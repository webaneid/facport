import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq, and } from "drizzle-orm";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { user as userTable, memberSeats, subscriptions, plans, invoiceItems, orders, subscriptionRenewals } from "../db/schema";
import { teamRoute } from "./team.route";
import { createTestDataUsaha, createTestSeat } from "../lib/test-fixtures";
import { activateInvoiceItems } from "../lib/order-activation";
import { getCompanyTimezone } from "../lib/company-timezone";
import { addCalendarMonths } from "../lib/subscription-period";

// § Fase 183, ADR-0043 — perpanjangan kursi PER SLOT (termasuk banyak slot sekaligus), hidupkan kembali slot habis, fallback slot baru.
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(teamRoute);

async function signUp(email: string) {
  const res = await testApp.handle(new Request("http://localhost/api/auth/sign-up/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!", name: "Seat Renew" }) }));
  const body = (await res.json()) as { user: { id: string } };
  await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, body.user.id));
  return body.user.id;
}
async function signIn(email: string) {
  const res = await testApp.handle(new Request("http://localhost/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!" }) }));
  return res.headers.get("set-cookie") ?? "";
}
async function seatPlan(interval: "monthly" | "yearly") {
  const [p] = await db.insert(plans).values({ name: `Seat Renew ${interval} ${crypto.randomUUID()}`, price: interval === "yearly" ? 200000 : 20000, durationDays: interval === "yearly" ? 365 : 30, interval, modules: [], kind: "seat_addon" }).returning();
  return p!;
}
async function setup(tag: string) {
  const email = `seat-renew-${tag}-${runId}@test.local`;
  const ownerId = await signUp(email);
  const cookie = await signIn(email);
  const dataUsahaId = await createTestDataUsaha(ownerId);
  return { ownerId, cookie, dataUsahaId };
}
async function subOf(seatId: string) {
  const [seat] = await db.select().from(memberSeats).where(eq(memberSeats.id, seatId));
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.id, seat!.seatSubscriptionId));
  return { seat: seat!, sub: sub! };
}
const renew = (cookie: string, body: Record<string, unknown>) =>
  testApp.handle(new Request("http://localhost/me/team/renew", { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) }));

describe("POST /me/team/renew", () => {
  test("beberapa slot sekaligus → 1 invoice, 1 item per slot menunjuk slotnya; tagihan terbuka mengunci slot (tidak bisa dobel) dan GET /me/team menandainya", async () => {
    const { ownerId, cookie, dataUsahaId } = await setup("multi");
    const plan = await seatPlan("monthly");
    const s1 = await createTestSeat(ownerId, dataUsahaId);
    const s2 = await createTestSeat(ownerId, dataUsahaId);
    const s3 = await createTestSeat(ownerId, dataUsahaId);
    const res = await renew(cookie, { dataUsahaId, seatIds: [s1, s2, s3], interval: "monthly", repeat: true });
    expect(res.status).toBe(200);
    const { invoiceId, amountDue } = (await res.json()) as { invoiceId: string; amountDue: number };
    const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
    expect(items.length).toBe(3);
    const targets = new Set(items.map((i) => i.renewSubscriptionId));
    for (const id of [s1, s2, s3]) expect(targets.has((await subOf(id)).sub.id)).toBe(true);
    expect(items.every((i) => i.renewalInterval === "monthly")).toBe(true);
    expect(amountDue).toBeGreaterThanOrEqual(3 * 1); // total = Σ harga paket kursi termurah aktif + kode unik
    void plan;

    // slot yang sama lagi → ditolak; slot lain yang belum ditagih tetap bisa
    const again = await renew(cookie, { dataUsahaId, seatIds: [s2], interval: "monthly" });
    expect(again.status).toBe(400);
    expect(((await again.json()) as { code: string }).code).toBe("SEAT_RENEWAL_IN_PROGRESS");
    const list = (await (await testApp.handle(new Request(`http://localhost/me/team?dataUsahaId=${dataUsahaId}`, { headers: { cookie } }))).json()) as { seats: { renewalOpen: boolean }[] };
    expect(list.seats.every((s) => s.renewalOpen)).toBe(true);
  });

  test("slot Data Usaha lain / milik orang lain → 404; slot dibatalkan → SEAT_NOT_RENEWABLE; paket kursi periode itu tak ada → SEAT_PLAN_NOT_AVAILABLE", async () => {
    const a = await setup("authz-a");
    const b = await setup("authz-b");
    await seatPlan("monthly");
    const foreign = await createTestSeat(b.ownerId, b.dataUsahaId);
    const res = await renew(a.cookie, { dataUsahaId: a.dataUsahaId, seatIds: [foreign], interval: "monthly" });
    expect(res.status).toBe(404);
    expect((await renew(a.cookie, { dataUsahaId: b.dataUsahaId, seatIds: [foreign], interval: "monthly" })).status).toBe(404);

    const mine = await createTestSeat(a.ownerId, a.dataUsahaId);
    const { sub } = await subOf(mine);
    await db.update(subscriptions).set({ status: "cancelled" }).where(eq(subscriptions.id, sub.id));
    const cancelled = await renew(a.cookie, { dataUsahaId: a.dataUsahaId, seatIds: [mine], interval: "monthly" });
    expect(((await cancelled.json()) as { code: string }).code).toBe("SEAT_NOT_RENEWABLE");

    const ok = await createTestSeat(a.ownerId, a.dataUsahaId);
    // tanpa paket kursi tahunan aktif: nonaktifkan sementara yang ada (dipulihkan di finally — DB dev dipakai bersama)
    const yearlyActive = await db.select({ id: plans.id }).from(plans).where(and(eq(plans.kind, "seat_addon"), eq(plans.interval, "yearly"), eq(plans.isActive, true)));
    try {
      for (const p of yearlyActive) await db.update(plans).set({ isActive: false }).where(eq(plans.id, p.id));
      const noPlan = await renew(a.cookie, { dataUsahaId: a.dataUsahaId, seatIds: [ok], interval: "yearly" });
      expect(((await noPlan.json()) as { code: string }).code).toBe("SEAT_PLAN_NOT_AVAILABLE");
    } finally {
      for (const p of yearlyActive) await db.update(plans).set({ isActive: true }).where(eq(plans.id, p.id));
    }
  });

  test("slot trial ditolak (SEAT_NOT_RENEWABLE) dan tidak ditandai renewable; tagihan terbuka milik pemilik LAMA (invoice atas user lain) tetap mengunci slot (transfer kepemilikan)", async () => {
    const { ownerId, cookie, dataUsahaId } = await setup("trial-transfer");
    await seatPlan("monthly");
    const trialSeat = await createTestSeat(ownerId, dataUsahaId);
    await db.update(subscriptions).set({ isTrial: true }).where(eq(subscriptions.id, (await subOf(trialSeat)).sub.id));
    const res = await renew(cookie, { dataUsahaId, seatIds: [trialSeat], interval: "monthly" });
    expect(((await res.json()) as { code: string }).code).toBe("SEAT_NOT_RENEWABLE");

    const seatId = await createTestSeat(ownerId, dataUsahaId);
    const { sub } = await subOf(seatId);
    const oldOwner = await signUp(`seat-renew-oldowner-${runId}@test.local`);
    const { invoices } = await import("../db/schema");
    const [inv] = await db.insert(invoices).values({ invoiceNumber: `INV-TR-${crypto.randomUUID().slice(0, 8)}`, userId: oldOwner, status: "unpaid", billToName: "Old", subtotal: 1, total: 1, dueDate: new Date(Date.now() + 86400000) }).returning();
    const plan = await seatPlan("monthly");
    await db.insert(invoiceItems).values({ invoiceId: inv!.id, planId: plan.id, moduleKey: "seat_addon", label: "x", price: 1, durationDays: 30, interval: "monthly", renewSubscriptionId: sub.id });
    await db.insert(orders).values({ invoiceId: inv!.id, uniqueCode: 111, status: "pending", dataUsahaId });
    const again = await renew(cookie, { dataUsahaId, seatIds: [seatId], interval: "monthly" });
    expect(((await again.json()) as { code: string }).code).toBe("SEAT_RENEWAL_IN_PROGRESS");
    const list = (await (await testApp.handle(new Request(`http://localhost/me/team?dataUsahaId=${dataUsahaId}`, { headers: { cookie } }))).json()) as { seats: { id: string; renewable: boolean; renewalOpen: boolean }[] };
    expect(list.seats.find((x) => x.id === trialSeat)!.renewable).toBe(false);
    expect(list.seats.find((x) => x.id === seatId)!.renewalOpen).toBe(true);
  });

  test("validasi body: seatIds kosong → 422; interval tidak dikenal → 422; tanpa login → 401", async () => {
    const { cookie, dataUsahaId } = await setup("validate");
    expect((await renew(cookie, { dataUsahaId, seatIds: [], interval: "monthly" })).status).toBe(422);
    expect((await renew(cookie, { dataUsahaId, seatIds: [crypto.randomUUID()], interval: "weekly" })).status).toBe(422);
    expect((await renew("", { dataUsahaId, seatIds: [crypto.randomUUID()], interval: "monthly" })).status).toBe(401);
  });
});

describe("aktivasi item perpanjangan kursi (activateInvoiceItems)", () => {
  async function activate(ownerId: string, dataUsahaId: string, targetSubId: string | null, plan: typeof plans.$inferSelect, now: Date, renewalInterval: string | null = null) {
    const [order] = await db.insert(orders).values({ invoiceId: (await makeInvoice(ownerId)).id, dataUsahaId, uniqueCode: 0 }).returning();
    return db.transaction(async (tx) => {
      const [item] = await tx
        .insert(invoiceItems)
        .values({ invoiceId: order!.invoiceId, planId: plan.id, moduleKey: "seat_addon", label: plan.name, price: plan.price, durationDays: plan.durationDays, interval: plan.interval, renewalInterval, renewSubscriptionId: targetSubId })
        .returning();
      return activateInvoiceItems(tx, { userId: ownerId, orderId: order!.id, dataUsahaId, items: [{ item: item!, plan }], now, timeZone: await getCompanyTimezone(), actorId: ownerId });
    });
  }
  async function makeInvoice(userId: string) {
    const { invoices } = await import("../db/schema");
    const [inv] = await db.insert(invoices).values({ invoiceNumber: `INV-TST-${crypto.randomUUID().slice(0, 8)}`, userId, status: "unpaid", billToName: "T", subtotal: 0, total: 0, dueDate: new Date() }).returning();
    return inv!;
  }

  test("slot MASIH aktif → diperpanjang di tempat dari akhir lama; slot, anggota, dan jumlah slot tidak berubah; penanda terjadwal terpasang", async () => {
    const { ownerId, dataUsahaId } = await setup("act-active");
    const plan = await seatPlan("monthly");
    const seatId = await createTestSeat(ownerId, dataUsahaId);
    const before = await subOf(seatId);
    const res = await activate(ownerId, dataUsahaId, before.sub.id, plan, new Date(), "monthly");
    expect(res.createdSubscriptionIds).toEqual([]);
    expect(res.renewals.length).toBe(1);
    const after = await subOf(seatId);
    expect(after.sub.id).toBe(before.sub.id);
    expect(after.sub.endAt!.getTime()).toBeGreaterThan(before.sub.endAt!.getTime());
    expect(after.sub.renewalInterval).toBe("monthly");
    expect(await db.select().from(memberSeats).where(eq(memberSeats.dataUsahaId, dataUsahaId))).toHaveLength(1);
  });

  test("slot SUDAH HABIS (expired) → slot yang sama hidup lagi, periode baru mulai dari 'now' (saat disetujui), anggota tetap; riwayat tercatat", async () => {
    const { ownerId, dataUsahaId } = await setup("act-expired");
    const plan = await seatPlan("monthly");
    const seatId = await createTestSeat(ownerId, dataUsahaId);
    const before = await subOf(seatId);
    await db.update(subscriptions).set({ status: "expired", endAt: new Date(Date.now() - 20 * 86400000) }).where(eq(subscriptions.id, before.sub.id));
    const now = new Date();
    const res = await activate(ownerId, dataUsahaId, before.sub.id, plan, now);
    expect(res.createdSubscriptionIds).toEqual([]);
    const after = await subOf(seatId);
    expect(after.sub.id).toBe(before.sub.id);
    expect(after.sub.status).toBe("active");
    expect(after.sub.startAt!.getTime()).toBe(now.getTime());
    expect(after.sub.endAt!.getTime()).toBe(addCalendarMonths(now, 1, await getCompanyTimezone()).getTime());
    expect(await db.select().from(subscriptionRenewals).where(eq(subscriptionRenewals.subscriptionId, before.sub.id))).toHaveLength(1);
    expect(after.seat.id).toBe(before.seat.id);
    expect(await db.select().from(memberSeats).where(eq(memberSeats.dataUsahaId, dataUsahaId))).toHaveLength(1);
  });

  test("target dibatalkan / Data Usaha lain / tanpa target → slot BARU dibuat (pelanggan sudah membayar; slot lama tetap mati)", async () => {
    const { ownerId, dataUsahaId } = await setup("act-fallback");
    const other = await setup("act-fallback-other");
    const plan = await seatPlan("monthly");
    const seatId = await createTestSeat(ownerId, dataUsahaId);
    const { sub } = await subOf(seatId);
    await db.update(subscriptions).set({ status: "cancelled" }).where(eq(subscriptions.id, sub.id));
    const foreignSeat = await createTestSeat(other.ownerId, other.dataUsahaId);
    const foreign = (await subOf(foreignSeat)).sub;

    for (const target of [sub.id, foreign.id, null]) {
      const res = await activate(ownerId, dataUsahaId, target, plan, new Date());
      expect(res.createdSubscriptionIds.length).toBe(1);
    }
    // fallback tercatat di audit (target ada → 2 entri: dibatalkan & Data Usaha lain)
    const { auditLogs } = await import("../db/schema");
    const logs = (await db.select().from(auditLogs).where(eq(auditLogs.entityType, "order"))).filter((l) => (l.changes as { seatRenewalFallback?: boolean } | null)?.seatRenewalFallback && [sub.id, foreign.id].includes((l.changes as { targetSubscriptionId: string }).targetSubscriptionId));
    expect(logs.length).toBe(2);
    expect((await subOf(foreignSeat)).sub.endAt!.getTime()).toBe(foreign.endAt!.getTime()); // slot orang lain tak tersentuh
    expect((await subOf(seatId)).sub.status).toBe("cancelled");
    expect(await db.select().from(memberSeats).where(eq(memberSeats.dataUsahaId, dataUsahaId))).toHaveLength(4);
  });
});
