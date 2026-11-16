import type { FormulaExportResult } from "@/lib/formula-export";

// § Fase 221 — unduh Riwayat Input Produksi (xlsx). Pengunduhan memakai `downloadFormulaExport` (fetch berkredensial + header Data Usaha → blob);
// file ini hanya URL, validasi rentang di sisi UI (cermin `parseHistoryExportRange` di API — server tetap yang memutuskan), dan pesan galat.
export const MAX_HISTORY_EXPORT_DAYS = 2;

export function historyExportUrl(base: string, from: string, to: string): string {
  return `${base}/autoproduksi/production-entries/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
}

function dayNumber(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
  return Math.round(ms / 86_400_000);
}

// Pesan galat untuk rentang yang tidak boleh diunduh, atau null bila valid.
export function historyRangeError(from: string, to: string): string | null {
  const a = dayNumber(from);
  const b = dayNumber(to);
  if (a === null || b === null) return "Pilih tanggal mulai dan tanggal akhir.";
  if (b < a) return "Tanggal akhir tidak boleh sebelum tanggal mulai.";
  if (b - a + 1 > MAX_HISTORY_EXPORT_DAYS) return `Rentang maksimal ${MAX_HISTORY_EXPORT_DAYS} hari.`;
  return null;
}

export function historyExportErrorMessage(result: Extract<FormulaExportResult, { ok: false }>): string {
  if (result.code === "NETWORK") return "Gagal mengunduh — periksa koneksi internet Anda lalu coba lagi.";
  if (result.code === "RANGE_TOO_LONG") return `Rentang maksimal ${MAX_HISTORY_EXPORT_DAYS} hari.`;
  if (result.code === "RANGE_INVALID" || result.code === "INVALID_DATE") return "Rentang tanggal tidak valid — periksa tanggal mulai dan akhir.";
  if (result.code === "EXPORT_TOO_LARGE") return "Data terlalu banyak untuk satu file — pilih rentang yang lebih pendek.";
  if (result.code === "DATA_USAHA_REQUIRED" || result.code === "DATA_USAHA_FORBIDDEN") return "Pilih Data Usaha yang benar lewat menu \"Ganti Data Usaha\", lalu coba unduh lagi.";
  if (result.status === 401) return "Sesi berakhir — silakan masuk lagi, lalu coba unduh.";
  return "Gagal mengunduh riwayat. Coba lagi sebentar.";
}
