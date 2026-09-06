import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../../lib/auth";
import { db } from "../../lib/db";
import { user as userTable, roles, userRoles, plans, subscriptions, importBatches, importBatchRows } from "../../db/schema";
import { adminImportBatchesRoute } from "./import-batches.route";

// § diminta user 2026-09-05 — admin (Super Admin/Admin) lihat riwayat &
// detail log import SEMUA user, READ-ONLY, buat bantu diagnosa pas user
// telepon support.
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(adminImportBatchesRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Import Batches Admin Test" }),
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
  const email = `import-batches-admin-${runId}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const adminId = await signUp(email);
  const [role] = await db.select().from(roles).where(eq(roles.name, "admin"));
  await db.insert(userRoles).values({ userId: adminId, roleId: role!.id }).onConflictDoNothing();
  return signIn(email);
}

async function createCustomerWithBatch(fileName: string, module: string) {
  const email = `import-batches-customer-${runId}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const userId = await signUp(email);
  const [customerRole] = await db.select().from(roles).where(eq(roles.name, "customer"));
  await db.insert(userRoles).values({ userId, roleId: customerRole!.id }).onConflictDoNothing();

  const [plan] = await db.insert(plans).values({ name: `Import Batches Test Plan ${email}`, price: 1000, durationDays: 30, modules: [module] }).returning();
  const [subscription] = await db
    .insert(subscriptions)
    .values({ userId, planId: plan!.id, status: "active", startAt: new Date(), endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) })
    .returning();

  const [batch] = await db
    .insert(importBatches)
    .values({ userId, subscriptionId: subscription!.id, module, fileName, totalRows: 2, status: "completed_with_errors" })
    .returning();

  await db.insert(importBatchRows).values([
    { batchId: batch!.id, rowNumber: 1, rawData: { billNumber: "INV-001" }, status: "success" },
    { batchId: batch!.id, rowNumber: 2, rawData: { billNumber: "INV-002" }, status: "failed", errorMessage: "Vendor tidak ditemukan" },
  ]);

  return { userId, batchId: batch!.id };
}

describe("GET /admin/users/:id/import-batches", () => {
  test("200 — Super Admin lihat batch milik user tertentu", async () => {
    const adminCookie = await makeAdminCookie();
    const { userId } = await createCustomerWithBatch("laporan-pembelian.xlsx", "purchase_invoice");

    const res = await testApp.handle(new Request(`http://localhost/admin/users/${userId}/import-batches`, { headers: { cookie: adminCookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: string }; batches: { fileName: string; module: string }[]; total: number };
    expect(body.user.id).toBe(userId);
    expect(body.total).toBe(1);
    expect(body.batches[0]!.fileName).toBe("laporan-pembelian.xlsx");
    expect(body.batches[0]!.module).toBe("purchase_invoice");
  });

  test("404 kalau user tidak ditemukan", async () => {
    const adminCookie = await makeAdminCookie();
    const res = await testApp.handle(
      new Request("http://localhost/admin/users/does-not-exist/import-batches", { headers: { cookie: adminCookie } }),
    );
    expect(res.status).toBe(404);
  });

  test("403 kalau tidak punya users.view/users.manage", async () => {
    const email = `import-batches-noview-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);
    const res = await testApp.handle(new Request("http://localhost/admin/users/any-id/import-batches", { headers: { cookie } }));
    expect(res.status).toBe(403);
  });
});

describe("GET /admin/import-batches/:batchId", () => {
  test("200 — hasil termasuk rawData & errorMessage per baris (buat diagnosa support)", async () => {
    const adminCookie = await makeAdminCookie();
    const { batchId } = await createCustomerWithBatch("laporan-penjualan.xlsx", "sales_invoice");

    const res = await testApp.handle(new Request(`http://localhost/admin/import-batches/${batchId}`, { headers: { cookie: adminCookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      batch: { module: string; fileName: string };
      summary: { success: number; failed: number; pending: number };
      rows: { status: string; errorMessage: string | null; rawData: Record<string, unknown> }[];
    };
    expect(body.batch.module).toBe("sales_invoice");
    expect(body.summary).toEqual({ success: 1, failed: 1, pending: 0 });
    const failedRow = body.rows.find((r) => r.status === "failed");
    expect(failedRow?.errorMessage).toBe("Vendor tidak ditemukan");
    expect(failedRow?.rawData).toEqual({ billNumber: "INV-002" });
  });

  test("404 kalau batch tidak ditemukan", async () => {
    const adminCookie = await makeAdminCookie();
    const res = await testApp.handle(
      new Request("http://localhost/admin/import-batches/00000000-0000-0000-0000-000000000000", { headers: { cookie: adminCookie } }),
    );
    expect(res.status).toBe(404);
  });

  test("403 kalau tidak punya users.view/users.manage", async () => {
    const email = `import-batches-detail-noview-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);
    const { batchId } = await createCustomerWithBatch("tidak-boleh-dilihat.xlsx", "purchase_invoice");
    const res = await testApp.handle(new Request(`http://localhost/admin/import-batches/${batchId}`, { headers: { cookie } }));
    expect(res.status).toBe(403);
  });
});
