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
// § Import Produksi (Excel) — worker resolve formula by name lalu panggil
// fungsi ini TANPA baris `autoproduksi_production_entries` (dibuat
// SETELAH, bukan sebelum — § `processAutoproduksiProductionImportRow`,
// workers/index.ts). Dipersempit ke field yang BENERAN dipakai di bawah
// (bukan `ProductionEntry` utuh) supaya pemanggil tidak perlu construct
// row DB palsu cuma untuk nilai-nilai ini.
// § Fase 168 — `branchName`/`warehouseName`/`rawMaterialWarehouseName`/
// `projectNo`/`departmentName` PINDAH KE SINI dari Formula/FormulaItem
// (konteks per-PRODUKSI, bukan bagian resep — § komentar schema).
type ProductionEntryInput = Pick<
  ProductionEntry,
  "producedQty" | "transDate" | "branchName" | "warehouseName" | "rawMaterialWarehouseName" | "projectNo" | "departmentName"
>;

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

export function buildProductionEntryPayload(formula: Formula, formulaItems: FormulaItem[], entry: ProductionEntryInput): Record<string, unknown> {
  const producedQty = Number(entry.producedQty);

  // § Fase 168 — Gudang Bahan Baku/Proyek/Departemen SEKARANG datang dari
  // `entry` (konteks per-produksi, dipilih user tiap kali input), BUKAN
  // lagi per-item Formula — SATU nilai berlaku SERAGAM ke SEMUA baris
  // Bahan Baku dalam 1x produksi (sesuai permintaan client, bukan per-item
  // lagi seperti desain lama).
  const rawMaterialLines = formulaItems.map((item) => ({
    itemNo: item.itemNo,
    itemUnitName: item.itemUnitName,
    // § Bahan Baku BERKURANG — takaran formula (PER 1 unit barang jadi) ×
    // qty produksi yang diinput user, § alur dikonfirmasi user: "ketika
    // kita input bolu, secara otomatis akan mengurangi telur dan tepung
    // sesuai kebutuhan yang diproduksi".
    quantity: Number(item.quantity) * producedQty,
    itemAdjustmentType: "ADJUSTMENT_OUT" satisfies ItemAdjustmentType,
    ...(entry.rawMaterialWarehouseName ? { warehouseName: entry.rawMaterialWarehouseName } : {}),
    ...(entry.projectNo ? { projectNo: entry.projectNo } : {}),
    ...(entry.departmentName ? { departmentName: entry.departmentName } : {}),
  }));

  const finishedGoodLine = {
    itemNo: formula.finishedGoodItemNo,
    itemUnitName: formula.finishedGoodItemUnitName,
    // § Barang Jadi BERTAMBAH — qty produksi APA ADANYA (bukan dikali apa pun).
    quantity: producedQty,
    itemAdjustmentType: "ADJUSTMENT_IN" satisfies ItemAdjustmentType,
    // § Gudang Barang Jadi (`entry.warehouseName`) — field terpisah dari
    // `entry.rawMaterialWarehouseName` di atas, karena baris Barang Jadi
    // vs Bahan Baku butuh gudang yang berbeda.
    ...(entry.warehouseName ? { warehouseName: entry.warehouseName } : {}),
    ...(entry.projectNo ? { projectNo: entry.projectNo } : {}),
    ...(entry.departmentName ? { departmentName: entry.departmentName } : {}),
    // § BUG DITEMUKAN & DIPERBAIKI 2026-10-02 (rilis v2.21.0) — `standardCost`
    // SUDAH ADA di skema sejak Fase 159 ("Nilai dimasukan manual", contoh
    // client) TAPI SEMPAT TIDAK PERNAH dikirim ke Accurate. Spec resmi
    // `item-adjustment/save.do` cantumkan `unitCost` wajib utk baris
    // ADJUSTMENT_IN ("diisi hanya jika penambahan kuantitas barang") — TIDAK
    // tersentuh oleh perombakan Fase 168 (tetap dari `formula.standardCost`,
    // sumbernya resep bukan konteks produksi).
    ...(formula.standardCost != null ? { unitCost: Number(formula.standardCost) } : {}),
  };

  return {
    transDate: formatTransDateForAccurate(entry.transDate),
    adjustmentAccountNo: formula.adjustmentAccountNo,
    // § Fase 168 — Cabang sekarang OPSIONAL (dulu wajib dari Formula) —
    // kosong = field di-omit total, Accurate pakai default preferensi
    // (dikonfirmasi `accurate-openapi.json`: `branchName` TIDAK required
    // di top-level `item-adjustment/save.do`).
    ...(entry.branchName ? { branchName: entry.branchName } : {}),
    description: AUTOPRODUKSI_DESCRIPTION,
    detailItem: [...rawMaterialLines, finishedGoodLine],
  };
}

// § diminta client 2026-10-03 — Cabang/Gudang Barang Jadi/Gudang Bahan Baku
// yang DIKOSONGKAN di Input Produksi diisi dari default per subscription
// (`autoproduksi_defaults`, diatur di halaman Pengaturan AutoProduksi).
// Nilai yang diisi user SELALU menang; default belum diatur + isian kosong =
// tetap null (perilaku lama: field di-omit dari payload). Murni (tanpa DB)
// supaya bisa dites langsung — pemuat DB ada di `autoproduksi-defaults.ts`.
type ContextDefaultFields = "branchName" | "warehouseName" | "rawMaterialWarehouseName";
export type ContextDefaults = Record<ContextDefaultFields, string | null>;

export function applyContextDefaults<T extends ContextDefaults>(entry: T, defaults: ContextDefaults | null): T {
  const pick = (value: string | null, fallback: string | null | undefined) => (value && value.trim() !== "" ? value : fallback && fallback.trim() !== "" ? fallback : null);
  return {
    ...entry,
    branchName: pick(entry.branchName, defaults?.branchName),
    warehouseName: pick(entry.warehouseName, defaults?.warehouseName),
    rawMaterialWarehouseName: pick(entry.rawMaterialWarehouseName, defaults?.rawMaterialWarehouseName),
  };
}
