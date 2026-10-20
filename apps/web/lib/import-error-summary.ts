// § Perbaikan kecil (2026-10-20) — ringkasan galat di halaman hasil import. Kasus nyata: pelanggan menekan "Retry baris gagal" ±20 kali pada galat yang tidak bisa
// pulih tanpa memperbaiki data (PPh ID salah teks, pembayaran melebihi sisa tagihan). Ringkasan mengelompokkan pesan galat, menghitung baris, dan memberi saran
// dalam bahasa awam + apakah "Retry" berguna. Murni (tanpa React) agar mudah diuji; komponen di `components/import/import-error-summary.tsx`.

export type SummaryRow = { status: string; errorMessage: string | null };

/** `fix-data` = perbaiki data dulu (Retry tanpa perbaikan pasti gagal lagi); `check-accurate` = periksa Accurate dulu (hindari duplikat); `retry-ok` = Retry wajar. */
export type ErrorAction = "fix-data" | "check-accurate" | "retry-ok";
export type ErrorHint = { advice: string; action: ErrorAction };
export type ErrorGroup = { key: string; count: number; example: string; hint: ErrorHint | null };
export type ErrorSummary = { totalFailed: number; groups: ErrorGroup[]; otherGroups: number; otherRows: number };

export const ERROR_HINTS: { pattern: RegExp; hint: ErrorHint }[] = [
  {
    pattern: /tidak ditemukan di Data Master Pajak/i,
    hint: { action: "fix-data", advice: 'Isi kolom "PPh ID" persis seperti kolom Deskripsi di Master Pajak Accurate (jenis PPh 23), atau kosongkan bila fakturnya tidak kena PPh.' },
  },
  {
    pattern: /melebihi nilai (utang|piutang)/i,
    hint: {
      action: "fix-data",
      advice: "Jumlah Payment lebih besar dari sisa tagihan faktur di Accurate. Cek sisa tagihan faktur itu di Accurate (mungkin sudah dibayar sebagian/penuh). Payment diisi SEBELUM dipotong PPh/diskon.",
    },
  },
  {
    pattern: /tidak ditemukan atau sudah dihapus/i,
    hint: { action: "fix-data", advice: "Nomor faktur tidak ada di Accurate atau sudah dihapus. Periksa kolom nomor faktur di Excel." },
  },
  {
    pattern: /(Kolom wajib|Kolom header wajib)/i,
    hint: { action: "fix-data", advice: "Lengkapi kolom wajib yang disebut pada pesan di Excel (atau lewat Edit baris), lalu Retry." },
  },
  {
    pattern: /Accurate (belum|tidak) membalas/i,
    hint: { action: "check-accurate", advice: "Periksa dulu di Accurate apakah transaksinya sudah masuk sebelum import ulang, supaya tidak terjadi duplikat." },
  },
  {
    pattern: /melebihi toleransi/i,
    hint: { action: "retry-ok", advice: "Batas permintaan Accurate terlampaui sesaat. Aman untuk Retry." },
  },
];

// Pesan yang diberi lampiran daftar faktur dari Excel (`payment-error-context.ts`) dipotong di sini agar pesan yang sama tetap satu kelompok.
const ANNOTATION_MARKER = " Faktur pada dokumen ini menurut Excel:";

/** Kunci pengelompokan: id, teks bertanda kutip, dan angka diganti penanda, sehingga pesan yang sama polanya (nomor faktur/baris berbeda) jadi satu kelompok. */
export function normalizeErrorKey(message: string): string {
  const base = message.includes(ANNOTATION_MARKER) ? message.slice(0, message.indexOf(ANNOTATION_MARKER)) : message;
  return base
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/"[^"]*"/g, '"<…>"')
    .replace(/\d+([.,]\d+)*/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

export function hintFor(message: string): ErrorHint | null {
  return ERROR_HINTS.find((h) => h.pattern.test(message))?.hint ?? null;
}

export function summarizeErrors(rows: SummaryRow[], maxGroups = 5): ErrorSummary {
  const failed = rows.filter((r) => r.status === "failed" && r.errorMessage && r.errorMessage.trim() !== "");
  const byKey = new Map<string, ErrorGroup>();
  for (const r of failed) {
    const message = r.errorMessage!.trim();
    const key = normalizeErrorKey(message);
    const existing = byKey.get(key);
    if (existing) existing.count += 1;
    else byKey.set(key, { key, count: 1, example: message.includes(ANNOTATION_MARKER) ? message.slice(0, message.indexOf(ANNOTATION_MARKER)) : message, hint: hintFor(message) });
  }
  const all = [...byKey.values()].sort((a, b) => b.count - a.count);
  const shown = all.slice(0, maxGroups);
  const rest = all.slice(maxGroups);
  return { totalFailed: failed.length, groups: shown, otherGroups: rest.length, otherRows: rest.reduce((s, g) => s + g.count, 0) };
}
