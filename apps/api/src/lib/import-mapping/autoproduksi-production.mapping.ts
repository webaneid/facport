// § architecture-autoproduksi.md — Import Produksi (Excel), "Kirim Dengan
// Excel" yang ditunda sejak Fase 160/GitHub #79. BEDA dari 24 modul import
// lain: TIDAK ADA grouping (1 baris Excel = 1 Input Produksi = 1 panggilan
// `item-adjustment/save.do`, mirror alur single-entry manual
// `autoproduksi.route.ts` POST /autoproduksi/production-entries) DAN baris
// tidak langsung berisi field Accurate — "Nama Resep/Formula" HARUS
// di-resolve dulu ke `autoproduksi_formulas` (lookup lokal, bukan Accurate)
// sebelum payload bisa disusun (§ `buildProductionEntryPayload`,
// lib/autoproduksi.ts, direuse APA ADANYA dari flow manual).
//
// § Sumber: `Autoproduksi_Barang Jadi.xlsx` (client, 2026-10-02) — cuma 3
// kolom: Tanggal, Nama Resep/Formula, Jumlah.
//
// § Resolusi nama Formula AMBIGU (duplikat nama DIBOLEHKAN di Import
// Formula, keputusan eksplisit user) ditangani di WORKER
// (`processAutoproduksiProductionImportRow`, workers/index.ts) — butuh
// akses DB, bukan di file pure ini. File ini CUMA validasi bentuk baris
// (tanggal valid, qty > 0, nama tidak kosong).
export const autoproduksiProductionMapping = {
  requiredFields: ["transDate", "formulaName", "producedQty"] as const,
  fieldToAccuratePath: {
    transDate: "transDate",
    formulaName: "formulaName",
    producedQty: "producedQty",
  } as Record<string, string>,
  defaultColumnMap: {
    Tanggal: "transDate",
    "Nama Resep/Formula": "formulaName",
    Jumlah: "producedQty",
  } as Record<string, string>,
};

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

const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);

/**
 * Parse sel tanggal Excel (serial number, "YYYY-MM-DD", atau "DD/MM/YYYY"
 * — client EKSPLISIT bilang kedua format diterima, § komentar sel Excel
 * "Tanggal") jadi ISO "YYYY-MM-DD" (format kolom
 * `autoproduksi_production_entries.transDate`, BUKAN format Accurate —
 * konversi ke DD/MM/YYYY tetap lewat `formatTransDateForAccurate` yang
 * sudah ada, dipanggil `buildProductionEntryPayload`). `null` = tidak
 * bisa diparse.
 */
export function parseAutoproduksiTransDate(value: unknown): string | null {
  if (typeof value === "number") {
    const date = new Date(EXCEL_EPOCH_UTC_MS + value * 86400000);
    if (Number.isNaN(date.getTime())) return null;
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  }
  if (value instanceof Date) {
    return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    const dmyMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
    if (dmyMatch) {
      const [, d, m, y] = dmyMatch;
      return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
    }
  }
  return null;
}

/** Validasi SATU baris: tanggal tidak terparse, Nama Resep kosong, atau Jumlah bukan angka > 0. */
export function autoproduksiProductionRowError(rawRow: Record<string, unknown>, columnMapping: Record<string, string>): string[] {
  const errors: string[] = [];
  if (parseAutoproduksiTransDate(valueOf(rawRow, "transDate", columnMapping)) === null) errors.push("transDate");
  const name = valueOf(rawRow, "formulaName", columnMapping);
  if (name === undefined || String(name).trim() === "") errors.push("formulaName");
  const qty = valueOf(rawRow, "producedQty", columnMapping);
  const qtyNum = qty === undefined ? NaN : Number(qty);
  if (!Number.isFinite(qtyNum) || qtyNum <= 0) errors.push("producedQty");
  return errors;
}
