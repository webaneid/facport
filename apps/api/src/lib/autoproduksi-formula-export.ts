import * as XLSX from "xlsx";
import { formatFormulaCode } from "./formula-number";
import { autoproduksiFormulaMapping } from "./import-mapping/autoproduksi-formula.mapping";

// § Fase 193 — Export Formula AutoProduksi. Susunan = template Import Formula (semua kolom `defaultColumnMap`, urutan sama — termasuk "Status" Aktif/Nonaktif yang DIBACA Import supaya Formula nonaktif tetap nonaktif)
// + "No. Formula" di akhir (referensi saja — Import tidak punya ID & tidak pernah menimpa, jadi kolom ini tidak dipetakan/diabaikan saat diimpor balik). Per Formula: baris BJ dulu (Akun Perantara + Unit Cost), lalu baris BB menurut `sortOrder`.
// Sel teks di xlsx bertipe string (bukan rumus), jadi nilai berawalan "=" tidak dieksekusi dan sengaja TIDAK dimodifikasi — round-trip harus persis.
export const FORMULA_EXPORT_HEADERS = [...Object.keys(autoproduksiFormulaMapping.defaultColumnMap), "No. Formula"] as const;

export type FormulaExportInput = {
  formulaNumber: number;
  name: string;
  finishedGoodItemNo: string;
  finishedGoodItemName: string | null;
  finishedGoodItemUnitName: string;
  standardCost: string | null;
  adjustmentAccountNo: string;
  isActive: boolean;
  items: { itemNo: string; itemName: string | null; itemUnitName: string; quantity: string; sortOrder: number }[];
};

export type FormulaExportRow = Record<(typeof FORMULA_EXPORT_HEADERS)[number], string | number>;

function num(value: string | null): string | number {
  if (value === null || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
}

export function buildFormulaExportRows(formulas: FormulaExportInput[]): FormulaExportRow[] {
  const rows: FormulaExportRow[] = [];
  for (const f of [...formulas].sort((a, b) => a.formulaNumber - b.formulaNumber)) {
    const common = { "Nama Resep/Formula": f.name, "Akun Perantara": f.adjustmentAccountNo, "No. Formula": formatFormulaCode(f.formulaNumber), Status: f.isActive ? "Aktif" : "Nonaktif" };
    rows.push({
      ...common,
      "Tipe Barang": "BJ",
      "Nomor Item": f.finishedGoodItemNo,
      "Nama Item": f.finishedGoodItemName ?? "",
      Jumlah: "",
      "Nama Unit": f.finishedGoodItemUnitName,
      "Unit Cost": num(f.standardCost),
    });
    for (const item of [...f.items].sort((a, b) => a.sortOrder - b.sortOrder)) {
      rows.push({
        ...common,
        "Tipe Barang": "BB",
        "Nomor Item": item.itemNo,
        "Nama Item": item.itemName ?? "",
        Jumlah: num(item.quantity),
        "Nama Unit": item.itemUnitName,
        "Unit Cost": "",
      });
    }
  }
  return rows;
}

export function generateFormulaExportBuffer(formulas: FormulaExportInput[]): Buffer {
  const sheet = XLSX.utils.json_to_sheet(buildFormulaExportRows(formulas), { header: [...FORMULA_EXPORT_HEADERS] });
  sheet["!cols"] = FORMULA_EXPORT_HEADERS.map(() => ({ wch: 20 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Formula");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
