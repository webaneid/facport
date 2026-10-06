import { describe, test, expect } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { plans, subscriptions, subscriptionRenewals, auditLogs, user as userTable } from "../db/schema";
import { legacyYearCorrection, findLegacyYearCandidates, applyLegacyYearCorrections, LEGACY_YEAR_CORRECTION_REASON } from "./legacy-year-correction";
import { addCalendarMonths } from "./subscription-period";
import { createTestDataUsaha } from "./test-fixtures";

const WIB = "Asia/Jakarta";
const DAY = 24 * 60 * 60 * 1000;
const wib = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(Date.UTC(y, mo - 1, d, h - 7, mi));
const iso = (d: Date) => d.toISOString();

describe("legacyYearCorrection (murni) — hanya yang JELAS tahun-360-hari, hanya menambah", () => {
  test("360 hari → tepat 1 tahun kalender dari mulai (jam sama, WIB); tambahan 5 hari (6 hari di tahun kabisat)", () => {
    const start = wib(2026, 10, 6, 14, 35);
    const fix = legacyYearCorrection(start, new Date(start.getTime() + 360 * DAY), WIB)!;
    expect(fix.years).toBe(1);
    expect(iso(fix.newEndAt)).toBe(iso(wib(2027, 10, 6, 14, 35)));
    expect(fix.addedDays).toBe(5);
    const leapStart = wib(2027, 10, 6, 14, 35); // melewati 29 Feb 2028 → 366 hari
    expect(legacyYearCorrection(leapStart, new Date(leapStart.getTime() + 360 * DAY), WIB)!.addedDays).toBe(6);
  });

  test("kelipatan tahun lama: 720 hari → 2 tahun kalender; toleransi ±1 hari", () => {
    const start = wib(2026, 1, 15, 9, 0);
    const two = legacyYearCorrection(start, new Date(start.getTime() + 720 * DAY), WIB)!;
    expect(two.years).toBe(2);
    expect(iso(two.newEndAt)).toBe(iso(wib(2028, 1, 15, 9, 0)));
    expect(legacyYearCorrection(start, new Date(start.getTime() + 361 * DAY), WIB)).not.toBeNull();
    expect(legacyYearCorrection(start, new Date(start.getTime() + 359 * DAY), WIB)).not.toBeNull();
  });

  test("bukan kandidat: 30 hari, 365 hari (tahun baru), 400 hari (kontrak khusus), 362 hari (di luar toleransi), akhir ≤ mulai", () => {
    const start = wib(2026, 10, 6, 14, 35);
    for (const days of [30, 365, 400, 362, 358, 0]) expect(legacyYearCorrection(start, new Date(start.getTime() + days * DAY), WIB)).toBeNull();
  });

  test("tanggal 29 Feb: mulai 29 Feb 2028 + 360 hari → 28 Feb 2029 (jepit, bukan meluber ke Maret)", () => {
    const start = wib(2028, 2, 29, 10, 0);
    expect(iso(legacyYearCorrection(start, new Date(start.getTime() + 360 * DAY), WIB)!.newEndAt)).toBe(iso(wib(2029, 2, 28, 10, 0)));
  });
});

describe("findLegacyYearCandidates + applyLegacyYearCorrections (DB)", () => {
  const runId = Date.now();
  let seq = 0;
  async function seed(opts: { spanDays: number; status?: string; isTrial?: boolean; anchored?: boolean; endsInFuture?: boolean; lastReminder?: number | null }) {
    const email = `legacy360-${runId}-${++seq}@test.local`;
    const userId = crypto.randomUUID();
    await db.insert(userTable).values({ id: userId, name: "Legacy 360", email, emailVerified: true, createdAt: new Date() });
    const dataUsahaId = await createTestDataUsaha(userId);
    const [plan] = await db.insert(plans).values({ name: `Legacy 360 Plan ${runId}-${seq}`, price: 1000, durationDays: 360, interval: "yearly", modules: ["sales_invoice"] }).returning();
    // mulai 100 hari lalu → berakhir 260 hari lagi (untuk span 360) — masih di masa depan
    const startAt = new Date(Date.now() - (opts.endsInFuture === false ? opts.spanDays + 10 : 100) * DAY);
    const endAt = new Date(startAt.getTime() + opts.spanDays * DAY);
    const [sub] = await db
      .insert(subscriptions)
      .values({
        userId, planId: plan!.id, status: opts.status ?? "active", startAt, endAt, isTrial: opts.isTrial ?? false, dataUsahaId,
        lastReminderThresholdDays: opts.lastReminder ?? null, ...(opts.anchored ? { periodAnchorAt: startAt, periodMonths: 12 } : {}),
      })
      .returning();
    return { sub: sub!, email };
  }
  const mine = async (emails: string[]) => (await findLegacyYearCandidates(WIB)).filter((c) => emails.includes(c.userEmail));

  test("kandidat HANYA yang aktif, non-trial, berakhir di masa depan, tanpa jangkar, belum pernah diperpanjang, rentang N×360 hari", async () => {
    const good = await seed({ spanDays: 360, lastReminder: 7 });
    const two = await seed({ spanDays: 720 });
    const skip = [
      await seed({ spanDays: 365 }), // tahun baru
      await seed({ spanDays: 30 }),
      await seed({ spanDays: 360, isTrial: true }),
      await seed({ spanDays: 360, status: "cancelled" }),
      await seed({ spanDays: 360, anchored: true }), // langganan baru (punya jangkar)
      await seed({ spanDays: 360, endsInFuture: false }), // sudah berakhir
    ];
    const renewed = await seed({ spanDays: 360 });
    await db.insert(subscriptionRenewals).values({ subscriptionId: renewed.sub.id, source: "admin", previousEndAt: renewed.sub.endAt!, newEndAt: renewed.sub.endAt!, interval: "monthly" });

    const found = await mine([good.email, two.email, renewed.email, ...skip.map((s) => s.email)]);
    expect(found.map((c) => c.userEmail).sort()).toEqual([good.email, two.email].sort());
    expect(found.find((c) => c.userEmail === two.email)!.years).toBe(2);
  });

  test("apply: end_at = mulai + 12 bulan kalender, jangkar & 12 bulan dicatat, reminder direset, audit tercatat; idempoten; yang berubah di tengah jalan DILEWATI", async () => {
    const a = await seed({ spanDays: 360, lastReminder: 7 });
    const stale = await seed({ spanDays: 360 });
    const candidates = await mine([a.email, stale.email]);
    expect(candidates).toHaveLength(2);

    // admin mengubah tanggal `stale` setelah kandidat dihitung → tidak boleh ditimpa
    await db.update(subscriptions).set({ endAt: new Date(stale.sub.endAt!.getTime() + 10 * DAY) }).where(eq(subscriptions.id, stale.sub.id));

    const result = await applyLegacyYearCorrections(candidates, WIB);
    expect(result).toEqual({ corrected: 1, skipped: 1 });

    const [after] = await db.select().from(subscriptions).where(eq(subscriptions.id, a.sub.id));
    expect(after!.endAt!.getTime()).toBe(addCalendarMonths(a.sub.startAt!, 12, WIB).getTime());
    expect(after!.endAt!.getTime()).toBeGreaterThan(a.sub.endAt!.getTime()); // hanya menambah
    expect(after!.periodAnchorAt!.getTime()).toBe(a.sub.startAt!.getTime());
    expect(after!.periodMonths).toBe(12);
    expect(after!.lastReminderThresholdDays).toBeNull();
    const audit = (await db.select().from(auditLogs).where(eq(auditLogs.entityId, a.sub.id))).filter((l) => (l.changes as { reason?: string }).reason === LEGACY_YEAR_CORRECTION_REASON);
    expect(audit).toHaveLength(1);

    const [untouched] = await db.select().from(subscriptions).where(eq(subscriptions.id, stale.sub.id));
    expect(untouched!.endAt!.getTime()).toBe(stale.sub.endAt!.getTime() + 10 * DAY);
    expect(untouched!.periodAnchorAt).toBeNull();

    // idempoten: setelah dikoreksi tidak lagi kandidat; menerapkan ulang = tidak ada yang berubah
    expect(await mine([a.email])).toHaveLength(0);
    expect(await applyLegacyYearCorrections(candidates, WIB)).toEqual({ corrected: 0, skipped: 2 });
  });
});
