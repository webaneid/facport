import { describe, test, expect } from "bun:test";
import { Elysia } from "elysia";
import { eq, and } from "drizzle-orm";
import * as XLSX from "xlsx";
import { auth } from "../lib/auth";
import { db } from "../lib/db";
import {
  user as userTable,
  roles,
  userRoles,
  plans,
  subscriptions,
  importBatches,
  importBatchRows,
  memberSeats,
  autoproduksiFormulas,
  autoproduksiFormulaItems,
} from "../db/schema";
import { autoproduksiFormulaImportRoute } from "./autoproduksi-formula-import.route";
import { createTestDataUsaha, createTestSeat } from "../lib/test-fixtures";

// § architecture-autoproduksi.md — Import Formula, SATU-SATUNYA modul
// import synchronous di Facport (TIDAK ADA panggilan Accurate). Fokus
// test: batch status langsung completed/completed_with_errors (tidak
// pernah "processing"), Formula+Item BENERAN tersimpan di DB, validasi
// grup (tepat 1 BJ), dan retry TIDAK duplikat grup yang sudah sukses.
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(autoproduksiFormulaImportRoute);
const columnMapping = {
  "Nama Resep/Formula": "formulaName",
  Cabang: "branchName",
  Gudang: "warehouseName",
  "Akun Perantara": "adjustmentAccountNo",
  "Tipe Barang": "itemType",
  "Nomor Item": "itemNo",
  "Nama Item": "itemName",
  Jumlah: "quantity",
  "Nama Unit": "itemUnitName",
  "Unit Cost": "unitCost",
};

function buildExcelFile(rows: (string | number)[][], filename = "formula.xlsx"): File {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new File([new Uint8Array(buffer)], filename, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

const HEADER = ["Nama Resep/Formula", "Cabang", "Gudang", "Akun Perantara", "Tipe Barang", "Nomor Item", "Nama Item", "Jumlah", "Nama Unit", "Unit Cost"];
function validFormulaRows(name = "Bolu Kukus SP"): (string | number)[][] {
  return [
    HEADER,
    [name, "JAKARTA", "Utama", "110501", "BB", "100006", "Telur", 0.5, "Kg", ""],
    [name, "JAKARTA", "Utama", "110501", "BB", "100007", "Tepung", 0.2, "Kg", ""],
    [name, "JAKARTA", "Utama", "110501", "BJ", "100005", "Bolu", 1, "Loyang", 17000],
  ];
}

async function signUp(email: string) {
  const res = await testApp.handle(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "TestPassword123!", name: "AutoProduksi Formula Import Test" }),
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
    .values({ name: `AutoProduksi Formula Import Test Plan ${email}`, price: 1000, durationDays: 30, modules: ["autoproduksi_production"], productLine: "autoproduksi" })
    .returning();
  const dataUsahaId = await createTestDataUsaha(userId);
  const [subscription] = await db
    .insert(subscriptions)
    .values({ userId, planId: plan!.id, status: "active", startAt: new Date(), endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), dataUsahaId })
    .returning();
  return { userId, cookie, subscriptionId: subscription!.id, dataUsahaId };
}

async function uploadAndConfirm(cookie: string, rows: (string | number)[][]) {
  const form = new FormData();
  form.append("file", buildExcelFile(rows));
  const uploadRes = await testApp.handle(new Request("http://localhost/autoproduksi/import-formula/upload", { method: "POST", headers: { cookie }, body: form }));
  const { batchId } = (await uploadRes.json()) as { batchId: string };
  const confirmRes = await testApp.handle(
    new Request(`http://localhost/autoproduksi/import-formula/${batchId}/confirm`, {
      method: "POST",
      headers: { cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ columnMapping }),
    }),
  );
  return { batchId, confirmRes };
}

describe("POST /autoproduksi/import-formula/upload + confirm — happy path SYNCHRONOUS", () => {
  test("confirm langsung completed (bukan processing) — Formula+Item BENERAN tersimpan di DB", async () => {
    const { cookie, subscriptionId } = await createProvisionedUser(`ap-formula-happy-${runId}@test.local`);
    const { batchId, confirmRes } = await uploadAndConfirm(cookie, validFormulaRows("Bolu Kukus SP Happy"));

    expect(confirmRes.status).toBe(200);
    expect((await confirmRes.json()) as { status: string }).toMatchObject({ status: "completed" });

    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
    expect(batch!.status).toBe("completed");
    expect(batch!.module).toBe("autoproduksi_formula");

    const [formula] = await db
      .select()
      .from(autoproduksiFormulas)
      .where(and(eq(autoproduksiFormulas.subscriptionId, subscriptionId), eq(autoproduksiFormulas.name, "Bolu Kukus SP Happy")));
    expect(formula).toBeDefined();
    expect(formula!.finishedGoodItemNo).toBe("100005");
    expect(formula!.standardCost).toBe("17000.00"); // numeric(18,2) di DB
    expect(formula!.adjustmentAccountNo).toBe("110501");

    const items = await db.select().from(autoproduksiFormulaItems).where(eq(autoproduksiFormulaItems.formulaId, formula!.id));
    expect(items).toHaveLength(2);

    const rows = await db.select().from(importBatchRows).where(eq(importBatchRows.batchId, batchId));
    expect(rows.every((r) => r.status === "success")).toBe(true);
  });

  test("grup TANPA baris BJ -> baris gagal, batch completed_with_errors, TIDAK ADA Formula tersimpan", async () => {
    const { cookie, subscriptionId } = await createProvisionedUser(`ap-formula-nobj-${runId}@test.local`);
    const rowsNoBj = [HEADER, ["Resep Gagal", "JAKARTA", "Utama", "110501", "BB", "100006", "Telur", 0.5, "Kg", ""]];
    const { batchId, confirmRes } = await uploadAndConfirm(cookie, rowsNoBj);

    expect((await confirmRes.json()) as { status: string }).toMatchObject({ status: "completed_with_errors" });
    const rows = await db.select().from(importBatchRows).where(eq(importBatchRows.batchId, batchId));
    expect(rows[0]!.status).toBe("failed");
    expect(rows[0]!.errorMessage).toMatch(/TEPAT 1 baris Tipe Barang=BJ/);

    const formulas = await db.select().from(autoproduksiFormulas).where(and(eq(autoproduksiFormulas.subscriptionId, subscriptionId), eq(autoproduksiFormulas.name, "Resep Gagal")));
    expect(formulas).toHaveLength(0);
  });

  test("duplikat Nama Resep DIBOLEHKAN — upload 2x nama sama -> 2 Formula terpisah", async () => {
    const { cookie, subscriptionId } = await createProvisionedUser(`ap-formula-dup-${runId}@test.local`);
    await uploadAndConfirm(cookie, validFormulaRows("Resep Kembar"));
    await uploadAndConfirm(cookie, validFormulaRows("Resep Kembar"));

    const formulas = await db.select().from(autoproduksiFormulas).where(and(eq(autoproduksiFormulas.subscriptionId, subscriptionId), eq(autoproduksiFormulas.name, "Resep Kembar")));
    expect(formulas).toHaveLength(2);
  });
});

describe("POST /autoproduksi/import-formula/:batchId/retry — tidak duplikat grup yang sudah sukses", () => {
  test("batch 1 grup sukses + 1 grup gagal -> retry setelah fix HANYA proses grup gagal (jumlah Formula sukses tidak bertambah)", async () => {
    const { cookie, subscriptionId } = await createProvisionedUser(`ap-formula-retry-${runId}@test.local`);
    const mixedRows = [
      HEADER,
      ["Resep OK", "JAKARTA", "Utama", "110501", "BB", "100006", "Telur", 0.5, "Kg", ""],
      ["Resep OK", "JAKARTA", "Utama", "110501", "BJ", "100005", "Bolu", 1, "Loyang", 17000],
      ["Resep Rusak", "JAKARTA", "Utama", "110501", "BB", "100006", "Telur", 0.5, "Kg", ""],
      // § Resep Rusak sengaja TANPA baris BJ -> gagal di confirm pertama.
    ];
    const { batchId, confirmRes } = await uploadAndConfirm(cookie, mixedRows);
    expect((await confirmRes.json()) as { status: string }).toMatchObject({ status: "completed_with_errors" });

    let formulasOk = await db.select().from(autoproduksiFormulas).where(and(eq(autoproduksiFormulas.subscriptionId, subscriptionId), eq(autoproduksiFormulas.name, "Resep OK")));
    expect(formulasOk).toHaveLength(1);

    // § retry TANPA memperbaiki apa pun — "Resep Rusak" MASIH tanpa BJ, tetap gagal; "Resep OK" (sudah success) TIDAK diproses ulang.
    const retryRes = await testApp.handle(new Request(`http://localhost/autoproduksi/import-formula/${batchId}/retry`, { method: "POST", headers: { cookie } }));
    expect(retryRes.status).toBe(200);

    formulasOk = await db.select().from(autoproduksiFormulas).where(and(eq(autoproduksiFormulas.subscriptionId, subscriptionId), eq(autoproduksiFormulas.name, "Resep OK")));
    expect(formulasOk).toHaveLength(1); // TIDAK bertambah jadi 2
  });
});

describe("DELETE /autoproduksi/import-formula/:batchId — ownership", () => {
  test("403 DELETE_OWNER_ONLY kalau yang hapus MEMBER (bukan pemilik Data Usaha), Formula yang sudah dibuat TETAP ADA", async () => {
    const owner = await createProvisionedUser(`ap-formula-delete-memberowner-${runId}@test.local`);
    const { batchId } = await uploadAndConfirm(owner.cookie, validFormulaRows("Resep Delete Test"));

    const memberEmail = `ap-formula-delete-member-${runId}@test.local`;
    const memberId = await signUp(memberEmail);
    const [customerRole] = await db.select().from(roles).where(eq(roles.name, "customer"));
    await db.insert(userRoles).values({ userId: memberId, roleId: customerRole!.id }).onConflictDoNothing();
    const memberCookie = await signIn(memberEmail);
    const seatId = await createTestSeat(owner.userId, owner.dataUsahaId);
    await db.update(memberSeats).set({ memberUserId: memberId, status: "active" }).where(eq(memberSeats.id, seatId));

    const res = await testApp.handle(new Request(`http://localhost/autoproduksi/import-formula/${batchId}`, { method: "DELETE", headers: { cookie: memberCookie } }));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code: string }).code).toBe("DELETE_OWNER_ONLY");

    const [stillThere] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
    expect(stillThere).toBeDefined();
    const [formula] = await db
      .select()
      .from(autoproduksiFormulas)
      .where(and(eq(autoproduksiFormulas.subscriptionId, owner.subscriptionId), eq(autoproduksiFormulas.name, "Resep Delete Test")));
    expect(formula).toBeDefined(); // Delete batch TIDAK PERNAH menyentuh Formula yang sudah dibuat
  });
});
