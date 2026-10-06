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

// § Fase 177, ADR-0041 — assign BANYAK paket sekaligus (SubscriptionPicker): atomik, satu `now`, aturan per paket sama dengan POST /.
describe("POST /admin/subscriptions/bulk (Fase 177)", () => {
  async function bulk(cookie: string, body: Record<string, unknown>) {
    return testApp.handle(new Request("http://localhost/admin/subscriptions/bulk", { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  }
  type BulkBody = { dataUsahaId: string; results: { planId: string; subscriptionId: string; renewed: boolean; previousEndAt: string | null; endAt: string }[] };

  test("N paket baru sekaligus: semua mulai di instan yang sama, akhir kalender sesuai periode masing-masing (bulanan +1, tahunan +12), jangkar tercatat", async () => {
    const cookie = await adminCookie();
    const userId = await signUp(`admin-bulk-new-${runId}@test.local`);
    const a = await makePlan("monthly", "sales_invoice");
    const b = await makePlan("yearly", "purchase_invoice");
    const c = await makePlan("monthly", "journal_voucher");
    const res = await bulk(cookie, { userId, planIds: [a.id, b.id, c.id] });
    expect(res.status).toBe(200);
    const body = (await res.json()) as BulkBody;
    expect(body.results).toHaveLength(3);
    expect(body.results.every((r) => r.renewed === false)).toBe(true);

    const tz = await getCompanyTimezone();
    const rows = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.startAt!.getTime())).size).toBe(1);
    const byPlan = new Map(rows.map((r) => [r.planId, r]));
    expect(byPlan.get(a.id)!.endAt!.getTime()).toBe(addCalendarMonths(byPlan.get(a.id)!.startAt!, 1, tz).getTime());
    expect(byPlan.get(b.id)!.endAt!.getTime()).toBe(addCalendarMonths(byPlan.get(b.id)!.startAt!, 12, tz).getTime());
    expect(byPlan.get(b.id)!.periodMonths).toBe(12);
    // semua di Data Usaha yang sama
    expect(new Set(rows.map((r) => r.dataUsahaId)).size).toBe(1);
  });

  test("campuran: modul yang masih aktif DIPERPANJANG dari akhir lama, modul lain baru — dalam satu permintaan", async () => {
    const cookie = await adminCookie();
    const userId = await signUp(`admin-bulk-mixed-${runId}@test.local`);
    const dataUsahaId = await getOrCreateDefaultDataUsaha(userId);
    const renewPlan = await makePlan("monthly", "other_deposit");
    const newPlan = await makePlan("yearly", "other_payment");
    const oldEnd = new Date(Date.now() + 12 * 24 * 60 * 60 * 1000 + 321);
    const [existing] = await db
      .insert(subscriptions)
      .values({ userId, planId: renewPlan.id, status: "active", startAt: new Date(oldEnd.getTime() - 5 * 24 * 60 * 60 * 1000), endAt: oldEnd, dataUsahaId })
      .returning();

    const res = await bulk(cookie, { userId, planIds: [renewPlan.id, newPlan.id], dataUsahaId });
    expect(res.status).toBe(200);
    const body = (await res.json()) as BulkBody;
    const renewed = body.results.find((r) => r.planId === renewPlan.id)!;
    expect(renewed.renewed).toBe(true);
    expect(renewed.subscriptionId).toBe(existing!.id);
    expect(new Date(renewed.previousEndAt!).getTime()).toBe(oldEnd.getTime());
    expect(body.results.find((r) => r.planId === newPlan.id)!.renewed).toBe(false);
    const [after] = await db.select().from(subscriptions).where(eq(subscriptions.id, existing!.id));
    expect(after!.endAt!.getTime()).toBe(addCalendarMonths(oldEnd, 1, await getCompanyTimezone()).getTime());
  });

  test("endAt override berlaku sama untuk semua paket (jangkar kosong)", async () => {
    const cookie = await adminCookie();
    const userId = await signUp(`admin-bulk-custom-${runId}@test.local`);
    const a = await makePlan("monthly", "sales_quotation");
    const b = await makePlan("monthly", "receive_item");
    const custom = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000 + 4242);
    const res = await bulk(cookie, { userId, planIds: [a.id, b.id], endAt: custom.toISOString() });
    expect(res.status).toBe(200);
    const rows = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
    expect(rows.every((r) => r.endAt!.getTime() === custom.getTime() && r.periodAnchorAt === null)).toBe(true);
  });

  test("ATOMIK: satu paket tidak ditemukan → 404 dan TIDAK ada langganan yang terbuat; paket nonaktif → 400; 2 paket modul sama → 400 DUPLICATE_MODULE_IN_REQUEST", async () => {
    const cookie = await adminCookie();
    const userId = await signUp(`admin-bulk-invalid-${runId}@test.local`);
    const ok = await makePlan("monthly", "item_transfer");
    const missing = await bulk(cookie, { userId, planIds: [ok.id, crypto.randomUUID()] });
    expect(missing.status).toBe(404);
    expect(await db.select().from(subscriptions).where(eq(subscriptions.userId, userId))).toHaveLength(0);

    const inactive = await makePlan("monthly", "item_requisition");
    await db.update(plans).set({ isActive: false }).where(eq(plans.id, inactive.id));
    const inactiveRes = await bulk(cookie, { userId, planIds: [ok.id, inactive.id] });
    expect(inactiveRes.status).toBe(400);
    expect(((await inactiveRes.json()) as { code: string }).code).toBe("PLAN_NOT_ACTIVE");

    const monthlyDup = await makePlan("monthly", "inventory_adjustment");
    const yearlyDup = await makePlan("yearly", "inventory_adjustment");
    const dup = await bulk(cookie, { userId, planIds: [monthlyDup.id, yearlyDup.id] });
    expect(dup.status).toBe(400);
    expect(((await dup.json()) as { code: string }).code).toBe("DUPLICATE_MODULE_IN_REQUEST");
    expect(await db.select().from(subscriptions).where(eq(subscriptions.userId, userId))).toHaveLength(0);
  });

  test("endAt masa lalu → 400; Data Usaha milik orang lain → 404; tanpa izin subscriptions.manage → ditolak", async () => {
    const cookie = await adminCookie();
    const userId = await signUp(`admin-bulk-guard-${runId}@test.local`);
    const otherId = await signUp(`admin-bulk-guard-other-${runId}@test.local`);
    const plan = await makePlan("monthly", "work_order");
    const past = await bulk(cookie, { userId, planIds: [plan.id], endAt: new Date(Date.now() - 1000).toISOString() });
    expect(past.status).toBe(400);
    const foreignDu = await getOrCreateDefaultDataUsaha(otherId);
    const foreign = await bulk(cookie, { userId, planIds: [plan.id], dataUsahaId: foreignDu });
    expect(foreign.status).toBe(404);
    const noAuth = await testApp.handle(new Request("http://localhost/admin/subscriptions/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, planIds: [plan.id] }) }));
    expect([401, 403]).toContain(noAuth.status);
  });
});
