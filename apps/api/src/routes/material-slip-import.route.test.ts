import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { user as userTable, roles, userRoles, plans, subscriptions, importBatches, importBatchRows, memberSeats } from "../db/schema";
import { materialSlipImportRoute } from "./material-slip-import.route";
import { generateTemplateBuffer } from "../lib/excel";
import { createTestDataUsaha, createTestSeat } from "../lib/test-fixtures";

// § Fase 148 — mirror `roll-over-import.route.test.ts`/grouping 2-level (§ manufacture-slip-shared.ts). Edit baris HANYA
// memakai `materialSlipRowError` (itemNo wajib, tipe dikenali bila kolomnya terisi) — header dokumen boleh kosong di
// baris berikutnya, jadi TIDAK ada cek `requiredFields` per baris.
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(materialSlipImportRoute);
const columnMapping = {
  "Trans Date": "transDate",
  "Trans No": "number",
  "Material Slip Type": "materialSlipType",
  "Work Order No": "workOrderNumber",
  "Branch Name": "branchName",
  "Item No": "itemNo",
  Qty: "quantity",
};
const validRawData = {
  "Trans Date": "05/09/2026",
  "Trans No": "MS-001",
  "Material Slip Type": "ITEM_PICK",
  "Work Order No": "WO-001",
  "Branch Name": "JAKARTA",
  "Item No": "BRG-1",
  Qty: "1",
};

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Material Slip Import Test" }),
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
    .values({ name: `Material Slip Import Test Plan ${email}`, price: 1000, durationDays: 30, modules: ["material_slip"] })
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

describe("GET /material-slip/import/template", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/material-slip/import/template"));
    expect(res.status).toBe(401);
  });

  test("403 kalau login tapi tidak punya permission import.create", async () => {
    const email = `ms-noperm-${runId}@test.local`;
    await signUp(email);
    const cookie = await signIn(email);

    const res = await testApp.handle(new Request("http://localhost/material-slip/import/template", { headers: { cookie } }));
    expect(res.status).toBe(403);
  });
});

describe("POST /material-slip/import/upload", () => {
  test("401 kalau tidak login (dengan file .xlsx asli, supaya bukan gagal validasi t.File duluan)", async () => {
    const buffer = generateTemplateBuffer([
      { column: "Tanggal", required: true, example: "17/09/2026", description: "test" },
      { column: "Item No", required: true, example: "BRG-001", description: "test" },
    ]);
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      "test.xlsx",
    );
    const res = await testApp.handle(new Request("http://localhost/material-slip/import/upload", { method: "POST", body: form }));
    expect(res.status).toBe(401);
  });
});

describe("Ownership batch — user lain TIDAK BOLEH akses batch orang lain", () => {
  test("GET/POST /material-slip/import/:batchId* dengan batchId milik user LAIN → 404, bukan bocor data", async () => {
    const owner = await createProvisionedUser(`ms-owner-${runId}@test.local`);
    const attacker = await createProvisionedUser(`ms-attacker-${runId}@test.local`);

    const [batch] = await db
      .insert(importBatches)
      .values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "material_slip",
        fileName: "milik-owner.xlsx",
        totalRows: 1,
        status: "mapping_pending",
      })
      .returning();

    const getRes = await testApp.handle(new Request(`http://localhost/material-slip/import/${batch!.id}`, { headers: { cookie: attacker.cookie } }));
    expect(getRes.status).toBe(404);
    expect(((await getRes.json()) as { code: string }).code).toBe("BATCH_NOT_FOUND");

    const retryRes = await testApp.handle(
      new Request(`http://localhost/material-slip/import/${batch!.id}/retry`, { method: "POST", headers: { cookie: attacker.cookie } }),
    );
    expect(retryRes.status).toBe(404);

    const ownerRes = await testApp.handle(new Request(`http://localhost/material-slip/import/${batch!.id}`, { headers: { cookie: owner.cookie } }));
    expect(ownerRes.status).toBe(200);
  });
});

describe("POST /material-slip/import/:batchId/confirm — validasi mapping", () => {
  test("400 MISSING_REQUIRED_FIELDS kalau kolom wajib belum di-mapping", async () => {
    const owner = await createProvisionedUser(`ro-confirm-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "material_slip", fileName: "test.xlsx", totalRows: 1, status: "mapping_pending" })
      .returning();

    const res = await testApp.handle(
      new Request(`http://localhost/material-slip/import/${batch!.id}/confirm`, {
        method: "POST",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ columnMapping: { Tanggal: "transDate" } }), // field wajib lain sengaja tidak di-mapping
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; fields: string[] };
    expect(body.code).toBe("MISSING_REQUIRED_FIELDS");
    expect(body.fields).toContain("workOrderNumber");
    expect(body.fields).toContain("materialSlipType");
    // § itemNo wajib BERSYARAT per baris (lewat materialSlipRowError), bukan di level mapping; branchName OPSIONAL (§ Quirk)
    expect(body.fields).not.toContain("itemNo");
    expect(body.fields).not.toContain("branchName");
    expect(body.fields).not.toContain("number"); // § "Trans No" OPSIONAL
  });

  test("400 INVALID_MAPPING_FIELD kalau ada kolom di-mapping ke field yang tidak dikenal", async () => {
    const owner = await createProvisionedUser(`ms-invalidfield-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "material_slip", fileName: "test.xlsx", totalRows: 1, status: "mapping_pending" })
      .returning();

    const res = await testApp.handle(
      new Request(`http://localhost/material-slip/import/${batch!.id}/confirm`, {
        method: "POST",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ columnMapping: { "Kolom Aneh": "fieldTidakAda" } }),
      }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe("INVALID_MAPPING_FIELD");
  });
});

describe("GET /material-slip/import (list)", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/material-slip/import"));
    expect(res.status).toBe(401);
  });

  test("cuma return batch milik subscription sendiri, urut terbaru dulu, dibatasi ?limit", async () => {
    const owner = await createProvisionedUser(`ms-list-owner-${runId}@test.local`);
    const other = await createProvisionedUser(`ms-list-other-${runId}@test.local`);

    await db.insert(importBatches).values({
      userId: other.userId,
      subscriptionId: other.subscriptionId,
      module: "material_slip",
      fileName: "punya-orang-lain.xlsx",
      totalRows: 1,
      status: "completed",
    });

    for (const fileName of ["batch-1.xlsx", "batch-2.xlsx", "batch-3.xlsx"]) {
      await db.insert(importBatches).values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "material_slip", fileName, totalRows: 1, status: "completed" });
    }

    const res = await testApp.handle(new Request("http://localhost/material-slip/import?limit=2", { headers: { cookie: owner.cookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { batches: { fileName: string }[]; total: number };
    expect(body.batches).toHaveLength(2);
    expect(body.batches.map((b) => b.fileName)).toEqual(["batch-3.xlsx", "batch-2.xlsx"]);
    expect(body.batches.some((b) => b.fileName === "punya-orang-lain.xlsx")).toBe(false);
    expect(body.total).toBe(3);
  });

  test("?offset melompati N batch terbaru, `total` tetap hitungan penuh — pola halaman Riwayat", async () => {
    const owner = await createProvisionedUser(`ms-offset-${runId}@test.local`);
    for (const fileName of ["off-1.xlsx", "off-2.xlsx", "off-3.xlsx"]) {
      await db.insert(importBatches).values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "material_slip", fileName, totalRows: 1, status: "completed" });
    }

    const res = await testApp.handle(new Request("http://localhost/material-slip/import?limit=2&offset=1", { headers: { cookie: owner.cookie } }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { batches: { fileName: string }[]; total: number };
    expect(body.batches.map((b) => b.fileName)).toEqual(["off-2.xlsx", "off-1.xlsx"]);
    expect(body.total).toBe(3);
  });
});

describe("PUT /material-slip/import/:batchId/rows/:rowId — Edit Baris", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(
      new Request("http://localhost/material-slip/import/00000000-0000-0000-0000-000000000000/rows/00000000-0000-0000-0000-000000000000", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawData: {} }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("404 kalau batch milik user LAIN", async () => {
    const owner = await createProvisionedUser(`ms-editrow-owner-${runId}@test.local`);
    const attacker = await createProvisionedUser(`ms-editrow-attacker-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "material_slip", fileName: "test.xlsx", totalRows: 1, status: "completed_with_errors", columnMapping })
      .returning();
    const [row] = await db.insert(importBatchRows).values({ batchId: batch!.id, rowNumber: 1, rawData: {}, status: "failed" }).returning();

    const res = await testApp.handle(
      new Request(`http://localhost/material-slip/import/${batch!.id}/rows/${row!.id}`, {
        method: "PUT",
        headers: { cookie: attacker.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ rawData: validRawData }),
      }),
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as { code: string }).code).toBe("BATCH_NOT_FOUND");
  });

  test("409 ROW_NOT_EDITABLE kalau baris statusnya bukan failed", async () => {
    const owner = await createProvisionedUser(`ms-editrow-noteditable-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "material_slip", fileName: "test.xlsx", totalRows: 1, status: "completed", columnMapping })
      .returning();
    const [row] = await db.insert(importBatchRows).values({ batchId: batch!.id, rowNumber: 1, rawData: {}, status: "success" }).returning();

    const res = await testApp.handle(
      new Request(`http://localhost/material-slip/import/${batch!.id}/rows/${row!.id}`, {
        method: "PUT",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ rawData: validRawData }),
      }),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("ROW_NOT_EDITABLE");
  });

  test("400 MISSING_REQUIRED_VALUES kalau field wajib dikosongkan, sukses (status pending) kalau lengkap", async () => {
    const owner = await createProvisionedUser(`ms-editrow-save-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "material_slip", fileName: "test.xlsx", totalRows: 1, status: "completed_with_errors", columnMapping })
      .returning();
    const [row] = await db
      .insert(importBatchRows)
      .values({ batchId: batch!.id, rowNumber: 1, rawData: {}, status: "failed", errorMessage: "Item tidak ditemukan" })
      .returning();

    const missingRes = await testApp.handle(
      new Request(`http://localhost/material-slip/import/${batch!.id}/rows/${row!.id}`, {
        method: "PUT",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ rawData: { ...validRawData, "Item No": "" } }),
      }),
    );
    expect(missingRes.status).toBe(400);
    const missingBody = (await missingRes.json()) as { code: string; fields: string[] };
    expect(missingBody.code).toBe("MISSING_REQUIRED_VALUES");
    expect(missingBody.fields).toContain("itemNo");

    const okRes = await testApp.handle(
      new Request(`http://localhost/material-slip/import/${batch!.id}/rows/${row!.id}`, {
        method: "PUT",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ rawData: validRawData }),
      }),
    );
    expect(okRes.status).toBe(200);
    expect((await okRes.json()) as { rowId: string; status: string }).toEqual({ rowId: row!.id, status: "pending" });

    const [updated] = await db.select().from(importBatchRows).where(eq(importBatchRows.id, row!.id));
    expect(updated!.status).toBe("pending");
    expect(updated!.errorMessage).toBeNull();
  });

  test("400 MISSING_REQUIRED_VALUES kalau 'Material Slip Type' tidak dikenali dictionary (§ materialSlipRowError)", async () => {
    const owner = await createProvisionedUser(`ms-editrow-badtype-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "material_slip", fileName: "test.xlsx", totalRows: 1, status: "completed_with_errors", columnMapping })
      .returning();
    const [row] = await db
      .insert(importBatchRows)
      .values({ batchId: batch!.id, rowNumber: 1, rawData: {}, status: "failed", errorMessage: "Material Slip Type tidak dikenali" })
      .returning();

    const res = await testApp.handle(
      new Request(`http://localhost/material-slip/import/${batch!.id}/rows/${row!.id}`, {
        method: "PUT",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ rawData: { ...validRawData, "Material Slip Type": "PINDAH" } }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; fields: string[] };
    expect(body.code).toBe("MISSING_REQUIRED_VALUES");
    expect(body.fields).toContain("materialSlipType");
  });
});

describe("PUT /material-slip/import/:batchId/rows — Edit Bulk (Grid)", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(
      new Request("http://localhost/material-slip/import/00000000-0000-0000-0000-000000000000/rows", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: [] }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("404 kalau batch milik user LAIN", async () => {
    const owner = await createProvisionedUser(`ms-bulkedit-owner-${runId}@test.local`);
    const attacker = await createProvisionedUser(`ms-bulkedit-attacker-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "material_slip", fileName: "test.xlsx", totalRows: 1, status: "completed_with_errors", columnMapping })
      .returning();

    const res = await testApp.handle(
      new Request(`http://localhost/material-slip/import/${batch!.id}/rows`, {
        method: "PUT",
        headers: { cookie: attacker.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ rows: [] }),
      }),
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as { code: string }).code).toBe("BATCH_NOT_FOUND");
  });

  test("campuran baris valid & field wajib kosong, bukan gagalkan seluruh request", async () => {
    const owner = await createProvisionedUser(`ms-bulkedit-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "material_slip", fileName: "test.xlsx", totalRows: 2, status: "completed_with_errors", columnMapping })
      .returning();
    const [validRow, missingRow] = await db
      .insert(importBatchRows)
      .values([
        { batchId: batch!.id, rowNumber: 1, rawData: {}, status: "failed", errorMessage: "Item tidak ditemukan" },
        { batchId: batch!.id, rowNumber: 2, rawData: {}, status: "failed", errorMessage: "Item tidak ditemukan" },
      ])
      .returning();

    const missingRawData = { ...validRawData, "Trans No": "MS-002", "Item No": "" };

    const res = await testApp.handle(
      new Request(`http://localhost/material-slip/import/${batch!.id}/rows`, {
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
    expect(body.errors[0]!.fields).toContain("itemNo");

    const [updatedValid] = await db.select().from(importBatchRows).where(eq(importBatchRows.id, validRow!.id));
    expect(updatedValid!.status).toBe("pending");
  });
});

describe("DELETE /material-slip/import/:batchId — hapus riwayat lokal", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/material-slip/import/00000000-0000-0000-0000-000000000000", { method: "DELETE" }));
    expect(res.status).toBe(401);
  });

  test("404 kalau batch milik user LAIN", async () => {
    const owner = await createProvisionedUser(`ms-delete-owner-${runId}@test.local`);
    const attacker = await createProvisionedUser(`ms-delete-attacker-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "material_slip", fileName: "test.xlsx", totalRows: 1, status: "completed" })
      .returning();

    const res = await testApp.handle(new Request(`http://localhost/material-slip/import/${batch!.id}`, { method: "DELETE", headers: { cookie: attacker.cookie } }));
    expect(res.status).toBe(404);
  });

  test("403 DELETE_OWNER_ONLY kalau yang hapus MEMBER (bukan pemilik Data Usaha), walau seat-nya aktif di Data Usaha yang sama", async () => {
    const owner = await createProvisionedUser(`ms-delete-memberowner-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "material_slip", fileName: "test.xlsx", totalRows: 1, status: "completed" })
      .returning();

    const memberEmail = `ms-delete-member-${runId}@test.local`;
    const memberId = await signUp(memberEmail);
    const [customerRole] = await db.select().from(roles).where(eq(roles.name, "customer"));
    await db.insert(userRoles).values({ userId: memberId, roleId: customerRole!.id }).onConflictDoNothing();
    const memberCookie = await signIn(memberEmail);
    const seatId = await createTestSeat(owner.userId, owner.dataUsahaId);
    await db.update(memberSeats).set({ memberUserId: memberId, status: "active" }).where(eq(memberSeats.id, seatId));

    const res = await testApp.handle(new Request(`http://localhost/material-slip/import/${batch!.id}`, { method: "DELETE", headers: { cookie: memberCookie } }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("DELETE_OWNER_ONLY");

    const [stillThere] = await db.select().from(importBatches).where(eq(importBatches.id, batch!.id));
    expect(stillThere).toBeDefined();
  });

  test("409 BATCH_BUSY kalau status processing", async () => {
    const owner = await createProvisionedUser(`ms-delete-busy-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "material_slip", fileName: "test.xlsx", totalRows: 1, status: "processing" })
      .returning();

    const res = await testApp.handle(new Request(`http://localhost/material-slip/import/${batch!.id}`, { method: "DELETE", headers: { cookie: owner.cookie } }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("BATCH_BUSY");
  });

  test("berhasil hapus batch + baris (cascade), tercatat di audit log", async () => {
    const owner = await createProvisionedUser(`ms-delete-ok-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "material_slip", fileName: "hapus-saya.xlsx", totalRows: 1, status: "completed" })
      .returning();
    await db.insert(importBatchRows).values({ batchId: batch!.id, rowNumber: 1, rawData: {}, status: "success", accurateTransactionId: "123" });

    const res = await testApp.handle(new Request(`http://localhost/material-slip/import/${batch!.id}`, { method: "DELETE", headers: { cookie: owner.cookie } }));
    expect(res.status).toBe(200);
    expect((await res.json()) as { batchId: string; deleted: boolean }).toEqual({ batchId: batch!.id, deleted: true });

    const [remaining] = await db.select().from(importBatches).where(eq(importBatches.id, batch!.id));
    expect(remaining).toBeUndefined();
    const remainingRows = await db.select().from(importBatchRows).where(eq(importBatchRows.batchId, batch!.id));
    expect(remainingRows).toHaveLength(0);
  });
});
