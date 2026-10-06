import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { db } from "../../lib/db";
import { user as userTable, roles, userRoles, plans, subscriptions } from "../../db/schema";
import { adminSubscriptionsRoute } from "./subscriptions.route";
import { addCalendarMonths } from "../../lib/subscription-period";
import { getCompanyTimezone } from "../../lib/company-timezone";

// § Fase 174, ADR-0041 — assign admin: tanpa `endAt` = dihitung dari periode paket (kalender, jangkar dicatat); dengan `endAt` = override bebas
// (jangkar kosong); PATCH tanggal manual mengosongkan jangkar. Sebelumnya endpoint ini tanpa test sama sekali.
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(adminSubscriptionsRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Admin Subs Test" }),
    }),
  );
  const body = (await res.json()) as { user: { id: string } };
  await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, body.user.id));
  return body.user.id;
}

async function adminCookie() {
  const email = `admin-subs-admin-${runId}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const id = await signUp(email);
  const [role] = await db.select().from(roles).where(eq(roles.name, "admin"));
  await db.insert(userRoles).values({ userId: id, roleId: role!.id }).onConflictDoNothing();
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "TestPassword123!" }) }),
  );
  return res.headers.get("set-cookie") ?? "";
}

async function makePlan(interval: "monthly" | "yearly", moduleKey: string) {
  const [plan] = await db
    .insert(plans)
    .values({ name: `AdminSubs Plan ${interval} ${moduleKey} ${runId}-${Math.random()}`, price: 1000, durationDays: interval === "yearly" ? 365 : 30, interval, modules: [moduleKey] })
    .returning();
  return plan!;
}

async function post(cookie: string, body: Record<string, unknown>) {
  return testApp.handle(new Request("http://localhost/admin/subscriptions", { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
}

describe("POST /admin/subscriptions — periode (Fase 174)", () => {
  test("tanpa endAt: bulanan → +1 bulan kalender dari sekarang, jangkar & 1 bulan tercatat", async () => {
    const cookie = await adminCookie();
    const userId = await signUp(`admin-subs-monthly-${runId}@test.local`);
    const plan = await makePlan("monthly", "sales_invoice");
    const res = await post(cookie, { userId, planId: plan.id });
    expect(res.status).toBe(200);
    const sub = (await res.json()) as { id: string };
    const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, sub.id));
    expect(row!.endAt!.getTime()).toBe(addCalendarMonths(row!.startAt!, 1, await getCompanyTimezone()).getTime());
    expect(row!.periodMonths).toBe(1);
    expect(row!.periodAnchorAt!.getTime()).toBe(row!.startAt!.getTime());
  });

  test("tanpa endAt: tahunan → +12 bulan kalender", async () => {
    const cookie = await adminCookie();
    const userId = await signUp(`admin-subs-yearly-${runId}@test.local`);
    const plan = await makePlan("yearly", "purchase_invoice");
    const sub = (await (await post(cookie, { userId, planId: plan.id })).json()) as { id: string };
    const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, sub.id));
    expect(row!.endAt!.getTime()).toBe(addCalendarMonths(row!.startAt!, 12, await getCompanyTimezone()).getTime());
    expect(row!.periodMonths).toBe(12);
  });

  test("dengan endAt (override custom): dipakai persis (tanggal+jam bebas), jangkar dikosongkan", async () => {
    const cookie = await adminCookie();
    const userId = await signUp(`admin-subs-custom-${runId}@test.local`);
    const plan = await makePlan("monthly", "sales_receipt");
    const custom = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000 + 12345);
    const sub = (await (await post(cookie, { userId, planId: plan.id, endAt: custom.toISOString() })).json()) as { id: string };
    const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, sub.id));
    expect(row!.endAt!.getTime()).toBe(custom.getTime());
    expect(row!.periodAnchorAt).toBeNull();
    expect(row!.periodMonths).toBeNull();
  });

  test("400 END_AT_MUST_BE_FUTURE — endAt yang dikirim sudah lewat; 404 PLAN_NOT_FOUND", async () => {
    const cookie = await adminCookie();
    const userId = await signUp(`admin-subs-past-${runId}@test.local`);
    const plan = await makePlan("monthly", "purchase_payment");
    const past = await post(cookie, { userId, planId: plan.id, endAt: new Date(Date.now() - 1000).toISOString() });
    expect(past.status).toBe(400);
    expect(((await past.json()) as { code: string }).code).toBe("END_AT_MUST_BE_FUTURE");
    const missing = await post(cookie, { userId, planId: crypto.randomUUID() });
    expect(missing.status).toBe(404);
  });
});

describe("PATCH /admin/subscriptions/:id — ubah tanggal manual", () => {
  test("endAt baru dipakai persis dan jangkar dikosongkan (perpanjangan berikutnya menetapkan jangkar baru)", async () => {
    const cookie = await adminCookie();
    const userId = await signUp(`admin-subs-patch-${runId}@test.local`);
    const plan = await makePlan("monthly", "journal_voucher");
    const created = (await (await post(cookie, { userId, planId: plan.id })).json()) as { id: string };
    const [before] = await db.select().from(subscriptions).where(eq(subscriptions.id, created.id));
    expect(before!.periodAnchorAt).not.toBeNull();

    const next = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000 + 777);
    const res = await testApp.handle(
      new Request(`http://localhost/admin/subscriptions/${created.id}`, { method: "PATCH", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify({ endAt: next.toISOString() }) }),
    );
    expect(res.status).toBe(200);
    const [after] = await db.select().from(subscriptions).where(eq(subscriptions.id, created.id));
    expect(after!.endAt!.getTime()).toBe(next.getTime());
    expect(after!.periodAnchorAt).toBeNull();
    expect(after!.periodMonths).toBeNull();
  });
});
