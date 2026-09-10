import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { db } from "../../lib/db";
import { user as userTable, roles, userRoles, plans, subscriptions, accurateConnections } from "../../db/schema";
import { adminUserSubscriptionsRoute } from "./user-subscriptions.route";

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
  test("200 — tampilkan connected:true HANYA untuk koneksi status active, connectionStatus akurat", async () => {
    const adminCookie = await makeAdminCookie();
    const customerEmail = `usersubs-customer-${runId}-${Math.random().toString(36).slice(2, 8)}@test.local`;
    const userId = await signUp(customerEmail);
    const [customerRole] = await db.select().from(roles).where(eq(roles.name, "customer"));
    await db.insert(userRoles).values({ userId, roleId: customerRole!.id }).onConflictDoNothing();

    const [healthyConn] = await db
      .insert(accurateConnections)
      .values({
        userId,
        accessTokenEncrypted: "dummy",
        refreshTokenEncrypted: "dummy",
        expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        accurateDbAlias: "PT Sehat",
      })
      .returning();
    const [brokenConn] = await db
      .insert(accurateConnections)
      .values({
        userId,
        accessTokenEncrypted: "dummy",
        refreshTokenEncrypted: "dummy",
        expiresAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        accurateDbAlias: "PT Bermasalah",
        status: "expired",
      })
      .returning();

    const [planHealthy] = await db
      .insert(plans)
      .values({ name: `UserSubs Healthy ${runId}`, price: 1000, durationDays: 30, modules: ["purchase_invoice"] })
      .returning();
    await db.insert(subscriptions).values({
      userId,
      planId: planHealthy!.id,
      status: "active",
      startAt: new Date(),
      endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      accurateConnectionId: healthyConn!.id,
    });

    const [planBroken] = await db
      .insert(plans)
      .values({ name: `UserSubs Broken ${runId}`, price: 1000, durationDays: 30, modules: ["sales_invoice"] })
      .returning();
    await db.insert(subscriptions).values({
      userId,
      planId: planBroken!.id,
      status: "active",
      startAt: new Date(),
      endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      accurateConnectionId: brokenConn!.id,
    });

    const res = await testApp.handle(new Request(`http://localhost/admin/users/${userId}/subscriptions`, { headers: { cookie: adminCookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      subscriptions: { planName: string; connected: boolean; connectionStatus: string | null; accurateDbAlias: string | null }[];
    };
    const healthy = body.subscriptions.find((s) => s.planName === `UserSubs Healthy ${runId}`);
    const broken = body.subscriptions.find((s) => s.planName === `UserSubs Broken ${runId}`);
    expect(healthy?.connected).toBe(true);
    expect(healthy?.connectionStatus).toBe("active");
    expect(broken?.connected).toBe(false);
    expect(broken?.connectionStatus).toBe("expired");
    expect(broken?.accurateDbAlias).toBe("PT Bermasalah");
  });
});
