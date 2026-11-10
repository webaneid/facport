import { and, eq, gt, inArray, isNull, lt, or, sql, count } from "drizzle-orm";
import { db } from "./db";
import {
  accurateConnections,
  auditLogs,
  autoproduksiDefaults,
  autoproduksiFormulas,
  autoproduksiIntermediaryAccounts,
  autoproduksiProductionEntries,
  dataUsaha,
  importBatches,
  memberSeats,
  orders,
  ownershipTransfers,
  subscriptions,
} from "../db/schema";
import { dataUsahaReferencingTables } from "./account-erasure-db";
import { settleTrialUsage } from "./trial-claims";

// § Fase 218, ADR-0055, architecture-data-usaha-archive.md — hapus (kosong) & arsip (punya riwayat) Data Usaha oleh PEMILIK. Arsip dan hapus WAJIB memutus koneksi Accurate (pelanggan
// mengira Data Usaha yang diarsipkan sudah tiada). Semua aturan dihitung ULANG di dalam transaksi dengan kunci baris; pratinjau hanya informasi.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Tx | typeof db;

export const ARCHIVE_RETENTION_DAYS = 30;

export type BlockerCode = "ACTIVE_SUBSCRIPTION" | "PENDING_ORDER" | "PENDING_TRANSFER" | "IMPORT_RUNNING" | "ACTIVE_SEAT";
export type Blocker = { code: BlockerCode; count: number };
export type Lifecycle = { mode: "delete" | "archive" | "blocked"; blockers: Blocker[]; tables: string[] };

/** Murni: dari tabel yang merujuk + penghalang → mode. Kosong = hapus; ada penghalang = blocked; selain itu arsip. */
export function decideMode(tables: readonly string[], blockers: readonly Blocker[]): Lifecycle["mode"] {
  if (tables.length === 0) return "delete";
  return blockers.length > 0 ? "blocked" : "archive";
}

export function confirmNameMatches(input: string, name: string): boolean {
  return input.trim().toLowerCase() === name.trim().toLowerCase() && name.trim().length > 0;
}

export function isArchiveExpired(archivedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - archivedAt.getTime() > ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
}

async function findBlockers(executor: Executor, id: string, now: Date): Promise<Blocker[]> {
  const n = async (q: Promise<{ c: number }[]>) => (await q)[0]?.c ?? 0;
  const [active, pendingOrders, pendingSubs, transfers, running, seats] = await Promise.all([
    n(executor.select({ c: count() }).from(subscriptions).where(and(eq(subscriptions.dataUsahaId, id), eq(subscriptions.status, "active"), or(isNull(subscriptions.endAt), gt(subscriptions.endAt, now))))),
    n(executor.select({ c: count() }).from(orders).where(and(eq(orders.dataUsahaId, id), inArray(orders.status, ["pending", "submitted"])))),
    n(executor.select({ c: count() }).from(subscriptions).where(and(eq(subscriptions.dataUsahaId, id), eq(subscriptions.status, "pending_payment")))),
    n(executor.select({ c: count() }).from(ownershipTransfers).where(and(eq(ownershipTransfers.dataUsahaId, id), eq(ownershipTransfers.status, "pending")))),
    n(
      executor
        .select({ c: count() })
        .from(importBatches)
        .innerJoin(subscriptions, eq(subscriptions.id, importBatches.subscriptionId))
        .where(and(eq(subscriptions.dataUsahaId, id), inArray(importBatches.status, ["processing", "cancelling"]))),
    ),
    n(executor.select({ c: count() }).from(memberSeats).where(and(eq(memberSeats.dataUsahaId, id), eq(memberSeats.status, "active")))),
  ]);
  const out: Blocker[] = [];
  if (active > 0) out.push({ code: "ACTIVE_SUBSCRIPTION", count: active });
  if (pendingOrders + pendingSubs > 0) out.push({ code: "PENDING_ORDER", count: pendingOrders + pendingSubs });
  if (transfers > 0) out.push({ code: "PENDING_TRANSFER", count: transfers });
  if (running > 0) out.push({ code: "IMPORT_RUNNING", count: running });
  if (seats > 0) out.push({ code: "ACTIVE_SEAT", count: seats });
  return out;
}

export async function evaluateLifecycle(executor: Executor, id: string, now: Date = new Date()): Promise<Lifecycle> {
  const tables = await dataUsahaReferencingTables(executor, id);
  const blockers = tables.length === 0 ? [] : await findBlockers(executor, id, now);
  return { mode: decideMode(tables, blockers), blockers, tables };
}

type DuRow = typeof dataUsaha.$inferSelect;

/** Putus Accurate pada Data Usaha ini: kosongkan pointer & database; cabut koneksi akun bila tak dipakai Data Usaha lain. Dipanggil di dalam transaksi pemanggil. */
async function disconnectAccurate(tx: Tx, du: DuRow, actorId: string, via: "archive" | "delete"): Promise<{ revokedConnection: boolean }> {
  const connectionId = du.accurateConnectionId;
  if (!connectionId && !du.accurateDbId) return { revokedConnection: false };
  await tx.update(dataUsaha).set({ accurateConnectionId: null, accurateDbId: null, accurateDbAlias: null, accurateDbConfirmedAt: null, updatedAt: new Date() }).where(eq(dataUsaha.id, du.id));
  let revoked = false;
  if (connectionId) {
    const [stillUsed] = await tx.select({ id: dataUsaha.id }).from(dataUsaha).where(and(eq(dataUsaha.accurateConnectionId, connectionId))).limit(1);
    if (!stillUsed) {
      // Pointer lama per-subscription (model sebelum ADR-0037) juga menunjuk baris ini — lepas dulu, pola sama `admin/data-usaha.route.ts`.
      await tx.update(subscriptions).set({ accurateConnectionId: null }).where(eq(subscriptions.accurateConnectionId, connectionId));
      await tx.delete(accurateConnections).where(eq(accurateConnections.id, connectionId));
      revoked = true;
    }
  }
  await tx.insert(auditLogs).values({
    entityType: "data_usaha",
    entityId: du.id,
    action: "disconnect_accurate",
    changes: {
      previousConnectionId: connectionId,
      previousAccurateDbId: du.accurateDbId ?? null,
      previousAccurateDbAlias: du.accurateDbAlias ?? null,
      removedAccount: revoked,
      affectedDataUsahaIds: [du.id],
      reason: null,
      via,
    },
    actorId,
  });
  return { revokedConnection: revoked };
}

export type LifecycleFailure =
  | { ok: false; status: 404; code: "DATA_USAHA_NOT_FOUND" }
  | { ok: false; status: 409; code: "ALREADY_ARCHIVED" | "NOT_ARCHIVED" | "NOT_EMPTY" | "IS_EMPTY" | "ARCHIVE_EXPIRED" }
  | { ok: false; status: 400; code: "CONFIRM_MISMATCH" }
  | { ok: false; status: 409; code: "HAS_BLOCKERS"; blockers: Blocker[] };

async function lockOwned(tx: Tx, ownerId: string, id: string): Promise<DuRow | null> {
  const [du] = await tx.select().from(dataUsaha).where(and(eq(dataUsaha.id, id), eq(dataUsaha.userId, ownerId))).for("update");
  return du ?? null;
}

export async function archiveDataUsaha(ownerId: string, id: string, confirm: string): Promise<{ ok: true; revokedConnection: boolean } | LifecycleFailure> {
  return db.transaction(async (tx) => {
    const du = await lockOwned(tx, ownerId, id);
    if (!du) return { ok: false, status: 404, code: "DATA_USAHA_NOT_FOUND" };
    if (du.archivedAt) return { ok: false, status: 409, code: "ALREADY_ARCHIVED" };
    if (!confirmNameMatches(confirm, du.name)) return { ok: false, status: 400, code: "CONFIRM_MISMATCH" };
    const life = await evaluateLifecycle(tx, id);
    if (life.mode === "blocked") return { ok: false, status: 409, code: "HAS_BLOCKERS", blockers: life.blockers };
    if (life.mode === "delete") return { ok: false, status: 409, code: "IS_EMPTY" };
    const { revokedConnection } = await disconnectAccurate(tx, du, ownerId, "archive");
    await tx.update(dataUsaha).set({ archivedAt: new Date(), updatedAt: new Date() }).where(eq(dataUsaha.id, id));
    await tx.insert(auditLogs).values({ entityType: "data_usaha", entityId: id, action: "archive", changes: { name: du.name, revokedConnection }, actorId: ownerId });
    return { ok: true, revokedConnection };
  });
}

export async function deleteEmptyDataUsaha(ownerId: string, id: string, confirm: string): Promise<{ ok: true; revokedConnection: boolean } | LifecycleFailure> {
  return db.transaction(async (tx) => {
    const du = await lockOwned(tx, ownerId, id);
    if (!du) return { ok: false, status: 404, code: "DATA_USAHA_NOT_FOUND" };
    if (du.archivedAt) return { ok: false, status: 409, code: "ALREADY_ARCHIVED" };
    if (!confirmNameMatches(confirm, du.name)) return { ok: false, status: 400, code: "CONFIRM_MISMATCH" };
    const life = await evaluateLifecycle(tx, id);
    if (life.mode !== "delete") return { ok: false, status: 409, code: "NOT_EMPTY" };
    const { revokedConnection } = await disconnectAccurate(tx, du, ownerId, "delete");
    await tx.delete(dataUsaha).where(and(eq(dataUsaha.id, id), eq(dataUsaha.userId, ownerId)));
    await tx.insert(auditLogs).values({ entityType: "data_usaha", entityId: id, action: "delete", changes: { name: du.name, revokedConnection }, actorId: ownerId });
    return { ok: true, revokedConnection };
  });
}

export async function restoreDataUsaha(ownerId: string, id: string, now: Date = new Date()): Promise<{ ok: true } | LifecycleFailure> {
  return db.transaction(async (tx) => {
    const du = await lockOwned(tx, ownerId, id);
    if (!du) return { ok: false, status: 404, code: "DATA_USAHA_NOT_FOUND" };
    if (!du.archivedAt) return { ok: false, status: 409, code: "NOT_ARCHIVED" };
    if (du.archiveCleanedAt || isArchiveExpired(du.archivedAt, now)) return { ok: false, status: 409, code: "ARCHIVE_EXPIRED" };
    await tx.update(dataUsaha).set({ archivedAt: null, updatedAt: new Date() }).where(eq(dataUsaha.id, id));
    await tx.insert(auditLogs).values({ entityType: "data_usaha", entityId: id, action: "restore", changes: { name: du.name }, actorId: ownerId });
    return { ok: true };
  });
}

/**
 * Job harian (§ 9 architecture): Data Usaha diarsipkan > 30 hari — buang data operasional (AutoProduksi, sisa riwayat import; kuota trial dipindah ke counter permanen dulu), lalu hapus
 * barisnya bila tidak ada lagi yang merujuk. Catatan keuangan, audit, klaim trial, `conversion_logs`, dan counter permanen TIDAK pernah dihapus (cangkang dipertahankan).
 */
export async function cleanupExpiredArchives(now: Date = new Date()): Promise<{ processed: number; deleted: number }> {
  const cutoff = new Date(now.getTime() - ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const expired = await db.select({ id: dataUsaha.id, name: dataUsaha.name }).from(dataUsaha).where(and(lt(dataUsaha.archivedAt, cutoff), isNull(dataUsaha.archiveCleanedAt)));
  let deleted = 0;
  for (const du of expired) {
    await db.transaction(async (tx) => {
      const subs = await tx.select({ id: subscriptions.id, isTrial: subscriptions.isTrial }).from(subscriptions).where(eq(subscriptions.dataUsahaId, du.id));
      for (const s of subs.filter((x) => x.isTrial)) await settleTrialUsage(s.id, tx);
      const subIds = subs.map((s) => s.id);
      if (subIds.length) await tx.delete(importBatches).where(inArray(importBatches.subscriptionId, subIds));
      await tx.delete(autoproduksiProductionEntries).where(eq(autoproduksiProductionEntries.dataUsahaId, du.id));
      await tx.delete(autoproduksiFormulas).where(eq(autoproduksiFormulas.dataUsahaId, du.id));
      await tx.delete(autoproduksiIntermediaryAccounts).where(eq(autoproduksiIntermediaryAccounts.dataUsahaId, du.id));
      await tx.delete(autoproduksiDefaults).where(eq(autoproduksiDefaults.dataUsahaId, du.id));
      const remaining = await dataUsahaReferencingTables(tx, du.id);
      // `formulaLastNumber` (penghitung nomor) sengaja tidak dihitung sebagai "isi" lagi setelah formula dibuang; hanya FK nyata yang menahan baris.
      const fkOnly = remaining.filter((t) => t !== "data_usaha");
      if (fkOnly.length === 0) {
        await tx.delete(dataUsaha).where(eq(dataUsaha.id, du.id));
        deleted++;
      } else {
        await tx.update(dataUsaha).set({ archiveCleanedAt: now, updatedAt: now }).where(eq(dataUsaha.id, du.id));
      }
      await tx.insert(auditLogs).values({ entityType: "data_usaha", entityId: du.id, action: "delete", changes: { reason: "archive_retention_cleanup", name: du.name, rowRemoved: fkOnly.length === 0, keptBecause: fkOnly }, actorId: null });
    });
  }
  return { processed: expired.length, deleted };
}
