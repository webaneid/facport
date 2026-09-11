import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { subscriptionsRoute } from "./subscriptions.route";
import { db } from "../lib/db";
import { plans, subscriptions, invoices, invoiceItems, orders, notifications, user as userTable } from "../db/schema";
import { createTestDataUsaha } from "../lib/test-fixtures";

// § Fase 16, ADR-0022 — checkout REWORK: cart multi-modul `{planIds}`,
// bikin invoice+order (BUKAN lagi subscription "pending_payment"
// langsung — subscription baru tercipta setelah admin confirm, §
// admin/orders.route.test.ts).
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(subscriptionsRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Checkout Test" }),
    }),
  );
  const body = (await res.json()) as { user: { id: string } };
  await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, body.user.id));
  return body.user.id;
}

async function signIn(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!" }),
    }),
  );
  return res.headers.get("set-cookie") ?? "";
}

async function postCheckout(cookie: string, planIds: string[], dataUsahaId: string) {
  return testApp.handle(
    new Request("http://localhost/subscriptions/checkout", {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ planIds, dataUsahaId }),
    }),
  );
}

async function postTrial(cookie: string, planId: string, dataUsahaId: string) {
  return testApp.handle(
    new Request("http://localhost/subscriptions/trial", {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ planId, dataUsahaId }),
    }),
  );
}

describe("POST /subscriptions/checkout", () => {
  test("401 kalau tidak login", async () => {
    const res = await postCheckout("", ["00000000-0000-0000-0000-000000000000"], "00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(401);
  });

  test("404 PLAN_NOT_FOUND kalau salah satu planId tidak ada", async () => {
    const email = `checkout-notfound-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    const dataUsahaId = await createTestDataUsaha(userId);

    const res = await postCheckout(cookie, ["00000000-0000-0000-0000-000000000000"], dataUsahaId);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("PLAN_NOT_FOUND");
  });

  test("400 PLAN_NOT_ACTIVE kalau plan sudah dinonaktifkan", async () => {
    const email = `checkout-inactive-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    const dataUsahaId = await createTestDataUsaha(userId);

    const [plan] = await db
      .insert(plans)
      .values({ name: `Plan Inactive ${runId}`, price: 100000, durationDays: 30, modules: ["sales_invoice"], isActive: false })
      .returning();

    const res = await postCheckout(cookie, [plan!.id], dataUsahaId);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("PLAN_NOT_ACTIVE");
  });

  test("400 DUPLICATE_MODULE_IN_CART kalau 1 checkout mengandung 2 tier plan untuk modul yang sama (Fase 53)", async () => {
    const email = `checkout-dup-tier-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    const dataUsahaId = await createTestDataUsaha(userId);

    const [monthly] = await db
      .insert(plans)
      .values({ name: `Plan Bulanan ${runId}`, price: 100000, durationDays: 30, modules: ["sales_invoice"], isActive: true })
      .returning();
    const [yearly] = await db
      .insert(plans)
      .values({ name: `Plan Tahunan ${runId}`, price: 1000000, durationDays: 360, modules: ["sales_invoice"], isActive: true })
      .returning();

    const res = await postCheckout(cookie, [monthly!.id, yearly!.id], dataUsahaId);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; moduleKey: string };
    expect(body.code).toBe("DUPLICATE_MODULE_IN_CART");
    expect(body.moduleKey).toBe("sales_invoice");
  });

  test("400 MODULE_ALREADY_SUBSCRIBED kalau user sudah punya subscription aktif untuk modul yang sama", async () => {
    const email = `checkout-dup-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    const dataUsahaId = await createTestDataUsaha(userId);

    const [existingPlan] = await db
      .insert(plans)
      .values({ name: `Plan Existing ${runId}`, price: 100000, durationDays: 30, modules: ["purchase_invoice"] })
      .returning();
    await db.insert(subscriptions).values({
      userId,
      planId: existingPlan!.id,
      status: "active",
      startAt: new Date(),
      endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      dataUsahaId,
    });

    const [newPlan] = await db
      .insert(plans)
      .values({ name: `Plan New ${runId}`, price: 120000, durationDays: 30, modules: ["purchase_invoice"] })
      .returning();

    const res = await postCheckout(cookie, [newPlan!.id], dataUsahaId);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; moduleKey: string };
    expect(body.code).toBe("MODULE_ALREADY_SUBSCRIBED");
    expect(body.moduleKey).toBe("purchase_invoice");
  });

  // § security review 2026-09-04 (High) — guard SEBELUMNYA cuma cek
  // subscription AKTIF, tidak lihat invoice/order lain yang masih
  // pending/submitted (belum ada subscription sama sekali, karena
  // subscription baru tercipta SETELAH admin confirm). Test ini
  // reproduksi skenario "2 tab checkout modul sama sebelum bayar sama
  // sekali" — checkout KEDUA WAJIB ditolak walau checkout PERTAMA belum
  // pernah dikonfirmasi admin (belum ada subscription sama sekali).
  test("400 MODULE_ALREADY_SUBSCRIBED kalau modul yang sama masih ada di invoice/order PENDING lain (belum tentu ada subscription aktif)", async () => {
    const email = `checkout-inflight-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    const dataUsahaId = await createTestDataUsaha(userId);

    const [planA] = await db
      .insert(plans)
      .values({ name: `Plan Inflight A ${runId}`, price: 100000, durationDays: 30, modules: ["sales_invoice"] })
      .returning();
    const firstRes = await postCheckout(cookie, [planA!.id], dataUsahaId);
    expect(firstRes.status).toBe(200); // checkout PERTAMA sukses, order status "pending", TIDAK ada subscription

    const [planB] = await db
      .insert(plans)
      .values({ name: `Plan Inflight B ${runId}`, price: 90000, durationDays: 30, modules: ["sales_invoice"] })
      .returning();
    const secondRes = await postCheckout(cookie, [planB!.id], dataUsahaId);
    expect(secondRes.status).toBe(400);
    const body = (await secondRes.json()) as { code: string; moduleKey: string };
    expect(body.code).toBe("MODULE_ALREADY_SUBSCRIBED");
    expect(body.moduleKey).toBe("sales_invoice");
  });

  test("200 checkout 2 plan (cart) — 1 invoice dengan 2 invoiceItems + 1 order, amountDue = subtotal + uniqueCode", async () => {
    const email = `checkout-cart-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    const dataUsahaId = await createTestDataUsaha(userId);

    const [planA] = await db
      .insert(plans)
      .values({ name: `Cart Plan A ${runId}`, price: 150000, durationDays: 30, modules: ["sales_receipt"] })
      .returning();
    const [planB] = await db
      .insert(plans)
      .values({ name: `Cart Plan B ${runId}`, price: 175000, durationDays: 30, modules: ["journal_voucher"] })
      .returning();

    const res = await postCheckout(cookie, [planA!.id, planB!.id], dataUsahaId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { invoiceId: string; orderId: string; amountDue: number };

    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, body.invoiceId));
    expect(invoice!.subtotal).toBe(325000);
    expect(invoice!.total).toBe(325000);
    expect(invoice!.status).toBe("unpaid");

    const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, body.invoiceId));
    expect(items.length).toBe(2);

    const [order] = await db.select().from(orders).where(eq(orders.id, body.orderId));
    expect(order!.invoiceId).toBe(body.invoiceId);
    expect(order!.status).toBe("pending");
    expect(order!.uniqueCode).toBeGreaterThanOrEqual(100);
    expect(order!.uniqueCode).toBeLessThanOrEqual(999);
    expect(body.amountDue).toBe(325000 + order!.uniqueCode);

    // § Fase 45 — checkout WAJIB bikin notifikasi "order_created" ke user
    const [notif] = await db.select().from(notifications).where(eq(notifications.entityId, body.orderId));
    expect(notif!.type).toBe("order_created");
    expect(notif!.entityType).toBe("order");
  });
});

// § Fase 43 — self-service "Coba Gratis": TANPA invoice/order/pembayaran
// sama sekali, subscription langsung "active" dengan `isTrial: true`.
describe("POST /subscriptions/trial", () => {
  test("401 kalau tidak login", async () => {
    const res = await postTrial("", "00000000-0000-0000-0000-000000000000", "00000000-0000-0000-0000-000000000000");
    expect(res.status).toBe(401);
  });

  test("404 PLAN_NOT_FOUND kalau planId tidak ada", async () => {
    const email = `trial-notfound-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    const dataUsahaId = await createTestDataUsaha(userId);

    const res = await postTrial(cookie, "00000000-0000-0000-0000-000000000000", dataUsahaId);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("PLAN_NOT_FOUND");
  });

  // § Fase 43 (koreksi) — trial BUKAN otomatis semua paket, admin WAJIB
  // tandai eksplisit `plans.trialEligible`. Test ini pastikan paket yang
  // TIDAK ditandai (default `trialEligible: false` kalau tidak diisi)
  // ditolak, BUKAN diam-diam diizinkan.
  test("400 TRIAL_NOT_AVAILABLE_FOR_PLAN kalau paket TIDAK ditandai admin boleh ditrial", async () => {
    const email = `trial-not-eligible-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    const dataUsahaId = await createTestDataUsaha(userId);

    const [plan] = await db
      .insert(plans)
      .values({ name: `Non Trial Plan ${runId}`, price: 100000, durationDays: 30, modules: ["purchase_invoice"], trialEligible: false })
      .returning();

    const res = await postTrial(cookie, plan!.id, dataUsahaId);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("TRIAL_NOT_AVAILABLE_FOR_PLAN");
  });

  test("200 — trial langsung aktif, isTrial=true, TANPA invoice/order (paket trialEligible)", async () => {
    const email = `trial-success-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    const dataUsahaId = await createTestDataUsaha(userId);

    const [plan] = await db
      .insert(plans)
      .values({ name: `Trial Plan ${runId}`, price: 100000, durationDays: 30, modules: ["purchase_invoice"], trialEligible: true })
      .returning();

    const res = await postTrial(cookie, plan!.id, dataUsahaId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { subscriptionId: string };

    const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.id, body.subscriptionId));
    expect(subscription!.status).toBe("active");
    expect(subscription!.isTrial).toBe(true);
    expect(subscription!.orderId).toBeNull();
    expect(subscription!.invoiceItemId).toBeNull();

    // § Fase 45 — trial WAJIB bikin notifikasi "trial_started"
    const [notif] = await db.select().from(notifications).where(eq(notifications.entityId, body.subscriptionId));
    expect(notif!.type).toBe("trial_started");
  });

  test("400 TRIAL_ALREADY_USED kalau modul yang sama sudah pernah ditrial (1x seumur hidup)", async () => {
    const email = `trial-reused-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    const dataUsahaId = await createTestDataUsaha(userId);

    const [plan] = await db
      .insert(plans)
      .values({ name: `Trial Reused Plan ${runId}`, price: 100000, durationDays: 30, modules: ["sales_invoice"], trialEligible: true })
      .returning();

    const firstRes = await postTrial(cookie, plan!.id, dataUsahaId);
    expect(firstRes.status).toBe(200);

    const [planSameModule] = await db
      .insert(plans)
      .values({ name: `Trial Reused Plan B ${runId}`, price: 120000, durationDays: 30, modules: ["sales_invoice"], trialEligible: true })
      .returning();
    const secondRes = await postTrial(cookie, planSameModule!.id, dataUsahaId);
    expect(secondRes.status).toBe(400);
    const body = (await secondRes.json()) as { code: string; moduleKey: string };
    expect(body.code).toBe("TRIAL_ALREADY_USED");
    expect(body.moduleKey).toBe("sales_invoice");
  });

  test("400 MODULE_ALREADY_SUBSCRIBED kalau modul sudah punya subscription AKTIF (paket asli)", async () => {
    const email = `trial-dup-active-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);

    const dataUsahaId = await createTestDataUsaha(userId);
    const [existingPlan] = await db
      .insert(plans)
      .values({ name: `Real Plan ${runId}`, price: 100000, durationDays: 30, modules: ["vendor_payable_account"] })
      .returning();
    await db.insert(subscriptions).values({
      userId,
      planId: existingPlan!.id,
      status: "active",
      startAt: new Date(),
      endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      dataUsahaId,
    });

    const [trialPlan] = await db
      .insert(plans)
      .values({ name: `Trial Attempt Plan ${runId}`, price: 90000, durationDays: 30, modules: ["vendor_payable_account"], trialEligible: true })
      .returning();
    const res = await postTrial(cookie, trialPlan!.id, dataUsahaId);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; moduleKey: string };
    expect(body.code).toBe("MODULE_ALREADY_SUBSCRIBED");
    expect(body.moduleKey).toBe("vendor_payable_account");
  });

  test("checkout TETAP bisa dipanggil untuk modul yang sedang trial (trial tidak memblokir upgrade ke paket asli)", async () => {
    const email = `trial-then-checkout-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);
    const dataUsahaId = await createTestDataUsaha(userId);

    const [trialPlan] = await db
      .insert(plans)
      .values({ name: `Trial Upgrade Plan ${runId}`, price: 100000, durationDays: 30, modules: ["purchase_payment"], trialEligible: true })
      .returning();
    const trialRes = await postTrial(cookie, trialPlan!.id, dataUsahaId);
    expect(trialRes.status).toBe(200);

    const [realPlan] = await db
      .insert(plans)
      .values({ name: `Real Upgrade Plan ${runId}`, price: 150000, durationDays: 30, modules: ["purchase_payment"] })
      .returning();
    const checkoutRes = await postCheckout(cookie, [realPlan!.id], dataUsahaId);
    expect(checkoutRes.status).toBe(200);
  });
});
