import { and, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { plans, subscriptions, memberSeats, invoiceItems, auditLogs } from "../db/schema";
import { computeSubscriptionPeriod, isSubscriptionInterval, inferIntervalFromDays } from "./subscription-period";
import { findRenewableSubscription, renewSubscriptionInPlace, reactivateSubscription, type RenewalResult } from "./subscription-renewal";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PlanRow = typeof plans.$inferSelect;
type InvoiceItemRow = typeof invoiceItems.$inferSelect;

export type ActivationResult = { createdSubscriptionIds: string[]; renewals: RenewalResult[] };

// § Fase 178 — INTI "invoice lunas → langganan aktif", diekstrak dari `POST /admin/orders/:id/confirm` (§ Fase 16/110/174/176) supaya DIPAKAI BERSAMA oleh
// (a) konfirmasi pembayaran customer dan (b) invoice yang dilunasi otomatis oleh admin (`createPaidInvoiceAndOrder`) — aturannya identik, tidak ada 2 salinan.
// WAJIB dipanggil di dalam transaksi pemanggil; invoice/order sudah dikunci & ditandai paid oleh pemanggil. Perilaku TIDAK berubah dari versi inline:
//  - per item: modul aktif non-trial & end_at > sekarang → diperpanjang di tempat (Fase 176); trial digantikan; sudah lewat end_at → expired + baru;
//  - mulai = `now` (satu untuk seluruh order → semua fitur baru berakhir di instan yang sama), akhir kalender (ADR-0041), periode dari SNAPSHOT invoice item;
//  - `seat_addon` (`modules: []`) tidak pernah masuk jalur supersede/perpanjang dan membuat 1 slot `member_seats` per langganan (Fase 110).
export async function activateInvoiceItems(
  tx: Tx,
  params: { userId: string; orderId: string; dataUsahaId: string; items: { item: InvoiceItemRow; plan: PlanRow }[]; now: Date; timeZone: string; actorId: string },
): Promise<ActivationResult> {
  const { userId, orderId, dataUsahaId, items, now, timeZone, actorId } = params;

  // § ditemukan 2026-09-07 — trial SENGAJA tidak memblokir beli paket asli (upgrade kapan saja), tapi trial lama WAJIB ditutup begitu paket asli aktif
  // (cegah 2 subscription "active" untuk 1 modul). § Fase 108 — di-SCOPE PER DATA USAHA.
  const activeSubs = await tx
    .select({ id: subscriptions.id, modules: plans.modules, isTrial: subscriptions.isTrial, endAt: subscriptions.endAt })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active"), eq(subscriptions.dataUsahaId, dataUsahaId)));

  const createdSubscriptionIds: string[] = [];
  const renewals: RenewalResult[] = [];
  for (const { item, plan } of items) {
    const moduleKey = plan.modules[0];
    const interval = isSubscriptionInterval(item.interval) ? item.interval : isSubscriptionInterval(plan.interval) ? plan.interval : inferIntervalFromDays(item.durationDays);

    // § Fase 183, ADR-0043 — item perpanjangan KURSI: slot target diperpanjang di tempat (masih aktif) atau dihidupkan kembali dari `now` (sudah habis). Slot dibatalkan /
    // bukan kursi Data Usaha ini / tidak ada → jatuh ke pembelian slot BARU di bawah (pelanggan sudah membayar; jangan sampai tidak mendapat apa-apa).
    if (plan.kind === "seat_addon" && item.renewSubscriptionId) {
      // dikunci SEBELUM memilih cabang (job kedaluwarsa bisa membalik status di antaranya) + wajib benar-benar kursi (baris member_seats menunjuk langganan ini)
      const [target] = await tx.select().from(subscriptions).where(sql`${subscriptions.id} = ${item.renewSubscriptionId} FOR UPDATE`).limit(1);
      const [seatRow] = target ? await tx.select({ id: memberSeats.id }).from(memberSeats).where(eq(memberSeats.seatSubscriptionId, target.id)).limit(1) : [];
      if (target && seatRow && target.dataUsahaId === dataUsahaId && !target.isTrial && target.status !== "cancelled") {
        const stillRunning = target.status === "active" && !!target.endAt && target.endAt.getTime() > now.getTime();
        const result = stillRunning
          ? await renewSubscriptionInPlace(tx, { subscription: target, interval, timeZone, source: "order", actorId, orderId, invoiceItemId: item.id })
          : await reactivateSubscription(tx, { subscription: target, interval, timeZone, now, actorId, orderId, invoiceItemId: item.id });
        if (isSubscriptionInterval(item.renewalInterval)) await tx.update(subscriptions).set({ renewalInterval: item.renewalInterval }).where(eq(subscriptions.id, target.id));
        renewals.push(result);
        continue;
      }
      // fallback ke slot BARU (ADR-0043 poin 3) — dicatat supaya admin bisa menelusuri (mis. slot sengaja dicabut saat tagihan masih terbuka)
      await tx.insert(auditLogs).values({
        entityType: "order",
        entityId: orderId,
        action: "update",
        changes: { seatRenewalFallback: true, targetSubscriptionId: item.renewSubscriptionId, reason: !target ? "not_found" : !seatRow ? "not_a_seat" : target.dataUsahaId !== dataUsahaId ? "other_data_usaha" : target.isTrial ? "trial" : "cancelled" },
        actorId,
      });
    }

    if (moduleKey) {
      const renewable = await findRenewableSubscription(tx, { dataUsahaId, moduleKey, now });
      for (const s of activeSubs.filter((s) => s.modules[0] === moduleKey)) {
        if (renewable && s.id === renewable.id) continue;
        if (!s.isTrial && s.endAt && s.endAt.getTime() <= now.getTime()) {
          await tx.update(subscriptions).set({ status: "expired" }).where(eq(subscriptions.id, s.id));
        } else {
          await tx.update(subscriptions).set({ status: "cancelled", endAt: now }).where(eq(subscriptions.id, s.id));
        }
      }
      if (renewable) {
        renewals.push(await renewSubscriptionInPlace(tx, { subscription: renewable, interval, timeZone, source: "order", actorId, orderId, invoiceItemId: item.id }));
        // § Fase 181 — niat "perpanjangan berikutnya" yang ikut invoice ini dipasang ke langganan (tanpa niat → penanda lama dibiarkan).
        if (isSubscriptionInterval(item.renewalInterval)) await tx.update(subscriptions).set({ renewalInterval: item.renewalInterval }).where(eq(subscriptions.id, renewable.id));
        continue;
      }
    }

    const { endAt, periodAnchorAt, periodMonths } = computeSubscriptionPeriod(now, interval, timeZone);
    const [sub] = await tx
      .insert(subscriptions)
      .values({
        userId, planId: plan.id, orderId, invoiceItemId: item.id, status: "active", startAt: now, endAt, periodAnchorAt, periodMonths, dataUsahaId,
        renewalInterval: isSubscriptionInterval(item.renewalInterval) ? item.renewalInterval : null, // Fase 181 — siklus perpanjangan terjadwal berlanjut
      })
      .returning();
    createdSubscriptionIds.push(sub!.id);

    if (plan.kind === "seat_addon") {
      await tx.insert(memberSeats).values({ primaryUserId: userId, dataUsahaId, seatSubscriptionId: sub!.id });
    }
  }

  return { createdSubscriptionIds, renewals };
}
