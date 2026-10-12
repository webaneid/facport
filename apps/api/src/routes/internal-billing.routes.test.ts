import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { subscriptionsRoute } from "./subscriptions.route";
import { adminSubscriptionsRoute } from "./admin/subscriptions.route";
import { plans, invoices, subscriptions, roles, userRoles, user as userTable } from "../db/schema";
import { createTestDataUsaha } from "../lib/test-fixtures";

// § Fase 189G, ADR-0044 — kontrol keuangan Lapis 1 di level ROUTE: akun internal ditolak 403 `INTERNAL_ACCOUNT_NO_BILLING` di checkout pelanggan dan di mode
// admin "invoice"/"paid_invoice"; mode admin "gratis" (tanpa invoice) tetap berjalan; akun komersil tidak terpengaruh. Aplikasi tes TANPA `.onError` →
// membuktikan error kustom memetakan dirinya ke 403 (bukan 500).
const runId = Date.now();
let seq = 0;
const testApp = new Elysia().mount(auth.handler).use(subscriptionsRoute).use(adminSubscriptionsRoute);

async function makeAccount(roleName: "customer" | "admin" | "staff", opts: { isInternal?: boolean } = {}) {
  const email = `internal-billing-${runId}-${seq++}@test.local`;
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!", name: "Internal Billing" }) }),
  );
  const { user } = (await res.json()) as { user: { id: string } };
  await db.update(userTable).set({ emailVerified: true, isInternal: opts.isInternal ?? false }).where(eq(userTable.id, user.id));
  const [role] = await db.select().from(roles).where(eq(roles.name, roleName));
  await db.insert(userRoles).values({ userId: user.id, roleId: role!.id }).onConflictDoNothing();
  const signIn = await testApp.handle(
    new Request("http://localhost/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!" }) }),
  );
  return { id: user.id, cookie: signIn.headers.get("set-cookie") ?? "", dataUsahaId: await createTestDataUsaha(user.id) };
}

async function makePlan() {
  const [plan] = await db.insert(plans).values({ name: `Internal Billing Plan ${runId}-${seq++}`, price: 120000, durationDays: 30, interval: "monthly", modules: ["sales_invoice"] }).returning();
  return plan!;
}

const countInvoices = async (userId: string) => (await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.userId, userId))).length;
const checkout = (cookie: string, planIds: string[], dataUsahaId: string) =>
  testApp.handle(new Request("http://localhost/subscriptions/checkout", { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify({ planIds, dataUsahaId }) }));
const bulk = (cookie: string, body: Record<string, unknown>) =>
  testApp.handle(new Request("http://localhost/admin/subscriptions/bulk", { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) }));

describe("checkout pelanggan", () => {
  test("pelanggan KOMERSIL tetap bisa checkout (kontrol: tidak ikut terblokir)", async () => {
    const c = await makeAccount("customer");
    const plan = await makePlan();
    const res = await checkout(c.cookie, [plan.id], c.dataUsahaId);
    expect(res.status).toBe(200);
    expect(await countInvoices(c.id)).toBe(1);
  });

  test("pelanggan INTERNAL (flag) → 403 INTERNAL_ACCOUNT_NO_BILLING, tidak ada invoice", async () => {
    const c = await makeAccount("customer", { isInternal: true });
    const plan = await makePlan();
    const res = await checkout(c.cookie, [plan.id], c.dataUsahaId);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "INTERNAL_ACCOUNT_NO_BILLING" });
    expect(await countInvoices(c.id)).toBe(0);
  });

  test("setelah tanda internal dicabut, checkout kembali normal", async () => {
    const c = await makeAccount("customer", { isInternal: true });
    const plan = await makePlan();
    expect((await checkout(c.cookie, [plan.id], c.dataUsahaId)).status).toBe(403);
    await db.update(userTable).set({ isInternal: false }).where(eq(userTable.id, c.id));
    expect((await checkout(c.cookie, [plan.id], c.dataUsahaId)).status).toBe(200);
  });
});

describe("pemberian langganan oleh admin (/admin/subscriptions/bulk)", () => {
  test("target internal: mode 'invoice' dan 'paid_invoice' ditolak 403, mode 'free' (tanpa invoice) lolos dan langganan aktif", async () => {
    const admin = await makeAccount("admin");
    const target = await makeAccount("customer", { isInternal: true });
    const plan = await makePlan();

    for (const payment of ["invoice", "paid_invoice"]) {
      const res = await bulk(admin.cookie, { userId: target.id, dataUsahaId: target.dataUsahaId, planIds: [plan.id], payment });
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ code: "INTERNAL_ACCOUNT_NO_BILLING" });
    }
    expect(await countInvoices(target.id)).toBe(0);

    const free = await bulk(admin.cookie, { userId: target.id, dataUsahaId: target.dataUsahaId, planIds: [plan.id], payment: "free" });
    expect(free.status).toBe(200);
    const subs = await db.select().from(subscriptions).where(eq(subscriptions.userId, target.id));
    expect(subs).toHaveLength(1);
    expect(subs[0]!.status).toBe("active");
    expect(await countInvoices(target.id)).toBe(0);
  });

  test("target ber-role staff (internal otomatis) juga ditolak untuk mode invoice; target komersil tetap bisa 'invoice' dan 'paid_invoice'", async () => {
    const admin = await makeAccount("admin");
    const staffTarget = await makeAccount("staff");
    const plan = await makePlan();
    const denied = await bulk(admin.cookie, { userId: staffTarget.id, dataUsahaId: staffTarget.dataUsahaId, planIds: [plan.id], payment: "invoice" });
    expect(denied.status).toBe(403);

    const commercial = await makeAccount("customer");
    const ok = await bulk(admin.cookie, { userId: commercial.id, dataUsahaId: commercial.dataUsahaId, planIds: [plan.id], payment: "invoice" });
    expect(ok.status).toBe(200);
    expect(await countInvoices(commercial.id)).toBe(1);
  });
});
