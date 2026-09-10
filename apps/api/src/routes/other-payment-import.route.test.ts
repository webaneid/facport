import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { user as userTable, roles, userRoles, plans, subscriptions, importBatches, importBatchRows } from "../db/schema";
import { otherPaymentImportRoute } from "./other-payment-import.route";
import { generateTemplateBuffer } from "../lib/excel";

// § pola sama journal-voucher-import.route.test.ts — route ini juga
// gabung permission + moduleAccess (Dua Lapis Gate). TANPA validasi XOR
// (modul ini tidak punya field semacam itu, beda dari Jurnal Umum).
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(otherPaymentImportRoute);

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Other Payment Import Test" }),
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
    .values({ name: `Other Payment Import Test Plan ${email}`, price: 1000, durationDays: 30, modules: ["other_payment"] })
    .returning();
  const [subscription] = await db
    .insert(subscriptions)
    .values({
      userId,
      planId: plan!.id,
      status: "active",
      startAt: new Date(),
      endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })
    .returning();

  return { userId, cookie, subscriptionId: subscription!.id };
}

const fullColumnMapping = {
  "Trans Date": "transDate",
  "Trans No": "transNo",
  "Branch Name": "branchName",
  "Bank No": "bankNo",
  "Payee": "payee",
  "Acc No": "lineAccountNo",
  "Amount": "lineAmount",
  "Expense Name": "lineExpenseName",
};

describe("GET /other-payment/import/template", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/other-payment/import/template"));
    expect(res.status).toBe(401);
  });

  test("403 kalau login tapi tidak punya permission import.create", async () => {
    const email = `op-noperm-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);

    const res = await testApp.handle(new Request("http://localhost/other-payment/import/template", { headers: { cookie } }));
    expect(res.status).toBe(403);
  });
});

describe("POST /other-payment/import/upload", () => {
  test("401 kalau tidak login (dengan file .xlsx asli, supaya bukan gagal validasi t.File duluan)", async () => {
    const buffer = generateTemplateBuffer([
      { column: "Acc No", required: true, example: "6-30100", description: "test" },
      { column: "Amount", required: true, example: "500000", description: "test" },
    ]);
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      "test.xlsx",
    );
    const res = await testApp.handle(new Request("http://localhost/other-payment/import/upload", { method: "POST", body: form }));
    expect(res.status).toBe(401);
  });
});

describe("Ownership batch — user lain TIDAK BOLEH akses batch orang lain", () => {
  test("GET/POST /other-payment/import/:batchId* dengan batchId milik user LAIN → 404, bukan bocor data", async () => {
    const ownerEmail = `op-owner-${runId}@test.local`;
    const attackerEmail = `op-attacker-${runId}@test.local`;
    const owner = await createProvisionedUser(ownerEmail);
    const attacker = await createProvisionedUser(attackerEmail);

    const [batch] = await db
      .insert(importBatches)
      .values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "other_payment",
        fileName: "milik-owner.xlsx",
        totalRows: 1,
        status: "mapping_pending",
      })
      .returning();

    const getRes = await testApp.handle(
      new Request(`http://localhost/other-payment/import/${batch!.id}`, { headers: { cookie: attacker.cookie } }),
    );
    expect(getRes.status).toBe(404);
    expect(((await getRes.json()) as { code: string }).code).toBe("BATCH_NOT_FOUND");

    const retryRes = await testApp.handle(
      new Request(`http://localhost/other-payment/import/${batch!.id}/retry`, { method: "POST", headers: { cookie: attacker.cookie } }),
    );
    expect(retryRes.status).toBe(404);

    const ownerRes = await testApp.handle(
      new Request(`http://localhost/other-payment/import/${batch!.id}`, { headers: { cookie: owner.cookie } }),
    );
    expect(ownerRes.status).toBe(200);
  });
});

describe("POST /other-payment/import/:batchId/confirm — validasi mapping", () => {
  test("400 MISSING_REQUIRED_FIELDS kalau kolom wajib belum di-mapping", async () => {
    const owner = await createProvisionedUser(`op-confirm-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "other_payment",
        fileName: "test.xlsx",
        totalRows: 1,
        status: "mapping_pending",
      })
      .returning();

    const res = await testApp.handle(
      new Request(`http://localhost/other-payment/import/${batch!.id}/confirm`, {
        method: "POST",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ columnMapping: { "Acc No": "lineAccountNo" } }), // field wajib lain sengaja tidak di-mapping
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; fields: string[] };
    expect(body.code).toBe("MISSING_REQUIRED_FIELDS");
    expect(body.fields).toContain("transDate");
    expect(body.fields).toContain("transNo");
    expect(body.fields).toContain("branchName");
    expect(body.fields).toContain("bankNo");
    expect(body.fields).toContain("payee");
    expect(body.fields).toContain("lineAmount");
    expect(body.fields).toContain("lineExpenseName");
  });

  test("400 INVALID_MAPPING_FIELD kalau field tidak dikenal", async () => {
    const owner = await createProvisionedUser(`op-invalidfield-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "other_payment", fileName: "test.xlsx", totalRows: 1, status: "mapping_pending" })
      .returning();

    const res = await testApp.handle(
      new Request(`http://localhost/other-payment/import/${batch!.id}/confirm`, {
        method: "POST",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ columnMapping: { "Kolom Aneh": "fieldTidakDikenal" } }),
      }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("INVALID_MAPPING_FIELD");
  });
});

describe("GET /other-payment/import (list)", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/other-payment/import"));
    expect(res.status).toBe(401);
  });

  test("cuma return batch milik subscription sendiri, urut terbaru dulu", async () => {
    const owner = await createProvisionedUser(`op-list-owner-${runId}@test.local`);
    const other = await createProvisionedUser(`op-list-other-${runId}@test.local`);

    await db.insert(importBatches).values({
      userId: other.userId,
      subscriptionId: other.subscriptionId,
      module: "other_payment",
      fileName: "punya-orang-lain.xlsx",
      totalRows: 1,
      status: "completed",
    });

    for (const fileName of ["batch-1.xlsx", "batch-2.xlsx"]) {
      await db.insert(importBatches).values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "other_payment",
        fileName,
        totalRows: 1,
        status: "completed",
      });
    }

    const res = await testApp.handle(new Request("http://localhost/other-payment/import?limit=10", { headers: { cookie: owner.cookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { batches: { fileName: string }[]; total: number };
    expect(body.batches.map((b) => b.fileName)).toEqual(["batch-2.xlsx", "batch-1.xlsx"]);
    expect(body.batches.some((b) => b.fileName === "punya-orang-lain.xlsx")).toBe(false);
    expect(body.total).toBe(2);
  });
});

describe("PUT /other-payment/import/:batchId/rows/:rowId — Edit Baris", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(
      new Request(
        "http://localhost/other-payment/import/00000000-0000-0000-0000-000000000000/rows/00000000-0000-0000-0000-000000000000",
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rawData: {} }) },
      ),
    );
    expect(res.status).toBe(401);
  });

  test("404 kalau batch milik user LAIN", async () => {
    const owner = await createProvisionedUser(`op-editrow-owner-${runId}@test.local`);
    const attacker = await createProvisionedUser(`op-editrow-attacker-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "other_payment",
        fileName: "test.xlsx",
        totalRows: 1,
        status: "completed_with_errors",
        columnMapping: fullColumnMapping,
      })
      .returning();
    const [row] = await db.insert(importBatchRows).values({ batchId: batch!.id, rowNumber: 1, rawData: {}, status: "failed" }).returning();

    const res = await testApp.handle(
      new Request(`http://localhost/other-payment/import/${batch!.id}/rows/${row!.id}`, {
        method: "PUT",
        headers: { cookie: attacker.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ rawData: { "Acc No": "6-30100" } }),
      }),
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as { code: string }).code).toBe("BATCH_NOT_FOUND");
  });

  test("409 ROW_NOT_EDITABLE kalau baris statusnya bukan failed", async () => {
    const owner = await createProvisionedUser(`op-editrow-noteditable-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "other_payment",
        fileName: "test.xlsx",
        totalRows: 1,
        status: "completed",
        columnMapping: fullColumnMapping,
      })
      .returning();
    const [row] = await db.insert(importBatchRows).values({ batchId: batch!.id, rowNumber: 1, rawData: {}, status: "success" }).returning();

    const res = await testApp.handle(
      new Request(`http://localhost/other-payment/import/${batch!.id}/rows/${row!.id}`, {
        method: "PUT",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ rawData: { "Acc No": "6-30100" } }),
      }),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("ROW_NOT_EDITABLE");
  });

  test("400 MISSING_REQUIRED_VALUES kalau field wajib dikosongkan, sukses (status pending) kalau lengkap", async () => {
    const owner = await createProvisionedUser(`op-editrow-save-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "other_payment",
        fileName: "test.xlsx",
        totalRows: 1,
        status: "completed_with_errors",
        columnMapping: fullColumnMapping,
      })
      .returning();
    const [row] = await db
      .insert(importBatchRows)
      .values({ batchId: batch!.id, rowNumber: 1, rawData: {}, status: "failed", errorMessage: "Akun tidak ditemukan" })
      .returning();

    const missingRes = await testApp.handle(
      new Request(`http://localhost/other-payment/import/${batch!.id}/rows/${row!.id}`, {
        method: "PUT",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ rawData: { "Trans Date": "10/09/2026", "Trans No": "OP-001", "Branch Name": "JAKARTA", "Bank No": "1-10200", "Payee": "PLN", "Acc No": "6-30100", "Amount": "500000", "Expense Name": "" } }),
      }),
    );
    expect(missingRes.status).toBe(400);
    const missingBody = (await missingRes.json()) as { code: string; fields: string[] };
    expect(missingBody.code).toBe("MISSING_REQUIRED_VALUES");
    expect(missingBody.fields).toContain("lineExpenseName");

    const okRes = await testApp.handle(
      new Request(`http://localhost/other-payment/import/${batch!.id}/rows/${row!.id}`, {
        method: "PUT",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ rawData: { "Trans Date": "10/09/2026", "Trans No": "OP-001", "Branch Name": "JAKARTA", "Bank No": "1-10200", "Payee": "PLN", "Acc No": "6-30100", "Amount": "500000", "Expense Name": "Listrik" } }),
      }),
    );
    expect(okRes.status).toBe(200);
    expect((await okRes.json()) as { rowId: string; status: string }).toEqual({ rowId: row!.id, status: "pending" });

    const [updated] = await db.select().from(importBatchRows).where(eq(importBatchRows.id, row!.id));
    expect(updated!.status).toBe("pending");
    expect(updated!.errorMessage).toBeNull();
  });
});

describe("PUT /other-payment/import/:batchId/rows — Edit Bulk (Grid)", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(
      new Request("http://localhost/other-payment/import/00000000-0000-0000-0000-000000000000/rows", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: [] }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("404 kalau batch milik user LAIN", async () => {
    const owner = await createProvisionedUser(`op-bulkedit-owner-${runId}@test.local`);
    const attacker = await createProvisionedUser(`op-bulkedit-attacker-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "other_payment", fileName: "test.xlsx", totalRows: 1, status: "completed_with_errors", columnMapping: fullColumnMapping })
      .returning();

    const res = await testApp.handle(
      new Request(`http://localhost/other-payment/import/${batch!.id}/rows`, {
        method: "PUT",
        headers: { cookie: attacker.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ rows: [] }),
      }),
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as { code: string }).code).toBe("BATCH_NOT_FOUND");
  });

  test("campuran baris valid & field wajib kosong, bukan gagalkan seluruh request", async () => {
    const owner = await createProvisionedUser(`op-bulkedit-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "other_payment", fileName: "test.xlsx", totalRows: 2, status: "completed_with_errors", columnMapping: fullColumnMapping })
      .returning();
    const [validRow, missingRow] = await db
      .insert(importBatchRows)
      .values([
        { batchId: batch!.id, rowNumber: 1, rawData: {}, status: "failed", errorMessage: "Akun tidak ditemukan" },
        { batchId: batch!.id, rowNumber: 2, rawData: {}, status: "failed", errorMessage: "Akun tidak ditemukan" },
      ])
      .returning();

    const res = await testApp.handle(
      new Request(`http://localhost/other-payment/import/${batch!.id}/rows`, {
        method: "PUT",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: [
            { id: validRow!.id, rawData: { "Trans Date": "10/09/2026", "Trans No": "OP-001", "Branch Name": "JAKARTA", "Bank No": "1-10200", "Payee": "PLN", "Acc No": "6-30100", "Amount": "500000", "Expense Name": "Listrik" } },
            { id: missingRow!.id, rawData: { "Trans Date": "10/09/2026", "Trans No": "OP-002", "Branch Name": "", "Bank No": "1-10200", "Payee": "PLN", "Acc No": "6-30100", "Amount": "500000", "Expense Name": "Listrik" } },
          ],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { updated: string[]; errors: { rowId: string; rowNumber: number; fields: string[] }[] };
    expect(body.updated).toEqual([validRow!.id]);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0]!.fields).toContain("branchName");
  });
});

describe("DELETE /other-payment/import/:batchId — hapus riwayat lokal", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/other-payment/import/00000000-0000-0000-0000-000000000000", { method: "DELETE" }));
    expect(res.status).toBe(401);
  });

  test("404 kalau batch milik user LAIN", async () => {
    const owner = await createProvisionedUser(`op-delete-owner-${runId}@test.local`);
    const attacker = await createProvisionedUser(`op-delete-attacker-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "other_payment", fileName: "test.xlsx", totalRows: 1, status: "completed" })
      .returning();

    const res = await testApp.handle(new Request(`http://localhost/other-payment/import/${batch!.id}`, { method: "DELETE", headers: { cookie: attacker.cookie } }));
    expect(res.status).toBe(404);
  });

  test("409 BATCH_BUSY kalau status processing", async () => {
    const owner = await createProvisionedUser(`op-delete-busy-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "other_payment", fileName: "test.xlsx", totalRows: 1, status: "processing" })
      .returning();

    const res = await testApp.handle(new Request(`http://localhost/other-payment/import/${batch!.id}`, { method: "DELETE", headers: { cookie: owner.cookie } }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("BATCH_BUSY");
  });

  test("berhasil hapus batch + baris (cascade), tercatat di audit log", async () => {
    const owner = await createProvisionedUser(`op-delete-ok-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "other_payment", fileName: "hapus-saya.xlsx", totalRows: 1, status: "completed" })
      .returning();
    await db.insert(importBatchRows).values({ batchId: batch!.id, rowNumber: 1, rawData: {}, status: "success", accurateTransactionId: "123" });

    const res = await testApp.handle(new Request(`http://localhost/other-payment/import/${batch!.id}`, { method: "DELETE", headers: { cookie: owner.cookie } }));
    expect(res.status).toBe(200);
    expect((await res.json()) as { batchId: string; deleted: boolean }).toEqual({ batchId: batch!.id, deleted: true });

    const [remaining] = await db.select().from(importBatches).where(eq(importBatches.id, batch!.id));
    expect(remaining).toBeUndefined();
    const remainingRows = await db.select().from(importBatchRows).where(eq(importBatchRows.batchId, batch!.id));
    expect(remainingRows).toHaveLength(0);
  });
});
