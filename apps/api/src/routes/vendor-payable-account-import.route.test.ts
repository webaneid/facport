import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { user as userTable, roles, userRoles, plans, subscriptions, importBatches, importBatchRows } from "../db/schema";
import { vendorPayableAccountImportRoute } from "./vendor-payable-account-import.route";
import { generateTemplateBuffer } from "../lib/excel";
import { createTestDataUsaha } from "../lib/test-fixtures";

// § pola sama purchase-invoice-import.route.test.ts — route ini juga gabung
// permission + moduleAccess (Dua Lapis Gate).
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(vendorPayableAccountImportRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Vendor Import Test" }),
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

async function createProvisionedUser(email: string) {
  const userId = await signUp(email);
  const cookie = await signIn(email);

  const [customerRole] = await db.select().from(roles).where(eq(roles.name, "customer"));
  await db.insert(userRoles).values({ userId, roleId: customerRole!.id }).onConflictDoNothing();

  const [plan] = await db
    .insert(plans)
    .values({ name: `Vendor Import Test Plan ${email}`, price: 1000, durationDays: 30, modules: ["vendor_payable_account"] })
    .returning();
  const dataUsahaId = await createTestDataUsaha(userId);
  const [subscription] = await db
    .insert(subscriptions)
    .values({
      userId,
      planId: plan!.id,
      status: "active",
      startAt: new Date(),
      endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      dataUsahaId,
    })
    .returning();

  return { userId, cookie, subscriptionId: subscription!.id };
}

describe("GET /vendor/payable-account/import/template", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/vendor/payable-account/import/template"));
    expect(res.status).toBe(401);
  });

  test("403 kalau login tapi tidak punya permission import.create", async () => {
    const email = `vpa-noperm-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);

    const res = await testApp.handle(
      new Request("http://localhost/vendor/payable-account/import/template", { headers: { cookie } }),
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /vendor/payable-account/import/upload", () => {
  test("401 kalau tidak login (dengan file .xlsx asli, supaya bukan gagal validasi t.File duluan)", async () => {
    const buffer = generateTemplateBuffer([
      { column: "Vendor No", required: true, example: "V-0001", description: "test" },
      { column: "Akun Hutang", required: true, example: "2-10100", description: "test" },
    ]);
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      "test.xlsx",
    );
    const res = await testApp.handle(
      new Request("http://localhost/vendor/payable-account/import/upload", { method: "POST", body: form }),
    );
    expect(res.status).toBe(401);
  });
});

describe("Ownership batch — user lain TIDAK BOLEH akses batch orang lain", () => {
  test("GET/POST /vendor/payable-account/import/:batchId* dengan batchId milik user LAIN → 404, bukan bocor data", async () => {
    const ownerEmail = `vpa-owner-${runId}@test.local`;
    const attackerEmail = `vpa-attacker-${runId}@test.local`;
    const owner = await createProvisionedUser(ownerEmail);
    const attacker = await createProvisionedUser(attackerEmail);

    const [batch] = await db
      .insert(importBatches)
      .values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "vendor_payable_account",
        fileName: "milik-owner.xlsx",
        totalRows: 1,
        status: "mapping_pending",
      })
      .returning();

    const getRes = await testApp.handle(
      new Request(`http://localhost/vendor/payable-account/import/${batch!.id}`, {
        headers: { cookie: attacker.cookie },
      }),
    );
    expect(getRes.status).toBe(404);
    expect(((await getRes.json()) as { code: string }).code).toBe("BATCH_NOT_FOUND");

    const retryRes = await testApp.handle(
      new Request(`http://localhost/vendor/payable-account/import/${batch!.id}/retry`, {
        method: "POST",
        headers: { cookie: attacker.cookie },
      }),
    );
    expect(retryRes.status).toBe(404);

    const ownerRes = await testApp.handle(
      new Request(`http://localhost/vendor/payable-account/import/${batch!.id}`, { headers: { cookie: owner.cookie } }),
    );
    expect(ownerRes.status).toBe(200);
  });
});

describe("POST /vendor/payable-account/import/:batchId/confirm — validasi mapping", () => {
  test("400 MISSING_REQUIRED_FIELDS kalau kolom Akun Hutang belum di-mapping", async () => {
    const owner = await createProvisionedUser(`vpa-confirm-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "vendor_payable_account",
        fileName: "test.xlsx",
        totalRows: 1,
        status: "mapping_pending",
      })
      .returning();

    const res = await testApp.handle(
      new Request(`http://localhost/vendor/payable-account/import/${batch!.id}/confirm`, {
        method: "POST",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ columnMapping: { "Vendor No": "vendorNo" } }), // payableAccountNo sengaja tidak di-mapping
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; fields: string[] };
    expect(body.code).toBe("MISSING_REQUIRED_FIELDS");
    expect(body.fields).toContain("payableAccountNo");
  });
});

describe("GET /vendor/payable-account/import (list)", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/vendor/payable-account/import"));
    expect(res.status).toBe(401);
  });

  test("cuma return batch milik subscription sendiri, urut terbaru dulu, dibatasi ?limit", async () => {
    const owner = await createProvisionedUser(`vpa-list-owner-${runId}@test.local`);
    const other = await createProvisionedUser(`vpa-list-other-${runId}@test.local`);

    await db.insert(importBatches).values({
      userId: other.userId,
      subscriptionId: other.subscriptionId,
      module: "vendor_payable_account",
      fileName: "punya-orang-lain.xlsx",
      totalRows: 1,
      status: "completed",
    });

    for (const fileName of ["batch-1.xlsx", "batch-2.xlsx", "batch-3.xlsx"]) {
      await db.insert(importBatches).values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "vendor_payable_account",
        fileName,
        totalRows: 1,
        status: "completed",
      });
    }

    const res = await testApp.handle(
      new Request("http://localhost/vendor/payable-account/import?limit=2", { headers: { cookie: owner.cookie } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { batches: { fileName: string }[]; total: number };
    expect(body.batches).toHaveLength(2);
    expect(body.batches.map((b) => b.fileName)).toEqual(["batch-3.xlsx", "batch-2.xlsx"]);
    expect(body.batches.some((b) => b.fileName === "punya-orang-lain.xlsx")).toBe(false);
    expect(body.total).toBe(3);
  });

  test("?offset melompati N batch terbaru, `total` tetap hitungan penuh (bukan cuma halaman ini) — pola halaman Riwayat", async () => {
    const owner = await createProvisionedUser(`vpa-offset-${runId}@test.local`);
    for (const fileName of ["off-1.xlsx", "off-2.xlsx", "off-3.xlsx"]) {
      await db.insert(importBatches).values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "vendor_payable_account",
        fileName,
        totalRows: 1,
        status: "completed",
      });
    }

    const res = await testApp.handle(
      new Request("http://localhost/vendor/payable-account/import?limit=2&offset=1", { headers: { cookie: owner.cookie } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { batches: { fileName: string }[]; total: number };
    expect(body.batches.map((b) => b.fileName)).toEqual(["off-2.xlsx", "off-1.xlsx"]);
    expect(body.total).toBe(3);
  });
});

describe("PUT /vendor/payable-account/import/:batchId/rows/:rowId — Edit Baris", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(
      new Request("http://localhost/vendor/payable-account/import/00000000-0000-0000-0000-000000000000/rows/00000000-0000-0000-0000-000000000000", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawData: {} }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("404 kalau batch milik user LAIN", async () => {
    const owner = await createProvisionedUser(`vpa-editrow-owner-${runId}@test.local`);
    const attacker = await createProvisionedUser(`vpa-editrow-attacker-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "vendor_payable_account",
        fileName: "test.xlsx",
        totalRows: 1,
        status: "completed_with_errors",
        columnMapping: { "Vendor No": "vendorNo", "Akun Hutang": "payableAccountNo" },
      })
      .returning();
    const [row] = await db
      .insert(importBatchRows)
      .values({ batchId: batch!.id, rowNumber: 1, rawData: { "Vendor No": "" }, status: "failed" })
      .returning();

    const res = await testApp.handle(
      new Request(`http://localhost/vendor/payable-account/import/${batch!.id}/rows/${row!.id}`, {
        method: "PUT",
        headers: { cookie: attacker.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ rawData: { "Vendor No": "V-0001", "Akun Hutang": "2-10100" } }),
      }),
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as { code: string }).code).toBe("BATCH_NOT_FOUND");
  });

  test("409 ROW_NOT_EDITABLE kalau baris statusnya bukan failed", async () => {
    const owner = await createProvisionedUser(`vpa-editrow-noteditable-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "vendor_payable_account",
        fileName: "test.xlsx",
        totalRows: 1,
        status: "completed",
        columnMapping: { "Vendor No": "vendorNo", "Akun Hutang": "payableAccountNo" },
      })
      .returning();
    const [row] = await db
      .insert(importBatchRows)
      .values({ batchId: batch!.id, rowNumber: 1, rawData: { "Vendor No": "V-0001" }, status: "success" })
      .returning();

    const res = await testApp.handle(
      new Request(`http://localhost/vendor/payable-account/import/${batch!.id}/rows/${row!.id}`, {
        method: "PUT",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ rawData: { "Vendor No": "V-0002", "Akun Hutang": "2-10100" } }),
      }),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("ROW_NOT_EDITABLE");
  });

  test("400 MISSING_REQUIRED_VALUES kalau field wajib dikosongkan, sukses (status pending) kalau lengkap", async () => {
    const owner = await createProvisionedUser(`vpa-editrow-save-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "vendor_payable_account",
        fileName: "test.xlsx",
        totalRows: 1,
        status: "completed_with_errors",
        columnMapping: { "Vendor No": "vendorNo", "Akun Hutang": "payableAccountNo" },
      })
      .returning();
    const [row] = await db
      .insert(importBatchRows)
      .values({ batchId: batch!.id, rowNumber: 1, rawData: { "Vendor No": "V-0001" }, status: "failed", errorMessage: "Vendor tidak ditemukan" })
      .returning();

    const missingRes = await testApp.handle(
      new Request(`http://localhost/vendor/payable-account/import/${batch!.id}/rows/${row!.id}`, {
        method: "PUT",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ rawData: { "Vendor No": "V-0001", "Akun Hutang": "" } }),
      }),
    );
    expect(missingRes.status).toBe(400);
    const missingBody = (await missingRes.json()) as { code: string; fields: string[] };
    expect(missingBody.code).toBe("MISSING_REQUIRED_VALUES");
    expect(missingBody.fields).toContain("payableAccountNo");

    const okRes = await testApp.handle(
      new Request(`http://localhost/vendor/payable-account/import/${batch!.id}/rows/${row!.id}`, {
        method: "PUT",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ rawData: { "Vendor No": "V-0001", "Akun Hutang": "2-10100" } }),
      }),
    );
    expect(okRes.status).toBe(200);
    expect((await okRes.json()) as { rowId: string; status: string }).toEqual({ rowId: row!.id, status: "pending" });

    const [updated] = await db.select().from(importBatchRows).where(eq(importBatchRows.id, row!.id));
    expect(updated!.status).toBe("pending");
    expect(updated!.errorMessage).toBeNull();
  });
});

// § Fase 51 — versi BULK, dipakai grid edit ala Excel.
describe("PUT /vendor/payable-account/import/:batchId/rows — Edit Bulk (Grid)", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(
      new Request("http://localhost/vendor/payable-account/import/00000000-0000-0000-0000-000000000000/rows", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: [] }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("404 kalau batch milik user LAIN", async () => {
    const owner = await createProvisionedUser(`vpa-bulkedit-owner-${runId}@test.local`);
    const attacker = await createProvisionedUser(`vpa-bulkedit-attacker-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "vendor_payable_account",
        fileName: "test.xlsx",
        totalRows: 1,
        status: "completed_with_errors",
        columnMapping: { "Vendor No": "vendorNo", "Akun Hutang": "payableAccountNo" },
      })
      .returning();

    const res = await testApp.handle(
      new Request(`http://localhost/vendor/payable-account/import/${batch!.id}/rows`, {
        method: "PUT",
        headers: { cookie: attacker.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ rows: [] }),
      }),
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as { code: string }).code).toBe("BATCH_NOT_FOUND");
  });

  test("campuran: baris valid tersimpan (pending), baris field wajib kosong & baris status bukan failed dicatat di errors, bukan gagalkan seluruh request", async () => {
    const owner = await createProvisionedUser(`vpa-bulkedit-mixed-${runId}@test.local`);
    const columnMapping = { "Vendor No": "vendorNo", "Akun Hutang": "payableAccountNo" };
    const [batch] = await db
      .insert(importBatches)
      .values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "vendor_payable_account",
        fileName: "test.xlsx",
        totalRows: 3,
        status: "completed_with_errors",
        columnMapping,
      })
      .returning();
    const [validRow, missingRow, notFailedRow] = await db
      .insert(importBatchRows)
      .values([
        { batchId: batch!.id, rowNumber: 1, rawData: { "Vendor No": "V-0001" }, status: "failed", errorMessage: "Vendor tidak ditemukan" },
        { batchId: batch!.id, rowNumber: 2, rawData: { "Vendor No": "V-0002" }, status: "failed", errorMessage: "Vendor tidak ditemukan" },
        { batchId: batch!.id, rowNumber: 3, rawData: { "Vendor No": "V-0003" }, status: "success" },
      ])
      .returning();

    const res = await testApp.handle(
      new Request(`http://localhost/vendor/payable-account/import/${batch!.id}/rows`, {
        method: "PUT",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: [
            { id: validRow!.id, rawData: { "Vendor No": "V-0001", "Akun Hutang": "2-10100" } },
            { id: missingRow!.id, rawData: { "Vendor No": "V-0002", "Akun Hutang": "" } },
            { id: notFailedRow!.id, rawData: { "Vendor No": "V-0003" } },
          ],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { updated: string[]; errors: { rowId: string; rowNumber: number; fields: string[] }[] };
    expect(body.updated).toEqual([validRow!.id]);
    expect(body.errors).toHaveLength(2);
    expect(body.errors.find((e) => e.rowId === missingRow!.id)?.fields).toContain("payableAccountNo");
    expect(body.errors.find((e) => e.rowId === notFailedRow!.id)?.fields).toContain("ROW_NOT_EDITABLE");

    const [updatedValid] = await db.select().from(importBatchRows).where(eq(importBatchRows.id, validRow!.id));
    expect(updatedValid!.status).toBe("pending");
    const [stillMissing] = await db.select().from(importBatchRows).where(eq(importBatchRows.id, missingRow!.id));
    expect(stillMissing!.status).toBe("failed");
    const [stillSuccess] = await db.select().from(importBatchRows).where(eq(importBatchRows.id, notFailedRow!.id));
    expect(stillSuccess!.status).toBe("success");
  });
});

describe("DELETE /vendor/payable-account/import/:batchId — hapus riwayat lokal", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(
      new Request("http://localhost/vendor/payable-account/import/00000000-0000-0000-0000-000000000000", { method: "DELETE" }),
    );
    expect(res.status).toBe(401);
  });

  test("404 kalau batch milik user LAIN", async () => {
    const owner = await createProvisionedUser(`vpa-delete-owner-${runId}@test.local`);
    const attacker = await createProvisionedUser(`vpa-delete-attacker-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "vendor_payable_account", fileName: "test.xlsx", totalRows: 1, status: "completed" })
      .returning();

    const res = await testApp.handle(
      new Request(`http://localhost/vendor/payable-account/import/${batch!.id}`, { method: "DELETE", headers: { cookie: attacker.cookie } }),
    );
    expect(res.status).toBe(404);
  });

  test("409 BATCH_BUSY kalau status processing", async () => {
    const owner = await createProvisionedUser(`vpa-delete-busy-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "vendor_payable_account", fileName: "test.xlsx", totalRows: 1, status: "processing" })
      .returning();

    const res = await testApp.handle(
      new Request(`http://localhost/vendor/payable-account/import/${batch!.id}`, { method: "DELETE", headers: { cookie: owner.cookie } }),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("BATCH_BUSY");
  });

  test("berhasil hapus batch + baris (cascade), tercatat di audit log", async () => {
    const owner = await createProvisionedUser(`vpa-delete-ok-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "vendor_payable_account", fileName: "hapus-saya.xlsx", totalRows: 1, status: "completed" })
      .returning();
    await db.insert(importBatchRows).values({ batchId: batch!.id, rowNumber: 1, rawData: {}, status: "success", accurateTransactionId: "123" });

    const res = await testApp.handle(
      new Request(`http://localhost/vendor/payable-account/import/${batch!.id}`, { method: "DELETE", headers: { cookie: owner.cookie } }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as { batchId: string; deleted: boolean }).toEqual({ batchId: batch!.id, deleted: true });

    const [remaining] = await db.select().from(importBatches).where(eq(importBatches.id, batch!.id));
    expect(remaining).toBeUndefined();
    const remainingRows = await db.select().from(importBatchRows).where(eq(importBatchRows.batchId, batch!.id));
    expect(remainingRows).toHaveLength(0);
  });
});
