import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq, and } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { db } from "../../lib/db";
import { user as userTable, roles, userRoles, dataUsaha, auditLogs, ownershipTransfers, accurateConnections, plans, subscriptions, notifications, importBatches } from "../../db/schema";
import { adminDataUsahaRoute } from "./data-usaha.route";
import { createTestAccurateConnection, createTestDataUsaha } from "../../lib/test-fixtures";

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

  // § Fase 143, ADR-0036 #6 / ADR-0037 #6 — token Accurate milik akun pemilik LAMA tidak boleh diwarisi pemilik baru.
  test("200 — transfer MEMUTUS pointer koneksi Accurate (database terakhir dipertahankan; baris koneksi milik pemilik lama tidak dihapus)", async () => {
    const adminCookie = await makeAdminCookie();
    const ownerId = await signUp(`admin-du-xfer-conn-owner-${runId}@test.local`);
    const dataUsahaId = await createTestDataUsaha(ownerId, `DU Admin Xfer Conn ${runId}`);
    const conn = await createTestAccurateConnection(ownerId, { dataUsahaId, accurateDbId: "321", accurateDbAlias: "PT Lama" });
    const toUserId = await signUp(`admin-du-xfer-conn-target-${runId}@test.local`);

    const res = await testApp.handle(
      new Request(`http://localhost/admin/data-usaha/${dataUsahaId}/transfer-ownership`, {
        method: "POST",
        headers: { cookie: adminCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ toUserId }),
      }),
    );
    expect(res.status).toBe(200);
    const [du] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, dataUsahaId));
    expect(du).toMatchObject({ userId: toUserId, accurateConnectionId: null, accurateDbId: "321", accurateDbAlias: "PT Lama" });
    const [stillThere] = await db.select().from(accurateConnections).where(eq(accurateConnections.id, conn.id));
    expect(stillThere?.userId).toBe(ownerId);
  });
});

// § Fase 144 — "Putuskan Koneksi" admin di level DATA USAHA (menggantikan endpoint per-subscription). Koneksi dipegang Data Usaha
// (ADR-0037): satu aksi memutus SEMUA fitur di dalamnya.
describe("POST /admin/data-usaha/:id/disconnect-accurate", () => {
  const post = (cookie: string, id: string, body?: { removeAccount?: boolean }) =>
    testApp.handle(
      new Request(`http://localhost/admin/data-usaha/${id}/disconnect-accurate`, {
        method: "POST",
        headers: { ...(cookie ? { cookie } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );

  test("401 tanpa login; 403 untuk customer biasa", async () => {
    expect((await post("", "00000000-0000-0000-0000-000000000000")).status).toBe(401);
    const email = `admin-du-disc-cust-${runId}@test.local`;
    await signUp(email);
    expect((await post(await signIn(email), "00000000-0000-0000-0000-000000000000")).status).toBe(403);
  });

  test("404 DATA_USAHA_NOT_FOUND; 400 NOT_CONNECTED bila belum punya koneksi", async () => {
    const adminCookie = await makeAdminCookie();
    const missing = await post(adminCookie, "00000000-0000-0000-0000-000000000000");
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { code: string }).code).toBe("DATA_USAHA_NOT_FOUND");

    const ownerId = await signUp(`admin-du-disc-nc-${runId}@test.local`);
    const du = await createTestDataUsaha(ownerId);
    const res = await post(adminCookie, du);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("NOT_CONNECTED");
  });

  test("200 — putus BERSIH: pointer koneksi DAN pilihan database dikosongkan (user wajib pilih database lagi), baris koneksi akun tetap ada, audit log level data_usaha, notifikasi ke PEMILIK", async () => {
    const adminCookie = await makeAdminCookie();
    const ownerId = await signUp(`admin-du-disc-ok-${runId}@test.local`);
    const du = await createTestDataUsaha(ownerId, `DU Putus ${runId}`);
    const conn = await createTestAccurateConnection(ownerId, { dataUsahaId: du, accurateDbId: "77", accurateDbAlias: "PT Demo Putus" });

    const res = await post(adminCookie, du);
    expect(res.status).toBe(200);

    const [row] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, du));
    expect(row).toMatchObject({ accurateConnectionId: null, accurateDbId: null, accurateDbAlias: null, accurateDbConfirmedAt: null });
    expect((await db.select().from(accurateConnections).where(eq(accurateConnections.id, conn.id))).length).toBe(1);

    const [audit] = await db.select().from(auditLogs).where(and(eq(auditLogs.entityType, "data_usaha"), eq(auditLogs.entityId, du), eq(auditLogs.action, "disconnect_accurate")));
    expect(audit).toBeTruthy();
    expect((audit!.changes as { previousConnectionId?: string }).previousConnectionId).toBe(conn.id);
    expect(audit!.changes).toMatchObject({ previousAccurateDbId: "77", previousAccurateDbAlias: "PT Demo Putus", removedAccount: false });

    const notifs = await db.select().from(notifications).where(eq(notifications.userId, ownerId));
    const n = notifs.find((x) => x.type === "accurate_connection_disconnected_by_admin");
    expect(n?.body).toContain(`DU Putus ${runId}`);
  });

  test("Data Usaha dengan BEBERAPA fitur: satu aksi memutus semuanya (tidak ada koneksi per fitur)", async () => {
    const adminCookie = await makeAdminCookie();
    const ownerId = await signUp(`admin-du-disc-multi-${runId}@test.local`);
    const du = await createTestDataUsaha(ownerId);
    await createTestAccurateConnection(ownerId, { dataUsahaId: du, accurateDbId: "1", accurateDbAlias: "PT Satu" });
    for (const [i, moduleKey] of ["purchase_invoice", "sales_invoice", "sales_order"].entries()) {
      const [plan] = await db.insert(plans).values({ name: `Plan Putus ${i} ${runId}`, price: 1, durationDays: 30, modules: [moduleKey] }).returning();
      await db.insert(subscriptions).values({ userId: ownerId, planId: plan!.id, status: "active", startAt: new Date(), endAt: new Date(Date.now() + 86_400_000), dataUsahaId: du });
    }
    expect((await post(adminCookie, du)).status).toBe(200);
    const [row] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, du));
    expect(row!.accurateConnectionId).toBeNull(); // satu pointer di Data Usaha — semua fitur ikut
    expect((await post(adminCookie, du)).status).toBe(400); // sudah terputus
  });

  test("removeAccount: koneksi akun DIHAPUS dan SEMUA Data Usaha yang memakainya ikut putus bersih (user wajib OAuth dari nol)", async () => {
    const adminCookie = await makeAdminCookie();
    const ownerId = await signUp(`admin-du-disc-rm-${runId}@test.local`);
    const duA = await createTestDataUsaha(ownerId, `DU RM A ${runId}`);
    const duB = await createTestDataUsaha(ownerId, `DU RM B ${runId}`);
    const conn = await createTestAccurateConnection(ownerId, { dataUsahaId: duA, accurateDbId: "1", accurateDbAlias: "DB A" });
    await db.update(dataUsaha).set({ accurateConnectionId: conn.id, accurateDbId: "2", accurateDbAlias: "DB B" }).where(eq(dataUsaha.id, duB));
    // pointer lama per-subscription (sebelum ADR-0037) juga menunjuk koneksi ini
    const [plan] = await db.insert(plans).values({ name: `Plan RM ${runId}`, price: 1, durationDays: 30, modules: ["sales_invoice"] }).returning();
    const [sub] = await db
      .insert(subscriptions)
      .values({ userId: ownerId, planId: plan!.id, status: "active", startAt: new Date(), endAt: new Date(Date.now() + 86_400_000), dataUsahaId: duA, accurateConnectionId: conn.id })
      .returning();

    const res = await post(adminCookie, duA, { removeAccount: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ removedAccount: true, affectedDataUsaha: 2 });

    for (const id of [duA, duB]) {
      const [row] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, id));
      expect(row).toMatchObject({ accurateConnectionId: null, accurateDbId: null, accurateDbAlias: null });
    }
    expect((await db.select().from(accurateConnections).where(eq(accurateConnections.id, conn.id))).length).toBe(0);
    const [subAfter] = await db.select().from(subscriptions).where(eq(subscriptions.id, sub!.id));
    expect(subAfter!.accurateConnectionId).toBeNull();
    const [audit] = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, duA), eq(auditLogs.action, "disconnect_accurate")));
    expect(audit!.changes).toMatchObject({ removedAccount: true });
  });

  test("tanpa removeAccount: Data Usaha LAIN yang berbagi koneksi akun yang sama TIDAK tersentuh", async () => {
    const adminCookie = await makeAdminCookie();
    const ownerId = await signUp(`admin-du-disc-share-${runId}@test.local`);
    const duA = await createTestDataUsaha(ownerId, `DU Share A ${runId}`);
    const duB = await createTestDataUsaha(ownerId, `DU Share B ${runId}`);
    const conn = await createTestAccurateConnection(ownerId, { dataUsahaId: duA, accurateDbId: "1", accurateDbAlias: "DB A" });
    await db.update(dataUsaha).set({ accurateConnectionId: conn.id, accurateDbId: "2", accurateDbAlias: "DB B" }).where(eq(dataUsaha.id, duB));

    expect((await post(adminCookie, duA)).status).toBe(200);
    const [a] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, duA));
    const [b] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, duB));
    expect(a).toMatchObject({ accurateConnectionId: null, accurateDbId: null });
    expect(b).toMatchObject({ accurateConnectionId: conn.id, accurateDbId: "2", accurateDbAlias: "DB B" });
    expect((await db.select().from(accurateConnections).where(eq(accurateConnections.id, conn.id))).length).toBe(1);
  });

  test("409 IMPORT_RUNNING kalau ada import berjalan di Data Usaha terdampak — tidak ada yang berubah", async () => {
    const adminCookie = await makeAdminCookie();
    const ownerId = await signUp(`admin-du-disc-run-${runId}@test.local`);
    const du = await createTestDataUsaha(ownerId);
    const conn = await createTestAccurateConnection(ownerId, { dataUsahaId: du, accurateDbId: "9", accurateDbAlias: "DB Run" });
    const [plan] = await db.insert(plans).values({ name: `Plan Run ${runId}`, price: 1, durationDays: 30, modules: ["sales_invoice"] }).returning();
    const [sub] = await db
      .insert(subscriptions)
      .values({ userId: ownerId, planId: plan!.id, status: "active", startAt: new Date(), endAt: new Date(Date.now() + 86_400_000), dataUsahaId: du })
      .returning();
    await db.insert(importBatches).values({ userId: ownerId, subscriptionId: sub!.id, module: "sales_invoice", fileName: "x.xlsx", totalRows: 1, status: "processing" });

    const res = await post(adminCookie, du, { removeAccount: true });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("IMPORT_RUNNING");
    const [row] = await db.select().from(dataUsaha).where(eq(dataUsaha.id, du));
    expect(row).toMatchObject({ accurateConnectionId: conn.id, accurateDbId: "9" });
    expect((await db.select().from(accurateConnections).where(eq(accurateConnections.id, conn.id))).length).toBe(1);
  });

  test("endpoint lama per-subscription sudah tidak ada", async () => {
    const res = await testApp.handle(new Request("http://localhost/admin/subscriptions/00000000-0000-0000-0000-000000000000/disconnect-accurate", { method: "POST" }));
    expect(res.status).toBe(404);
  });
});
