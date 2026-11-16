import * as XLSX from "xlsx";
import { formatFormulaCode } from "./formula-number";

// § Fase 221 (evaluasi client 2026-11-16, butir 3) — unduh Riwayat Input Produksi ke Excel.
// Keputusan user: pelanggan MEMILIH tanggal sendiri, rentang MAKSIMAL 2 hari (inklusif: dari=sampai = 1 hari, dari+1 = 2 hari),
// berdasarkan TANGGAL PRODUKSI (`trans_date`, tanggal yang dipilih pelanggan di form/Excel), bukan waktu input.
// Dikerjakan SINKRON (bukan job queue) dengan alasan eksplisit: rentang ≤ 2 hari + batas baris `MAX_HISTORY_EXPORT_ROWS`
// membuat kerjanya kecil; kalau melebihi batas, permintaan DITOLAK (bukan dipotong diam-diam) — lihat architecture-autoproduksi.md.
export const MAX_HISTORY_EXPORT_DAYS = 2;
export const MAX_HISTORY_EXPORT_ROWS = 20000;

export type HistoryExportRangeResult = { ok: true; from: string; to: string } | { ok: false; code: "INVALID_DATE" | "RANGE_INVALID" | "RANGE_TOO_LONG" };

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Tanggal kalender murni "YYYY-MM-DD" → hari ke-N (UTC, tanpa pengaruh zona waktu/DST). null bila bukan tanggal nyata (mis. 2026-02-30).
function dayNumber(iso: string): number | null {
  const m = ISO_DATE_RE.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return Math.round(ms / 86_400_000);
}

export function parseHistoryExportRange(from: string, to: string): HistoryExportRangeResult {
  const a = dayNumber(from);
  const b = dayNumber(to);
  if (a === null || b === null) return { ok: false, code: "INVALID_DATE" };
  if (b < a) return { ok: false, code: "RANGE_INVALID" };
  if (b - a + 1 > MAX_HISTORY_EXPORT_DAYS) return { ok: false, code: "RANGE_TOO_LONG" };
  return { ok: true, from, to };
}

export const HISTORY_EXPORT_HEADERS = [
  "Tanggal Produksi",
  "No. Formula",
  "Nama Formula",
  "Kode Barang Jadi",
  "Nama Barang Jadi",
  "Qty Produksi",
  "Satuan",
  "Cabang",
  "Gudang Barang Jadi",
  "Gudang Bahan Baku",
  "Proyek",
  "Departemen",
  "Status",
  "No. Transaksi Accurate",
  "Pesan Galat",
  "Waktu Input",
] as const;

export type HistoryExportInput = {
  transDate: string;
  formulaNumber: number;
  formulaName: string;
  finishedGoodItemNo: string;
  finishedGoodItemName: string | null;
  finishedGoodItemUnitName: string;
  producedQty: string;
  branchName: string | null;
  warehouseName: string | null;
  rawMaterialWarehouseName: string | null;
  projectNo: string | null;
  departmentName: string | null;
  status: string;
  accurateTransactionNumber: string | null;
  errorMessage: string | null;
  createdAt: Date;
};

export type HistoryExportRow = Record<(typeof HISTORY_EXPORT_HEADERS)[number], string | number>;

const STATUS_LABEL: Record<string, string> = { pending: "Menunggu", processing: "Memproses", success: "Sukses", failed: "Gagal" };

// Waktu input ditampilkan di zona waktu PERUSAHAAN (penyimpanan tetap UTC), format "YYYY-MM-DD HH:mm:ss".
export function formatInputTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(date);
}

function qty(value: string): string | number {
  const n = Number(value);
  return Number.isFinite(n) ? n : value;
}

// Sel teks xlsx bertipe string (bukan rumus) → nilai berawalan "=" (mis. pesan galat dari Accurate) tidak dieksekusi; sengaja tidak dimodifikasi (pola Fase 193).
export function buildHistoryExportRows(entries: HistoryExportInput[], timeZone: string): HistoryExportRow[] {
  return entries.map((e) => ({
    "Tanggal Produksi": e.transDate,
    "No. Formula": formatFormulaCode(e.formulaNumber),
    "Nama Formula": e.formulaName,
    "Kode Barang Jadi": e.finishedGoodItemNo,
    "Nama Barang Jadi": e.finishedGoodItemName ?? "",
    "Qty Produksi": qty(e.producedQty),
    Satuan: e.finishedGoodItemUnitName,
    Cabang: e.branchName ?? "",
    "Gudang Barang Jadi": e.warehouseName ?? "",
    "Gudang Bahan Baku": e.rawMaterialWarehouseName ?? "",
    Proyek: e.projectNo ?? "",
    Departemen: e.departmentName ?? "",
    Status: STATUS_LABEL[e.status] ?? e.status,
    "No. Transaksi Accurate": e.accurateTransactionNumber ?? "",
    "Pesan Galat": e.errorMessage ?? "",
    "Waktu Input": formatInputTime(e.createdAt, timeZone),
  }));
}

export function generateHistoryExportBuffer(entries: HistoryExportInput[], timeZone: string): Buffer {
  const sheet = XLSX.utils.json_to_sheet(buildHistoryExportRows(entries, timeZone), { header: [...HISTORY_EXPORT_HEADERS] });
  sheet["!cols"] = HISTORY_EXPORT_HEADERS.map((h) => ({ wch: h === "Pesan Galat" ? 50 : h.startsWith("Nama") ? 28 : 20 }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Riwayat Produksi");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
