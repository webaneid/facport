import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { user as userTable, roles, userRoles, plans, subscriptions, importBatches, importBatchRows, memberSeats } from "../db/schema";
import { salesQuotationImportRoute } from "./sales-quotation-import.route";
import { generateTemplateBuffer, parseExcelBuffer } from "../lib/excel";
import { createTestDataUsaha, createTestSeat } from "../lib/test-fixtures";

// § Fase 123 — mirror `purchase-order-import.route.test.ts` (modul yang
// juga TIDAK punya endpoint cancel).
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(salesQuotationImportRoute);
const columnMapping = {
  "Customer Number": "customerNo",
  Date: "transDate",
  "Trans Number": "number",
  "Item Number": "itemNo",
  "Item price": "unitPrice",
  "Item Quantity": "quantity",
  "Item Unit Name": "itemUnitName",
  "Branch Name": "branchName",
};

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Sales Quotation Import Test" }),
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
    .values({ name: `Sales Quotation Import Test Plan ${email}`, price: 1000, durationDays: 30, modules: ["sales_quotation"] })
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

  return { userId, cookie, subscriptionId: subscription!.id, dataUsahaId };
}

describe("GET /sales-quotation/import/template", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/sales-quotation/import/template"));
    expect(res.status).toBe(401);
  });

  test("403 kalau login tapi tidak punya permission import.create", async () => {
    const email = `sq-noperm-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);

    const res = await testApp.handle(
      new Request("http://localhost/sales-quotation/import/template", { headers: { cookie } }),
    );
    expect(res.status).toBe(403);
  });
});

describe("POST /sales-quotation/import/upload", () => {
  test("401 kalau tidak login (dengan file .xlsx asli, supaya bukan gagal validasi t.File duluan)", async () => {
    const buffer = generateTemplateBuffer([
      { column: "Customer Number", required: true, example: "C.0001", description: "test" },
      { column: "Item Number", required: true, example: "BRG-001", description: "test" },
    ]);
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      "test.xlsx",
    );
    const res = await testApp.handle(
      new Request("http://localhost/sales-quotation/import/upload", { method: "POST", body: form }),
    );
    expect(res.status).toBe(401);
  });
});

describe("Ownership batch — user lain TIDAK BOLEH akses batch orang lain", () => {
  test("GET/POST /sales-quotation/import/:batchId* dengan batchId milik user LAIN → 404, bukan bocor data", async () => {
    const ownerEmail = `sq-owner-${runId}@test.local`;
    const attackerEmail = `sq-attacker-${runId}@test.local`;
    const owner = await createProvisionedUser(ownerEmail);
    const attacker = await createProvisionedUser(attackerEmail);

    const [batch] = await db
      .insert(importBatches)
      .values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "sales_quotation",
        fileName: "milik-owner.xlsx",
        totalRows: 1,
        status: "mapping_pending",
      })
      .returning();

    const getRes = await testApp.handle(
      new Request(`http://localhost/sales-quotation/import/${batch!.id}`, {
        headers: { cookie: attacker.cookie },
      }),
    );
    expect(getRes.status).toBe(404);
    expect(((await getRes.json()) as { code: string }).code).toBe("BATCH_NOT_FOUND");

    const retryRes = await testApp.handle(
      new Request(`http://localhost/sales-quotation/import/${batch!.id}/retry`, {
        method: "POST",
        headers: { cookie: attacker.cookie },
      }),
    );
    expect(retryRes.status).toBe(404);

    const ownerRes = await testApp.handle(
      new Request(`http://localhost/sales-quotation/import/${batch!.id}`, { headers: { cookie: owner.cookie } }),
    );
    expect(ownerRes.status).toBe(200);
  });
});

// § diminta user 2026-09-27 — download baris gagal sebagai Excel, generik
// lintas 23 modul import (mirror lib/excel.test.ts untuk isi filenya).
describe("GET /sales-quotation/import/:batchId/failed-rows/export", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(
      new Request("http://localhost/sales-quotation/import/00000000-0000-0000-0000-000000000000/failed-rows/export"),
    );
    expect(res.status).toBe(401);
  });

  test("404 BATCH_NOT_FOUND kalau batch milik user LAIN", async () => {
    const owner = await createProvisionedUser(`sq-export-owner-${runId}@test.local`);
    const attacker = await createProvisionedUser(`sq-export-attacker-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "sales_quotation", fileName: "test.xlsx", totalRows: 1, status: "completed_with_errors", columnMapping })
      .returning();
    await db.insert(importBatchRows).values({ batchId: batch!.id, rowNumber: 1, rawData: { "Customer Number": "C.0001" }, status: "failed", errorMessage: "Customer tidak ditemukan" });

    const res = await testApp.handle(
      new Request(`http://localhost/sales-quotation/import/${batch!.id}/failed-rows/export`, { headers: { cookie: attacker.cookie } }),
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as { code: string }).code).toBe("BATCH_NOT_FOUND");
  });

  test("404 NO_FAILED_ROWS kalau batch tidak punya baris gagal sama sekali", async () => {
    const owner = await createProvisionedUser(`sq-export-nofailed-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "sales_quotation", fileName: "test.xlsx", totalRows: 1, status: "completed", columnMapping })
      .returning();
    await db.insert(importBatchRows).values({ batchId: batch!.id, rowNumber: 1, rawData: { "Customer Number": "C.0001" }, status: "success", accurateTransactionId: "101" });

    const res = await testApp.handle(
      new Request(`http://localhost/sales-quotation/import/${batch!.id}/failed-rows/export`, { headers: { cookie: owner.cookie } }),
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as { code: string }).code).toBe("NO_FAILED_ROWS");
  });

  test("200 balikin file .xlsx berisi HANYA baris failed (bukan success/pending), kolom asli + Pesan Error, nama file disanitasi", async () => {
    const owner = await createProvisionedUser(`sq-export-ok-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "sales_quotation", fileName: 'data "klien" 2026.xlsx', totalRows: 3, status: "completed_with_errors", columnMapping })
      .returning();
    await db.insert(importBatchRows).values([
      { batchId: batch!.id, rowNumber: 1, rawData: { "Customer Number": "C.0001", "Item Number": "BRG-01" }, status: "failed", errorMessage: "Item tidak ditemukan" },
      { batchId: batch!.id, rowNumber: 2, rawData: { "Customer Number": "C.0002", "Item Number": "BRG-02" }, status: "success", accurateTransactionId: "101" },
      { batchId: batch!.id, rowNumber: 3, rawData: { "Customer Number": "C.0003", "Item Number": "BRG-03" }, status: "pending" },
    ]);

    const res = await testApp.handle(
      new Request(`http://localhost/sales-quotation/import/${batch!.id}/failed-rows/export`, { headers: { cookie: owner.cookie } }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    // § tanda kutip di nama file asli WAJIB tersanitasi — tidak boleh "kabur" dari atribut quoted-string.
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="baris-gagal-data klien 2026.xlsx"');

    const buffer = Buffer.from(await res.arrayBuffer());
    const parsed = parseExcelBuffer(buffer);
    expect(parsed.headers).toEqual(["Customer Number", "Item Number", "Pesan Error"]);
    expect(parsed.rows).toEqual([{ "Customer Number": "C.0001", "Item Number": "BRG-01", "Pesan Error": "Item tidak ditemukan" }]);
  });
});

describe("POST /sales-quotation/import/:batchId/confirm — validasi mapping", () => {
  test("400 MISSING_REQUIRED_FIELDS kalau kolom wajib belum di-mapping", async () => {
    const owner = await createProvisionedUser(`sq-confirm-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "sales_quotation",
        fileName: "test.xlsx",
        totalRows: 1,
        status: "mapping_pending",
      })
      .returning();

    const res = await testApp.handle(
      new Request(`http://localhost/sales-quotation/import/${batch!.id}/confirm`, {
        method: "POST",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ columnMapping: { "Customer Number": "customerNo" } }), // field wajib lain sengaja tidak di-mapping
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; fields: string[] };
    expect(body.code).toBe("MISSING_REQUIRED_FIELDS");
    expect(body.fields).toContain("transDate");
    expect(body.fields).toContain("itemNo");
    expect(body.fields).toContain("unitPrice");
    expect(body.fields).toContain("quantity");
    expect(body.fields).toContain("itemUnitName");
    expect(body.fields).toContain("branchName");
  });

  test("400 INVALID_MAPPING_FIELD kalau ada kolom di-mapping ke field yang tidak dikenal", async () => {
    const owner = await createProvisionedUser(`sq-invalidfield-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "sales_quotation",
        fileName: "test.xlsx",
        totalRows: 1,
        status: "mapping_pending",
      })
      .returning();

    const res = await testApp.handle(
      new Request(`http://localhost/sales-quotation/import/${batch!.id}/confirm`, {
        method: "POST",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ columnMapping: { "Kolom Aneh": "fieldTidakAda" } }),
      }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("INVALID_MAPPING_FIELD");
  });
});

describe("GET /sales-quotation/import (list)", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/sales-quotation/import"));
    expect(res.status).toBe(401);
  });

  test("cuma return batch milik subscription sendiri, urut terbaru dulu, dibatasi ?limit", async () => {
    const owner = await createProvisionedUser(`sq-list-owner-${runId}@test.local`);
    const other = await createProvisionedUser(`sq-list-other-${runId}@test.local`);

    await db.insert(importBatches).values({
      userId: other.userId,
      subscriptionId: other.subscriptionId,
      module: "sales_quotation",
      fileName: "punya-orang-lain.xlsx",
      totalRows: 1,
      status: "completed",
    });

    for (const fileName of ["batch-1.xlsx", "batch-2.xlsx", "batch-3.xlsx"]) {
      await db.insert(importBatches).values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "sales_quotation",
        fileName,
        totalRows: 1,
        status: "completed",
      });
    }

    const res = await testApp.handle(
      new Request("http://localhost/sales-quotation/import?limit=2", { headers: { cookie: owner.cookie } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { batches: { fileName: string }[]; total: number };
    expect(body.batches).toHaveLength(2);
    expect(body.batches.map((b) => b.fileName)).toEqual(["batch-3.xlsx", "batch-2.xlsx"]);
    expect(body.batches.some((b) => b.fileName === "punya-orang-lain.xlsx")).toBe(false);
    expect(body.total).toBe(3);
  });

  test("?offset melompati N batch terbaru, `total` tetap hitungan penuh — pola halaman Riwayat", async () => {
    const owner = await createProvisionedUser(`sq-offset-${runId}@test.local`);
    for (const fileName of ["off-1.xlsx", "off-2.xlsx", "off-3.xlsx"]) {
      await db.insert(importBatches).values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "sales_quotation",
        fileName,
        totalRows: 1,
        status: "completed",
      });
    }

    const res = await testApp.handle(
      new Request("http://localhost/sales-quotation/import?limit=2&offset=1", { headers: { cookie: owner.cookie } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { batches: { fileName: string }[]; total: number };
    expect(body.batches.map((b) => b.fileName)).toEqual(["off-2.xlsx", "off-1.xlsx"]);
    expect(body.total).toBe(3);
  });
});

describe("PUT /sales-quotation/import/:batchId/rows/:rowId — Edit Baris", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(
      new Request(
        "http://localhost/sales-quotation/import/00000000-0000-0000-0000-000000000000/rows/00000000-0000-0000-0000-000000000000",
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rawData: {} }) },
      ),
    );
    expect(res.status).toBe(401);
  });

  test("404 kalau batch milik user LAIN", async () => {
    const owner = await createProvisionedUser(`sq-editrow-owner-${runId}@test.local`);
    const attacker = await createProvisionedUser(`sq-editrow-attacker-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "sales_quotation",
        fileName: "test.xlsx",
        totalRows: 1,
        status: "completed_with_errors",
        columnMapping,
      })
      .returning();
    const [row] = await db
      .insert(importBatchRows)
      .values({ batchId: batch!.id, rowNumber: 1, rawData: {}, status: "failed" })
      .returning();

    const res = await testApp.handle(
      new Request(`http://localhost/sales-quotation/import/${batch!.id}/rows/${row!.id}`, {
        method: "PUT",
        headers: { cookie: attacker.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ rawData: { "Customer Number": "C.0001" } }),
      }),
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as { code: string }).code).toBe("BATCH_NOT_FOUND");
  });

  test("409 ROW_NOT_EDITABLE kalau baris statusnya bukan failed", async () => {
    const owner = await createProvisionedUser(`sq-editrow-noteditable-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "sales_quotation",
        fileName: "test.xlsx",
        totalRows: 1,
        status: "completed",
        columnMapping,
      })
      .returning();
    const [row] = await db
      .insert(importBatchRows)
      .values({ batchId: batch!.id, rowNumber: 1, rawData: {}, status: "success" })
      .returning();

    const res = await testApp.handle(
      new Request(`http://localhost/sales-quotation/import/${batch!.id}/rows/${row!.id}`, {
        method: "PUT",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ rawData: { "Customer Number": "C.0001" } }),
      }),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("ROW_NOT_EDITABLE");
  });

  test("400 MISSING_REQUIRED_VALUES kalau field wajib dikosongkan, sukses (status pending) kalau lengkap", async () => {
    const owner = await createProvisionedUser(`sq-editrow-save-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "sales_quotation",
        fileName: "test.xlsx",
        totalRows: 1,
        status: "completed_with_errors",
        columnMapping,
      })
      .returning();
    const [row] = await db
      .insert(importBatchRows)
      .values({ batchId: batch!.id, rowNumber: 1, rawData: {}, status: "failed", errorMessage: "Customer tidak ditemukan" })
      .returning();

    const missingRes = await testApp.handle(
      new Request(`http://localhost/sales-quotation/import/${batch!.id}/rows/${row!.id}`, {
        method: "PUT",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ rawData: { "Customer Number": "", Date: "05/09/2026", "Trans Number": "SQ-001", "Item Number": "BRG-1", "Item price": "1000", "Item Quantity": "1", "Item Unit Name": "Unit", "Branch Name": "JAKARTA" } }),
      }),
    );
    expect(missingRes.status).toBe(400);
    const missingBody = (await missingRes.json()) as { code: string; fields: string[] };
    expect(missingBody.code).toBe("MISSING_REQUIRED_VALUES");
    expect(missingBody.fields).toContain("customerNo");

    const okRes = await testApp.handle(
      new Request(`http://localhost/sales-quotation/import/${batch!.id}/rows/${row!.id}`, {
        method: "PUT",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ rawData: { "Customer Number": "C.0001", Date: "05/09/2026", "Trans Number": "SQ-001", "Item Number": "BRG-1", "Item price": "1000", "Item Quantity": "1", "Item Unit Name": "Unit", "Branch Name": "JAKARTA" } }),
      }),
    );
    expect(okRes.status).toBe(200);
    expect((await okRes.json()) as { rowId: string; status: string }).toEqual({ rowId: row!.id, status: "pending" });

    const [updated] = await db.select().from(importBatchRows).where(eq(importBatchRows.id, row!.id));
    expect(updated!.status).toBe("pending");
    expect(updated!.errorMessage).toBeNull();
  });
});

describe("PUT /sales-quotation/import/:batchId/rows — Edit Bulk (Grid)", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(
      new Request("http://localhost/sales-quotation/import/00000000-0000-0000-0000-000000000000/rows", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: [] }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("404 kalau batch milik user LAIN", async () => {
    const owner = await createProvisionedUser(`sq-bulkedit-owner-${runId}@test.local`);
    const attacker = await createProvisionedUser(`sq-bulkedit-attacker-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "sales_quotation",
        fileName: "test.xlsx",
        totalRows: 1,
        status: "completed_with_errors",
        columnMapping,
      })
      .returning();

    const res = await testApp.handle(
      new Request(`http://localhost/sales-quotation/import/${batch!.id}/rows`, {
        method: "PUT",
        headers: { cookie: attacker.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ rows: [] }),
      }),
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as { code: string }).code).toBe("BATCH_NOT_FOUND");
  });

  test("campuran baris valid & field wajib kosong, bukan gagalkan seluruh request", async () => {
    const owner = await createProvisionedUser(`sq-bulkedit-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "sales_quotation",
        fileName: "test.xlsx",
        totalRows: 2,
        status: "completed_with_errors",
        columnMapping,
      })
      .returning();
    const [validRow, missingRow] = await db
      .insert(importBatchRows)
      .values([
        { batchId: batch!.id, rowNumber: 1, rawData: {}, status: "failed", errorMessage: "Customer tidak ditemukan" },
        { batchId: batch!.id, rowNumber: 2, rawData: {}, status: "failed", errorMessage: "Customer tidak ditemukan" },
      ])
      .returning();

    const validRawData = { "Customer Number": "C.0001", Date: "05/09/2026", "Trans Number": "SQ-001", "Item Number": "BRG-1", "Item price": "1000", "Item Quantity": "1", "Item Unit Name": "Unit", "Branch Name": "JAKARTA" };
    const missingRawData = { ...validRawData, "Trans Number": "SQ-002", "Customer Number": "" };

    const res = await testApp.handle(
      new Request(`http://localhost/sales-quotation/import/${batch!.id}/rows`, {
        method: "PUT",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: [
            { id: validRow!.id, rawData: validRawData },
            { id: missingRow!.id, rawData: missingRawData },
          ],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { updated: string[]; errors: { rowId: string; rowNumber: number; fields: string[] }[] };
    expect(body.updated).toEqual([validRow!.id]);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0]!.fields).toContain("customerNo");

    const [updatedValid] = await db.select().from(importBatchRows).where(eq(importBatchRows.id, validRow!.id));
    expect(updatedValid!.status).toBe("pending");
  });
});

describe("DELETE /sales-quotation/import/:batchId — hapus riwayat lokal", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(
      new Request("http://localhost/sales-quotation/import/00000000-0000-0000-0000-000000000000", { method: "DELETE" }),
    );
    expect(res.status).toBe(401);
  });

  test("404 kalau batch milik user LAIN", async () => {
    const owner = await createProvisionedUser(`sq-delete-owner-${runId}@test.local`);
    const attacker = await createProvisionedUser(`sq-delete-attacker-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "sales_quotation", fileName: "test.xlsx", totalRows: 1, status: "completed" })
      .returning();

    const res = await testApp.handle(
      new Request(`http://localhost/sales-quotation/import/${batch!.id}`, { method: "DELETE", headers: { cookie: attacker.cookie } }),
    );
    expect(res.status).toBe(404);
  });

  test("403 DELETE_OWNER_ONLY kalau yang hapus MEMBER (bukan pemilik Data Usaha), walau seat-nya aktif di Data Usaha yang sama", async () => {
    const owner = await createProvisionedUser(`sq-delete-memberowner-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "sales_quotation", fileName: "test.xlsx", totalRows: 1, status: "completed" })
      .returning();

    const memberEmail = `sq-delete-member-${runId}@test.local`;
    const memberId = await signUp(memberEmail);
    const [customerRole] = await db.select().from(roles).where(eq(roles.name, "customer"));
    await db.insert(userRoles).values({ userId: memberId, roleId: customerRole!.id }).onConflictDoNothing();
    const memberCookie = await signIn(memberEmail);
    const seatId = await createTestSeat(owner.userId, owner.dataUsahaId);
    await db.update(memberSeats).set({ memberUserId: memberId, status: "active" }).where(eq(memberSeats.id, seatId));

    const res = await testApp.handle(
      new Request(`http://localhost/sales-quotation/import/${batch!.id}`, { method: "DELETE", headers: { cookie: memberCookie } }),
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("DELETE_OWNER_ONLY");

    const [stillThere] = await db.select().from(importBatches).where(eq(importBatches.id, batch!.id));
    expect(stillThere).toBeDefined();
  });

  test("409 BATCH_BUSY kalau status processing", async () => {
    const owner = await createProvisionedUser(`sq-delete-busy-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "sales_quotation", fileName: "test.xlsx", totalRows: 1, status: "processing" })
      .returning();

    const res = await testApp.handle(
      new Request(`http://localhost/sales-quotation/import/${batch!.id}`, { method: "DELETE", headers: { cookie: owner.cookie } }),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("BATCH_BUSY");
  });

  test("berhasil hapus batch + baris (cascade), tercatat di audit log", async () => {
    const owner = await createProvisionedUser(`sq-delete-ok-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "sales_quotation", fileName: "hapus-saya.xlsx", totalRows: 1, status: "completed" })
      .returning();
    await db.insert(importBatchRows).values({ batchId: batch!.id, rowNumber: 1, rawData: {}, status: "success", accurateTransactionId: "123" });

    const res = await testApp.handle(
      new Request(`http://localhost/sales-quotation/import/${batch!.id}`, { method: "DELETE", headers: { cookie: owner.cookie } }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as { batchId: string; deleted: boolean }).toEqual({ batchId: batch!.id, deleted: true });

    const [remaining] = await db.select().from(importBatches).where(eq(importBatches.id, batch!.id));
    expect(remaining).toBeUndefined();
    const remainingRows = await db.select().from(importBatchRows).where(eq(importBatchRows.batchId, batch!.id));
    expect(remainingRows).toHaveLength(0);
  });
});
