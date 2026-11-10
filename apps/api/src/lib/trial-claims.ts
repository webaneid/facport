import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "./db";
import { trialClaims, plans, dataUsaha, settings, auditLogs } from "../db/schema";
import type { subscriptions } from "../db/schema";
import { getInternalReason } from "./internal-accounts";
import { moduleProductLine } from "./module-catalog";

// § Fase 217, ADR-0054, architecture-trial-database-ledger.md — trial 1x seumur hidup per (database Accurate, modul), lintas akun & Data Usaha.
// Klaim dibuat SAAT IMPORT PERTAMA dikonfirmasi (dari `checkTrialRowBudget`), bukan saat trial dibuat.

export const TRIAL_EXEMPT_DB_IDS_SETTING_KEY = "trial.exemptDbIds";

/**
 * Hanya modul yang berbicara ke database Accurate (Facport, AutoProduksi) yang punya klaim. Produk Konverter (Excel→XML untuk Accurate Desktop, `konverter_*`)
 * tidak punya database Accurate dan di luar cakupan buku besar (ADR-0054 butir 8). Modul tak dikenal (null) juga dilewati (aman: tidak mengunci apa pun).
 */
export function claimableModules(modules: readonly string[]): string[] {
  return modules.filter((m) => {
    const line = moduleProductLine(m);
    return line !== null && line !== "konverter";
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Tx | typeof db;
type SubscriptionRow = typeof subscriptions.$inferSelect;

export type TrialClaimOutcome =
  | { kind: "skip" } // tanpa buku besar (database belum terpilih, dikecualikan, atau akun internal) -> aturan lama per-langganan
  | { kind: "ok"; usedRows: number }
  | { kind: "blocked"; status: 409; code: "TRIAL_DATABASE_ALREADY_USED" | "TRIAL_SUBSCRIPTION_BOUND" };

/** Daftar id database yang dikecualikan (pengaturan admin). Nilai cacat diabaikan (aman: berarti tidak ada pengecualian). */
export async function getExemptDbIds(executor: Executor = db): Promise<Set<string>> {
  const [row] = await executor.select().from(settings).where(eq(settings.key, TRIAL_EXEMPT_DB_IDS_SETTING_KEY));
  const v = row?.value;
  if (!Array.isArray(v)) return new Set();
  return new Set(v.filter((x): x is string | number => typeof x === "string" || typeof x === "number").map((x) => String(x).trim()).filter(Boolean));
}

/**
 * Samakan counter `rows_used` klaim aktif langganan dengan baris sukses yang MASIH ada di `import_batch_rows` (naik saja, GREATEST).
 * Idempoten. Dipanggil saat cek kuota, saat batch selesai, dan sebelum purge/hapus, supaya pemakaian tidak hilang bersama baris.
 */
export async function settleTrialUsage(subscriptionId: string, executor: Executor = db): Promise<void> {
  await executor.execute(sql`
    UPDATE trial_claims c SET rows_used = sub.cnt
    FROM (
      SELECT b.module AS module, count(*)::int AS cnt
      FROM import_batch_rows r JOIN import_batches b ON b.id = r.batch_id
      WHERE b.subscription_id = ${subscriptionId} AND r.status = 'success'
      GROUP BY b.module
    ) sub
    WHERE c.subscription_id = ${subscriptionId} AND c.released_at IS NULL AND c.module = sub.module AND c.rows_used < sub.cnt
  `);
}

/** Pastikan langganan trial memegang klaim (db, modul) untuk semua modul paketnya. */
export async function ensureTrialClaims(subscription: SubscriptionRow): Promise<TrialClaimOutcome> {
  const [du] = await db.select({ accurateDbId: dataUsaha.accurateDbId }).from(dataUsaha).where(eq(dataUsaha.id, subscription.dataUsahaId));
  const dbId = du?.accurateDbId?.trim();
  if (!dbId) return { kind: "skip" };
  if ((await getExemptDbIds()).has(dbId)) return { kind: "skip" };
  if ((await getInternalReason(subscription.userId)) !== null) return { kind: "skip" };

  const [plan] = await db.select({ modules: plans.modules }).from(plans).where(eq(plans.id, subscription.planId));
  const modules = claimableModules(plan?.modules ?? []);
  if (modules.length === 0) return { kind: "skip" };

  return db.transaction(async (tx): Promise<TrialClaimOutcome> => {
    // Satu langganan hanya boleh terikat pada SATU database (cegah putus koneksi lalu pilih database lain).
    const [bound] = await tx
      .select({ id: trialClaims.id })
      .from(trialClaims)
      .where(and(eq(trialClaims.subscriptionId, subscription.id), isNull(trialClaims.releasedAt), ne(trialClaims.accurateDbId, dbId), inArray(trialClaims.module, modules)))
      .limit(1);
    if (bound) return { kind: "blocked", status: 409, code: "TRIAL_SUBSCRIPTION_BOUND" };

    await tx
      .insert(trialClaims)
      .values(modules.map((m) => ({ accurateDbId: dbId, module: m, subscriptionId: subscription.id, userId: subscription.userId, dataUsahaId: subscription.dataUsahaId })))
      .onConflictDoNothing();

    const active = await tx
      .select()
      .from(trialClaims)
      .where(and(eq(trialClaims.accurateDbId, dbId), inArray(trialClaims.module, modules), isNull(trialClaims.releasedAt)));
    if (active.some((c) => c.subscriptionId !== subscription.id)) return { kind: "blocked", status: 409, code: "TRIAL_DATABASE_ALREADY_USED" };

    await settleTrialUsage(subscription.id, tx);
    const own = await tx
      .select({ rowsUsed: trialClaims.rowsUsed })
      .from(trialClaims)
      .where(and(eq(trialClaims.subscriptionId, subscription.id), isNull(trialClaims.releasedAt)));
    return { kind: "ok", usedRows: own.reduce((a, c) => a + c.rowsUsed, 0) };
  });
}

/** Lepas klaim aktif (admin). Baris tidak dihapus, hanya ditandai; klaim baru untuk (db, modul) itu jadi mungkin. */
export async function releaseTrialClaim(claimId: string, actorId: string, reason: string) {
  return db.transaction(async (tx) => {
    const [claim] = await tx.select().from(trialClaims).where(eq(trialClaims.id, claimId)).for("update");
    if (!claim) return { ok: false as const, code: "CLAIM_NOT_FOUND" as const };
    if (claim.releasedAt) return { ok: false as const, code: "CLAIM_ALREADY_RELEASED" as const };
    await tx.update(trialClaims).set({ releasedAt: new Date(), releasedBy: actorId, releaseReason: reason }).where(eq(trialClaims.id, claimId));
    await tx.insert(auditLogs).values({
      entityType: "trial_claim",
      entityId: claimId,
      action: "update",
      changes: { released: true, accurateDbId: claim.accurateDbId, module: claim.module, subscriptionId: claim.subscriptionId, reason },
      actorId,
    });
    return { ok: true as const, claim };
  });
}

/**
 * Pemeriksaan awal saat trial DIBUAT (UX, bukan satu-satunya lapis): bila Data Usaha sudah punya database terpilih dan (db, modul) sudah
 * diklaim langganan trial LAIN, kembalikan modul yang bentrok. Aturan lewati sama dengan `ensureTrialClaims` (tanpa database, dikecualikan, internal).
 */
export async function findForeignTrialClaim(params: { userId: string; dataUsahaId: string; modules: string[] }, executor: Executor = db): Promise<string | null> {
  const { userId, dataUsahaId } = params;
  const modules = claimableModules(params.modules);
  if (modules.length === 0) return null;
  const [du] = await executor.select({ accurateDbId: dataUsaha.accurateDbId }).from(dataUsaha).where(eq(dataUsaha.id, dataUsahaId));
  const dbId = du?.accurateDbId?.trim();
  if (!dbId) return null;
  if ((await getExemptDbIds(executor)).has(dbId)) return null;
  if ((await getInternalReason(userId, executor)) !== null) return null;
  const [hit] = await executor
    .select({ module: trialClaims.module })
    .from(trialClaims)
    .where(and(eq(trialClaims.accurateDbId, dbId), inArray(trialClaims.module, modules), isNull(trialClaims.releasedAt)))
    .limit(1);
  return hit?.module ?? null;
}
