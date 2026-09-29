import type { ItemAdjustmentType } from "./import-mapping/inventory-adjustment.mapping";
import type { autoproduksiFormulas, autoproduksiFormulaItems, autoproduksiProductionEntries } from "../db/schema";

// § Fase 159, architecture-autoproduksi.md — inti logic "Auto" di
// AutoProduksi: hitung kebutuhan Bahan Baku dari qty produksi × takaran
// formula, susun jadi payload `item-adjustment/save.do` (endpoint yang
// SUDAH ADA, § accurate-inventory-adjustment.ts — TIDAK ada integrasi baru).
// Dipisah dari worker (murni fungsi, tanpa DB/network) supaya bisa di-unit-
// test tanpa mock DB/Accurate sama sekali.

type Formula = typeof autoproduksiFormulas.$inferSelect;
type FormulaItem = typeof autoproduksiFormulaItems.$inferSelect;
type ProductionEntry = typeof autoproduksiProductionEntries.$inferSelect;

// § transDate disimpan "YYYY-MM-DD" (dari <input type="date"> polos, §
// autoproduksi.route.ts schema) — Accurate API expect "DD/MM/YYYY" (sama
// format `todayAccurateDate()` di accurate-vendor.ts). BEDA dari
// todayAccurateDate: transDate di sini tanggal yang user PILIH eksplisit
// (kalender, bukan "hari ini"), jadi tidak perlu resolve timezone
// perusahaan — cukup format ulang string apa adanya, tanpa `Date` object
// (hindari kelas bug timezone yang sama seperti lesson todayAccurateDate).
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatTransDateForAccurate(isoDate: string): string {
  const match = ISO_DATE_RE.exec(isoDate);
  if (!match) throw new Error(`Format tanggal tidak valid: "${isoDate}" (harus YYYY-MM-DD)`);
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

// § Keterangan hardcode "Input Dari AutoProduksi" — literal SAMA PERSIS
// yang ditunjukkan client di simulasi (screenshot Accurate asli), bukan
// ditebak.
const AUTOPRODUKSI_DESCRIPTION = "Input Dari AutoProduksi";

export function buildProductionEntryPayload(formula: Formula, formulaItems: FormulaItem[], entry: ProductionEntry): Record<string, unknown> {
  const producedQty = Number(entry.producedQty);

  const rawMaterialLines = formulaItems.map((item) => ({
    itemNo: item.itemNo,
    itemUnitName: item.itemUnitName,
    // § Bahan Baku BERKURANG — takaran formula (PER 1 unit barang jadi) ×
    // qty produksi yang diinput user, § alur dikonfirmasi user: "ketika
    // kita input bolu, secara otomatis akan mengurangi telur dan tepung
    // sesuai kebutuhan yang diproduksi".
    quantity: Number(item.quantity) * producedQty,
    itemAdjustmentType: "ADJUSTMENT_OUT" satisfies ItemAdjustmentType,
    ...(item.warehouseName ? { warehouseName: item.warehouseName } : {}),
  }));

  const finishedGoodLine = {
    itemNo: formula.finishedGoodItemNo,
    itemUnitName: formula.finishedGoodItemUnitName,
    // § Barang Jadi BERTAMBAH — qty produksi APA ADANYA (bukan dikali apa pun).
    quantity: producedQty,
    itemAdjustmentType: "ADJUSTMENT_IN" satisfies ItemAdjustmentType,
    ...(formula.warehouseName ? { warehouseName: formula.warehouseName } : {}),
  };

  return {
    transDate: formatTransDateForAccurate(entry.transDate),
    adjustmentAccountNo: formula.adjustmentAccountNo,
    branchName: formula.branchName,
    description: AUTOPRODUKSI_DESCRIPTION,
    detailItem: [...rawMaterialLines, finishedGoodLine],
  };
}
