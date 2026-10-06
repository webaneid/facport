import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { db } from "../../lib/db";
import { user as userTable, roles, userRoles, plans, subscriptions, subscriptionRenewals } from "../../db/schema";
import { adminSubscriptionsRoute } from "./subscriptions.route";
import { addCalendarMonths, computeSubscriptionPeriod } from "../../lib/subscription-period";
import { getOrCreateDefaultDataUsaha } from "../../lib/data-usaha";
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

// § Fase 176, ADR-0041 poin 4 — assign admin untuk modul yang SUDAH aktif: tanpa endAt = perpanjangan dari akhir lama; dengan endAt = override (alur lama).
describe("POST /admin/subscriptions — perpanjangan dini (Fase 176)", () => {
  async function seedActive(userId: string, planId: string, endAt: Date, aligned = true) {
    const dataUsahaId = await getOrCreateDefaultDataUsaha(userId);
    const startAt = new Date(endAt.getTime() - 10 * 24 * 60 * 60 * 1000);
    const [sub] = await db
      .insert(subscriptions)
      .values({ userId, planId, status: "active", startAt, endAt, dataUsahaId, ...(aligned ? { periodAnchorAt: startAt, periodMonths: 1 } : {}) })
      .returning();
    return sub!;
  }

  test("tanpa endAt + modul aktif → diperpanjang DI TEMPAT dari akhir lama (+1 bulan), tanpa baris baru, riwayat 'admin' tercatat", async () => {
    const cookie = await adminCookie();
    const userId = await signUp(`admin-subs-renew-${runId}@test.local`);
    const plan = await makePlan("monthly", "sales_order");
    const oldEnd = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000 + 555);
    const sub = await seedActive(userId, plan.id, oldEnd, false);

    const res = await post(cookie, { userId, planId: plan.id });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; renewed?: boolean };
    expect(body.renewed).toBe(true);
    expect(body.id).toBe(sub.id);
    const all = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
    expect(all).toHaveLength(1);
    expect(all[0]!.endAt!.getTime()).toBe(addCalendarMonths(oldEnd, 1, await getCompanyTimezone()).getTime());
    const [renewal] = await db.select().from(subscriptionRenewals).where(eq(subscriptionRenewals.subscriptionId, sub.id));
    expect(renewal!.source).toBe("admin");
    expect(renewal!.orderId).toBeNull();
    expect(renewal!.previousEndAt.getTime()).toBe(oldEnd.getTime());
  });

  test("dengan endAt eksplisit → override: langganan lama ditutup, baru dibuat dengan tanggal admin (alur lama tidak berubah)", async () => {
    const cookie = await adminCookie();
    const userId = await signUp(`admin-subs-renew-override-${runId}@test.local`);
    const plan = await makePlan("monthly", "sales_return");
    const sub = await seedActive(userId, plan.id, new Date(Date.now() + 10 * 24 * 60 * 60 * 1000));
    const custom = new Date(Date.now() + 200 * 24 * 60 * 60 * 1000 + 321);

    const res = await post(cookie, { userId, planId: plan.id, endAt: custom.toISOString() });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { renewed?: boolean }).renewed).toBeUndefined();
    const [old] = await db.select().from(subscriptions).where(eq(subscriptions.id, sub.id));
    expect(old!.status).toBe("cancelled");
    const active = (await db.select().from(subscriptions).where(eq(subscriptions.userId, userId))).filter((s) => s.status === "active");
    expect(active).toHaveLength(1);
    expect(active[0]!.endAt!.getTime()).toBe(custom.getTime());
  });

  test("langganan aktif tapi end_at sudah lewat → BUKAN perpanjangan: dibuat baru dari sekarang (dihitung dari periode paket)", async () => {
    const cookie = await adminCookie();
    const userId = await signUp(`admin-subs-renew-stale-${runId}@test.local`);
    const plan = await makePlan("monthly", "delivery_order");
    await seedActive(userId, plan.id, new Date(Date.now() - 60 * 1000));
    const res = await post(cookie, { userId, planId: plan.id });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { renewed?: boolean }).renewed).toBeUndefined();
    const fresh = (await db.select().from(subscriptions).where(eq(subscriptions.userId, userId))).filter((s) => s.endAt!.getTime() > Date.now());
    expect(fresh).toHaveLength(1);
    const expected = computeSubscriptionPeriod(fresh[0]!.startAt!, "monthly", await getCompanyTimezone());
    expect(fresh[0]!.endAt!.getTime()).toBe(expected.endAt.getTime());
  });
});
