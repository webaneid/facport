// § architecture-autoproduksi.md — Import Formula (Excel). BEDA TOTAL dari
// 24 modul import lain: TIDAK PERNAH memanggil Accurate — Formula (BOM)
// adalah data lokal Facport murni (`autoproduksi_formulas`/
// `autoproduksi_formula_items`), divalidasi Accurate baru nanti saat Input
// Produksi diproses (sama filosofi "Accurate validasi saat save beneran").
//
// § Sumber: `Autoproduksi_Formula Produksi.xlsx` (client, 2026-10-02).
// Baris dikelompokkan by "Nama Resep/Formula" (ADR-0011) — tiap grup WAJIB
// tepat 1 baris Tipe Barang=BJ (Barang Jadi, jadi header
// `autoproduksi_formulas`) + minimal 1 baris Tipe Barang=BB (Bahan Baku,
// jadi baris `autoproduksi_formula_items`).
//
// § Fase 168 (diminta client) — Cabang/Gudang/Nomor Project/Departemen
// DIHAPUS TOTAL dari modul ini (header maupun per-item) — semuanya SEKARANG
// konteks per-PRODUKSI, bukan bagian resep (pindah ke
// `autoproduksi-production.mapping.ts`). Formula sekarang murni: Nama
// Resep + Akun Perantara + daftar Barang Jadi/Bahan Baku + takaran.
//
// § Nama Resep/Formula WAJIB unik per Data Usaha (permintaan client
// 2026-10-09, membalik keputusan 2026-10-02) — grup yang namanya sudah
// dipakai GAGAL (tak peka huruf besar/kecil), TIDAK PERNAH update/timpa.
// Formula lama yang sudah kembar tetap ada; Input Produksi tetap menolak
// nama ganda (bukan menebak) — lihat `autoproduksi-production.mapping.ts`.
export const AUTOPRODUKSI_ITEM_TYPES = ["BB", "BJ"] as const;
export type AutoproduksiItemType = (typeof AUTOPRODUKSI_ITEM_TYPES)[number];

// § dictionary TEBAKAN TERBAIK (mirror pola `ROLL_OVER_TYPE_DICTIONARY`) —
// comment client sendiri di file Excel ("1 -> Bahan Baku, 2 -> Barang
// Jadi") TIDAK COCOK dengan data asli (`BB`/`BJ` literal) — kemungkinan
// draft lama. Terima KEDUA bentuk supaya aman, baris yang benar-benar tidak
// dikenali gagal dengan pesan jelas (bukan ditebak diam-diam).
const ITEM_TYPE_DICTIONARY: Record<string, AutoproduksiItemType> = {
  "1": "BB",
  bb: "BB",
  "bahan baku": "BB",
  "2": "BJ",
  bj: "BJ",
  "barang jadi": "BJ",
};

export function resolveAutoproduksiItemType(raw: unknown): AutoproduksiItemType | null {
  if (raw === undefined || raw === null) return null;
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === "") return null;
  const upper = normalized.toUpperCase();
  if ((AUTOPRODUKSI_ITEM_TYPES as readonly string[]).includes(upper)) return upper as AutoproduksiItemType;
  return ITEM_TYPE_DICTIONARY[normalized] ?? null;
}

export const autoproduksiFormulaMapping = {
  requiredFields: ["formulaName", "adjustmentAccountNo", "itemType", "itemNo", "itemUnitName"] as const,
  fieldToAccuratePath: {
    formulaName: "name",
    adjustmentAccountNo: "adjustmentAccountNo",
    itemType: "itemType",
    itemNo: "itemNo",
    itemName: "itemName",
    quantity: "quantity",
    itemUnitName: "itemUnitName",
    unitCost: "unitCost",
  } as Record<string, string>,
  defaultColumnMap: {
    "Nama Resep/Formula": "formulaName",
    "Akun Perantara": "adjustmentAccountNo",
    "Tipe Barang": "itemType",
    "Nomor Item": "itemNo",
    "Nama Item": "itemName",
    Jumlah: "quantity",
    "Nama Unit": "itemUnitName",
    "Unit Cost": "unitCost",
  } as Record<string, string>,
};

export type ImportRowRecord = { id: string; rawData: Record<string, unknown> };
export type AutoproduksiFormulaGroup = { groupKey: string; rows: ImportRowRecord[] };

function columnOf(columnMapping: Record<string, string>, field: string): string | null {
  return Object.entries(columnMapping).find(([, f]) => f === field)?.[0] ?? null;
}

export function valueOf(rawRow: Record<string, unknown>, field: string, columnMapping: Record<string, string>): unknown {
  const column = columnOf(columnMapping, field);
  if (!column) return undefined;
  const value = rawRow[column];
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
}

function textOf(row: ImportRowRecord, columnMapping: Record<string, string>, field: string): string | null {
  const value = valueOf(row.rawData, field, columnMapping);
  return value === undefined ? null : String(value).trim();
}

// § grouping by "Nama Resep/Formula" — field ini WAJIB (§ requiredFields),
// jadi BEDA dari ADR-0011 biasa (grouping key di modul lain OPSIONAL,
// kosong = 1 baris = 1 dokumen): baris tanpa nama formula langsung gagal
// validasi required-field, tidak pernah sampai tahap grouping.
export function groupAutoproduksiFormulaRows(rows: ImportRowRecord[], columnMapping: Record<string, string>): AutoproduksiFormulaGroup[] {
  const groups: AutoproduksiFormulaGroup[] = [];
  const byKey = new Map<string, AutoproduksiFormulaGroup>();
  for (const row of rows) {
    const name = textOf(row, columnMapping, "formulaName");
    const key = (name ?? `__baris_${row.id}`).toLowerCase();
    let group = byKey.get(key);
    if (!group) {
      group = { groupKey: name ?? "", rows: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.rows.push(row);
  }
  return groups;
}

// § security review Fase 166 — modul ini (BEDA dari 24 modul Excel lain)
// insert nilai Excel LANGSUNG ke kolom `varchar` kita sendiri
// (`autoproduksi_formulas`/`autoproduksi_formula_items`), bukan cuma
// diteruskan ke Accurate — jadi field yang kepanjangan BISA kena error
// Postgres mentah ("value too long for type character varying(N)") kalau
// tidak ditolak DULU di sini (sama prinsip `autoproduksi.route.ts`
// `maxLength` utk form manual, § komentar atas file itu — di sini versi
// Excel-nya). Limit HARUS cocok persis `autoproduksi.schema.ts`.
const MAX_LENGTHS: Record<string, number> = {
  formulaName: 255,
  adjustmentAccountNo: 50,
  itemNo: 100,
  itemName: 255,
  itemUnitName: 50,
};

function fieldLengthErrors(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): string[] {
  const errors: string[] = [];
  for (const [field, max] of Object.entries(MAX_LENGTHS)) {
    const value = valueOf(rawRow, field, columnMapping);
    if (value !== undefined && String(value).length > max) errors.push(field);
  }
  return errors;
}

/** Validasi SATU baris: itemType tidak dikenali, (BB) quantity belum diisi, atau ADA field yang lebih panjang dari batas kolom DB. BJ tidak wajib quantity (takaran formula selalu PER 1 unit). */
export function autoproduksiFormulaRowError(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): string[] {
  const type = resolveAutoproduksiItemType(valueOf(rawRow, "itemType", columnMapping));
  if (type === null) return ["itemType"];
  const errors: string[] = [];
  if (type === "BB" && valueOf(rawRow, "quantity", columnMapping) === undefined) errors.push("quantity");
  errors.push(...fieldLengthErrors(rawRow, columnMapping));
  return errors;
}

/**
 * Validasi SATU GRUP (= 1 Formula): tepat 1 baris BJ, minimal 1 baris BB.
 * Mengembalikan pesan galat, atau null bila valid.
 */
export function validateAutoproduksiFormulaGroup(group: AutoproduksiFormulaGroup, columnMapping: Record<string, string>): string | null {
  const types = group.rows.map((r) => resolveAutoproduksiItemType(valueOf(r.rawData, "itemType", columnMapping)));
  const bjCount = types.filter((t) => t === "BJ").length;
  const bbCount = types.filter((t) => t === "BB").length;
  if (bjCount !== 1) return `Formula "${group.groupKey}" harus punya TEPAT 1 baris Tipe Barang=BJ (Barang Jadi) — ditemukan ${bjCount}.`;
  if (bbCount < 1) return `Formula "${group.groupKey}" butuh minimal 1 baris Tipe Barang=BB (Bahan Baku).`;
  return null;
}

export type AutoproduksiFormulaRecord = {
  name: string;
  finishedGoodItemNo: string;
  finishedGoodItemUnitName: string;
  finishedGoodItemName: string | null;
  standardCost: string | null;
  adjustmentAccountNo: string;
  items: {
    itemNo: string;
    itemUnitName: string;
    itemName: string | null;
    quantity: string;
  }[];
};

/**
 * Susun 1 grup (sudah divalidasi `validateAutoproduksiFormulaGroup`) jadi
 * record siap-insert `autoproduksi_formulas`+`autoproduksi_formula_items`
 * — PURE, tanpa DB/network (bisa di-unit-test tanpa mock, § pola
 * `buildProductionEntryPayload`). `adjustmentAccountNo` diambil dari baris
 * BJ (header konseptual grup — di contoh client semua baris repeat nilai
 * yang sama, tapi BJ yang otoritatif bila beda).
 */
export function buildAutoproduksiFormulaRecord(group: AutoproduksiFormulaGroup, columnMapping: Record<string, string>): AutoproduksiFormulaRecord {
  const bjRow = group.rows.find((r) => resolveAutoproduksiItemType(valueOf(r.rawData, "itemType", columnMapping)) === "BJ")!;
  const bbRows = group.rows.filter((r) => resolveAutoproduksiItemType(valueOf(r.rawData, "itemType", columnMapping)) === "BB");

  return {
    name: group.groupKey,
    finishedGoodItemNo: textOf(bjRow, columnMapping, "itemNo") ?? "",
    finishedGoodItemUnitName: textOf(bjRow, columnMapping, "itemUnitName") ?? "",
    finishedGoodItemName: textOf(bjRow, columnMapping, "itemName"),
    standardCost: textOf(bjRow, columnMapping, "unitCost"),
    adjustmentAccountNo: textOf(bjRow, columnMapping, "adjustmentAccountNo") ?? "",
    items: bbRows.map((row) => ({
      itemNo: textOf(row, columnMapping, "itemNo") ?? "",
      itemUnitName: textOf(row, columnMapping, "itemUnitName") ?? "",
      itemName: textOf(row, columnMapping, "itemName"),
      quantity: textOf(row, columnMapping, "quantity") ?? "0",
    })),
  };
}
