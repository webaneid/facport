import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, ne, or, sql } from "drizzle-orm";
import { db } from "./db";
import { subscriptions, plans, dataUsaha, user as userTable, orders, invoices, invoiceItems } from "../db/schema";
import { createInvoiceAndOrder, inFlightModuleKeys, inFlightSeatRenewalIds } from "./invoice-order";
import { createNotification, createNotificationsBulk, NOTIFICATION_TYPES, formatNotificationDate } from "./notifications";
import { SUBSCRIPTION_REMINDER_THRESHOLDS } from "./subscription-reminders";
import { getUserIdsWithPermission } from "./permission";
import { isSubscriptionInterval, type SubscriptionInterval } from "./subscription-period";
import { moduleLabel } from "./module-catalog";
import { boss, JOBS, startQueue } from "./queue";
import { escapeHtml } from "./email";
import { env } from "./env";
import { logger } from "./logger";

// § Fase 181, ADR-0042 — perpanjangan TERJADWAL: langganan modul (non-trial) yang ditandai `renewal_interval` ditagih OTOMATIS menjelang berakhir. Pembayaran tetap manual
// (transfer/QRIS, diverifikasi admin) — yang otomatis hanya TERBITNYA tagihan. Setelah dibayar, aktivasi memperpanjang di tempat dari tanggal berakhir (`activateInvoiceItems`).
const DAY_MS = 24 * 60 * 60 * 1000;

/** Tagihan terbit pada ambang pengingat TERBESAR (H-7) — satu sumber dengan `SUBSCRIPTION_REMINDER_THRESHOLDS`, supaya tidak pernah menyimpang dari jadwal pengingat. */
export const RENEWAL_INVOICE_DAYS_BEFORE = Math.max(...SUBSCRIPTION_REMINDER_THRESHOLDS);

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Link bayar tagihan (halaman pembayaran pelanggan yang login) — dipakai email penerbitan & pengingat H-3/H-1. */
export function renewalPayUrl(orderId: string): string {
  return `${env.APP_ORIGIN_PROD || "http://app.localhost:6209"}/billing/${orderId}/pay`;
}

/** Murni: `endAt` dalam jendela penerbitan (sekarang < endAt ≤ sekarang + 7 hari)? */
export function isRenewalDue(endAt: Date, now: Date): boolean {
  const diff = endAt.getTime() - now.getTime();
  return diff > 0 && diff <= RENEWAL_INVOICE_DAYS_BEFORE * DAY_MS;
}

/** Murni: kunci kelompok = Data Usaha × HARI KALENDER berakhir (zona perusahaan). Langganan yang di-assign bersamaan berakhir di detik yang sama → 1 invoice, bukan puluhan. */
export function renewalGroupKey(dataUsahaId: string, endAt: Date, timeZone: string): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(endAt);
  return `${dataUsahaId}|${day}`;
}

export function groupByRenewalKey<T extends { dataUsahaId: string; endAt: Date }>(items: T[], timeZone: string): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = renewalGroupKey(item.dataUsahaId, item.endAt, timeZone);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.values()];
}

/** § Fase 183, ADR-0043 — kunci "apa yang diperpanjang": modul = kunci modulnya; kursi = `seat:<id langganan>` (satu slot satu kunci, bukan per modul). */
export function renewalItemKey(plan: { kind: string; modules: string[] }, subscriptionId: string): string | null {
  if (plan.kind === "seat_addon") return `seat:${subscriptionId}`;
  return plan.modules[0] ?? null;
}
export const isSeatKey = (key: string) => key.startsWith("seat:");
export const renewalItemLabel = (key: string) => (isSeatKey(key) ? "User Tambahan" : moduleLabel(key));

type SubscriptionRow = typeof subscriptions.$inferSelect;
type PlanRow = typeof plans.$inferSelect;
export type RenewalCandidate = { subscription: SubscriptionRow & { endAt: Date }; moduleKey: string; ownerId: string; ownerName: string; dataUsahaId: string; dataUsahaName: string };

// Kandidat terbit otomatis: aktif, bukan trial, modul ATAU kursi (Fase 183), ditandai, berakhir dalam jendela 7 hari, dan belum ditagih untuk `end_at` ini. Penerima tagihan = pemilik
// Data Usaha SAAT INI (bukan pembeli awal — kepemilikan bisa dipindah, ADR-0032).
export async function findDueRenewalCandidates(now: Date): Promise<RenewalCandidate[]> {
  const rows = await db
    .select({ sub: subscriptions, plan: plans, ownerId: userTable.id, ownerName: userTable.name, dataUsahaName: dataUsaha.name })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .innerJoin(dataUsaha, eq(dataUsaha.id, subscriptions.dataUsahaId))
    .innerJoin(userTable, eq(userTable.id, dataUsaha.userId))
    .where(
      and(
        eq(subscriptions.status, "active"),
        eq(subscriptions.isTrial, false),
        isNotNull(subscriptions.renewalInterval),
        gt(subscriptions.endAt, now),
        lte(subscriptions.endAt, new Date(now.getTime() + RENEWAL_INVOICE_DAYS_BEFORE * DAY_MS)),
        or(isNull(subscriptions.renewalInvoicedForEndAt), ne(subscriptions.renewalInvoicedForEndAt, subscriptions.endAt)),
      ),
    )
    .orderBy(asc(subscriptions.endAt));
  return rows.flatMap((r) => (renewalItemKey(r.plan, r.sub.id) && r.sub.endAt ? [{ subscription: r.sub as SubscriptionRow & { endAt: Date }, moduleKey: renewalItemKey(r.plan, r.sub.id)!, ownerId: r.ownerId, ownerName: r.ownerName, dataUsahaId: r.sub.dataUsahaId, dataUsahaName: r.dataUsahaName }] : []));
}

export type IssueOutcome =
  | { status: "issued"; invoiceId: string; orderId: string; invoiceNumber: string; amountDue: number; subscriptionIds: string[]; skippedInFlight: string[]; missingPlan: string[] }
  | { status: "nothing"; skippedInFlight: string[]; missingPlan: string[] };

// Menerbitkan SATU tagihan untuk satu kelompok (Data Usaha × hari berakhir). Satu transaksi: setiap langganan dikunci & divalidasi ULANG (status/penanda/end_at belum berubah),
// modul yang sudah punya pesanan berjalan dilewati TANPA menandai (dicoba lagi besok), modul tanpa paket periode ditandai (+ dikembalikan agar admin diberi tahu sekali per siklus).
// `force` (penerbitan manual admin) mengabaikan jendela 7 hari & penanda siklus, dan memakai `intervalOverride` bila langganan belum punya penanda.
export async function issueRenewalInvoiceForGroup(
  group: RenewalCandidate[],
  opts: { timeZone: string; force?: boolean; intervalOverride?: SubscriptionInterval },
): Promise<IssueOutcome> {
  const first = group[0]!;
  const skippedInFlight: string[] = [];
  const missingPlan: string[] = [];

  const outcome = await db.transaction(async (tx): Promise<IssueOutcome> => {
    // kunci baris user pemilik (pola sama dengan checkout) SEBELUM membaca pesanan berjalan — menutup TOCTOU antara penerbitan manual ganda / job × checkout pelanggan
    await tx.select({ id: userTable.id }).from(userTable).where(sql`${userTable.id} = ${first.ownerId} FOR UPDATE`).limit(1);
    const inFlight = await inFlightModuleKeys(tx, { userId: first.ownerId, dataUsahaId: first.dataUsahaId });
    const seatInFlight = await inFlightSeatRenewalIds(tx, { userId: first.ownerId, dataUsahaId: first.dataUsahaId });
    const chosen: { candidate: RenewalCandidate; plan: PlanRow; interval: SubscriptionInterval; flagged: boolean }[] = [];

    for (const candidate of group) {
      const [row] = await tx.select().from(subscriptions).where(sql`${subscriptions.id} = ${candidate.subscription.id} FOR UPDATE`).limit(1);
      const interval = isSubscriptionInterval(row?.renewalInterval) ? row.renewalInterval : opts.intervalOverride;
      const stillValid =
        !!row && row.status === "active" && !row.isTrial && !!row.endAt && row.endAt.getTime() === candidate.subscription.endAt.getTime() && !!interval &&
        (opts.force || !row.renewalInvoicedForEndAt || row.renewalInvoicedForEndAt.getTime() !== row.endAt.getTime());
      if (!stillValid) continue;
      if (isSeatKey(candidate.moduleKey) ? seatInFlight.has(candidate.subscription.id) : inFlight.has(candidate.moduleKey)) {
        skippedInFlight.push(candidate.moduleKey);
        continue;
      }
      const seat = isSeatKey(candidate.moduleKey);
      const planCandidates = await tx.select().from(plans).where(and(eq(plans.isActive, true), eq(plans.kind, seat ? "seat_addon" : "module"), eq(plans.interval, interval!)));
      const plan = planCandidates.filter((p) => seat || p.modules[0] === candidate.moduleKey).sort((a, b) => a.price - b.price || a.name.localeCompare(b.name))[0];
      if (!plan) {
        missingPlan.push(candidate.moduleKey);
        // tandai siklus ini supaya admin tidak dibanjiri notifikasi tiap hari; admin dapat menerbitkan manual setelah paketnya tersedia
        await tx.update(subscriptions).set({ renewalInvoicedForEndAt: row!.endAt }).where(eq(subscriptions.id, row!.id));
        continue;
      }
      chosen.push({ candidate: { ...candidate, subscription: { ...candidate.subscription, ...row! } as RenewalCandidate["subscription"] }, plan, interval: interval!, flagged: isSubscriptionInterval(row!.renewalInterval) });
    }

    if (chosen.length === 0) return { status: "nothing", skippedInFlight, missingPlan };

    const dueDate = chosen.map((c) => c.candidate.subscription.endAt).sort((a, b) => a.getTime() - b.getTime())[0]!;
    const created = await createInvoiceAndOrder(tx, {
      userId: first.ownerId,
      billToName: first.ownerName,
      // kursi: item menunjuk slotnya (diperpanjang / dihidupkan kembali saat dibayar) dan membawa niat siklus sendiri
      planRows: chosen.map((c) => (isSeatKey(c.candidate.moduleKey) ? { ...c.plan, renewSubscriptionId: c.candidate.subscription.id, itemRenewalInterval: c.flagged ? c.interval : null } : c.plan)),
      dataUsahaId: first.dataUsahaId,
      origin: "renewal",
      dueDate, // = tanggal berakhir (bukan +3 hari) — jangan sampai job kedaluwarsa invoice mengedaluwarsakannya sebelum langganan berakhir
      // hanya langganan yang MEMANG ditandai yang siklusnya berlanjut setelah dibayar; penerbitan manual satu kali (tanpa penanda) tidak menyalakan perpanjangan berulang
      renewalIntervalByPlanId: Object.fromEntries(chosen.filter((c) => c.flagged && !isSeatKey(c.candidate.moduleKey)).map((c) => [c.plan.id, c.interval])),
    });
    for (const { candidate } of chosen) {
      // `last_reminder_threshold_days = 7` menekan pengingat H-7 generik (tagihan inilah pengingat pertamanya); H-3/H-1 tetap berjalan sebagai pengingat "belum dibayar".
      await tx
        .update(subscriptions)
        .set({ renewalInvoicedForEndAt: candidate.subscription.endAt, lastReminderThresholdDays: RENEWAL_INVOICE_DAYS_BEFORE })
        .where(eq(subscriptions.id, candidate.subscription.id));
    }
    const [invoice] = await tx.select({ invoiceNumber: invoices.invoiceNumber }).from(invoices).where(eq(invoices.id, created.invoiceId));
    return {
      status: "issued",
      invoiceId: created.invoiceId,
      orderId: created.orderId,
      invoiceNumber: invoice!.invoiceNumber,
      amountDue: created.amountDue,
      subscriptionIds: chosen.map((c) => c.candidate.subscription.id),
      skippedInFlight,
      missingPlan,
    };
  });

  if (outcome.status === "issued") {
    const features = group.filter((c) => outcome.subscriptionIds.includes(c.subscription.id)).map((c) => renewalItemLabel(c.moduleKey));
    const dueDate = group.map((c) => c.subscription.endAt).sort((a, b) => a.getTime() - b.getTime())[0]!;
    // tagihan SUDAH ter-commit & bertanda — galat notifikasi/email tidak boleh menjadikan kelompok "gagal" (dicatat saja; pengingat H-3/H-1 tetap menyebut tagihannya)
    try {
      await notifyRenewalInvoiceIssued({ ownerId: first.ownerId, dataUsahaName: first.dataUsahaName, orderId: outcome.orderId, invoiceNumber: outcome.invoiceNumber, amountDue: outcome.amountDue, features, dueDate, timeZone: opts.timeZone });
    } catch (err) {
      logger.error({ err, orderId: outcome.orderId }, "Notifikasi tagihan perpanjangan gagal terkirim (tagihan tetap terbit)");
    }
  }
  if (outcome.missingPlan.length > 0) {
    try {
      await notifyAdminsRenewalFailed(first.dataUsahaName, outcome.missingPlan);
    } catch (err) {
      logger.error({ err }, "Notifikasi admin perpanjangan gagal terkirim");
    }
  }
  return outcome;
}

async function notifyRenewalInvoiceIssued(p: { ownerId: string; dataUsahaName: string; orderId: string; invoiceNumber: string; amountDue: number; features: string[]; dueDate: Date; timeZone: string }) {
  const tanggal = formatNotificationDate(p.dueDate, p.timeZone);
  const featureText = p.features.join(", ");
  const total = `Rp${p.amountDue.toLocaleString("id-ID")}`;
  const title = "Tagihan perpanjangan terbit";
  const body = `Langganan ${featureText} di Data Usaha ${p.dataUsahaName} berakhir ${tanggal}. Tagihan perpanjangan ${p.invoiceNumber} (${total}) sudah terbit — bayar sebelum tanggal itu supaya tidak terputus.`;
  await createNotification({ userId: p.ownerId, type: NOTIFICATION_TYPES.RENEWAL_INVOICE_ISSUED, title, body, entityType: "order", entityId: p.orderId });

  const [owner] = await db.select({ email: userTable.email, name: userTable.name }).from(userTable).where(eq(userTable.id, p.ownerId));
  if (!owner) return;
  const payUrl = renewalPayUrl(p.orderId);
  await startQueue();
  await boss.send(JOBS.SEND_EMAIL, {
    to: owner.email,
    subject: `${title} — ${p.invoiceNumber}`,
    html: `<p>Halo ${escapeHtml(owner.name)},</p><p>${escapeHtml(body)}</p><p>Bayar di sini: <a href="${payUrl}">${payUrl}</a></p>`,
  });
}

async function notifyAdminsRenewalFailed(dataUsahaName: string, moduleKeys: string[]) {
  const adminIds = await getUserIdsWithPermission("subscriptions.manage");
  if (adminIds.length === 0) return;
  const features = moduleKeys.map(renewalItemLabel).join(", ");
  await createNotificationsBulk(
    adminIds.map((userId) => ({
      userId,
      type: NOTIFICATION_TYPES.ADMIN_RENEWAL_INVOICE_FAILED,
      title: "Tagihan perpanjangan tidak bisa terbit",
      body: `Perpanjangan terjadwal ${features} di Data Usaha ${dataUsahaName} tidak dapat ditagihkan: tidak ada paket aktif untuk periode yang dipilih. Aktifkan paketnya lalu terbitkan tagihan manual dari detail user.`,
    })),
  );
}

export type IssueDueSummary = { groups: number; invoices: number; skippedInFlight: number; missingPlan: number; failedGroups: number };

// Orkestrasi job harian: kandidat → kelompok → satu tagihan per kelompok. Galat satu kelompok tidak menghentikan yang lain (dilog); aman diulang (penanda per siklus).
export async function issueDueRenewalInvoices(now: Date, timeZone: string): Promise<IssueDueSummary> {
  const candidates = await findDueRenewalCandidates(now);
  const groups = groupByRenewalKey(candidates.map((c) => ({ ...c, endAt: c.subscription.endAt })), timeZone);
  const summary: IssueDueSummary = { groups: groups.length, invoices: 0, skippedInFlight: 0, missingPlan: 0, failedGroups: 0 };
  for (const group of groups) {
    try {
      const outcome = await issueRenewalInvoiceForGroup(group, { timeZone });
      if (outcome.status === "issued") summary.invoices += 1;
      summary.skippedInFlight += outcome.skippedInFlight.length;
      summary.missingPlan += outcome.missingPlan.length;
    } catch (err) {
      summary.failedGroups += 1;
      logger.error({ err, dataUsahaId: group[0]?.dataUsahaId }, "Gagal menerbitkan tagihan perpanjangan");
    }
  }
  return summary;
}

export type OpenRenewalOrder = { orderId: string; invoiceNumber: string; amountDue: number };

// Tagihan perpanjangan yang MASIH TERBUKA (order pending/submitted, origin renewal) per langganan — dipakai pengingat H-3/H-1 ("tagihan belum dibayar", dengan link).
export async function openRenewalOrdersBySubscription(subs: { id: string; dataUsahaId: string; moduleKey: string }[]): Promise<Map<string, OpenRenewalOrder>> {
  const result = new Map<string, OpenRenewalOrder>();
  if (subs.length === 0) return result;
  const rows = await db
    .select({ orderId: orders.id, dataUsahaId: orders.dataUsahaId, moduleKey: invoiceItems.moduleKey, renewSubscriptionId: invoiceItems.renewSubscriptionId, invoiceNumber: invoices.invoiceNumber, total: invoices.total, uniqueCode: orders.uniqueCode })
    .from(orders)
    .innerJoin(invoices, eq(invoices.id, orders.invoiceId))
    .innerJoin(invoiceItems, eq(invoiceItems.invoiceId, invoices.id))
    .where(and(eq(orders.origin, "renewal"), inArray(orders.status, ["pending", "submitted"]), inArray(orders.dataUsahaId, [...new Set(subs.map((s) => s.dataUsahaId))])));
  for (const s of subs) {
    const match = rows.find((r) => r.dataUsahaId === s.dataUsahaId && (isSeatKey(s.moduleKey) ? r.renewSubscriptionId === s.id : r.moduleKey === s.moduleKey));
    if (match) result.set(s.id, { orderId: match.orderId, invoiceNumber: match.invoiceNumber, amountDue: match.total + match.uniqueCode });
  }
  return result;
}

export class RenewalIssueError extends Error {
  constructor(public code: "SUBSCRIPTION_NOT_FOUND" | "SUBSCRIPTION_NOT_RENEWABLE" | "RENEWAL_INTERVAL_REQUIRED" | "MODULE_ORDER_IN_PROGRESS" | "RENEWAL_PLAN_NOT_AVAILABLE") {
    super(code);
  }
}

// Penerbitan MANUAL oleh admin untuk satu langganan (tombol "Terbitkan tagihan sekarang"): mengabaikan jendela 7 hari & penanda siklus (mis. tagihan sebelumnya dibatalkan, atau paket baru
// tersedia). Tetap menolak langganan trial/habis/seat, modul yang masih punya pesanan berjalan, dan paket periode yang tidak ada — dengan kode galat yang jelas.
export async function issueRenewalInvoiceNow(subscriptionId: string, opts: { timeZone: string; interval?: SubscriptionInterval }) {
  const [row] = await db
    .select({ sub: subscriptions, plan: plans, ownerId: userTable.id, ownerName: userTable.name, dataUsahaName: dataUsaha.name })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .innerJoin(dataUsaha, eq(dataUsaha.id, subscriptions.dataUsahaId))
    .innerJoin(userTable, eq(userTable.id, dataUsaha.userId))
    .where(eq(subscriptions.id, subscriptionId));
  if (!row) throw new RenewalIssueError("SUBSCRIPTION_NOT_FOUND");
  const moduleKey = renewalItemKey(row.plan, row.sub.id);
  if (row.sub.status !== "active" || row.sub.isTrial || !row.sub.endAt || row.sub.endAt.getTime() <= Date.now() || !moduleKey) throw new RenewalIssueError("SUBSCRIPTION_NOT_RENEWABLE");
  const interval = isSubscriptionInterval(row.sub.renewalInterval) ? row.sub.renewalInterval : opts.interval;
  if (!interval) throw new RenewalIssueError("RENEWAL_INTERVAL_REQUIRED");

  const candidate: RenewalCandidate = { subscription: row.sub as RenewalCandidate["subscription"], moduleKey, ownerId: row.ownerId, ownerName: row.ownerName, dataUsahaId: row.sub.dataUsahaId, dataUsahaName: row.dataUsahaName };
  const outcome = await issueRenewalInvoiceForGroup([candidate], { timeZone: opts.timeZone, force: true, intervalOverride: interval });
  if (outcome.status === "issued") return outcome;
  if (outcome.skippedInFlight.length > 0) throw new RenewalIssueError("MODULE_ORDER_IN_PROGRESS");
  throw new RenewalIssueError("RENEWAL_PLAN_NOT_AVAILABLE");
}
