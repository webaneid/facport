import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { auditLogs, dataUsaha, plans, subscriptions, user as userTable } from "../db/schema";
import { MODULE_CATALOG } from "./module-catalog";
import { getInternalReason } from "./internal-accounts";

// § Fase 191, D9 Lapis 2 (architecture-internal-accounts.md) — hibah akses INTERNAL: langganan modul TANPA tanggal akhir, tanpa order/invoice, untuk akun internal (trainer, karyawan, mitra).
// `end_at = NULL` sudah berarti "tanpa batas" di gerbang akses dan diabaikan job kedaluwarsa/pengingat/tagihan perpanjangan, jadi tidak ada notifikasi kedaluwarsa. Hibah dikenali dari penanda
// `subscriptions.internal_grant` (bukan dari end_at NULL). HANYA akun internal efektif yang boleh menerima; hibah dicabut otomatis saat akun kembali komersil (`revokeInternalGrants`).
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class InternalGrantError extends Error {
  constructor(
    readonly code: "NOT_INTERNAL" | "DATA_USAHA_NOT_FOUND" | "UNKNOWN_MODULE" | "NO_PLAN_FOR_MODULE",
    readonly status: number,
  ) {
    super(code);
  }
}

const ALL_MODULE_KEYS = MODULE_CATALOG.map((m) => m.key as string);

/** Murni: "all" → semua modul katalog; daftar → unik, harus dikenal. Mengembalikan `null` bila ada kunci tak dikenal. */
export function resolveGrantModules(input: string[] | "all"): string[] | null {
  if (input === "all") return [...ALL_MODULE_KEYS];
  const unique = [...new Set(input)];
  return unique.every((k) => ALL_MODULE_KEYS.includes(k)) && unique.length > 0 ? unique : null;
}

/** Paket modul AKTIF termurah (lalu tertua) untuk tiap modul — hanya `kind='module'`; modul tanpa paket aktif tidak dikembalikan. */
export async function cheapestPlanPerModule(executor: Tx | typeof db, moduleKeys: string[]): Promise<Map<string, string>> {
  const rows = await executor.select({ id: plans.id, modules: plans.modules, price: plans.price }).from(plans).where(and(eq(plans.isActive, true), eq(plans.kind, "module"))).orderBy(asc(plans.price), asc(plans.createdAt), asc(plans.id));
  const out = new Map<string, string>();
  for (const p of rows) {
    const key = p.modules[0];
    if (key && moduleKeys.includes(key) && !out.has(key)) out.set(key, p.id);
  }
  return out;
}

export type GrantResult = { granted: string[]; alreadyGranted: string[]; skippedNoPlan: string[] };

export async function grantInternalAccess(tx: Tx, p: { ownerId: string; dataUsahaId: string; moduleKeys: string[] | "all"; actorId: string }): Promise<GrantResult> {
  const keys = resolveGrantModules(p.moduleKeys);
  if (!keys) throw new InternalGrantError("UNKNOWN_MODULE", 422);
  // kunci baris akun: penandaan internal/komersil dan pemberian hibah saling menunggu (tidak ada hibah untuk akun yang baru menjadi komersil)
  await tx.select({ id: userTable.id }).from(userTable).where(eq(userTable.id, p.ownerId)).for("update");
  if ((await getInternalReason(p.ownerId, tx)) === null) throw new InternalGrantError("NOT_INTERNAL", 409);
  // kunci baris Data Usaha: pemberian hibah tidak bersaing dengan perpindahan pemilik / aktivasi di Data Usaha yang sama
  const [du] = await tx.select({ id: dataUsaha.id }).from(dataUsaha).where(and(eq(dataUsaha.id, p.dataUsahaId), eq(dataUsaha.userId, p.ownerId))).for("update");
  if (!du) throw new InternalGrantError("DATA_USAHA_NOT_FOUND", 404);

  const planByModule = await cheapestPlanPerModule(tx, keys);
  const active = await tx
    .select({ id: subscriptions.id, modules: plans.modules, internalGrant: subscriptions.internalGrant, endAt: subscriptions.endAt, isTrial: subscriptions.isTrial })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(subscriptions.dataUsahaId, p.dataUsahaId), eq(subscriptions.status, "active"), eq(plans.kind, "module")));
  const now = new Date();
  const result: GrantResult = { granted: [], alreadyGranted: [], skippedNoPlan: [] };

  for (const key of keys) {
    const existing = active.filter((s) => s.modules[0] === key);
    if (existing.some((s) => s.internalGrant)) {
      result.alreadyGranted.push(key);
      continue;
    }
    const planId = planByModule.get(key);
    if (!planId) {
      result.skippedNoPlan.push(key);
      continue;
    }
    // tutup langganan aktif lain modul yang sama di Data Usaha ini (cegah dua langganan aktif bersamaan; pola `assignPlanToDataUsaha`)
    for (const s of existing) {
      await tx.update(subscriptions).set({ status: "cancelled", endAt: now }).where(eq(subscriptions.id, s.id));
      await tx.insert(auditLogs).values({ entityType: "subscription", entityId: s.id, action: "update", changes: { status: { old: "active", new: "cancelled" }, replacedByInternalGrant: true, dataUsahaId: p.dataUsahaId, endAtOld: s.endAt?.toISOString() ?? null, isTrial: s.isTrial }, actorId: p.actorId });
    }
    const [sub] = await tx
      .insert(subscriptions)
      .values({ userId: p.ownerId, planId, status: "active", startAt: now, endAt: null, dataUsahaId: p.dataUsahaId, isTrial: false, renewalInterval: null, internalGrant: true })
      .returning({ id: subscriptions.id });
    await tx.insert(auditLogs).values({
      entityType: "subscription",
      entityId: sub!.id,
      action: "create",
      changes: { userId: p.ownerId, dataUsahaId: p.dataUsahaId, planId, moduleKey: key, endAt: null, internalGrant: true, replaced: existing.map((s) => s.id) },
      actorId: p.actorId,
    });
    result.granted.push(key);
  }
  return result;
}

/**
 * Cabut hibah internal AKTIF (status → cancelled, end_at → sekarang). Filter menurut PEMILIK Data Usaha SAAT INI (`userIds`; bukan `subscriptions.userId` yang bisa tertinggal setelah transfer)
 * dan/atau `dataUsahaId`. Tanpa filter tidak mencabut apa pun. Mengembalikan jumlah yang dicabut.
 */
export async function revokeInternalGrants(tx: Tx, p: { userIds?: string[]; dataUsahaId?: string; actorId: string }): Promise<number> {
  if (!p.userIds && !p.dataUsahaId) return 0;
  const conditions = [eq(subscriptions.internalGrant, true), eq(subscriptions.status, "active")];
  if (p.userIds) conditions.push(inArray(dataUsaha.userId, p.userIds));
  if (p.dataUsahaId) conditions.push(eq(subscriptions.dataUsahaId, p.dataUsahaId));
  const rows = await tx
    .select({ id: subscriptions.id, dataUsahaId: subscriptions.dataUsahaId, userId: subscriptions.userId })
    .from(subscriptions)
    .innerJoin(dataUsaha, eq(dataUsaha.id, subscriptions.dataUsahaId))
    .where(and(...conditions))
    .orderBy(subscriptions.id)
    .for("update", { of: subscriptions });
  if (rows.length === 0) return 0;
  await tx.update(subscriptions).set({ status: "cancelled", endAt: new Date() }).where(inArray(subscriptions.id, rows.map((r) => r.id)));
  await tx.insert(auditLogs).values(rows.map((r) => ({ entityType: "subscription", entityId: r.id, action: "update", changes: { internalGrantRevoked: true, status: { new: "cancelled" }, dataUsahaId: r.dataUsahaId, userId: r.userId }, actorId: p.actorId })));
  return rows.length;
}

/** Dipanggil SETELAH kepemilikan Data Usaha berpindah: bila pemilik baru bukan internal, hibah di Data Usaha itu dicabut (dalam transaksi yang sama). */
export async function revokeGrantsIfNewOwnerCommercial(tx: Tx, p: { dataUsahaId: string; newOwnerId: string; actorId: string }): Promise<number> {
  if ((await getInternalReason(p.newOwnerId, tx)) !== null) return 0;
  return revokeInternalGrants(tx, { dataUsahaId: p.dataUsahaId, actorId: p.actorId });
}

/** Jumlah hibah internal aktif milik `userIds` (untuk pratinjau dampak). */
export async function countActiveGrants(executor: Tx | typeof db, userIds: string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  const [row] = await executor.select({ n: sql<number>`count(*)` }).from(subscriptions).where(and(eq(subscriptions.internalGrant, true), eq(subscriptions.status, "active"), inArray(subscriptions.userId, userIds)));
  return Number(row?.n ?? 0);
}
