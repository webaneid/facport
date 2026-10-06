import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { plans, invoices, invoiceItems, orders, notifications, roles, userRoles, user as userTable, auditLogs } from "../db/schema";
import { ordersRoute } from "./orders.route";
import { adminOrdersRoute } from "./admin/orders.route";
import { inFlightModuleKeys } from "../lib/invoice-order";
import { expireOverdueOrders } from "../lib/order-cancel";
import { getOrCreateDefaultDataUsaha } from "../lib/data-usaha";

// § Fase 178 — batalkan invoice (admin & customer) + kedaluwarsa otomatis. Instance Elysia SENDIRI memasang route customer & admin sekaligus.
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(ordersRoute).use(adminOrdersRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!", name: "Cancel Test" }) }),
  );
  const body = (await res.json()) as { user: { id: string } };
  await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, body.user.id));
  return body.user.id;
}
async function signIn(email: string) {
  const res = await testApp.handle(new Request("http://localhost/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!" }) }));
  return res.headers.get("set-cookie") ?? "";
}
async function customer(tag: string) {
  const email = `cancel-${tag}-${runId}-${Math.random().toString(36).slice(2, 6)}@test.local`;
  const id = await signUp(email);
  return { id, email, cookie: await signIn(email) };
}
async function admin() {
  const email = `cancel-admin-${runId}-${Math.random().toString(36).slice(2, 6)}@test.local`;
  const id = await signUp(email);
  const [role] = await db.select().from(roles).where(eq(roles.name, "admin"));
  await db.insert(userRoles).values({ userId: id, roleId: role!.id }).onConflictDoNothing();
  return { id, cookie: await signIn(email) };
}

let seq = 0;
async function makeOrder(userId: string, opts: { status?: string; dueInMs?: number; moduleKey?: string; invoiceStatus?: string } = {}) {
  const dataUsahaId = await getOrCreateDefaultDataUsaha(userId);
  const moduleKey = opts.moduleKey ?? "sales_invoice";
  const [plan] = await db.insert(plans).values({ name: `Cancel Plan ${moduleKey} ${runId}-${Math.random()}`, price: 1000, durationDays: 30, interval: "monthly", modules: [moduleKey] }).returning();
  const [invoice] = await db
    .insert(invoices)
    .values({
      invoiceNumber: `INV/CANCEL/${runId}/${++seq}`, userId, status: opts.invoiceStatus ?? "unpaid", billToName: "Cancel", subtotal: 1000, total: 1000,
      dueDate: new Date(Date.now() + (opts.dueInMs ?? 3 * 24 * 60 * 60 * 1000)),
    })
    .returning();
  await db.insert(invoiceItems).values({ invoiceId: invoice!.id, planId: plan!.id, moduleKey, label: plan!.name, price: 1000, durationDays: 30, interval: "monthly" });
  const [order] = await db.insert(orders).values({ invoiceId: invoice!.id, uniqueCode: 123, status: opts.status ?? "pending", dataUsahaId }).returning();
  return { order: order!, invoice: invoice!, dataUsahaId };
}
const post = (path: string, cookie: string, body?: unknown) =>
  testApp.handle(new Request(`http://localhost${path}`, { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }));

describe("POST /admin/orders/:id/cancel", () => {
  for (const status of ["pending", "submitted", "rejected"]) {
    test(`membatalkan order '${status}': order cancelled + invoice void + alasan/pelaku/waktu tercatat + audit + notifikasi ke customer`, async () => {
      const a = await admin();
      const c = await customer(`admin-${status}`);
      const { order, invoice } = await makeOrder(c.id, { status });
      const res = await post(`/admin/orders/${order.id}/cancel`, a.cookie, { reason: "  Salah paket  " });
      expect(res.status).toBe(200);

      const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
      expect(o!.status).toBe("cancelled");
      expect(o!.cancelledBy).toBe(a.id);
      expect(o!.cancelledAt).toBeTruthy();
      expect(o!.cancelReason).toBe("Salah paket"); // di-trim
      const [inv] = await db.select().from(invoices).where(eq(invoices.id, invoice.id));
      expect(inv!.status).toBe("void");
      const [notif] = await db.select().from(notifications).where(eq(notifications.userId, c.id));
      expect(notif!.type).toBe("order_cancelled");
      expect(notif!.body).toContain("Salah paket");
      const audit = await db.select().from(auditLogs).where(eq(auditLogs.entityId, order.id));
      expect(audit.some((l) => l.actorId === a.id)).toBe(true);
    });
  }

  test("membuka blokir: modul yang tertahan order pending bebas lagi setelah dibatalkan (inFlight)", async () => {
    const a = await admin();
    const c = await customer("unblock");
    const { order, dataUsahaId } = await makeOrder(c.id, { moduleKey: "purchase_order" });
    expect((await inFlightModuleKeys(db, { userId: c.id, dataUsahaId })).has("purchase_order")).toBe(true);
    await post(`/admin/orders/${order.id}/cancel`, a.cookie, { reason: "tes" });
    expect((await inFlightModuleKeys(db, { userId: c.id, dataUsahaId })).has("purchase_order")).toBe(false);
  });

  test("400 INVOICE_ALREADY_PAID untuk order lunas (tidak dibatalkan); 400 ORDER_NOT_CANCELLABLE untuk yang sudah cancelled/expired; 404 tak dikenal; alasan kosong ditolak", async () => {
    const a = await admin();
    const c = await customer("invalid");
    const paid = await makeOrder(c.id, { status: "paid", invoiceStatus: "paid" });
    const paidRes = await post(`/admin/orders/${paid.order.id}/cancel`, a.cookie, { reason: "x" });
    expect(paidRes.status).toBe(400);
    expect(((await paidRes.json()) as { code: string }).code).toBe("INVOICE_ALREADY_PAID");
    expect((await db.select().from(orders).where(eq(orders.id, paid.order.id)))[0]!.status).toBe("paid");

    for (const status of ["cancelled", "expired"]) {
      const o = await makeOrder(c.id, { status });
      const res = await post(`/admin/orders/${o.order.id}/cancel`, a.cookie, { reason: "x" });
      expect(res.status).toBe(400);
      expect(((await res.json()) as { code: string }).code).toBe("ORDER_NOT_CANCELLABLE");
    }
    expect((await post(`/admin/orders/${crypto.randomUUID()}/cancel`, a.cookie, { reason: "x" })).status).toBe(404);
    const pending = await makeOrder(c.id);
    expect((await post(`/admin/orders/${pending.order.id}/cancel`, a.cookie, { reason: "" })).status).toBe(422);
  });

  test("bukan admin → ditolak (403)", async () => {
    const c = await customer("forbidden");
    const { order } = await makeOrder(c.id);
    const res = await post(`/admin/orders/${order.id}/cancel`, c.cookie, { reason: "x" });
    expect(res.status).toBe(403);
    expect((await db.select().from(orders).where(eq(orders.id, order.id)))[0]!.status).toBe("pending");
  });
});

describe("POST /orders/:id/cancel (customer)", () => {
  test("customer membatalkan pesanannya sendiri (pending): cancelled + void, pelaku = dirinya, alasan baku, TANPA notifikasi ke dirinya", async () => {
    const c = await customer("self");
    const { order, invoice } = await makeOrder(c.id);
    const res = await post(`/orders/${order.id}/cancel`, c.cookie);
    expect(res.status).toBe(200);
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(o!.status).toBe("cancelled");
    expect(o!.cancelledBy).toBe(c.id);
    expect(o!.cancelReason).toBe("Dibatalkan oleh pelanggan");
    expect((await db.select().from(invoices).where(eq(invoices.id, invoice.id)))[0]!.status).toBe("void");
    expect(await db.select().from(notifications).where(eq(notifications.userId, c.id))).toHaveLength(0);
  });

  test("ditolak (rejected) boleh dibatalkan; submitted (bukti menunggu admin) dan lunas TIDAK", async () => {
    const c = await customer("states");
    const rejected = await makeOrder(c.id, { status: "rejected" });
    expect((await post(`/orders/${rejected.order.id}/cancel`, c.cookie)).status).toBe(200);

    const submitted = await makeOrder(c.id, { status: "submitted" });
    const subRes = await post(`/orders/${submitted.order.id}/cancel`, c.cookie);
    expect(subRes.status).toBe(400);
    expect(((await subRes.json()) as { code: string }).code).toBe("ORDER_NOT_CANCELLABLE");
    expect((await db.select().from(orders).where(eq(orders.id, submitted.order.id)))[0]!.status).toBe("submitted");

    const paid = await makeOrder(c.id, { status: "paid", invoiceStatus: "paid" });
    const paidRes = await post(`/orders/${paid.order.id}/cancel`, c.cookie);
    expect(paidRes.status).toBe(400);
    expect(((await paidRes.json()) as { code: string }).code).toBe("INVOICE_ALREADY_PAID");
  });

  test("pesanan milik orang lain → 404 (tidak membocorkan keberadaan); tanpa login → 401", async () => {
    const owner = await customer("owner");
    const intruder = await customer("intruder");
    const { order } = await makeOrder(owner.id);
    expect((await post(`/orders/${order.id}/cancel`, intruder.cookie)).status).toBe(404);
    expect((await db.select().from(orders).where(eq(orders.id, order.id)))[0]!.status).toBe("pending");
    expect((await testApp.handle(new Request(`http://localhost/orders/${order.id}/cancel`, { method: "POST" }))).status).toBe(401);
  });

  test("order yang sudah dibatalkan tidak bisa diubah/dibayar lagi (metode pembayaran ditolak)", async () => {
    const c = await customer("after");
    const { order } = await makeOrder(c.id);
    await post(`/orders/${order.id}/cancel`, c.cookie);
    const res = await testApp.handle(
      new Request(`http://localhost/orders/${order.id}/method`, { method: "PATCH", headers: { cookie: c.cookie, "Content-Type": "application/json" }, body: JSON.stringify({ method: "bank_transfer", accountRef: "bank-1" }) }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("ORDER_NOT_EDITABLE");
  });
});

describe("expireOverdueOrders (kedaluwarsa otomatis)", () => {
  test("hanya order PENDING yang lewat jatuh tempo: order expired + invoice expired + notifikasi; idempoten", async () => {
    const c = await customer("expire");
    const overdue = await makeOrder(c.id, { dueInMs: -60 * 1000 });
    const expired = await expireOverdueOrders();
    expect(expired).toBeGreaterThanOrEqual(1);
    expect((await db.select().from(orders).where(eq(orders.id, overdue.order.id)))[0]!.status).toBe("expired");
    expect((await db.select().from(invoices).where(eq(invoices.id, overdue.invoice.id)))[0]!.status).toBe("expired");
    const [notif] = await db.select().from(notifications).where(eq(notifications.userId, c.id));
    expect(notif!.type).toBe("order_expired");
    expect(notif!.body).toContain(overdue.invoice.invoiceNumber);
    // dijalankan lagi: tidak ada notifikasi ganda
    await expireOverdueOrders();
    expect(await db.select().from(notifications).where(eq(notifications.userId, c.id))).toHaveLength(1);
  });

  test("TIDAK menyentuh: belum jatuh tempo, sudah ada bukti (submitted), ditolak (rejected), lunas", async () => {
    const c = await customer("expire-skip");
    const future = await makeOrder(c.id, { dueInMs: 60 * 60 * 1000 });
    const submitted = await makeOrder(c.id, { status: "submitted", dueInMs: -60 * 1000 });
    const rejected = await makeOrder(c.id, { status: "rejected", dueInMs: -60 * 1000 });
    const paid = await makeOrder(c.id, { status: "paid", invoiceStatus: "paid", dueInMs: -60 * 1000 });
    await expireOverdueOrders();
    const status = async (id: string) => (await db.select().from(orders).where(eq(orders.id, id)))[0]!.status;
    expect(await status(future.order.id)).toBe("pending");
    expect(await status(submitted.order.id)).toBe("submitted");
    expect(await status(rejected.order.id)).toBe("rejected");
    expect(await status(paid.order.id)).toBe("paid");
  });

  test("modul yang tertahan order kedaluwarsa bebas lagi (bisa dipesan ulang)", async () => {
    const c = await customer("expire-unblock");
    const { dataUsahaId } = await makeOrder(c.id, { moduleKey: "receive_item", dueInMs: -60 * 1000 });
    expect((await inFlightModuleKeys(db, { userId: c.id, dataUsahaId })).has("receive_item")).toBe(true);
    await expireOverdueOrders();
    expect((await inFlightModuleKeys(db, { userId: c.id, dataUsahaId })).has("receive_item")).toBe(false);
  });
});
