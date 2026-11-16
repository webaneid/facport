import { describe, test, expect } from "bun:test";
import { buildProductionEntryPayload, formatTransDateForAccurate, applyContextDefaults, requiresStandardCost, type ContextDefaults } from "./autoproduksi";
import type { autoproduksiFormulas, autoproduksiFormulaItems, autoproduksiProductionEntries } from "../db/schema";

// § Fase 159 — kasus contoh dari simulasi client (Autoproduksi.xlsx):
// Formula "Bolu Kukus SP" = Telur 0.5kg + Tepung 0.5kg per 1 Loyang Bolu.
// Diverifikasi payload SAMA PERSIS field yang dikonfirmasi client via
// screenshot Accurate asli (adjustmentAccountNo/description/branchName +
// detailItem[] dengan itemAdjustmentType IN/OUT yang benar).
// § Fase 168 — branchName/warehouseName/rawMaterialWarehouseName/projectNo/
// departmentName PINDAH dari Formula/FormulaItem ke ProductionEntry (§
// komentar schema) — test di bawah diperbarui mengikuti sumber field baru.
type Formula = typeof autoproduksiFormulas.$inferSelect;
type FormulaItem = typeof autoproduksiFormulaItems.$inferSelect;
type ProductionEntry = typeof autoproduksiProductionEntries.$inferSelect;

const baseFormula: Formula = {
  id: "formula-1",
  userId: "user-1",
  dataUsahaId: "du-1",
  subscriptionId: "sub-1",
  formulaNumber: 1,
  name: "Bolu Kukus SP (Spesial BGT)",
  finishedGoodItemNo: "100011",
  finishedGoodItemUnitName: "Loyang",
  finishedGoodItemName: null,
  standardCost: "20000",
  adjustmentAccountNo: "11078",
  adjustmentAccountName: null,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const formulaItems: FormulaItem[] = [
  { id: "fi-1", formulaId: "formula-1", itemNo: "100012", itemUnitName: "KG", itemName: null, quantity: "0.5", sortOrder: 0 },
  { id: "fi-2", formulaId: "formula-1", itemNo: "100013", itemUnitName: "KG", itemName: null, quantity: "0.5", sortOrder: 1 },
];

const baseEntry: ProductionEntry = {
  id: "entry-1",
  userId: "user-1",
  dataUsahaId: "du-1",
  subscriptionId: "sub-1",
  formulaId: "formula-1",
  producedQty: "1",
  transDate: "2026-09-28",
  branchName: "JAKARTA",
  warehouseName: null,
  rawMaterialWarehouseName: null,
  projectNo: null,
  departmentName: null,
  status: "pending",
  accurateTransactionId: null,
  accurateTransactionNumber: null,
  errorMessage: null,
  createdAt: new Date(),
};

describe("formatTransDateForAccurate", () => {
  test("YYYY-MM-DD -> DD/MM/YYYY (format Accurate)", () => {
    expect(formatTransDateForAccurate("2026-09-28")).toBe("28/09/2026");
  });

  test("format tidak valid -> throw pesan jelas", () => {
    expect(() => formatTransDateForAccurate("28-09-2026")).toThrow(/Format tanggal tidak valid/);
  });
});

describe("buildProductionEntryPayload — kasus simulasi client (Bolu = Telur + Tepung)", () => {
  test("qty produksi 1 -> bahan baku PERSIS sesuai takaran formula (tidak dikali apa pun)", () => {
    const payload = buildProductionEntryPayload(baseFormula, formulaItems, baseEntry);

    expect(payload.transDate).toBe("28/09/2026");
    expect(payload.adjustmentAccountNo).toBe("11078");
    expect(payload.branchName).toBe("JAKARTA");
    // § Fase 219 — nama produk jadi ditambahkan; fixture ini finishedGoodItemName=null → cadangan nama Formula
    expect(payload.description).toBe("Input Dari AutoProduksi - Bolu Kukus SP (Spesial BGT)");

    const detailItem = payload.detailItem as Record<string, unknown>[];
    expect(detailItem).toHaveLength(3);

    // 2 baris Bahan Baku BERKURANG (ADJUSTMENT_OUT), qty = takaran formula apa adanya (qty produksi = 1)
    expect(detailItem[0]).toMatchObject({ itemNo: "100012", quantity: 0.5, itemAdjustmentType: "ADJUSTMENT_OUT" });
    expect(detailItem[1]).toMatchObject({ itemNo: "100013", quantity: 0.5, itemAdjustmentType: "ADJUSTMENT_OUT" });

    // 1 baris Barang Jadi BERTAMBAH (ADJUSTMENT_IN), qty = qty produksi
    expect(detailItem[2]).toMatchObject({ itemNo: "100011", quantity: 1, itemAdjustmentType: "ADJUSTMENT_IN" });
  });

  // § Fase 219 (evaluasi client 2026-11-16)
  test("Keterangan dokumen memakai nama Barang Jadi bila ada, cadangan nama Formula bila kosong/spasi", () => {
    const withName = buildProductionEntryPayload({ ...baseFormula, finishedGoodItemName: "Bolu Kukus" }, formulaItems, baseEntry);
    expect(withName.description).toBe("Input Dari AutoProduksi - Bolu Kukus");
    const blank = buildProductionEntryPayload({ ...baseFormula, finishedGoodItemName: "   " }, formulaItems, baseEntry);
    expect(blank.description).toBe("Input Dari AutoProduksi - Bolu Kukus SP (Spesial BGT)");
  });

  test("detailNotes: baris Bahan Baku = 'Bahan Baku', baris Barang Jadi = 'Barang Jadi'", () => {
    const detailItem = buildProductionEntryPayload(baseFormula, formulaItems, baseEntry).detailItem as Record<string, unknown>[];
    expect(detailItem[0]!.detailNotes).toBe("Bahan Baku");
    expect(detailItem[1]!.detailNotes).toBe("Bahan Baku");
    expect(detailItem[2]!.detailNotes).toBe("Barang Jadi");
  });

  // § Fase 220 — Formula hanya Barang Jadi
  test("Formula TANPA bahan baku -> detailItem hanya 1 baris ADJUSTMENT_IN lengkap unitCost", () => {
    const detailItem = buildProductionEntryPayload(baseFormula, [], baseEntry).detailItem as Record<string, unknown>[];
    expect(detailItem).toHaveLength(1);
    expect(detailItem[0]).toMatchObject({ itemNo: "100011", itemAdjustmentType: "ADJUSTMENT_IN", detailNotes: "Barang Jadi", unitCost: 20000 });
  });

  test("requiresStandardCost: wajib hanya bila tanpa bahan baku dan harga kosong/0", () => {
    expect(requiresStandardCost(0, null)).toBe(true);
    expect(requiresStandardCost(0, undefined)).toBe(true);
    expect(requiresStandardCost(0, "0.00")).toBe(true);
    expect(requiresStandardCost(0, 15000)).toBe(false);
    expect(requiresStandardCost(0, "15000.00")).toBe(false);
    expect(requiresStandardCost(2, null)).toBe(false);
  });

  test("qty produksi 10 -> kebutuhan bahan baku ikut dikali 10 (inti fitur 'Auto')", () => {
    const entry10 = { ...baseEntry, producedQty: "10" };
    const payload = buildProductionEntryPayload(baseFormula, formulaItems, entry10);
    const detailItem = payload.detailItem as Record<string, unknown>[];

    expect(detailItem[0]).toMatchObject({ itemNo: "100012", quantity: 5, itemAdjustmentType: "ADJUSTMENT_OUT" }); // 0.5 * 10
    expect(detailItem[1]).toMatchObject({ itemNo: "100013", quantity: 5, itemAdjustmentType: "ADJUSTMENT_OUT" }); // 0.5 * 10
    expect(detailItem[2]).toMatchObject({ itemNo: "100011", quantity: 10, itemAdjustmentType: "ADJUSTMENT_IN" });
  });

  test("branchName KOSONG (null) -> field branchName tidak ikut terkirim sama sekali (Accurate pakai default preferensi)", () => {
    const entryNoBranch = { ...baseEntry, branchName: null };
    const payload = buildProductionEntryPayload(baseFormula, formulaItems, entryNoBranch);
    expect("branchName" in payload).toBe(false);
  });

  // § Fase 168 — Gudang Barang Jadi vs Gudang Bahan Baku sekarang 2 field
  // TERPISAH di level entry (konteks per-produksi), bukan lagi per-item
  // Formula — rawMaterialWarehouseName berlaku SERAGAM ke SEMUA baris
  // Bahan Baku, warehouseName khusus baris Barang Jadi.
  test("gudang (Barang Jadi & Bahan Baku) dari entry disertakan ke baris yang sesuai kalau diisi", () => {
    const entryWithWarehouse = { ...baseEntry, warehouseName: "Gudang Jadi", rawMaterialWarehouseName: "Gudang Bahan Baku" };
    const payload = buildProductionEntryPayload(baseFormula, formulaItems, entryWithWarehouse);
    const detailItem = payload.detailItem as Record<string, unknown>[];
    expect(detailItem[0]).toMatchObject({ itemNo: "100012", warehouseName: "Gudang Bahan Baku" });
    expect(detailItem[1]).toMatchObject({ itemNo: "100013", warehouseName: "Gudang Bahan Baku" });
    expect(detailItem[2]).toMatchObject({ itemNo: "100011", warehouseName: "Gudang Jadi" });
  });

  test("gudang KOSONG tidak ikut terkirim sebagai field (bukan string kosong/undefined literal)", () => {
    const payload = buildProductionEntryPayload(baseFormula, formulaItems, baseEntry);
    const detailItem = payload.detailItem as Record<string, unknown>[];
    expect("warehouseName" in detailItem[0]!).toBe(false);
    expect("warehouseName" in detailItem[2]!).toBe(false);
  });

  // § BUG DITEMUKAN & DIPERBAIKI 2026-10-02 (rilis v2.21.0) — standardCost
  // SUDAH ADA di skema sejak Fase 159 tapi SEMPAT TIDAK PERNAH dikirim
  // sebagai unitCost. TIDAK tersentuh oleh perombakan Fase 168 — tetap
  // bersumber dari Formula (resep), bukan konteks produksi.
  test("standardCost formula dikirim sebagai unitCost di baris Barang Jadi (ADJUSTMENT_IN)", () => {
    const payload = buildProductionEntryPayload(baseFormula, formulaItems, baseEntry);
    const detailItem = payload.detailItem as Record<string, unknown>[];
    expect(detailItem[2]).toMatchObject({ itemNo: "100011", unitCost: 20000 });
    // § unitCost TIDAK dikirim di baris Bahan Baku (ADJUSTMENT_OUT) — field ini spesifik utk penambahan kuantitas.
    expect("unitCost" in detailItem[0]!).toBe(false);
  });

  test("standardCost KOSONG (null) -> unitCost tidak ikut terkirim sebagai field", () => {
    const formulaNoCost = { ...baseFormula, standardCost: null };
    const payload = buildProductionEntryPayload(formulaNoCost, formulaItems, baseEntry);
    const detailItem = payload.detailItem as Record<string, unknown>[];
    expect("unitCost" in detailItem[2]!).toBe(false);
  });

  // § Fase 168 — Nomor Project/Departemen sekarang 1 pasang field di level
  // entry, dipakai ULANG sama persis ke Barang Jadi MAUPUN semua baris
  // Bahan Baku (bukan lagi per-baris Formula).
  test("projectNo/departmentName dari entry disertakan ke SEMUA baris (Bahan Baku & Barang Jadi) kalau diisi", () => {
    const entryWithProject = { ...baseEntry, projectNo: "PRJ-1", departmentName: "Produksi" };
    const payload = buildProductionEntryPayload(baseFormula, formulaItems, entryWithProject);
    const detailItem = payload.detailItem as Record<string, unknown>[];
    expect(detailItem[0]).toMatchObject({ projectNo: "PRJ-1", departmentName: "Produksi" });
    expect(detailItem[1]).toMatchObject({ projectNo: "PRJ-1", departmentName: "Produksi" });
    expect(detailItem[2]).toMatchObject({ itemNo: "100011", projectNo: "PRJ-1", departmentName: "Produksi" });
  });

  test("projectNo/departmentName KOSONG tidak ikut terkirim sebagai field", () => {
    const payload = buildProductionEntryPayload(baseFormula, formulaItems, baseEntry);
    const detailItem = payload.detailItem as Record<string, unknown>[];
    expect("projectNo" in detailItem[0]!).toBe(false);
    expect("departmentName" in detailItem[0]!).toBe(false);
  });
});

describe("applyContextDefaults", () => {
  const defaults: ContextDefaults = { branchName: "KANTOR PUSAT", warehouseName: "Gudang Utama", rawMaterialWarehouseName: "Gudang Bahan" };
  const empty: ContextDefaults = { branchName: null, warehouseName: null, rawMaterialWarehouseName: null };

  test("isian kosong diisi dari default", () => {
    expect(applyContextDefaults(empty, defaults)).toEqual(defaults);
  });

  test("nilai yang diisi user selalu menang; hanya yang kosong dari default", () => {
    expect(applyContextDefaults({ ...empty, branchName: "JAKARTA", warehouseName: "  " }, defaults)).toEqual({
      branchName: "JAKARTA",
      warehouseName: "Gudang Utama",
      rawMaterialWarehouseName: "Gudang Bahan",
    });
  });

  test("default belum diatur (null) atau kosong — tetap null (perilaku lama, field di-omit)", () => {
    expect(applyContextDefaults(empty, null)).toEqual(empty);
    expect(applyContextDefaults(empty, { branchName: " ", warehouseName: null, rawMaterialWarehouseName: "" })).toEqual(empty);
  });

  test("field lain di entry tidak tersentuh", () => {
    expect(applyContextDefaults({ ...empty, projectNo: "PRJ-1" }, defaults).projectNo).toBe("PRJ-1");
  });
});
