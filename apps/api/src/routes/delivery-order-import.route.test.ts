import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { user as userTable, roles, userRoles, plans, subscriptions, importBatches, importBatchRows, memberSeats } from "../db/schema";
import { deliveryOrderImportRoute } from "./delivery-order-import.route";
import { createTestDataUsaha, createTestSeat } from "../lib/test-fixtures";

// § kasus nyata reza.eka17@gmail.com (2026-09-30, § docs/lessons-learned.md) —
// "CLS5" (dataClassification5Name, dipakai client sebagai label "Week N" untuk
// membedakan Item No duplikat dalam 1 Sales Order) tidak dicocokkan saat
// upload, baris gagal minta "isi kolom CLS5" tapi form edit baris TIDAK PUNYA
// input untuk kolom itu (dulu cuma render `Object.keys(columnMapping)`) — jadi
// tidak bisa diperbaiki tanpa upload ulang. Fokus test ini: endpoint
// `PUT .../rows/:rowId` sekarang bisa MENAMBAH cocokkan kolom lewat
// `columnMappingPatch`, bukan cuma edit nilai kolom yang sudah dicocokkan.
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(deliveryOrderImportRoute);

// § columnMapping SENGAJA TIDAK menyertakan "CLS2"/"CLS5" — mirror persis
// kondisi batch nyata reza (kolom itu ada isinya di raw_data tapi kelewat
// dicocokkan saat upload).
const columnMapping = {
  "Trans Date": "transDate",
  "Cust No": "customerNo",
  "Item No": "itemNo",
  "Item Qty": "quantity",
  "Item Unit Name": "itemUnitName",
};

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "Delivery Order Import Test" }),
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
    .values({ name: `Delivery Order Import Test Plan ${email}`, price: 1000, durationDays: 30, modules: ["delivery_order"] })
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

describe("PUT /delivery-order/import/:batchId/rows/:rowId — Edit Baris", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(
      new Request(
        "http://localhost/delivery-order/import/00000000-0000-0000-0000-000000000000/rows/00000000-0000-0000-0000-000000000000",
        { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rawData: {} }) },
      ),
    );
    expect(res.status).toBe(401);
  });

  test("404 kalau batch milik user LAIN", async () => {
    const owner = await createProvisionedUser(`do-editrow-owner-${runId}@test.local`);
    const attacker = await createProvisionedUser(`do-editrow-attacker-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "delivery_order",
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
      new Request(`http://localhost/delivery-order/import/${batch!.id}/rows/${row!.id}`, {
        method: "PUT",
        headers: { cookie: attacker.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ rawData: { "Cust No": "C.0001" } }),
      }),
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as { code: string }).code).toBe("BATCH_NOT_FOUND");
  });

  test("409 ROW_NOT_EDITABLE kalau baris statusnya bukan failed", async () => {
    const owner = await createProvisionedUser(`do-editrow-noteditable-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "delivery_order",
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
      new Request(`http://localhost/delivery-order/import/${batch!.id}/rows/${row!.id}`, {
        method: "PUT",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ rawData: { "Cust No": "C.0001" } }),
      }),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("ROW_NOT_EDITABLE");
  });

  test("400 MISSING_REQUIRED_VALUES kalau field wajib dikosongkan, sukses (status pending) kalau lengkap", async () => {
    const owner = await createProvisionedUser(`do-editrow-save-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "delivery_order",
        fileName: "test.xlsx",
        totalRows: 1,
        status: "completed_with_errors",
        columnMapping,
      })
      .returning();
    const [row] = await db
      .insert(importBatchRows)
      .values({ batchId: batch!.id, rowNumber: 1, rawData: {}, status: "failed", errorMessage: "Pelanggan harus diisi" })
      .returning();

    const missingRes = await testApp.handle(
      new Request(`http://localhost/delivery-order/import/${batch!.id}/rows/${row!.id}`, {
        method: "PUT",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          rawData: { "Trans Date": "05/09/2026", "Cust No": "", "Item No": "BRG-1", "Item Qty": "1", "Item Unit Name": "PCS" },
        }),
      }),
    );
    expect(missingRes.status).toBe(400);
    const missingBody = (await missingRes.json()) as { code: string; fields: string[] };
    expect(missingBody.code).toBe("MISSING_REQUIRED_VALUES");
    expect(missingBody.fields).toContain("customerNo");

    const okRes = await testApp.handle(
      new Request(`http://localhost/delivery-order/import/${batch!.id}/rows/${row!.id}`, {
        method: "PUT",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          rawData: { "Trans Date": "05/09/2026", "Cust No": "C.0001", "Item No": "BRG-1", "Item Qty": "1", "Item Unit Name": "PCS" },
        }),
      }),
    );
    expect(okRes.status).toBe(200);
    const okBody = (await okRes.json()) as { rowId: string; status: string };
    expect(okBody.rowId).toBe(row!.id);
    expect(okBody.status).toBe("pending");

    const [updated] = await db.select().from(importBatchRows).where(eq(importBatchRows.id, row!.id));
    expect(updated!.status).toBe("pending");
    expect(updated!.errorMessage).toBeNull();
  });

  test("400 INVALID_MAPPING_FIELD kalau columnMappingPatch nunjuk field yang tidak dikenal", async () => {
    const owner = await createProvisionedUser(`do-editrow-invalidpatch-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "delivery_order",
        fileName: "test.xlsx",
        totalRows: 1,
        status: "completed_with_errors",
        columnMapping,
      })
      .returning();
    const [row] = await db
      .insert(importBatchRows)
      .values({
        batchId: batch!.id,
        rowNumber: 1,
        rawData: { "Trans Date": "05/09/2026", "Cust No": "C.0001", "Item No": "BRG-1", "Item Qty": "1", "Item Unit Name": "PCS", CLS5: "Week1" },
        status: "failed",
        errorMessage: "test",
      })
      .returning();

    const res = await testApp.handle(
      new Request(`http://localhost/delivery-order/import/${batch!.id}/rows/${row!.id}`, {
        method: "PUT",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          rawData: { "Trans Date": "05/09/2026", "Cust No": "C.0001", "Item No": "BRG-1", "Item Qty": "1", "Item Unit Name": "PCS", CLS5: "Week1" },
          columnMappingPatch: { CLS5: "bukanFieldValid" },
        }),
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string; fields: string[] };
    expect(body.code).toBe("INVALID_MAPPING_FIELD");
    expect(body.fields).toContain("bukanFieldValid");

    // § batch.columnMapping TIDAK BOLEH ikut berubah kalau validasi gagal (fail-closed, bukan partial write).
    const [batchAfter] = await db.select().from(importBatches).where(eq(importBatches.id, batch!.id));
    expect(batchAfter!.columnMapping).toEqual(columnMapping);
  });

  test("columnMappingPatch MENAMBAH cocokkan kolom yang kelewat (kasus reza.eka17@gmail.com — CLS5) dan tersimpan ke batch, bukan cuma baris ini", async () => {
    const owner = await createProvisionedUser(`do-editrow-cls5-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({
        userId: owner.userId,
        subscriptionId: owner.subscriptionId,
        module: "delivery_order",
        fileName: "template-delivery-order.xlsx",
        totalRows: 2,
        status: "completed_with_errors",
        columnMapping, // § TANPA CLS5 — persis kondisi batch reza sebelum diperbaiki.
      })
      .returning();
    const [row1] = await db
      .insert(importBatchRows)
      .values({
        batchId: batch!.id,
        rowNumber: 1,
        rawData: { "Trans Date": "05/09/2026", "Cust No": "CSBY-0011", "Item No": "9900014", "Item Qty": "10", "Item Unit Name": "PCS", CLS5: "Week1" },
        status: "failed",
        errorMessage: 'Item "9900014" muncul 2× di Sales Order "SO-IDR-01" dengan kode sama — isi kolom CLS5 (Week) untuk membedakan baris mana yang dimaksud.',
      })
      .returning();
    // § baris ke-2, SIBLING dalam batch yang sama, BELUM diedit sama sekali — dipakai buktikan
    // patch mapping-nya BATCH-WIDE (bukan cuma nempel ke row1 yang sedang diedit).
    const [row2] = await db
      .insert(importBatchRows)
      .values({
        batchId: batch!.id,
        rowNumber: 2,
        rawData: { "Trans Date": "05/09/2026", "Cust No": "CSBY-0011", "Item No": "9900014", "Item Qty": "1", "Item Unit Name": "PCS", CLS5: "Week2" },
        status: "failed",
        errorMessage: 'Item "9900014" muncul 2× di Sales Order "SO-IDR-01" dengan kode sama — isi kolom CLS5 (Week) untuk membedakan baris mana yang dimaksud.',
      })
      .returning();

    const res = await testApp.handle(
      new Request(`http://localhost/delivery-order/import/${batch!.id}/rows/${row1!.id}`, {
        method: "PUT",
        headers: { cookie: owner.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          rawData: { "Trans Date": "05/09/2026", "Cust No": "CSBY-0011", "Item No": "9900014", "Item Qty": "10", "Item Unit Name": "PCS", CLS5: "Week1" },
          columnMappingPatch: { CLS5: "attribut5" },
        }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rowId: string; status: string; columnMapping: Record<string, string> };
    expect(body.status).toBe("pending");
    expect(body.columnMapping.CLS5).toBe("attribut5");

    // § batch.columnMapping BENAR-BENAR tersimpan dengan CLS5 baru, milik BATCH bukan row.
    const [batchAfter] = await db.select().from(importBatches).where(eq(importBatches.id, batch!.id));
    expect((batchAfter!.columnMapping as Record<string, string>).CLS5).toBe("attribut5");
    // § kolom yang sudah ada sebelumnya TIDAK boleh hilang gara-gara patch (merge, bukan replace).
    expect((batchAfter!.columnMapping as Record<string, string>)["Item No"]).toBe("itemNo");

    const [row1After] = await db.select().from(importBatchRows).where(eq(importBatchRows.id, row1!.id));
    expect(row1After!.status).toBe("pending");
    expect(row1After!.errorMessage).toBeNull();
    expect((row1After!.rawData as Record<string, unknown>).CLS5).toBe("Week1");

    // § row2 belum disentuh (masih "failed"), tapi begitu retry (di luar scope test ini, jalur worker),
    // sekarang bisa ke-resolve juga karena `columnMapping` batch sudah punya CLS5 — buktikan mapping-nya
    // sudah kebaca dari level BATCH, bukan cuma tertulis di row1.
    const [row2After] = await db.select().from(importBatchRows).where(eq(importBatchRows.id, row2!.id));
    expect(row2After!.status).toBe("failed");
    expect((row2After!.rawData as Record<string, unknown>).CLS5).toBe("Week2");
  });
});

describe("POST /delivery-order/import/:batchId/cancel — ownership (pemilik vs member)", () => {
  test("200 pemilik Data Usaha BISA Batal Import batch miliknya sendiri", async () => {
    const owner = await createProvisionedUser(`do-cancel-owner-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "delivery_order", fileName: "batal-saya.xlsx", totalRows: 1, status: "completed" })
      .returning();

    const res = await testApp.handle(
      new Request(`http://localhost/delivery-order/import/${batch!.id}/cancel`, { method: "POST", headers: { cookie: owner.cookie } }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()) as { batchId: string; status: string }).toEqual({ batchId: batch!.id, status: "cancelling" });
  });

  test("403 CANCEL_OWNER_ONLY kalau yang Batal Import MEMBER (bukan pemilik Data Usaha), walau seat-nya aktif di Data Usaha yang sama", async () => {
    const owner = await createProvisionedUser(`do-cancel-memberowner-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "delivery_order", fileName: "test.xlsx", totalRows: 1, status: "completed" })
      .returning();

    const memberEmail = `do-cancel-member-${runId}@test.local`;
    const memberId = await signUp(memberEmail);
    const [customerRole] = await db.select().from(roles).where(eq(roles.name, "customer"));
    await db.insert(userRoles).values({ userId: memberId, roleId: customerRole!.id }).onConflictDoNothing();
    const memberCookie = await signIn(memberEmail);
    const seatId = await createTestSeat(owner.userId, owner.dataUsahaId);
    await db.update(memberSeats).set({ memberUserId: memberId, status: "active" }).where(eq(memberSeats.id, seatId));

    const res = await testApp.handle(
      new Request(`http://localhost/delivery-order/import/${batch!.id}/cancel`, { method: "POST", headers: { cookie: memberCookie } }),
    );
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("CANCEL_OWNER_ONLY");

    const [stillThere] = await db.select().from(importBatches).where(eq(importBatches.id, batch!.id));
    expect(stillThere!.status).toBe("completed");
  });

  test("409 BATCH_NOT_CANCELLABLE kalau status batch bukan completed/completed_with_errors", async () => {
    const owner = await createProvisionedUser(`do-cancel-notready-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "delivery_order", fileName: "belum-selesai.xlsx", totalRows: 1, status: "processing" })
      .returning();

    const res = await testApp.handle(
      new Request(`http://localhost/delivery-order/import/${batch!.id}/cancel`, { method: "POST", headers: { cookie: owner.cookie } }),
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("BATCH_NOT_CANCELLABLE");
  });
});
