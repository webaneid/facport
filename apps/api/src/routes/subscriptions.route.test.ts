import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { subscriptionsRoute } from "./subscriptions.route";
import { db } from "../lib/db";
import { plans, subscriptions, invoices, invoiceItems, orders, user as userTable } from "../db/schema";

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

async function postCheckout(cookie: string, planIds: string[]) {
  return testApp.handle(
    new Request("http://localhost/subscriptions/checkout", {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ planIds }),
    }),
  );
}

describe("POST /subscriptions/checkout", () => {
  test("401 kalau tidak login", async () => {
    const res = await postCheckout("", ["00000000-0000-0000-0000-000000000000"]);
    expect(res.status).toBe(401);
  });

  test("404 PLAN_NOT_FOUND kalau salah satu planId tidak ada", async () => {
    const email = `checkout-notfound-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);

    const res = await postCheckout(cookie, ["00000000-0000-0000-0000-000000000000"]);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("PLAN_NOT_FOUND");
  });

  test("400 PLAN_NOT_ACTIVE kalau plan sudah dinonaktifkan", async () => {
    const email = `checkout-inactive-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);

    const [plan] = await db
      .insert(plans)
      .values({ name: `Plan Inactive ${runId}`, price: 100000, durationDays: 30, modules: ["sales_invoice"], isActive: false })
      .returning();

    const res = await postCheckout(cookie, [plan!.id]);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("PLAN_NOT_ACTIVE");
  });

  test("400 MODULE_ALREADY_SUBSCRIBED kalau user sudah punya subscription aktif untuk modul yang sama", async () => {
    const email = `checkout-dup-${runId}@test.local`;
    const userId = await signUp(email);
    const cookie = await signIn(email);

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
    });

    const [newPlan] = await db
      .insert(plans)
      .values({ name: `Plan New ${runId}`, price: 120000, durationDays: 30, modules: ["purchase_invoice"] })
      .returning();

    const res = await postCheckout(cookie, [newPlan!.id]);
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
    await signUp(email);
    const cookie = await signIn(email);

    const [planA] = await db
      .insert(plans)
      .values({ name: `Plan Inflight A ${runId}`, price: 100000, durationDays: 30, modules: ["sales_invoice"] })
      .returning();
    const firstRes = await postCheckout(cookie, [planA!.id]);
    expect(firstRes.status).toBe(200); // checkout PERTAMA sukses, order status "pending", TIDAK ada subscription

    const [planB] = await db
      .insert(plans)
      .values({ name: `Plan Inflight B ${runId}`, price: 90000, durationDays: 30, modules: ["sales_invoice"] })
      .returning();
    const secondRes = await postCheckout(cookie, [planB!.id]);
    expect(secondRes.status).toBe(400);
    const body = (await secondRes.json()) as { code: string; moduleKey: string };
    expect(body.code).toBe("MODULE_ALREADY_SUBSCRIBED");
    expect(body.moduleKey).toBe("sales_invoice");
  });

  test("200 checkout 2 plan (cart) — 1 invoice dengan 2 invoiceItems + 1 order, amountDue = subtotal + uniqueCode", async () => {
    const email = `checkout-cart-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);

    const [planA] = await db
      .insert(plans)
      .values({ name: `Cart Plan A ${runId}`, price: 150000, durationDays: 30, modules: ["sales_receipt"] })
      .returning();
    const [planB] = await db
      .insert(plans)
      .values({ name: `Cart Plan B ${runId}`, price: 175000, durationDays: 30, modules: ["journal_voucher"] })
      .returning();

    const res = await postCheckout(cookie, [planA!.id, planB!.id]);
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
  });
});
