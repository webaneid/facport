import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { db } from "../../lib/db";
import { user as userTable, roles, userRoles, plans, subscriptions } from "../../db/schema";
import { adminUserSubscriptionsRoute } from "./user-subscriptions.route";
import { createTestAccurateConnection, createTestDataUsaha } from "../../lib/test-fixtures";

// § Fase 92 (2026-09-10) — mirror pola `admin/import-batches.route.test.ts`.
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(adminUserSubscriptionsRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "User Subscriptions Admin Test" }),
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

async function makeAdminCookie() {
  const email = `usersubs-admin-${runId}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const adminId = await signUp(email);
  const [role] = await db.select().from(roles).where(eq(roles.name, "admin"));
  await db.insert(userRoles).values({ userId: adminId, roleId: role!.id }).onConflictDoNothing();
  return signIn(email);
}

describe("GET /admin/users/:id/subscriptions", () => {
  test("404 USER_NOT_FOUND kalau id tidak ada", async () => {
    const adminCookie = await makeAdminCookie();
    const res = await testApp.handle(
      new Request("http://localhost/admin/users/does-not-exist/subscriptions", { headers: { cookie: adminCookie } }),
    );
    expect(res.status).toBe(404);
  });

  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/admin/users/any-id/subscriptions"));
    expect(res.status).toBe(401);
  });

  // § inti fix Fase 91/92: `connected` HARUS cek status koneksi asli,
  // BUKAN cuma "ada baris koneksi" — dites di sini juga (bukan cuma di
  // endpoint versi customer) supaya admin lihat gambaran SEAKURAT yang
  // dilihat customer.
  test("200 — status koneksi diturunkan dari DATA USAHA: connected:true HANYA untuk koneksi active; expired/koneksi LAMA = tidak terhubung", async () => {
    const adminCookie = await makeAdminCookie();
    const customerEmail = `usersubs-customer-${runId}-${Math.random().toString(36).slice(2, 8)}@test.local`;
    const userId = await signUp(customerEmail);
    const [customerRole] = await db.select().from(roles).where(eq(roles.name, "customer"));
    await db.insert(userRoles).values({ userId, roleId: customerRole!.id }).onConflictDoNothing();

    // § Fase 143, ADR-0037 — 1 Data Usaha = 1 koneksi (dipegang Data Usaha), jadi kasus sehat vs bermasalah = 2 Data Usaha.
    const duHealthy = await createTestDataUsaha(userId, `UserSubs DU Sehat ${runId}`);
    const duBroken = await createTestDataUsaha(userId, `UserSubs DU Rusak ${runId}`);
    const duLegacy = await createTestDataUsaha(userId, `UserSubs DU Lama ${runId}`);
    await createTestAccurateConnection(userId, { dataUsahaId: duHealthy, accurateDbId: "1", accurateDbAlias: "PT Sehat" });
    await createTestAccurateConnection(userId, { dataUsahaId: duBroken, accurateDbId: "2", accurateDbAlias: "PT Bermasalah", status: "expired" });
    await createTestAccurateConnection(userId, { dataUsahaId: duLegacy, accurateUserId: null, accurateDbAlias: "PT Lama" }); // koneksi LAMA (cutover)

    const make = async (name: string, module: string, dataUsahaId: string) => {
      const [plan] = await db.insert(plans).values({ name, price: 1000, durationDays: 30, modules: [module] }).returning();
      await db.insert(subscriptions).values({
        userId,
        planId: plan!.id,
        status: "active",
        startAt: new Date(),
        endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        dataUsahaId,
      });
    };
    await make(`UserSubs Healthy ${runId}`, "purchase_invoice", duHealthy);
    await make(`UserSubs Broken ${runId}`, "sales_invoice", duBroken);
    await make(`UserSubs Legacy ${runId}`, "sales_receipt", duLegacy);

    const res = await testApp.handle(new Request(`http://localhost/admin/users/${userId}/subscriptions`, { headers: { cookie: adminCookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      subscriptions: {
        planName: string;
        connected: boolean;
        connectionStatus: string | null;
        accurateDbAlias: string | null;
        dataUsahaId: string;
        dataUsahaName: string;
      }[];
    };
    const by = (name: string) => body.subscriptions.find((s) => s.planName === `${name} ${runId}`);
    expect(by("UserSubs Healthy")).toMatchObject({ connected: true, connectionStatus: "active", accurateDbAlias: "PT Sehat", dataUsahaId: duHealthy });
    expect(by("UserSubs Broken")).toMatchObject({ connected: false, connectionStatus: "expired", accurateDbAlias: "PT Bermasalah" });
    expect(by("UserSubs Legacy")).toMatchObject({ connected: false, connectionStatus: null });

    // § diminta user 2026-09-12 — admin WAJIB bisa tahu Data Usaha mana yang punya subscription ini.
    expect(by("UserSubs Healthy")?.dataUsahaName).toBe(`UserSubs DU Sehat ${runId}`);
    expect(by("UserSubs Broken")?.dataUsahaId).toBe(duBroken);
  });
});
