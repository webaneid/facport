import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq, and } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { adminOrdersRoute } from "./orders.route";
import { db } from "../../lib/db";
import { plans, invoices, invoiceItems, orders, subscriptions, roles, userRoles, user as userTable } from "../../db/schema";

const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(adminOrdersRoute);
// § varchar(30) di `invoices.invoiceNumber` — counter pendek per-test.
let invoiceCounter = 0;
function nextInvoiceNumber() {
  invoiceCounter += 1;
  return `INV/AO/${runId}-${invoiceCounter}`;
}

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Admin Orders Test" }),
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

async function assignRole(userId: string, roleName: string) {
  const [role] = await db.select().from(roles).where(eq(roles.name, roleName));
  if (!role) throw new Error(`Role ${roleName} belum ke-seed`);
  await db.insert(userRoles).values({ userId, roleId: role.id }).onConflictDoNothing();
}

async function makeAdmin() {
  const email = `admin-orders-admin-${runId}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const adminId = await signUp(email);
  await assignRole(adminId, "admin");
  const cookie = await signIn(email);
  return cookie;
}

// § Fase 16 — 1 order bisa punya BEBERAPA invoiceItems (cart multi-modul),
// confirm HARUS bikin 1 subscription PER item, masing-masing durationDays
// dari plan-nya sendiri (beda plan bisa beda durasi).
async function createSubmittedOrder(userId: string, planSpecs: { moduleKey: string; price: number; durationDays: number }[]) {
  const planRows = [];
  for (const spec of planSpecs) {
    const [plan] = await db
      .insert(plans)
      .values({ name: `AdminOrders Plan ${spec.moduleKey} ${runId}-${Math.random()}`, price: spec.price, durationDays: spec.durationDays, modules: [spec.moduleKey] })
      .returning();
    planRows.push(plan!);
  }
  const total = planRows.reduce((s, p) => s + p.price, 0);
  const [invoice] = await db
    .insert(invoices)
    .values({
      invoiceNumber: nextInvoiceNumber(),
      userId,
      status: "unpaid",
      billToName: "Test User",
      subtotal: total,
      total,
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    })
    .returning();
  for (const plan of planRows) {
    await db.insert(invoiceItems).values({ invoiceId: invoice!.id, planId: plan.id, moduleKey: plan.modules[0]!, label: plan.name, price: plan.price });
  }
  const [order] = await db
    .insert(orders)
    .values({ invoiceId: invoice!.id, uniqueCode: 111, method: "bank_transfer", bankAccountRef: "bank-1", status: "submitted", submittedAt: new Date(), proofUrl: "orders/fake/fake.webp" })
    .returning();
  return { order: order!, invoice: invoice!, plans: planRows };
}

describe("GET /admin/orders", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/admin/orders"));
    expect(res.status).toBe(401);
  });

  test("403 kalau bukan admin", async () => {
    const email = `admin-orders-forbidden-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);
    const res = await testApp.handle(new Request("http://localhost/admin/orders", { headers: { cookie } }));
    expect(res.status).toBe(403);
  });

  test("200 default filter status=submitted", async () => {
    const adminCookie = await makeAdmin();
    const customerId = await signUp(`admin-orders-list-customer-${runId}@test.local`);
    const { order } = await createSubmittedOrder(customerId, [{ moduleKey: "sales_invoice", price: 100000, durationDays: 30 }]);

    const res = await testApp.handle(new Request("http://localhost/admin/orders", { headers: { cookie: adminCookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { orders: { id: string }[] };
    expect(body.orders.some((o) => o.id === order.id)).toBe(true);
  });
});

describe("POST /admin/orders/:id/confirm", () => {
  test("403 kalau bukan admin", async () => {
    const customerId = await signUp(`admin-orders-confirm-forbidden-${runId}@test.local`);
    const cookie = await signIn(`admin-orders-confirm-forbidden-${runId}@test.local`);
    const { order } = await createSubmittedOrder(customerId, [{ moduleKey: "purchase_invoice", price: 100000, durationDays: 30 }]);

    const res = await testApp.handle(new Request(`http://localhost/admin/orders/${order.id}/confirm`, { method: "POST", headers: { cookie } }));
    expect(res.status).toBe(403);
  });

  test("200 confirm — invoice+order jadi paid, N subscription tercipta (1 per invoiceItem, endAt sesuai durationDays masing-masing plan)", async () => {
    const adminCookie = await makeAdmin();
    const customerId = await signUp(`admin-orders-confirm-ok-${runId}@test.local`);
    const { order, invoice, plans: createdPlans } = await createSubmittedOrder(customerId, [
      { moduleKey: "sales_receipt", price: 100000, durationDays: 30 },
      { moduleKey: "purchase_payment", price: 120000, durationDays: 365 },
    ]);

    const res = await testApp.handle(new Request(`http://localhost/admin/orders/${order.id}/confirm`, { method: "POST", headers: { cookie: adminCookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { subscriptionsCreated: number };
    expect(body.subscriptionsCreated).toBe(2);

    const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(updatedOrder!.status).toBe("paid");
    expect(updatedOrder!.confirmedAt).toBeTruthy();

    const [updatedInvoice] = await db.select().from(invoices).where(eq(invoices.id, invoice.id));
    expect(updatedInvoice!.status).toBe("paid");
    expect(updatedInvoice!.paidAt).toBeTruthy();

    const subs = await db.select().from(subscriptions).where(eq(subscriptions.orderId, order.id));
    expect(subs.length).toBe(2);
    for (const sub of subs) {
      expect(sub.status).toBe("active");
      expect(sub.userId).toBe(customerId);
      const matchingPlan = createdPlans.find((p) => p.id === sub.planId)!;
      const expectedDurationMs = matchingPlan.durationDays * 24 * 60 * 60 * 1000;
      const actualDurationMs = sub.endAt!.getTime() - sub.startAt!.getTime();
      // toleransi 5 detik (waktu eksekusi test), bukan exact millisecond match
      expect(Math.abs(actualDurationMs - expectedDurationMs)).toBeLessThan(5000);
    }
  });

  test("400 ORDER_NOT_SUBMITTED kalau order sudah paid (tidak bisa confirm 2x)", async () => {
    const adminCookie = await makeAdmin();
    const customerId = await signUp(`admin-orders-confirm-twice-${runId}@test.local`);
    const { order } = await createSubmittedOrder(customerId, [{ moduleKey: "journal_voucher", price: 90000, durationDays: 30 }]);

    const res1 = await testApp.handle(new Request(`http://localhost/admin/orders/${order.id}/confirm`, { method: "POST", headers: { cookie: adminCookie } }));
    expect(res1.status).toBe(200);

    const res2 = await testApp.handle(new Request(`http://localhost/admin/orders/${order.id}/confirm`, { method: "POST", headers: { cookie: adminCookie } }));
    expect(res2.status).toBe(400);
    const body = (await res2.json()) as { code: string };
    expect(body.code).toBe("ORDER_NOT_SUBMITTED");
  });
});

describe("POST /admin/orders/:id/reject", () => {
  test("200 reject — status jadi rejected, rejectionNote tersimpan, TIDAK ada subscription tercipta", async () => {
    const adminCookie = await makeAdmin();
    const customerId = await signUp(`admin-orders-reject-ok-${runId}@test.local`);
    const { order } = await createSubmittedOrder(customerId, [{ moduleKey: "sales_invoice", price: 100000, durationDays: 30 }]);

    const res = await testApp.handle(
      new Request(`http://localhost/admin/orders/${order.id}/reject`, {
        method: "POST",
        headers: { cookie: adminCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Nominal tidak cocok dengan bukti transfer" }),
      }),
    );
    expect(res.status).toBe(200);

    const [updated] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(updated!.status).toBe("rejected");
    expect(updated!.rejectionNote).toBe("Nominal tidak cocok dengan bukti transfer");

    const subs = await db.select().from(subscriptions).where(and(eq(subscriptions.orderId, order.id)));
    expect(subs.length).toBe(0);
  });

  test("400 kalau reason kosong", async () => {
    const adminCookie = await makeAdmin();
    const customerId = await signUp(`admin-orders-reject-empty-${runId}@test.local`);
    const { order } = await createSubmittedOrder(customerId, [{ moduleKey: "purchase_invoice", price: 100000, durationDays: 30 }]);

    const res = await testApp.handle(
      new Request(`http://localhost/admin/orders/${order.id}/reject`, {
        method: "POST",
        headers: { cookie: adminCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "" }),
      }),
    );
    expect(res.status).toBe(422);
  });
});
