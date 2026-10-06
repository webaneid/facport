import { and, eq, gt, isNotNull, sql } from "drizzle-orm";
import { db } from "./db";
import { subscriptions, subscriptionRenewals, plans, user as userTable, auditLogs } from "../db/schema";
import { addCalendarMonths } from "./subscription-period";

// § Fase 179, ADR-0041 — koreksi SATU KALI langganan "1 tahun" yang dihitung 360 hari (12×30; kesalahan produk Fase 43 → baru dikoreksi 2026-10-06 menjadi 365
// hari, tetapi langganan yang SUDAH berjalan tetap membawa end_at lama). Pelanggan membeli "1 tahun" dan berhak atas 1 tahun KALENDER penuh: end_at digenapi
// menjadi start_at + 12 bulan kalender (zona perusahaan — fungsi periode yang SAMA dengan aplikasi), jangkar periode dicatat supaya perpanjangan berikutnya akurat.
//
// Aturan kandidat (konservatif — hanya yang JELAS tahun-360-hari):
//  - status `active`, BUKAN trial, end_at masih di masa depan (yang sudah berakhir tidak diubah — tidak ada yang bisa "diberikan" lagi);
//  - rentang end_at − start_at = N×360 hari (±1 hari) untuk N = 1..5 (kelipatan tahun lama), dan BELUM punya jangkar periode (langganan baru Fase 174+ tidak disentuh);
//  - tidak pernah diperpanjang lewat Fase 176 (tidak ada riwayat di `subscription_renewals`).
// Tanggal akhir hasil koreksi SELALU lebih lambat dari yang lama (hanya menambah, tidak pernah memotong).
const LEGACY_YEAR_DAYS = 360;
const MAX_LEGACY_YEARS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

export type LegacyYearCorrection = { years: number; newEndAt: Date; addedDays: number };

/** Murni: rentang start→end berupa N×360 hari (±1 hari)? Kembalikan koreksinya (N×12 bulan kalender dari start) atau null. */
export function legacyYearCorrection(startAt: Date, endAt: Date, timeZone: string): LegacyYearCorrection | null {
  const spanDays = (endAt.getTime() - startAt.getTime()) / DAY_MS;
  for (let years = 1; years <= MAX_LEGACY_YEARS; years++) {
    if (Math.abs(spanDays - years * LEGACY_YEAR_DAYS) > 1) continue;
    const newEndAt = addCalendarMonths(startAt, years * 12, timeZone);
    if (newEndAt.getTime() <= endAt.getTime()) return null; // tidak pernah memotong
    return { years, newEndAt, addedDays: Math.round((newEndAt.getTime() - endAt.getTime()) / DAY_MS) };
  }
  return null;
}

export type LegacyYearCandidate = {
  subscriptionId: string;
  userEmail: string;
  planName: string;
  startAt: Date;
  endAt: Date;
  years: number;
  newEndAt: Date;
  addedDays: number;
};

export async function findLegacyYearCandidates(timeZone: string, now: Date = new Date()): Promise<LegacyYearCandidate[]> {
  const rows = await db
    .select({ sub: subscriptions, planName: plans.name, email: userTable.email })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .innerJoin(userTable, eq(userTable.id, subscriptions.userId))
    .where(and(eq(subscriptions.status, "active"), eq(subscriptions.isTrial, false), isNotNull(subscriptions.startAt), gt(subscriptions.endAt, now), sql`${subscriptions.periodAnchorAt} is null`));

  const renewed = new Set((await db.select({ id: subscriptionRenewals.subscriptionId }).from(subscriptionRenewals)).map((r) => r.id));
  const out: LegacyYearCandidate[] = [];
  for (const { sub, planName, email } of rows) {
    if (!sub.startAt || !sub.endAt || renewed.has(sub.id)) continue;
    const fix = legacyYearCorrection(sub.startAt, sub.endAt, timeZone);
    if (!fix) continue;
    out.push({ subscriptionId: sub.id, userEmail: email, planName, startAt: sub.startAt, endAt: sub.endAt, ...fix });
  }
  return out.sort((a, b) => a.endAt.getTime() - b.endAt.getTime());
}

export const LEGACY_YEAR_CORRECTION_REASON = "fase-179-koreksi-tahun-360-hari";

// § Menerapkan koreksi: satu transaksi, tiap baris dikunci & DIVALIDASI ULANG (status/end_at/jangkar belum berubah sejak kandidat dihitung) — baris yang berubah di
// tengah jalan dilewati, bukan ditimpa. Idempoten: setelah dikoreksi baris punya jangkar → tidak lagi kandidat.
export async function applyLegacyYearCorrections(candidates: LegacyYearCandidate[], timeZone: string): Promise<{ corrected: number; skipped: number }> {
  let corrected = 0;
  let skipped = 0;
  await db.transaction(async (tx) => {
    for (const c of candidates) {
      const [row] = await tx.select().from(subscriptions).where(sql`${subscriptions.id} = ${c.subscriptionId} FOR UPDATE`).limit(1);
      const fresh = row && row.status === "active" && !row.isTrial && row.startAt && row.endAt && !row.periodAnchorAt ? legacyYearCorrection(row.startAt, row.endAt, timeZone) : null;
      if (!row || !fresh || row.endAt!.getTime() !== c.endAt.getTime()) {
        skipped += 1;
        continue;
      }
      await tx
        .update(subscriptions)
        .set({ endAt: fresh.newEndAt, periodAnchorAt: row.startAt, periodMonths: fresh.years * 12, lastReminderThresholdDays: null })
        .where(eq(subscriptions.id, row.id));
      await tx.insert(auditLogs).values({
        entityType: "subscription",
        entityId: row.id,
        action: "update",
        changes: { endAt: { old: row.endAt!.toISOString(), new: fresh.newEndAt.toISOString() }, addedDays: fresh.addedDays, reason: LEGACY_YEAR_CORRECTION_REASON },
      });
      corrected += 1;
    }
  });
  return { corrected, skipped };
}
