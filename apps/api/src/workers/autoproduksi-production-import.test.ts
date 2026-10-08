import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { allocateFormulaNumber } from "../lib/formula-number";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { user as userTable, dataUsaha, plans, subscriptions, autoproduksiFormulas, autoproduksiFormulaItems, autoproduksiProductionEntries, autoproduksiDefaults } from "../db/schema";
import { createTestDataUsaha } from "../lib/test-fixtures";
import { processAutoproduksiProductionImportRow } from "./index";
import type { AccurateSessionContext } from "../lib/accurate-session";

// § Fase 168 — jalur error resolusi Formula di Import Produksi (Excel):
// semua gagal SEBELUM panggilan Accurate, jadi ctx cukup stub kosong.
const runId = Date.now();
const ctx = {} as AccurateSessionContext;
const mapping = { Tanggal: "transDate", "Nama Resep/Formula": "formulaName", Jumlah: "producedQty" };
const row = (name: string) => ({ Tanggal: "2026-10-01", "Nama Resep/Formula": name, Jumlah: 2 });

let userId = "";
let subscriptionId = "";
let dataUsahaId = "";
let planId = "";

async function insertFormula(name: string, isActive: boolean) {
  const formulaNumber = await db.transaction((tx) => allocateFormulaNumber(tx, dataUsahaId));
  const [f] = await db
    .insert(autoproduksiFormulas)
    .values({
      userId,
      dataUsahaId,
      subscriptionId,
      formulaNumber,
      name,
      finishedGoodItemNo: "100011",
      finishedGoodItemUnitName: "Loyang",
      adjustmentAccountNo: "11078",
      isActive,
    })
    .returning();
  await db.insert(autoproduksiFormulaItems).values({ formulaId: f!.id, itemNo: "100012", itemUnitName: "KG", quantity: "1", sortOrder: 0 });
  return f!;
}

beforeAll(async () => {
  userId = `ap-worker-${runId}`;
  await db.insert(userTable).values({ id: userId, name: "AP Worker Test", email: `ap-worker-${runId}@test.local`, emailVerified: true, createdAt: new Date() });
  const [plan] = await db
    .insert(plans)
    .values({ name: `AP Worker Plan ${runId}`, price: 1000, durationDays: 30, modules: ["autoproduksi_production"], productLine: "autoproduksi" })
    .returning();
  planId = plan!.id;
  dataUsahaId = await createTestDataUsaha(userId);
  const [sub] = await db
    .insert(subscriptions)
    .values({ userId, planId, status: "active", startAt: new Date(), endAt: new Date(Date.now() + 86400000), dataUsahaId })
    .returning();
  subscriptionId = sub!.id;
});

afterAll(async () => {
  if (!subscriptionId) return;
  await db.delete(autoproduksiDefaults).where(eq(autoproduksiDefaults.subscriptionId, subscriptionId));
  // Test "duplikat tapi satu non-aktif" lolos sampai Accurate → tersisa entry failed.
  await db.delete(autoproduksiProductionEntries).where(eq(autoproduksiProductionEntries.subscriptionId, subscriptionId));
  await db.delete(autoproduksiFormulas).where(eq(autoproduksiFormulas.subscriptionId, subscriptionId));
  await db.delete(subscriptions).where(eq(subscriptions.id, subscriptionId));
  await db.delete(plans).where(eq(plans.id, planId));
  await db.delete(dataUsaha).where(eq(dataUsaha.userId, userId));
  await db.delete(userTable).where(eq(userTable.id, userId));
});

const run = (name: string) => processAutoproduksiProductionImportRow(ctx, { userId, subscriptionId }, dataUsahaId, row(name), mapping);

describe("processAutoproduksiProductionImportRow — resolusi Formula", () => {
  test("tidak ditemukan → error 'tidak ditemukan'", async () => {
    await expect(run(`Tidak Ada ${runId}`)).rejects.toThrow("tidak ditemukan");
  });

  test("satu-satunya Formula non-aktif → error NON-AKTIF", async () => {
    await insertFormula(`Roti Nonaktif ${runId}`, false);
    await expect(run(`Roti Nonaktif ${runId}`)).rejects.toThrow("NON-AKTIF");
  });

  test("dua Formula aktif bernama sama → error ganda", async () => {
    await insertFormula(`Roti Ganda ${runId}`, true);
    await insertFormula(`Roti Ganda ${runId}`, true);
    await expect(run(`Roti Ganda ${runId}`)).rejects.toThrow("ganda");
  });

  test("Fase 184 — pencocokan nama TIDAK peka huruf besar/kecil; kembar beda huruf dianggap ganda dan pesan menyebut nomor kandidat", async () => {
    const a = await insertFormula(`Kue Huruf ${runId}`, true);
    await expect(run(`kue huruf ${runId}`.toUpperCase())).rejects.not.toThrow("tidak ditemukan"); // lolos resolusi (gagal belakangan di Accurate)
    const b = await insertFormula(`KUE HURUF ${runId}`, true);
    const err = await run(`kue huruf ${runId}`).catch((e: Error) => e);
    expect((err as Error).message).toContain("ganda");
    expect((err as Error).message).toContain(`F-${String(a.formulaNumber).padStart(3, "0")}`);
    expect((err as Error).message).toContain(`F-${String(b.formulaNumber).padStart(3, "0")}`);
  });

  test("duplikat tapi satu non-aktif → tidak lagi dianggap ganda (lolos resolusi)", async () => {
    await insertFormula(`Roti Dup ${runId}`, false);
    await insertFormula(`Roti Dup ${runId}`, true);
    // ctx kosong → gagal DI panggilan Accurate, artinya resolusi Formula sudah lolos.
    const err = await run(`Roti Dup ${runId}`).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain("ganda");
    expect((err as Error).message).not.toContain("NON-AKTIF");
    expect((err as Error).message).not.toContain("tidak ditemukan");
  });

  test("nama Formula di DB berspasi ujung tetap ketemu", async () => {
    await insertFormula(`  Roti Spasi ${runId} `, false);
    await expect(run(`Roti Spasi ${runId}`)).rejects.toThrow("NON-AKTIF");
  });
});

describe("default Cabang/Gudang di Import Produksi (diminta client 2026-10-03)", () => {
  const rowWith = (name: string, extra: Record<string, unknown> = {}) => ({ ...row(name), ...extra });
  const mappingWithBranch = { ...mapping, Cabang: "branchName", "Gudang Barang Jadi": "warehouseName" };

  test("kolom Cabang/Gudang kosong diisi default; yang diisi di Excel menang (terlihat di entry tersimpan)", async () => {
    await db.insert(autoproduksiDefaults).values({ dataUsahaId, subscriptionId, branchName: "KANTOR PUSAT", warehouseName: "Gudang Utama", rawMaterialWarehouseName: "Gudang Bahan" });
    await insertFormula(`Roti Default ${runId}`, true);

    // ctx kosong → gagal DI panggilan Accurate; entry `failed` tetap menyimpan konteks yang sudah ter-resolve.
    await processAutoproduksiProductionImportRow(ctx, { userId, subscriptionId }, dataUsahaId, rowWith(`Roti Default ${runId}`), mappingWithBranch).catch(() => {});
    await processAutoproduksiProductionImportRow(
      ctx,
      { userId, subscriptionId },
      dataUsahaId,
      rowWith(`Roti Default ${runId}`, { Cabang: "SURABAYA" }),
      mappingWithBranch,
    ).catch(() => {});

    const entries = await db.select().from(autoproduksiProductionEntries).where(eq(autoproduksiProductionEntries.subscriptionId, subscriptionId));
    const byBranch = (b: string) => entries.find((e) => e.branchName === b);
    expect(byBranch("KANTOR PUSAT")).toMatchObject({ warehouseName: "Gudang Utama", rawMaterialWarehouseName: "Gudang Bahan" });
    expect(byBranch("SURABAYA")).toMatchObject({ warehouseName: "Gudang Utama" });
  });
});
