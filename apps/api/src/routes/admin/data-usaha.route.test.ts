import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq, and } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { db } from "../../lib/db";
import { user as userTable, roles, userRoles, dataUsaha, auditLogs, ownershipTransfers } from "../../db/schema";
import { adminDataUsahaRoute } from "./data-usaha.route";
import { createTestDataUsaha } from "../../lib/test-fixtures";

// § Fase 111, architecture-user-tambahan.md — transfer kepemilikan Data
// Usaha DIBANTU ADMIN, langsung eksekusi tanpa accept-flow.
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(adminDataUsahaRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Admin Data Usaha Test" }),
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
  const email = `admin-du-admin-${runId}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const adminId = await signUp(email);
  const [role] = await db.select().from(roles).where(eq(roles.name, "admin"));
  await db.insert(userRoles).values({ userId: adminId, roleId: role!.id }).onConflictDoNothing();
  return signIn(email);
}

describe("GET /admin/data-usaha", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/admin/data-usaha?userId=x"));
    expect(res.status).toBe(401);
  });

  test("403 kalau login tapi bukan admin (customer biasa)", async () => {
    const email = `admin-du-notadmin-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);
    const res = await testApp.handle(new Request("http://localhost/admin/data-usaha?userId=x", { headers: { cookie } }));
    expect(res.status).toBe(403);
  });

  test("200 — list Data Usaha milik userId yang diminta", async () => {
    const adminCookie = await makeAdminCookie();
    const ownerId = await signUp(`admin-du-owner-${runId}@test.local`);
    const dataUsahaId = await createTestDataUsaha(ownerId, `DU Admin List ${runId}`);

    const res = await testApp.handle(new Request(`http://localhost/admin/data-usaha?userId=${ownerId}`, { headers: { cookie: adminCookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dataUsaha: { id: string }[] };
    expect(body.dataUsaha.some((d) => d.id === dataUsahaId)).toBe(true);
  });
});

describe("POST /admin/data-usaha/:id/transfer-ownership", () => {
  test("400 CANNOT_TRANSFER_TO_SELF kalau toUserId = pemilik sekarang", async () => {
    const adminCookie = await makeAdminCookie();
    const ownerId = await signUp(`admin-du-self-${runId}@test.local`);
    const dataUsahaId = await createTestDataUsaha(ownerId, `DU Admin Self ${runId}`);

    const res = await testApp.handle(
      new Request(`http://localhost/admin/data-usaha/${dataUsahaId}/transfer-ownership`, {
        method: "POST",
        headers: { cookie: adminCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId: ownerId }),
      }),
    );
    expect(res.status).toBe(400);
  });

  test("404 TARGET_USER_NOT_FOUND kalau toUserId tidak ada", async () => {
    const adminCookie = await makeAdminCookie();
    const ownerId = await signUp(`admin-du-notarget-${runId}@test.local`);
    const dataUsahaId = await createTestDataUsaha(ownerId, `DU Admin NoTarget ${runId}`);

    const res = await testApp.handle(
      new Request(`http://localhost/admin/data-usaha/${dataUsahaId}/transfer-ownership`, {
        method: "POST",
        headers: { cookie: adminCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId: "does-not-exist" }),
      }),
    );
    expect(res.status).toBe(404);
  });

  test("200 — langsung eksekusi transfer, audit log tercatat, transfer self-service pending ikut dibatalkan", async () => {
    const adminCookie = await makeAdminCookie();
    const ownerId = await signUp(`admin-du-transfer-owner-${runId}@test.local`);
    const dataUsahaId = await createTestDataUsaha(ownerId, `DU Admin Transfer ${runId}`);
    const toUserId = await signUp(`admin-du-transfer-target-${runId}@test.local`);

    // § baris ownership_transfers PENDING dari jalur self-service (mis.
    // owner sempat inisiasi transfer sendiri ke alamat SALAH) — harus
    // ikut dibatalkan begitu admin transfer LANGSUNG ke tujuan lain.
    await db.insert(ownershipTransfers).values({
      dataUsahaId,
      fromUserId: ownerId,
      toEmail: "salah-ketik@test.local",
      tokenHash: "dummy-hash-not-real",
      tokenExpiresAt: new Date(Date.now() + 86400000),
    });

    const res = await testApp.handle(
      new Request(`http://localhost/admin/data-usaha/${dataUsahaId}/transfer-ownership`, {
        method: "POST",
        headers: { cookie: adminCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId }),
      }),
    );
    expect(res.status).toBe(200);

    const [du] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, dataUsahaId));
    expect(du!.userId).toBe(toUserId);

    const [log] = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, "data_usaha"), eq(auditLogs.entityId, dataUsahaId), eq(auditLogs.action, "transfer_ownership")));
    expect(log).toBeTruthy();

    const pendingRows = await db
      .select()
      .from(ownershipTransfers)
      .where(and(eq(ownershipTransfers.dataUsahaId, dataUsahaId), eq(ownershipTransfers.status, "pending")));
    expect(pendingRows.length).toBe(0);
  });
});
