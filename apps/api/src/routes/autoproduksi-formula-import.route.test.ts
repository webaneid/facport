import { describe, test, expect, spyOn } from "bun:test";
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
import { boss } from "../lib/queue";
import { runFormulaImportJob } from "../lib/autoproduksi-formula-import";

// § architecture-autoproduksi.md — Import Formula (TIDAK ADA panggilan Accurate). Fase 186: confirm/retry kini ASINKRON (status "processing" + job); tes menjalankan
// isi job (`runFormulaImportJob`) langsung dan menahan `boss.send` agar tidak masuk antrean DB dev. Fokus: Formula+Item BENERAN tersimpan, validasi grup (tepat 1 BJ),
// retry TIDAK duplikat grup yang sudah sukses.
const runId = Date.now();
const testApp = new Elysia().mount(auth.handler).use(autoproduksiFormulaImportRoute);
// § Fase 168 (diminta client) — Cabang/Gudang DIHAPUS dari modul ini
// (pindah ke Import Produksi) — fixture diperbarui mengikuti.
const columnMapping = {
  "Nama Resep/Formula": "formulaName",
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

const HEADER = ["Nama Resep/Formula", "Akun Perantara", "Tipe Barang", "Nomor Item", "Nama Item", "Jumlah", "Nama Unit", "Unit Cost"];
function validFormulaRows(name = "Bolu Kukus SP"): (string | number)[][] {
  return [
    HEADER,
    [name, "110501", "BB", "100006", "Telur", 0.5, "Kg", ""],
    [name, "110501", "BB", "100007", "Tepung", 0.2, "Kg", ""],
    [name, "110501", "BJ", "100005", "Bolu", 1, "Loyang", 17000],
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
  const spy = spyOn(boss, "send").mockImplementation((async () => "job-id") as never);
  try {
    const confirmRes = await testApp.handle(
      new Request(`http://localhost/autoproduksi/import-formula/${batchId}/confirm`, {
        method: "POST",
        headers: { cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ columnMapping }),
      }),
    );
    const confirmBody = (await confirmRes.clone().json()) as { status?: string };
    const sent = spy.mock.calls.length;
    await runFormulaImportJob(batchId);
    const [batch] = await db.select().from(importBatches).where(eq(importBatches.id, batchId));
    return { batchId, confirmRes, confirmBody, sent, finalStatus: batch!.status };
  } finally {
    spy.mockRestore();
  }
}

describe("POST /autoproduksi/import-formula/upload + confirm — asinkron (Fase 186)", () => {
  test("confirm langsung 'processing' + 1 job di-enqueue; setelah job jalan: completed — Formula+Item BENERAN tersimpan di DB", async () => {
    const { cookie, subscriptionId } = await createProvisionedUser(`ap-formula-happy-${runId}@test.local`);
    const { batchId, confirmRes, confirmBody, sent, finalStatus } = await uploadAndConfirm(cookie, validFormulaRows("Bolu Kukus SP Happy"));

    expect(confirmRes.status).toBe(200);
    expect(confirmBody.status).toBe("processing");
    expect(sent).toBe(1);
    expect(finalStatus).toBe("completed");

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
    const rowsNoBj = [HEADER, ["Resep Gagal", "110501", "BB", "100006", "Telur", 0.5, "Kg", ""]];
    const { batchId, finalStatus } = await uploadAndConfirm(cookie, rowsNoBj);

    expect(finalStatus).toBe("completed_with_errors");
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
      ["Resep OK", "110501", "BB", "100006", "Telur", 0.5, "Kg", ""],
      ["Resep OK", "110501", "BJ", "100005", "Bolu", 1, "Loyang", 17000],
      ["Resep Rusak", "110501", "BB", "100006", "Telur", 0.5, "Kg", ""],
      // § Resep Rusak sengaja TANPA baris BJ -> gagal di confirm pertama.
    ];
    const { batchId, finalStatus } = await uploadAndConfirm(cookie, mixedRows);
    expect(finalStatus).toBe("completed_with_errors");

    let formulasOk = await db.select().from(autoproduksiFormulas).where(and(eq(autoproduksiFormulas.subscriptionId, subscriptionId), eq(autoproduksiFormulas.name, "Resep OK")));
    expect(formulasOk).toHaveLength(1);

    // § retry TANPA memperbaiki apa pun — "Resep Rusak" MASIH tanpa BJ, tetap gagal; "Resep OK" (sudah success) TIDAK diproses ulang.
    const spy = spyOn(boss, "send").mockImplementation((async () => "job-id") as never);
    try {
      const retryRes = await testApp.handle(new Request(`http://localhost/autoproduksi/import-formula/${batchId}/retry`, { method: "POST", headers: { cookie } }));
      expect(retryRes.status).toBe(200);
      expect(((await retryRes.json()) as { status: string }).status).toBe("processing");
      expect(spy.mock.calls.length).toBe(1);
      // saat 'processing', retry kedua ditolak dan batch tidak bisa dihapus
      expect((await testApp.handle(new Request(`http://localhost/autoproduksi/import-formula/${batchId}/retry`, { method: "POST", headers: { cookie } }))).status).toBe(409);
      expect((await testApp.handle(new Request(`http://localhost/autoproduksi/import-formula/${batchId}`, { method: "DELETE", headers: { cookie } }))).status).toBe(409);
    } finally {
      spy.mockRestore();
    }
    await runFormulaImportJob(batchId);

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

// § Fase 186 — job berjalan idempoten: dijalankan DUA KALI tidak membuat Formula ganda (baris sukses tidak diproses ulang), dan nomor Formula terus berurutan.
describe("runFormulaImportJob — idempoten & nomor Formula", () => {
  test("job dijalankan ulang tidak menggandakan Formula; dua batch menghasilkan nomor F-001.. berurutan tanpa celah", async () => {
    const { cookie, subscriptionId } = await createProvisionedUser(`ap-formula-job-${runId}@test.local`);
    const first = await uploadAndConfirm(cookie, validFormulaRows("Job A"));
    await runFormulaImportJob(first.batchId);
    await uploadAndConfirm(cookie, validFormulaRows("Job B"));
    const formulas = await db.select().from(autoproduksiFormulas).where(eq(autoproduksiFormulas.subscriptionId, subscriptionId));
    expect(formulas).toHaveLength(2);
    expect(formulas.map((f) => f.formulaNumber).sort()).toEqual([1, 2]);
  });

  test("batch yang sudah dihapus sebelum job jalan → job selesai diam-diam (tanpa galat)", async () => {
    await expect(runFormulaImportJob(crypto.randomUUID())).resolves.toBeUndefined();
  });
});

