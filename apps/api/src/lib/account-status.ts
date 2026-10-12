import { and, eq, inArray } from "drizzle-orm";
import { db } from "./db";
import { auditLogs, roles, session, user as userTable, userRoles } from "../db/schema";

// § Fase 189H (bagian 2), ADR-0027/ADR-0045 — SATU sumber aturan nonaktifkan/aktifkan akun, dipakai endpoint tunggal (`PATCH /admin/users/:id/disable|enable`) DAN aksi massal.
// Aturan: tidak boleh menonaktifkan diri sendiri; tidak boleh menonaktifkan Super Admin AKTIF terakhir; baris dikunci (FOR UPDATE, urut id) dalam satu transaksi bersama audit;
// sesi akun dicabut seketika setelah commit; email status dikirim oleh pemanggil (best-effort).
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type StatusSkipReason = "NOT_FOUND" | "SELF" | "LAST_SUPER_ADMIN" | "ALREADY";
export type StatusTarget = { id: string; name: string; email: string; disabled: boolean };
export type StatusPlan = { requested: number; found: number; toChange: StatusTarget[]; skipped: { id: string; reason: StatusSkipReason }[] };

export async function planStatusChange(executor: Tx | typeof db, userIds: string[], disabled: boolean, actorId: string, opts: { lock?: boolean } = {}): Promise<StatusPlan> {
  const ids = [...new Set(userIds)];
  const base = executor.select({ id: userTable.id, name: userTable.name, email: userTable.email, disabled: userTable.disabled }).from(userTable).where(inArray(userTable.id, ids)).orderBy(userTable.id);
  const rows = opts.lock ? await base.for("update") : await base;
  const foundIds = new Set(rows.map((r) => r.id));
  const skipped: StatusPlan["skipped"] = ids.filter((id) => !foundIds.has(id)).map((id) => ({ id, reason: "NOT_FOUND" as const }));
  let candidates: StatusTarget[] = [];
  for (const r of rows) {
    if (disabled && r.id === actorId) skipped.push({ id: r.id, reason: "SELF" });
    else if (r.disabled === disabled) skipped.push({ id: r.id, reason: "ALREADY" });
    else candidates.push(r);
  }
  if (disabled && candidates.length > 0) {
    const [adminRole] = await executor.select().from(roles).where(eq(roles.name, "admin"));
    if (adminRole) {
      const adminQuery = executor.select({ userId: userRoles.userId }).from(userRoles).innerJoin(userTable, eq(userTable.id, userRoles.userId)).where(and(eq(userRoles.roleId, adminRole.id), eq(userTable.disabled, false)));
      const activeAdmins = (opts.lock ? await adminQuery.for("update") : await adminQuery).map((a) => a.userId);
      const candidateIds = new Set(candidates.map((c) => c.id));
      const remaining = activeAdmins.filter((id) => !candidateIds.has(id));
      if (remaining.length === 0) {
        // tidak boleh menyisakan 0 Super Admin aktif: semua target yang Super Admin aktif dilewati
        const adminSet = new Set(activeAdmins);
        for (const c of candidates) if (adminSet.has(c.id)) skipped.push({ id: c.id, reason: "LAST_SUPER_ADMIN" });
        candidates = candidates.filter((c) => !adminSet.has(c.id));
      }
    }
  }
  return { requested: ids.length, found: rows.length, toChange: candidates, skipped };
}

/** Terapkan perubahan status dalam SATU transaksi (rencana dihitung ulang dengan kunci baris); sesi dicabut sesudah commit. Mengembalikan rencana yang benar-benar diterapkan. */
export async function applyStatusChange(userIds: string[], disabled: boolean, actorId: string, opts: { bulk?: boolean } = {}): Promise<StatusPlan> {
  const plan = await db.transaction(async (tx) => {
    const p = await planStatusChange(tx, userIds, disabled, actorId, { lock: true });
    if (p.toChange.length > 0) {
      const changeIds = p.toChange.map((t) => t.id);
      await tx.update(userTable).set({ disabled }).where(inArray(userTable.id, changeIds));
      await tx.insert(auditLogs).values(
        p.toChange.map((t) => ({ entityType: "user", entityId: t.id, action: "update", changes: { disabled, ...(opts.bulk ? { bulk: true } : {}) }, actorId })),
      );
    }
    return p;
  });
  // § ADR-0027 — cabut SEMUA sesi aktif seketika (tanpa ini sesi lama jalan sampai expired walau disabled = true)
  if (disabled && plan.toChange.length > 0) await db.delete(session).where(inArray(session.userId, plan.toChange.map((t) => t.id)));
  return plan;
}
