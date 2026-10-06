// § Fase 43 — admin dulu WAJIB ketik durasi paket dalam hari mentah (mis.
// "360" untuk 1 tahun), merepotkan. UI sekarang input "Jumlah" + pilih unit
// (Hari/Bulan/Tahun), dikonversi ke `durationDays` (SATU-SATUNYA field yang
// dikirim ke API — API tidak tahu/tidak peduli soal unit) cuma saat submit.
// § Keputusan Kecil (phase-43): 1 Bulan = 30 hari. 1 Tahun SEMULA 360 hari
// (12×30); § DIKOREKSI 2026-10-06 (permintaan user): 1 Tahun = 365 HARI —
// pelanggan membeli "1 tahun" tapi hanya mendapat 360 hari. Paket/invoice
// LAMA yang tersimpan 360 hari (dan kelipatannya) TETAP ditampilkan sebagai
// "1 Tahun" (`LEGACY_YEAR_DAYS`) supaya riwayat tidak berubah jadi "360 Hari";
// paket yang diedit & disimpan ulang otomatis menjadi 365 hari (migration 0041
// juga menggeser paket lama di database).
import type { SubscriptionInterval } from "./subscription-period";

export type DurationUnit = "hari" | "bulan" | "tahun";

export const DURATION_UNIT_TO_DAYS: Record<DurationUnit, number> = {
  hari: 1,
  bulan: 30,
  tahun: 365,
};

/** Tahun lama (12×30). Hanya dipakai untuk MENGENALI data lama saat ditampilkan, tidak pernah untuk menghitung durasi baru. */
export const LEGACY_YEAR_DAYS = 360;

export const DURATION_UNIT_LABELS: Record<DurationUnit, string> = {
  hari: "Hari",
  bulan: "Bulan",
  tahun: "Tahun",
};

export function toDurationDays(amount: number, unit: DurationUnit): number {
  return amount * DURATION_UNIT_TO_DAYS[unit];
}

// § pilih unit TERBESAR yang habis dibagi bulat dari total hari, supaya
// paket "1 Tahun" (durationDays=360) tampil apa adanya saat diedit lagi,
// bukan berubah jadi "360 Hari". Fallback "hari" kalau tidak habis dibagi
// bulan/tahun (mis. durationDays=45).
export function inferDurationUnit(days: number): { amount: number; unit: DurationUnit } {
  if (days > 0 && days % DURATION_UNIT_TO_DAYS.tahun === 0) {
    return { amount: days / DURATION_UNIT_TO_DAYS.tahun, unit: "tahun" };
  }
  // Data lama: paket/invoice yang tersimpan 360 hari (kelipatan) tetap "N Tahun", bukan "N×12 Bulan".
  if (days > 0 && days % LEGACY_YEAR_DAYS === 0) {
    return { amount: days / LEGACY_YEAR_DAYS, unit: "tahun" };
  }
  if (days > 0 && days % DURATION_UNIT_TO_DAYS.bulan === 0) {
    return { amount: days / DURATION_UNIT_TO_DAYS.bulan, unit: "bulan" };
  }
  return { amount: days, unit: "hari" };
}

// § format kolom "Durasi" di tabel daftar paket (mis. "1 Tahun" bukan
// "365 hari") — pakai unit yang sama dengan `inferDurationUnit`.
export function formatDuration(days: number): string {
  const { amount, unit } = inferDurationUnit(days);
  return `${amount} ${DURATION_UNIT_LABELS[unit]}`;
}

// § Fase 173, ADR-0041 — paket kini berperiode "monthly"/"yearly" (bukan hitungan hari). Label form & kolom Durasi paket.
export const INTERVAL_LABELS: Record<SubscriptionInterval, string> = { monthly: "Bulanan", yearly: "Tahunan" };

/** "1 Bulan" / "1 Tahun" untuk tabel paket. Tanpa `interval` (data/klien lama) jatuh ke tebakan dari jumlah hari. */
export function formatPeriod(interval: SubscriptionInterval | undefined, fallbackDays: number): string {
  if (interval === "monthly") return "1 Bulan";
  if (interval === "yearly") return "1 Tahun";
  return formatDuration(fallbackDays);
}
