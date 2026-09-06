import { eq, and, count } from "drizzle-orm";
import { db } from "./db";
import { subscriptions, auditLogs, settings, importBatches, importBatchRows } from "../db/schema";

// § Fase 43 — trial gratis per modul (self-service, 1x seumur hidup per
// modul per user). Dibatasi jumlah BARIS berhasil-import (bukan durasi
// hari — durasi hari bisa "dimanfaatkan waktu" tanpa batas nyata oleh
// user yang tidak buru-buru import), diatur 1x secara GLOBAL di admin
// settings (bukan per-plan) supaya admin tidak input angka yang sama
// berkali-kali. § architecture-subscription.md § "Trial (Batas Baris)".
export const TRIAL_MAX_ROWS_SETTING_KEY = "trial.maxRows";
export const DEFAULT_TRIAL_MAX_ROWS = 100;
export const MIN_TRIAL_MAX_ROWS = 1;
export const MAX_TRIAL_MAX_ROWS = 100000;

// § durasi hari trial TETAP ada sebagai backstop kadaluarsa (dipakai job
// `EXPIRE_SUBSCRIPTIONS` yang sudah ada) — TERPISAH dari batas baris,
// supaya trial yang tidak pernah dipakai importnya tidak menggantung aktif
// selamanya.
export const TRIAL_DURATION_DAYS_SETTING_KEY = "trial.durationDays";
export const DEFAULT_TRIAL_DURATION_DAYS = 30;
export const MIN_TRIAL_DURATION_DAYS = 1;
export const MAX_TRIAL_DURATION_DAYS = 365;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PlanRow = { id: string; durationDays: number };

async function getTrialDurationDays(tx: Tx | typeof db): Promise<number> {
  const [row] = await tx.select().from(settings).where(eq(settings.key, TRIAL_DURATION_DAYS_SETTING_KEY));
  return Number(row?.value ?? DEFAULT_TRIAL_DURATION_DAYS);
}

async function getTrialMaxRows(tx: Tx | typeof db): Promise<number> {
  const [row] = await tx.select().from(settings).where(eq(settings.key, TRIAL_MAX_ROWS_SETTING_KEY));
  return Number(row?.value ?? DEFAULT_TRIAL_MAX_ROWS);
}

// § Fase 43 — mirror `createManualSubscriptions` (lib/manual-subscription.ts,
// Fase 18): insert LANGSUNG "active" tanpa order/invoice sama sekali. BEDA:
// durasi dari `trial.durationDays` (bukan `plan.durationDays`), dan
// `isTrial: true`. Guard "belum pernah trial modul ini"/"modul belum aktif"
// WAJIB sudah dicek oleh pemanggil (§ `POST /subscriptions/trial`) SEBELUM
// fungsi ini dipanggil — fungsi ini sendiri TIDAK mengecek ulang (dipanggil
// di dalam transaction yang sudah row-lock user, sama pola checkout).
export async function createTrialSubscription(tx: Tx, params: { userId: string; plan: PlanRow; actorId: string }) {
  const { userId, plan, actorId } = params;
  const durationDays = await getTrialDurationDays(tx);
  const now = new Date();
  const endAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

  const [subscription] = await tx
    .insert(subscriptions)
    .values({ userId, planId: plan.id, status: "active", startAt: now, endAt, isTrial: true })
    .returning();

  await tx.insert(auditLogs).values({
    entityType: "subscription",
    entityId: subscription!.id,
    action: "create",
    changes: { userId, planId: plan.id, endAt: endAt.toISOString(), isTrial: true, selfService: true },
    actorId,
  });

  return subscription!;
}

// § Fase 43 — batas baris trial: subscription non-trial SELALU lolos
// (paket asli tidak dibatasi jumlah baris). Untuk trial, hitung baris
// SUKSES yang SUDAH terpakai (scoped ke subscription INI, bukan lintas
// modul/subscription lain milik user yang sama — mirror query `GET
// /me/stats`, Fase 40, tapi di-scope per-subscription) + `additionalRows`
// yang AKAN diproses, dibanding batas global `trial.maxRows`.
export async function checkTrialRowBudget(
  subscriptionId: string,
  additionalRows: number,
): Promise<{ ok: true } | { ok: false; remaining: number; max: number }> {
  const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId));
  if (!subscription || !subscription.isTrial) return { ok: true };

  const [rowCountResult] = await db
    .select({ successCount: count() })
    .from(importBatchRows)
    .innerJoin(importBatches, eq(importBatchRows.batchId, importBatches.id))
    .where(and(eq(importBatches.subscriptionId, subscriptionId), eq(importBatchRows.status, "success")));
  const successCount = rowCountResult?.successCount ?? 0;

  const maxRows = await getTrialMaxRows(db);
  const remaining = Math.max(0, maxRows - successCount);
  if (successCount + additionalRows > maxRows) {
    return { ok: false, remaining, max: maxRows };
  }
  return { ok: true };
}
