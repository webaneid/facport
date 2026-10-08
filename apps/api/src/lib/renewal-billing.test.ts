import { describe, test, expect, spyOn } from "bun:test";
import { eq, and } from "drizzle-orm";
import { db } from "./db";
import { plans, subscriptions, invoices, invoiceItems, orders, notifications, roles, userRoles, memberSeats, user as userTable } from "../db/schema";
import {
  isRenewalDue,
  renewalGroupKey,
  groupByRenewalKey,
  RENEWAL_INVOICE_DAYS_BEFORE,
  issueDueRenewalInvoices,
  issueRenewalInvoiceNow,
  RenewalIssueError,
  openRenewalOrdersBySubscription,
} from "./renewal-billing";
import { createTestDataUsaha, createTestSeat } from "./test-fixtures";
import { cancelOrder, ADMIN_CANCELLABLE_STATUSES } from "./order-cancel";
import { activateInvoiceItems } from "./order-activation";
import { addCalendarMonths } from "./subscription-period";
import { boss } from "./queue";

// § Fase 181, ADR-0042 — perpanjangan terjadwal: tagihan terbit otomatis 7 hari sebelum berakhir untuk langganan ber-penanda.
const WIB = "Asia/Jakarta";
const DAY = 24 * 60 * 60 * 1000;
const wib = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(Date.UTC(y, mo - 1, d, h - 7, mi));
const runId = Date.now();
let seq = 0;

describe("isRenewalDue / renewalGroupKey / groupByRenewalKey (murni)", () => {
  const now = wib(2026, 10, 8, 9, 0);
  test("jendela: tepat 7 hari = terbit; 7 hari + 1 ms = belum; sudah lewat / tepat sekarang = tidak", () => {
    expect(RENEWAL_INVOICE_DAYS_BEFORE).toBe(7); // satu sumber dengan ambang pengingat terbesar
    expect(isRenewalDue(new Date(now.getTime() + 7 * DAY), now)).toBe(true);
    expect(isRenewalDue(new Date(now.getTime() + 7 * DAY + 1), now)).toBe(false);
    expect(isRenewalDue(new Date(now.getTime() + 1), now)).toBe(true);
    expect(isRenewalDue(now, now)).toBe(false);
    expect(isRenewalDue(new Date(now.getTime() - 1), now)).toBe(false);
  });
  test("kunci kelompok memakai HARI KALENDER WIB (bukan UTC): 7 Nov 00:30 WIB (= 6 Nov 17:30 UTC) sehari dengan 7 Nov 23:00 WIB, beda dari 6 Nov 23:00 WIB", () => {
    const a = renewalGroupKey("du-1", wib(2026, 11, 7, 0, 30), WIB);
    expect(a).toBe(renewalGroupKey("du-1", wib(2026, 11, 7, 23, 0), WIB));
    expect(a).not.toBe(renewalGroupKey("du-1", wib(2026, 11, 6, 23, 0), WIB));
    expect(a).not.toBe(renewalGroupKey("du-2", wib(2026, 11, 7, 0, 30), WIB)); // beda Data Usaha = beda kelompok
  });
  test("groupByRenewalKey: yang berakhir di detik yang sama satu kelompok; beda hari / beda Data Usaha terpisah", () => {
    const end = wib(2026, 11, 7, 10, 0);
    const groups = groupByRenewalKey(
      [
        { id: 1, dataUsahaId: "a", endAt: end },
        { id: 2, dataUsahaId: "a", endAt: end },
        { id: 3, dataUsahaId: "a", endAt: wib(2026, 11, 8, 10, 0) },
        { id: 4, dataUsahaId: "b", endAt: end },
      ],
      WIB,
    );
    expect(groups.map((g) => g.map((x) => x.id))).toEqual([[1, 2], [3], [4]]);
  });
});

// ---------- DB ----------
async function makeUser(tag: string, role?: string) {
  const id = crypto.randomUUID();
  const email = `renewal-${tag}-${runId}-${++seq}@test.local`;
  await db.insert(userTable).values({ id, name: `Renewal ${tag}`, email, emailVerified: true, createdAt: new Date() });
  if (role) {
    const [r] = await db.select().from(roles).where(eq(roles.name, role));
    await db.insert(userRoles).values({ userId: id, roleId: r!.id }).onConflictDoNothing();
  }
  return { id, email };
}
const makePlan = async (moduleKey: string, interval: "monthly" | "yearly", price = 1000) =>
  (await db.insert(plans).values({ name: `Renewal Plan ${moduleKey} ${interval} ${runId}-${++seq}`, price, durationDays: interval === "yearly" ? 365 : 30, interval, modules: [moduleKey] }).returning())[0]!;

// langganan aktif ber-penanda yang berakhir `endsInDays` hari lagi
async function seedSub(opts: { ownerId: string; dataUsahaId: string; moduleKey: string; endsInDays?: number; endAt?: Date; renewalInterval?: "monthly" | "yearly" | null; isTrial?: boolean; status?: string; buyerId?: string }) {
  const plan = await makePlan(opts.moduleKey, "monthly");
  const endAt = opts.endAt ?? new Date(Date.now() + (opts.endsInDays ?? 5) * DAY);
  const [sub] = await db
    .insert(subscriptions)
    .values({
      userId: opts.buyerId ?? opts.ownerId, planId: plan.id, status: opts.status ?? "active", startAt: new Date(endAt.getTime() - 30 * DAY), endAt, isTrial: opts.isTrial ?? false,
      renewalInterval: opts.renewalInterval === undefined ? "yearly" : opts.renewalInterval, dataUsahaId: opts.dataUsahaId,
    })
    .returning();
  return { sub: sub!, plan };
}
function spyEmails() {
  const sent: { to: string; subject: string; html: string }[] = [];
  const spy = spyOn(boss, "send").mockImplementation((async (_n: string, data: unknown) => {
    sent.push(data as { to: string; subject: string; html: string });
    return "job-id";
  }) as never);
  return { sent, spy };
}
async function setup(tag: string) {
  const owner = await makeUser(`${tag}-owner`);
  const dataUsahaId = await createTestDataUsaha(owner.id, `Renewal DU ${tag} ${runId}`);
  return { owner, dataUsahaId };
}
const invoicesOf = (userId: string) => db.select().from(invoices).where(eq(invoices.userId, userId));

describe("issueDueRenewalInvoices — penerbitan otomatis", () => {
  test("langganan ber-penanda tahunan berakhir 5 hari lagi → 1 invoice biasa (unpaid, order pending, origin renewal) dengan jatuh tempo = tanggal berakhir, paket TAHUNAN, niat siklus terbawa; langganan ditandai; notifikasi + email", async () => {
    const { owner, dataUsahaId } = await setup("issue");
    await makePlan("sales_quotation", "yearly", 999);
    const { sub } = await seedSub({ ownerId: owner.id, dataUsahaId, moduleKey: "sales_quotation", endsInDays: 5, renewalInterval: "yearly" });
    await db.update(subscriptions).set({ lastReminderThresholdDays: null }).where(eq(subscriptions.id, sub.id));
    const { sent, spy } = spyEmails();
    try {
      const summary = await issueDueRenewalInvoices(new Date(), WIB);
      expect(summary.invoices).toBeGreaterThanOrEqual(1);

      const [inv] = await invoicesOf(owner.id);
      expect(inv).toMatchObject({ status: "unpaid", userId: owner.id });
      expect(inv!.dueDate!.getTime()).toBe(sub.endAt!.getTime()); // BUKAN +3 hari
      const [order] = await db.select().from(orders).where(eq(orders.invoiceId, inv!.id));
      expect(order).toMatchObject({ status: "pending", origin: "renewal", dataUsahaId });
      const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, inv!.id));
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ moduleKey: "sales_quotation", interval: "yearly", renewalInterval: "yearly" });
      expect(inv!.total).toBe(items[0]!.price);

      const [after] = await db.select().from(subscriptions).where(eq(subscriptions.id, sub.id));
      expect(after!.renewalInvoicedForEndAt!.getTime()).toBe(sub.endAt!.getTime());
      expect(after!.lastReminderThresholdDays).toBe(7); // menekan pengingat H-7 generik
      expect(after!.endAt!.getTime()).toBe(sub.endAt!.getTime()); // penerbitan TIDAK mengubah masa aktif

      const [notif] = await db.select().from(notifications).where(eq(notifications.userId, owner.id));
      expect(notif!.type).toBe("renewal_invoice_issued");
      expect(notif!.body).toContain(inv!.invoiceNumber);
      const mail = sent.find((m) => m.to === owner.email)!;
      expect(mail.subject).toContain(inv!.invoiceNumber);
      expect(mail.html).toContain(`/billing/${order!.id}/pay`);
    } finally {
      spy.mockRestore();
    }
  });

  test("IDEMPOTEN: dijalankan lagi tidak menerbitkan tagihan kedua untuk siklus yang sama", async () => {
    const { owner, dataUsahaId } = await setup("idem");
    await makePlan("sales_return", "yearly");
    await seedSub({ ownerId: owner.id, dataUsahaId, moduleKey: "sales_return", endsInDays: 4 });
    const { spy } = spyEmails();
    try {
      await issueDueRenewalInvoices(new Date(), WIB);
      await issueDueRenewalInvoices(new Date(), WIB);
      expect(await invoicesOf(owner.id)).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });

  test("TIDAK menerbitkan: di luar jendela (10 hari), tanpa penanda, trial, seat, status bukan aktif, sudah lewat end_at", async () => {
    const { owner, dataUsahaId } = await setup("skip");
    await makePlan("delivery_order", "yearly");
    await seedSub({ ownerId: owner.id, dataUsahaId, moduleKey: "delivery_order", endsInDays: 10 });
    await seedSub({ ownerId: owner.id, dataUsahaId, moduleKey: "receive_item", endsInDays: 3, renewalInterval: null });
    await seedSub({ ownerId: owner.id, dataUsahaId, moduleKey: "other_deposit", endsInDays: 3, isTrial: true });
    await seedSub({ ownerId: owner.id, dataUsahaId, moduleKey: "other_payment", endsInDays: 3, status: "cancelled" });
    await seedSub({ ownerId: owner.id, dataUsahaId, moduleKey: "work_order", endAt: new Date(Date.now() - 1000) });
    // seat: langganan kursi ditandai (data tidak wajar) tetap tidak ditagih
    const seatId = await createTestSeat(owner.id, dataUsahaId);
    const [seatRow] = await db.select({ seatSubscriptionId: memberSeats.seatSubscriptionId }).from(memberSeats).where(eq(memberSeats.id, seatId));
    await db.update(subscriptions).set({ renewalInterval: "yearly", endAt: new Date(Date.now() + 3 * DAY) }).where(eq(subscriptions.id, seatRow!.seatSubscriptionId));
    const { spy } = spyEmails();
    try {
      await issueDueRenewalInvoices(new Date(), WIB);
      expect(await invoicesOf(owner.id)).toHaveLength(0);
    } finally {
      spy.mockRestore();
    }
  });

  test("modul yang sudah punya pesanan berjalan DILEWATI tanpa menandai; setelah pesanan dibatalkan terbit di run berikutnya", async () => {
    const { owner, dataUsahaId } = await setup("inflight");
    await makePlan("purchase_return", "yearly");
    const { sub } = await seedSub({ ownerId: owner.id, dataUsahaId, moduleKey: "purchase_return", endsInDays: 4 });
    // pesanan pending untuk modul yang sama (mis. perpanjangan manual oleh pelanggan)
    const [inv] = await db.insert(invoices).values({ invoiceNumber: `INV/RB/${runId}/${++seq}`, userId: owner.id, status: "unpaid", billToName: "x", subtotal: 1, total: 1, dueDate: new Date(Date.now() + DAY) }).returning();
    await db.insert(invoiceItems).values({ invoiceId: inv!.id, planId: sub.planId, moduleKey: "purchase_return", label: "x", price: 1, durationDays: 365, interval: "yearly" });
    const [order] = await db.insert(orders).values({ invoiceId: inv!.id, uniqueCode: 111, status: "pending", dataUsahaId }).returning();
    const { spy } = spyEmails();
    try {
      const first = await issueDueRenewalInvoices(new Date(), WIB);
      expect(first.skippedInFlight).toBeGreaterThanOrEqual(1);
      expect(await invoicesOf(owner.id)).toHaveLength(1); // hanya yang sudah ada
      expect((await db.select().from(subscriptions).where(eq(subscriptions.id, sub.id)))[0]!.renewalInvoicedForEndAt).toBeNull();

      await db.transaction((tx) => cancelOrder(tx, { orderId: order!.id, actorId: owner.id, reason: "uji", allowedStatuses: ADMIN_CANCELLABLE_STATUSES, notifyCustomer: false }));
      await issueDueRenewalInvoices(new Date(), WIB);
      const all = await invoicesOf(owner.id);
      expect(all).toHaveLength(2);
      expect(all.filter((i) => i.status === "unpaid")).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });

  test("paket periode tidak tersedia → tidak terbit, langganan ditandai (tidak diulang tiap hari), admin dinotifikasi; tidak notifikasi ganda di run berikutnya", async () => {
    const { owner, dataUsahaId } = await setup("noplan");
    const admin = await makeUser("noplan-admin", "admin");
    // modul langka tanpa paket tahunan aktif: pakai modul unik dengan paket bulanan saja (langganan memakai paket bulanan)
    const { sub } = await seedSub({ ownerId: owner.id, dataUsahaId, moduleKey: "konverter_standard_cost", endsInDays: 4, renewalInterval: "yearly" });
    const { spy } = spyEmails();
    try {
      const first = await issueDueRenewalInvoices(new Date(), WIB);
      expect(first.missingPlan).toBeGreaterThanOrEqual(1);
      expect(await invoicesOf(owner.id)).toHaveLength(0);
      expect((await db.select().from(subscriptions).where(eq(subscriptions.id, sub.id)))[0]!.renewalInvoicedForEndAt!.getTime()).toBe(sub.endAt!.getTime());
      const adminNotifs = () => db.select().from(notifications).where(and(eq(notifications.userId, admin.id), eq(notifications.type, "admin_renewal_invoice_failed")));
      expect(await adminNotifs()).toHaveLength(1);
      await issueDueRenewalInvoices(new Date(), WIB);
      expect(await adminNotifs()).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
  });

  test("kelompok: 3 langganan berakhir di hari WIB yang sama → 1 invoice 3 item, jatuh tempo = berakhir terawal; hari lain → invoice terpisah; penerima = pemilik Data Usaha SAAT INI; niat per item mengikuti penanda masing-masing", async () => {
    const { owner, dataUsahaId } = await setup("group");
    const buyer = await makeUser("group-oldbuyer"); // pembeli awal ≠ pemilik sekarang
    await Promise.all([makePlan("job_costing", "yearly"), makePlan("roll_over", "monthly"), makePlan("material_slip", "yearly"), makePlan("finished_good_slip", "yearly")]);
    const day1 = new Date(Date.now() + 3 * DAY);
    const dayStart = new Date(day1); // beberapa jam berbeda di hari kalender WIB yang sama
    const a = await seedSub({ ownerId: owner.id, buyerId: buyer.id, dataUsahaId, moduleKey: "job_costing", endAt: new Date(dayStart.getTime()), renewalInterval: "yearly" });
    const b = await seedSub({ ownerId: owner.id, dataUsahaId, moduleKey: "roll_over", endAt: new Date(dayStart.getTime() + 1000), renewalInterval: "monthly" });
    const c = await seedSub({ ownerId: owner.id, dataUsahaId, moduleKey: "material_slip", endAt: new Date(dayStart.getTime() + 2000), renewalInterval: "yearly" });
    const other = await seedSub({ ownerId: owner.id, dataUsahaId, moduleKey: "finished_good_slip", endAt: new Date(Date.now() + 6 * DAY), renewalInterval: "yearly" });
    const { spy } = spyEmails();
    try {
      await issueDueRenewalInvoices(new Date(), WIB);
      const all = await invoicesOf(owner.id);
      expect(all).toHaveLength(2); // gabungan 3 + terpisah 1
      expect(await invoicesOf(buyer.id)).toHaveLength(0);
      const items = async (invId: string) => db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invId));
      const combined = (await Promise.all(all.map(async (i) => ({ i, items: await items(i.id) })))).find((x) => x.items.length === 3)!;
      expect(combined.i.dueDate!.getTime()).toBe(a.sub.endAt!.getTime());
      const byModule = Object.fromEntries(combined.items.map((it) => [it.moduleKey, it]));
      expect(byModule.job_costing).toMatchObject({ interval: "yearly", renewalInterval: "yearly" });
      expect(byModule.roll_over).toMatchObject({ interval: "monthly", renewalInterval: "monthly" });
      expect(byModule.material_slip).toMatchObject({ interval: "yearly", renewalInterval: "yearly" });
      const separate = all.find((i) => i.id !== combined.i.id)!;
      expect(separate.dueDate!.getTime()).toBe(other.sub.endAt!.getTime());
      expect(b.sub.id).toBeTruthy();
      expect(c.sub.id).toBeTruthy();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("alur lengkap: tagihan perpanjangan dibayar → diperpanjang dari tanggal berakhir, siklus berlanjut", () => {
  test("setelah pembayaran disetujui langganan diperpanjang di tempat (akhir lama + 1 tahun, jangkar), penanda tetap, dan tagihan siklus BERIKUTNYA baru terbit saat end_at baru mendekat", async () => {
    const { owner, dataUsahaId } = await setup("flow");
    await makePlan("inventory_adjustment", "yearly");
    const { sub } = await seedSub({ ownerId: owner.id, dataUsahaId, moduleKey: "inventory_adjustment", endsInDays: 5, renewalInterval: "yearly" });
    const { spy } = spyEmails();
    try {
      await issueDueRenewalInvoices(new Date(), WIB);
      const [inv] = await invoicesOf(owner.id);
      const [order] = await db.select().from(orders).where(eq(orders.invoiceId, inv!.id));
      const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, inv!.id));
      const planRow = (await db.select().from(plans).where(eq(plans.id, items[0]!.planId!)))[0]!;

      // disetujui admin → aktivasi (inti yang sama dengan POST /admin/orders/:id/confirm)
      const now = new Date();
      await db.transaction((tx) => activateInvoiceItems(tx, { userId: owner.id, orderId: order!.id, dataUsahaId, items: [{ item: items[0]!, plan: planRow }], now, timeZone: WIB, actorId: owner.id }));
      const [after] = await db.select().from(subscriptions).where(eq(subscriptions.id, sub.id));
      expect(after!.endAt!.getTime()).toBe(addCalendarMonths(sub.endAt!, 12, WIB).getTime());
      expect(after!.renewalInterval).toBe("yearly"); // siklus berlanjut
      expect((await db.select().from(subscriptions).where(and(eq(subscriptions.userId, owner.id), eq(subscriptions.dataUsahaId, dataUsahaId)))).length).toBe(1);

      // siklus berikutnya: end_at baru jauh (1 tahun) → belum terbit; mendekat → terbit sekali lagi
      await issueDueRenewalInvoices(new Date(), WIB);
      expect(await invoicesOf(owner.id)).toHaveLength(1);
      await db.update(subscriptions).set({ endAt: new Date(Date.now() + 3 * DAY), renewalInvoicedForEndAt: after!.renewalInvoicedForEndAt }).where(eq(subscriptions.id, sub.id));
      await db.update(orders).set({ status: "paid" }).where(eq(orders.id, order!.id));
      await issueDueRenewalInvoices(new Date(), WIB);
      expect(await invoicesOf(owner.id)).toHaveLength(2);
    } finally {
      spy.mockRestore();
    }
  });

  test("aktivasi dari invoice biasa yang membawa niat (renewal_interval) memasang penanda ke langganan BARU; item tanpa niat tidak menyentuh penanda lama", async () => {
    const { owner, dataUsahaId } = await setup("carry");
    const plan = await makePlan("konverter_requisition", "yearly");
    const [inv] = await db.insert(invoices).values({ invoiceNumber: `INV/RB/${runId}/${++seq}`, userId: owner.id, status: "paid", billToName: "x", subtotal: 1, total: 1, dueDate: new Date() }).returning();
    const [item] = await db.insert(invoiceItems).values({ invoiceId: inv!.id, planId: plan.id, moduleKey: "konverter_requisition", label: "x", price: 1, durationDays: 365, interval: "yearly", renewalInterval: "yearly" }).returning();
    const [order] = await db.insert(orders).values({ invoiceId: inv!.id, uniqueCode: 0, status: "paid", dataUsahaId }).returning();
    await db.transaction((tx) => activateInvoiceItems(tx, { userId: owner.id, orderId: order!.id, dataUsahaId, items: [{ item: item!, plan }], now: new Date(), timeZone: WIB, actorId: owner.id }));
    const [created] = await db.select().from(subscriptions).where(and(eq(subscriptions.userId, owner.id), eq(subscriptions.dataUsahaId, dataUsahaId)));
    expect(created!.renewalInterval).toBe("yearly");
  });
});

describe("issueRenewalInvoiceNow — penerbitan manual admin", () => {
  test("terbit walau di luar jendela 7 hari dan walau siklus sudah ditagih sebelumnya (mis. tagihan lama dibatalkan); invoice origin renewal", async () => {
    const { owner, dataUsahaId } = await setup("manual");
    await makePlan("work_order", "yearly");
    const { sub } = await seedSub({ ownerId: owner.id, dataUsahaId, moduleKey: "work_order", endsInDays: 40, renewalInterval: "yearly" });
    await db.update(subscriptions).set({ renewalInvoicedForEndAt: sub.endAt }).where(eq(subscriptions.id, sub.id));
    const { spy } = spyEmails();
    try {
      const outcome = await issueRenewalInvoiceNow(sub.id, { timeZone: WIB });
      expect(outcome.status).toBe("issued");
      const [order] = await db.select().from(orders).where(eq(orders.id, outcome.orderId));
      expect(order!.origin).toBe("renewal");
    } finally {
      spy.mockRestore();
    }
  });

  test("tanpa penanda: butuh interval; dengan interval terbit tetapi TIDAK menyalakan siklus berulang (item tanpa renewal_interval)", async () => {
    const { owner, dataUsahaId } = await setup("manual-nonflag");
    await makePlan("material_slip", "monthly");
    const { sub } = await seedSub({ ownerId: owner.id, dataUsahaId, moduleKey: "konverter_item_transfer", endsInDays: 20, renewalInterval: null });
    await makePlan("konverter_item_transfer", "monthly");
    const { spy } = spyEmails();
    try {
      await expect(issueRenewalInvoiceNow(sub.id, { timeZone: WIB })).rejects.toMatchObject({ code: "RENEWAL_INTERVAL_REQUIRED" });
      const outcome = await issueRenewalInvoiceNow(sub.id, { timeZone: WIB, interval: "monthly" });
      const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, outcome.invoiceId));
      expect(items[0]!.renewalInterval).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  test("ditolak dengan kode jelas: tidak ditemukan, trial/habis (NOT_RENEWABLE), pesanan berjalan (MODULE_ORDER_IN_PROGRESS), paket periode tidak ada (RENEWAL_PLAN_NOT_AVAILABLE)", async () => {
    const { owner, dataUsahaId } = await setup("manual-reject");
    const code = async (id: string, interval?: "monthly" | "yearly") => {
      try {
        await issueRenewalInvoiceNow(id, { timeZone: WIB, interval });
        return "OK";
      } catch (err) {
        return err instanceof RenewalIssueError ? err.code : String(err);
      }
    };
    expect(await code(crypto.randomUUID())).toBe("SUBSCRIPTION_NOT_FOUND");
    const trial = await seedSub({ ownerId: owner.id, dataUsahaId, moduleKey: "journal_voucher", endsInDays: 3, isTrial: true });
    const lapsed = await seedSub({ ownerId: owner.id, dataUsahaId, moduleKey: "purchase_payment", endAt: new Date(Date.now() - 1000) });
    expect(await code(trial.sub.id)).toBe("SUBSCRIPTION_NOT_RENEWABLE");
    expect(await code(lapsed.sub.id)).toBe("SUBSCRIPTION_NOT_RENEWABLE");
    const noPlan = await seedSub({ ownerId: owner.id, dataUsahaId, moduleKey: "konverter_vendor_payment", endsInDays: 3, renewalInterval: "yearly" });
    expect(await code(noPlan.sub.id)).toBe("RENEWAL_PLAN_NOT_AVAILABLE");
  });
});

describe("openRenewalOrdersBySubscription", () => {
  test("hanya order origin 'renewal' yang masih pending/submitted; checkout/dibatalkan/lunas tidak dihitung", async () => {
    const { owner, dataUsahaId } = await setup("open");
    const sub = await seedSub({ ownerId: owner.id, dataUsahaId, moduleKey: "konverter_journal_voucher", endsInDays: 3 });
    const mk = async (origin: string, status: string) => {
      const [inv] = await db.insert(invoices).values({ invoiceNumber: `INV/RB/${runId}/${++seq}`, userId: owner.id, status: "unpaid", billToName: "x", subtotal: 100, total: 100, dueDate: new Date(Date.now() + DAY) }).returning();
      await db.insert(invoiceItems).values({ invoiceId: inv!.id, planId: sub.plan.id, moduleKey: "konverter_journal_voucher", label: "x", price: 100, durationDays: 365, interval: "yearly" });
      const [o] = await db.insert(orders).values({ invoiceId: inv!.id, uniqueCode: 123, status, origin, dataUsahaId }).returning();
      return { order: o!, invoice: inv! };
    };
    const target = { id: sub.sub.id, dataUsahaId, moduleKey: "konverter_journal_voucher" };
    await mk("checkout", "pending");
    await mk("renewal", "cancelled");
    await mk("renewal", "paid");
    expect((await openRenewalOrdersBySubscription([target])).size).toBe(0);
    const open = await mk("renewal", "submitted");
    const map = await openRenewalOrdersBySubscription([target]);
    expect(map.get(sub.sub.id)).toEqual({ orderId: open.order.id, invoiceNumber: open.invoice.invoiceNumber, amountDue: 100 + 123 });
    expect((await openRenewalOrdersBySubscription([])).size).toBe(0);
  });
});
