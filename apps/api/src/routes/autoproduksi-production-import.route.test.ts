import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import { user as userTable, roles, userRoles, plans, subscriptions, importBatches, importBatchRows, memberSeats } from "../db/schema";
import { autoproduksiProductionImportRoute } from "./autoproduksi-production-import.route";
import { createTestDataUsaha, createTestSeat } from "../lib/test-fixtures";

function buildExcelFile(rows: (string | number)[][], filename = "test.xlsx"): File {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new File([new Uint8Array(buffer)], filename, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

// § "Kirim Dengan Excel" (Fase 160 ditunda, dieksekusi sekarang) — mirror
// pola 24 modul import lain. moduleAccess "autoproduksi_production" (1
// SKU bundel bersama flow manual, § autoproduksi.route.test.ts).
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(autoproduksiProductionImportRoute);
const columnMapping = { Tanggal: "transDate", "Nama Resep/Formula": "formulaName", Jumlah: "producedQty" };

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "AutoProduksi Import Test" }),
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
    .values({ name: `AutoProduksi Import Test Plan ${email}`, price: 1000, durationDays: 30, modules: ["autoproduksi_production"], productLine: "autoproduksi" })
    .returning();
  const dataUsahaId = await createTestDataUsaha(userId);
  const [subscription] = await db
    .insert(subscriptions)
    .values({ userId, planId: plan!.id, status: "active", startAt: new Date(), endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), dataUsahaId })
    .returning();
  return { userId, cookie, subscriptionId: subscription!.id, dataUsahaId };
}

describe("GET /autoproduksi/import-produksi/template", () => {
  test("401 kalau tidak login", async () => {
    const res = await testApp.handle(new Request("http://localhost/autoproduksi/import-produksi/template"));
    expect(res.status).toBe(401);
  });

  test("200, template Excel bisa dihasilkan tanpa error", async () => {
    const { cookie } = await createProvisionedUser(`ap-prod-template-${runId}@test.local`);
    const res = await testApp.handle(new Request("http://localhost/autoproduksi/import-produksi/template", { headers: { cookie } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml");
  });
});

describe("POST /autoproduksi/import-produksi/upload + confirm", () => {
  test("upload lalu confirm dengan mapping lengkap -> 200 status processing", async () => {
    const { cookie } = await createProvisionedUser(`ap-prod-confirm-${runId}@test.local`);
    const file = buildExcelFile([["Tanggal", "Nama Resep/Formula", "Jumlah"], ["2026-07-13", "Bolu", 15]]);
    const form = new FormData();
    form.append("file", file);
    const uploadRes = await testApp.handle(new Request("http://localhost/autoproduksi/import-produksi/upload", { method: "POST", headers: { cookie }, body: form }));
    expect(uploadRes.status).toBe(200);
    const { batchId } = (await uploadRes.json()) as { batchId: string };

    const confirmRes = await testApp.handle(
      new Request(`http://localhost/autoproduksi/import-produksi/${batchId}/confirm`, {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ columnMapping }),
      }),
    );
    expect(confirmRes.status).toBe(200);
    expect((await confirmRes.json()) as { status: string }).toMatchObject({ status: "processing" });

    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
    expect(batch!.module).toBe("autoproduksi_production");
  });

  test("confirm dengan mapping tidak lengkap (Jumlah belum dipetakan) -> 400 MISSING_REQUIRED_FIELDS", async () => {
    const { cookie } = await createProvisionedUser(`ap-prod-missingfield-${runId}@test.local`);
    const file = buildExcelFile([["Tanggal", "Nama Resep/Formula", "Jumlah"], ["2026-07-13", "Bolu", 15]]);
    const form = new FormData();
    form.append("file", file);
    const uploadRes = await testApp.handle(new Request("http://localhost/autoproduksi/import-produksi/upload", { method: "POST", headers: { cookie }, body: form }));
    const { batchId } = (await uploadRes.json()) as { batchId: string };

    const confirmRes = await testApp.handle(
      new Request(`http://localhost/autoproduksi/import-produksi/${batchId}/confirm`, {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ columnMapping: { Tanggal: "transDate", "Nama Resep/Formula": "formulaName" } }),
      }),
    );
    expect(confirmRes.status).toBe(400);
    expect(((await confirmRes.json()) as { code: string; fields: string[] }).fields).toContain("producedQty");
  });
});

describe("DELETE /autoproduksi/import-produksi/:batchId — ownership", () => {
  test("200 pemilik Data Usaha BISA hapus riwayat batch miliknya sendiri", async () => {
    const owner = await createProvisionedUser(`ap-prod-delete-owner-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "autoproduksi_production", fileName: "test.xlsx", totalRows: 1, status: "completed" })
      .returning();

    const res = await testApp.handle(new Request(`http://localhost/autoproduksi/import-produksi/${batch!.id}`, { method: "DELETE", headers: { cookie: owner.cookie } }));
    expect(res.status).toBe(200);
  });

  test("403 DELETE_OWNER_ONLY kalau yang hapus MEMBER (bukan pemilik Data Usaha)", async () => {
    const owner = await createProvisionedUser(`ap-prod-delete-memberowner-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId: owner.userId, subscriptionId: owner.subscriptionId, module: "autoproduksi_production", fileName: "test.xlsx", totalRows: 1, status: "completed" })
      .returning();

    const memberEmail = `ap-prod-delete-member-${runId}@test.local`;
    const memberId = await signUp(memberEmail);
    const [customerRole] = await db.select().from(roles).where(eq(roles.name, "customer"));
    await db.insert(userRoles).values({ userId: memberId, roleId: customerRole!.id }).onConflictDoNothing();
    const memberCookie = await signIn(memberEmail);
    const seatId = await createTestSeat(owner.userId, owner.dataUsahaId);
    await db.update(memberSeats).set({ memberUserId: memberId, status: "active" }).where(eq(memberSeats.id, seatId));

    const res = await testApp.handle(new Request(`http://localhost/autoproduksi/import-produksi/${batch!.id}`, { method: "DELETE", headers: { cookie: memberCookie } }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("DELETE_OWNER_ONLY");

    const [stillThere] = await db.select().from(importBatches).where(eq(importBatches.id, batch!.id));
    expect(stillThere).toBeDefined();
  });
});

describe("PUT /autoproduksi/import-produksi/:batchId/rows/:rowId — edit baris gagal", () => {
  test("tanggal tidak valid -> 400 MISSING_REQUIRED_VALUES berisi transDate", async () => {
    const { userId, subscriptionId, cookie } = await createProvisionedUser(`ap-prod-editrow-${runId}@test.local`);
    const [batch] = await db
      .insert(importBatches)
      .values({ userId, subscriptionId, module: "autoproduksi_production", fileName: "t.xlsx", totalRows: 1, status: "completed_with_errors", columnMapping })
      .returning();
    const [row] = await db
      .insert(importBatchRows)
      .values({ batchId: batch!.id, rowNumber: 1, rawData: { Tanggal: "bad", "Nama Resep/Formula": "Bolu", Jumlah: "15" }, status: "failed" })
      .returning();

    const res = await testApp.handle(
      new Request(`http://localhost/autoproduksi/import-produksi/${batch!.id}/rows/${row!.id}`, {
        method: "PUT",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ rawData: { Tanggal: "masih salah", "Nama Resep/Formula": "Bolu", Jumlah: "15" } }),
      }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { fields: string[] }).fields).toContain("transDate");
  });
});
