import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { db } from "../../lib/db";
import { user as userTable, roles, userRoles, plans, subscriptions, accurateConnections, dataUsaha, auditLogs, notifications } from "../../db/schema";
import { adminSubscriptionsRoute } from "./subscriptions.route";
import { createTestAccurateConnection, createTestDataUsaha } from "../../lib/test-fixtures";

// § Fase 92 (2026-09-10) — TIDAK ADA test file untuk endpoint lain di
// `subscriptions.route.ts` sebelumnya (gap pre-existing, di luar scope
// fase ini) — file ini FOKUS ke endpoint BARU `disconnect-accurate` saja.
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(adminSubscriptionsRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Admin Subscriptions Test" }),
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
  const email = `admin-subs-admin-${runId}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const adminId = await signUp(email);
  const [role] = await db.select().from(roles).where(eq(roles.name, "admin"));
  await db.insert(userRoles).values({ userId: adminId, roleId: role!.id }).onConflictDoNothing();
  return signIn(email);
}

describe("POST /admin/subscriptions/:id/disconnect-accurate", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(
      new Request("http://localhost/admin/subscriptions/00000000-0000-0000-0000-000000000000/disconnect-accurate", { method: "POST" }),
    );
    expect(res.status).toBe(401);
  });

  test("404 SUBSCRIPTION_NOT_FOUND kalau id tidak ada", async () => {
    const adminCookie = await makeAdminCookie();
    const res = await testApp.handle(
      new Request("http://localhost/admin/subscriptions/00000000-0000-0000-0000-000000000000/disconnect-accurate", {
        method: "POST",
        headers: { cookie: adminCookie },
      }),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("SUBSCRIPTION_NOT_FOUND");
  });

  test("400 NOT_CONNECTED kalau Data Usaha subscription belum punya koneksi Accurate", async () => {
    const adminCookie = await makeAdminCookie();
    const customerEmail = `admin-subs-noconn-${runId}@test.local`;
    const userId = await signUp(customerEmail);
    const [plan] = await db
      .insert(plans)
      .values({ name: `Disconnect NoConn ${runId}`, price: 1000, durationDays: 30, modules: ["purchase_invoice"] })
      .returning();
    const dataUsahaId = await createTestDataUsaha(userId);
    const [sub] = await db
      .insert(subscriptions)
      .values({ userId, planId: plan!.id, status: "active", startAt: new Date(), endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), dataUsahaId })
      .returning();

    const res = await testApp.handle(
      new Request(`http://localhost/admin/subscriptions/${sub!.id}/disconnect-accurate`, { method: "POST", headers: { cookie: adminCookie } }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("NOT_CONNECTED");
  });

  test("200 — memutus koneksi di level DATA USAHA (semua subscription di dalamnya ikut), catat audit log, kirim notifikasi ke pemilik (BUKAN admin)", async () => {
    const adminCookie = await makeAdminCookie();
    const customerEmail = `admin-subs-disconnect-${runId}@test.local`;
    const userId = await signUp(customerEmail);
    const dataUsahaId = await createTestDataUsaha(userId);
    const connection = await createTestAccurateConnection(userId, { dataUsahaId, accurateDbId: "77", accurateDbAlias: "PT Demo Disconnect" });
    const [plan] = await db
      .insert(plans)
      .values({ name: `Disconnect Success ${runId}`, price: 1000, durationDays: 30, modules: ["purchase_invoice"] })
      .returning();
    const [sub] = await db
      .insert(subscriptions)
      .values({ userId, planId: plan!.id, status: "active", startAt: new Date(), endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), dataUsahaId })
      .returning();

    const res = await testApp.handle(
      new Request(`http://localhost/admin/subscriptions/${sub!.id}/disconnect-accurate`, { method: "POST", headers: { cookie: adminCookie } }),
    );
    expect(res.status).toBe(200);

    const [du] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, dataUsahaId));
    expect(du!.accurateConnectionId).toBeNull();
    expect(du!.accurateDbId).toBe("77"); // database terakhir diketahui dipertahankan

    // § koneksi ITU SENDIRI TIDAK dihapus (bisa dipakai Data Usaha lain milik akun yang sama).
    const [connectionStillExists] = await db.select().from(accurateConnections).where(eq(accurateConnections.id, connection.id));
    expect(connectionStillExists).toBeDefined();

    const [audit] = await db.select().from(auditLogs).where(eq(auditLogs.entityId, sub!.id));
    expect(audit?.action).toBe("disconnect_accurate");
    expect((audit?.changes as { dataUsahaId?: string })?.dataUsahaId).toBe(dataUsahaId);

    const notifs = await db.select().from(notifications).where(eq(notifications.userId, userId));
    expect(notifs.some((n) => n.type === "accurate_connection_disconnected_by_admin")).toBe(true);
  });
});
