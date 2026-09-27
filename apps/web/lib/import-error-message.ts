// § BUG DITEMUKAN & DIPERBAIKI 2026-09-27 (audit menyeluruh) — backend
// (SEMUA 23 `{module}-import.route.ts`, endpoint `confirm` & `retry`)
// SUDAH balikin kode `ACCURATE_SCOPE_MISSING` (409, § `missing: string[]`
// nama scope yang kurang) kalau koneksi Accurate customer kurang izin
// untuk modul itu — TAPI frontend TIDAK PERNAH baca kode ini sama sekali
// di 23 modul, selalu jatuh ke pesan generik ("Gagal konfirmasi
// mapping."/"Gagal mengirim ulang baris — coba lagi.") yang tidak
// memberi tahu solusinya (perbarui izin Accurate). Ditemukan sistemik di
// SEMUA 23 modul sekaligus — dipusatkan di SINI (bukan ditempel manual
// 23x lagi, itu pola yang sudah berulang kali bikin drift minggu ini)
// supaya kode error baru di masa depan otomatis konsisten ditangani di
// semua tempat yang memanggil fungsi ini.
export type ImportActionErrorValue = {
  code?: string;
  fields?: string[];
  remaining?: number;
  max?: number;
  missing?: string[];
};

/**
 * Pesan pengganti untuk kode error umum di alur konfirmasi mapping/retry
 * import (23 modul). `fallback` dipakai kalau `value?.code` tidak
 * dikenali (termasuk kalau `value` sendiri `undefined`).
 */
export function describeImportActionError(value: ImportActionErrorValue | undefined, fallback: string): string {
  switch (value?.code) {
    case "MISSING_REQUIRED_FIELDS":
      return `Field wajib belum dipetakan: ${value.fields?.join(", ")}`;
    case "TRIAL_ROW_LIMIT_EXCEEDED":
      return `Kuota trial tidak cukup — sisa ${value.remaining} dari ${value.max} baris. Kurangi jumlah baris atau upgrade ke paket berbayar.`;
    case "ACCURATE_SCOPE_MISSING":
      return `Izin Accurate belum lengkap untuk fitur ini${
        value.missing?.length ? ` (${value.missing.join(", ")})` : ""
      } — buka menu "Koneksi Accurate", perbarui izin, lalu coba lagi.`;
    // § kemungkinan besar TIDAK reachable dari alur UI normal (dropdown
    // mapping sudah dibatasi ke field valid) — defense-in-depth saja.
    case "INVALID_MAPPING_FIELD":
      return "Ada kolom yang dipetakan ke field yang tidak dikenal Accurate — cek ulang pemetaan kolom.";
    default:
      return fallback;
  }
}
