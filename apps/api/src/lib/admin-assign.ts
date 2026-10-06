import { and, eq } from "drizzle-orm";
import { db } from "./db";
import { plans, subscriptions, auditLogs, memberSeats } from "../db/schema";
import { computeSubscriptionPeriod, isSubscriptionInterval, inferIntervalFromDays } from "./subscription-period";
import { findRenewableSubscription, renewSubscriptionInPlace } from "./subscription-renewal";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PlanRow = typeof plans.$inferSelect;
type SubscriptionRow = typeof subscriptions.$inferSelect;

export type AssignResult = { subscription: SubscriptionRow; renewed: boolean; previousEndAt: Date | null };

// § Fase 177, ADR-0041 — inti "admin meng-assign 1 paket ke Data Usaha" (dulu inline di `POST /admin/subscriptions`), dipakai SATU paket (`POST /`) dan
// BANYAK paket sekaligus (`POST /bulk`) — aturannya identik. WAJIB dipanggil di dalam transaksi pemanggil (`tx`), dan kepemilikan Data Usaha SUDAH
// divalidasi pemanggil. `endAt` null = hitung dari periode paket; terisi = override admin (kontrak khusus, tanggal+jam bebas).
//  - tanpa `endAt` + modul yang sama MASIH AKTIF (non-trial, end_at > sekarang) → PERPANJANGAN di tempat dari akhir lama (sisa waktu tidak hilang);
//  - selain itu: tutup langganan aktif lain modul yang sama di Data Usaha ini, lalu buat baru (mulai sekarang).
export async function assignPlanToDataUsaha(
  tx: Tx,
  params: { userId: string; plan: PlanRow; dataUsahaId: string; endAt: Date | null; now: Date; timeZone: string; actorId: string },
): Promise<AssignResult> {
  const { userId, plan, dataUsahaId, endAt: customEnd, now, timeZone, actorId } = params;
  const interval = isSubscriptionInterval(plan.interval) ? plan.interval : inferIntervalFromDays(plan.durationDays);
  const moduleKey = plan.modules[0];

  if (!customEnd && moduleKey) {
    const renewable = await findRenewableSubscription(tx, { dataUsahaId, moduleKey, now });
    if (renewable) {
      const renewal = await renewSubscriptionInPlace(tx, { subscription: renewable, interval, timeZone, source: "admin", actorId });
      const [row] = await tx.select().from(subscriptions).where(eq(subscriptions.id, renewal.subscriptionId));
      return { subscription: row!, renewed: true, previousEndAt: renewal.previousEndAt };
    }
  }

  // § ditemukan 2026-09-07 — tutup subscription aktif LAIN utk modul yang sama SEBELUM insert baru (mis. trial aktif lalu admin assign paket asli) — cegah
  // 2 subscription "active" bersamaan utk 1 modul. § Fase 108 — di-SCOPE PER DATA USAHA. § Fase 110 — CUMA untuk plan `module` (moduleKey ada);
  // `seat_addon` (`modules: []`) TIDAK pernah masuk sini (kalau tidak, semua seat aktif lain ikut dibatalkan).
  if (moduleKey) {
    const existingActive = await tx
      .select({ id: subscriptions.id, modules: plans.modules })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active"), eq(subscriptions.dataUsahaId, dataUsahaId)));
    for (const s of existingActive.filter((s) => s.modules[0] === moduleKey)) {
      await tx.update(subscriptions).set({ status: "cancelled", endAt: now }).where(eq(subscriptions.id, s.id));
    }
  }

  const period = customEnd
    ? { endAt: customEnd, periodAnchorAt: null, periodMonths: null }
    : computeSubscriptionPeriod(now, interval, timeZone);

  // orderId = null — dianggap sudah dibayar di luar sistem (invoice manual/kontrak korporat), § architecture-subscription.md
  const [subscription] = await tx
    .insert(subscriptions)
    .values({ userId, planId: plan.id, status: "active", startAt: now, endAt: period.endAt, periodAnchorAt: period.periodAnchorAt, periodMonths: period.periodMonths, dataUsahaId })
    .returning();

  await tx.insert(auditLogs).values({
    entityType: "subscription",
    entityId: subscription!.id,
    action: "create",
    changes: { userId, planId: plan.id, endAt: period.endAt.toISOString(), provisionedBy: "admin" },
    actorId,
  });

  // § Fase 110 — sama seperti admin/orders.route.ts confirm & § lib/manual-subscription.ts.
  if (plan.kind === "seat_addon") {
    await tx.insert(memberSeats).values({ primaryUserId: userId, dataUsahaId, seatSubscriptionId: subscription!.id });
  }

  return { subscription: subscription!, renewed: false, previousEndAt: null };
}
