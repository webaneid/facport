import { describe, test, expect } from "bun:test";
import { buildProductionEntryPayload, formatTransDateForAccurate } from "./autoproduksi";
import type { autoproduksiFormulas, autoproduksiFormulaItems, autoproduksiProductionEntries } from "../db/schema";

// § Fase 159 — kasus contoh dari simulasi client (Autoproduksi.xlsx):
// Formula "Bolu Kukus SP" = Telur 0.5kg + Tepung 0.5kg per 1 Loyang Bolu.
// Diverifikasi payload SAMA PERSIS field yang dikonfirmasi client via
// screenshot Accurate asli (adjustmentAccountNo/description/branchName +
// detailItem[] dengan itemAdjustmentType IN/OUT yang benar).
type Formula = typeof autoproduksiFormulas.$inferSelect;
type FormulaItem = typeof autoproduksiFormulaItems.$inferSelect;
type ProductionEntry = typeof autoproduksiProductionEntries.$inferSelect;

const baseFormula: Formula = {
  id: "formula-1",
  userId: "user-1",
  dataUsahaId: "du-1",
  subscriptionId: "sub-1",
  name: "Bolu Kukus SP (Spesial BGT)",
  finishedGoodItemNo: "100011",
  finishedGoodItemUnitName: "Loyang",
  finishedGoodItemName: null,
  standardCost: "20000",
  adjustmentAccountNo: "11078",
  adjustmentAccountName: null,
  branchName: "JAKARTA",
  warehouseName: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const formulaItems: FormulaItem[] = [
  { id: "fi-1", formulaId: "formula-1", itemNo: "100012", itemUnitName: "KG", itemName: null, quantity: "0.5", warehouseName: null, sortOrder: 0 },
  { id: "fi-2", formulaId: "formula-1", itemNo: "100013", itemUnitName: "KG", itemName: null, quantity: "0.5", warehouseName: null, sortOrder: 1 },
];

const baseEntry: ProductionEntry = {
  id: "entry-1",
  userId: "user-1",
  dataUsahaId: "du-1",
  subscriptionId: "sub-1",
  formulaId: "formula-1",
  producedQty: "1",
  transDate: "2026-09-28",
  status: "pending",
  accurateTransactionId: null,
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
    expect(payload.description).toBe("Input Dari AutoProduksi");

    const detailItem = payload.detailItem as Record<string, unknown>[];
    expect(detailItem).toHaveLength(3);

    // 2 baris Bahan Baku BERKURANG (ADJUSTMENT_OUT), qty = takaran formula apa adanya (qty produksi = 1)
    expect(detailItem[0]).toMatchObject({ itemNo: "100012", quantity: 0.5, itemAdjustmentType: "ADJUSTMENT_OUT" });
    expect(detailItem[1]).toMatchObject({ itemNo: "100013", quantity: 0.5, itemAdjustmentType: "ADJUSTMENT_OUT" });

    // 1 baris Barang Jadi BERTAMBAH (ADJUSTMENT_IN), qty = qty produksi
    expect(detailItem[2]).toMatchObject({ itemNo: "100011", quantity: 1, itemAdjustmentType: "ADJUSTMENT_IN" });
  });

  test("qty produksi 10 -> kebutuhan bahan baku ikut dikali 10 (inti fitur 'Auto')", () => {
    const entry10 = { ...baseEntry, producedQty: "10" };
    const payload = buildProductionEntryPayload(baseFormula, formulaItems, entry10);
    const detailItem = payload.detailItem as Record<string, unknown>[];

    expect(detailItem[0]).toMatchObject({ itemNo: "100012", quantity: 5, itemAdjustmentType: "ADJUSTMENT_OUT" }); // 0.5 * 10
    expect(detailItem[1]).toMatchObject({ itemNo: "100013", quantity: 5, itemAdjustmentType: "ADJUSTMENT_OUT" }); // 0.5 * 10
    expect(detailItem[2]).toMatchObject({ itemNo: "100011", quantity: 10, itemAdjustmentType: "ADJUSTMENT_IN" });
  });

  test("warehouseName per Bahan Baku disertakan kalau diisi (§ wishlist client, field API sudah support)", () => {
    const itemsWithWarehouse: FormulaItem[] = [{ ...formulaItems[0]!, warehouseName: "Gudang Utama" }];
    const payload = buildProductionEntryPayload(baseFormula, itemsWithWarehouse, baseEntry);
    const detailItem = payload.detailItem as Record<string, unknown>[];
    expect(detailItem[0]).toMatchObject({ warehouseName: "Gudang Utama" });
  });

  test("warehouseName KOSONG tidak ikut terkirim sebagai field (bukan string kosong/undefined literal)", () => {
    const payload = buildProductionEntryPayload(baseFormula, formulaItems, baseEntry);
    const detailItem = payload.detailItem as Record<string, unknown>[];
    expect("warehouseName" in detailItem[0]!).toBe(false);
  });
});
