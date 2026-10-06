import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "./db";
import { subscriptions, subscriptionRenewals, plans, auditLogs } from "../db/schema";
import { computeRenewalEnd, type SubscriptionInterval } from "./subscription-period";
import { formatNotificationDateTime } from "./notifications";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type SubscriptionRow = typeof subscriptions.$inferSelect;

// § Fase 176, ADR-0041 poin 4 — perpanjangan dini. Langganan modul NON-trial yang MASIH AKTIF (status active DAN end_at > sekarang) pada Data Usaha yang
// sama dengan pembelian = kandidat perpanjangan: end_at diperpanjang di tempat dari akhir lama (tidak ada hari pelanggan yang hilang). Langganan yang
// sudah lewat end_at (walau job belum membalik statusnya) BUKAN kandidat — pembelian baru mulai dari saat disetujui (pelanggan tidak memakai fitur di masa jeda).
export async function findRenewableSubscription(tx: Tx | typeof db, params: { dataUsahaId: string; moduleKey: string; now: Date }): Promise<SubscriptionRow | null> {
  const rows = await tx
    .select({ subscription: subscriptions, modules: plans.modules })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(subscriptions.status, "active"), eq(subscriptions.dataUsahaId, params.dataUsahaId), eq(subscriptions.isTrial, false)))
    .orderBy(desc(subscriptions.createdAt));
  const match = rows.find((r) => r.modules[0] === params.moduleKey && r.subscription.endAt !== null && r.subscription.endAt.getTime() > params.now.getTime());
  return match?.subscription ?? null;
}

export type RenewalResult = { subscriptionId: string; previousEndAt: Date; newEndAt: Date; periodMonths: number };

// § Memperpanjang di tempat + mencatat riwayat + audit. WAJIB dipanggil di dalam transaksi pemanggil (`tx`). `lastReminderThresholdDays` direset supaya
// pengingat H-7/H-3/H-1 berlaku lagi untuk akhir yang baru.
export async function renewSubscriptionInPlace(
  tx: Tx,
  params: {
    subscription: SubscriptionRow;
    interval: SubscriptionInterval;
    timeZone: string;
    source: "order" | "admin";
    actorId: string;
    orderId?: string | null;
    invoiceItemId?: string | null;
  },
): Promise<RenewalResult> {
  const { interval, timeZone, source, actorId } = params;
  // Kunci baris & baca ULANG nilai terbaru — dua perpanjangan bersamaan (mis. konfirmasi order + assign admin) tidak boleh saling menimpa (lost update):
  // yang kedua menunggu, lalu menghitung dari akhir yang SUDAH diperpanjang yang pertama.
  const [subscription] = await tx.select().from(subscriptions).where(sql`${subscriptions.id} = ${params.subscription.id} FOR UPDATE`).limit(1);
  if (!subscription) throw new Error("SUBSCRIPTION_NOT_FOUND");
  if (!subscription.endAt) throw new Error("SUBSCRIPTION_HAS_NO_END_DATE");
  const previousEndAt = subscription.endAt;
  const next = computeRenewalEnd({ endAt: previousEndAt, periodAnchorAt: subscription.periodAnchorAt, periodMonths: subscription.periodMonths }, interval, timeZone);

  await tx
    .update(subscriptions)
    .set({ endAt: next.endAt, periodAnchorAt: next.periodAnchorAt, periodMonths: next.periodMonths, lastReminderThresholdDays: null })
    .where(eq(subscriptions.id, subscription.id));

  await tx.insert(subscriptionRenewals).values({
    subscriptionId: subscription.id,
    orderId: params.orderId ?? null,
    invoiceItemId: params.invoiceItemId ?? null,
    source,
    previousEndAt,
    newEndAt: next.endAt,
    interval,
    actorId,
  });

  await tx.insert(auditLogs).values({
    entityType: "subscription",
    entityId: subscription.id,
    action: "update",
    changes: { renewed: true, source, interval, endAt: { old: previousEndAt.toISOString(), new: next.endAt.toISOString() }, orderId: params.orderId ?? null },
    actorId,
  });

  return { subscriptionId: subscription.id, previousEndAt, newEndAt: next.endAt, periodMonths: next.periodMonths };
}

// § Teks notifikasi "Pembayaran terverifikasi". Tanpa perpanjangan = teks lama (tidak berubah). Dengan perpanjangan: sebut sampai kapan berlaku (tanggal + jam,
// zona perusahaan) — pelanggan melihat bahwa sisa masa aktifnya tidak hilang.
export function paymentVerifiedBody(createdCount: number, renewals: { newEndAt: Date }[], timeZone: string): string {
  if (renewals.length === 0) {
    return createdCount === 1
      ? "Pembayaran kamu terverifikasi — langganan sudah aktif, selamat menggunakan Facport!"
      : `Pembayaran kamu terverifikasi — ${createdCount} langganan sudah aktif, selamat menggunakan Facport!`;
  }
  const renewedText =
    renewals.length === 1
      ? `perpanjangan langganan berhasil, berlaku sampai ${formatNotificationDateTime(renewals[0]!.newEndAt, timeZone)}`
      : `${renewals.length} langganan berhasil diperpanjang, masing-masing dari tanggal berakhirnya`;
  return createdCount === 0
    ? `Pembayaran kamu terverifikasi — ${renewedText}.`
    : `Pembayaran kamu terverifikasi — ${createdCount} langganan baru sudah aktif dan ${renewedText}.`;
}
