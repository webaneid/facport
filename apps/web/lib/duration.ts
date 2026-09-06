// § Fase 43 — admin dulu WAJIB ketik durasi paket dalam hari mentah (mis.
// "360" untuk 1 tahun), merepotkan. UI sekarang input "Jumlah" + pilih unit
// (Hari/Bulan/Tahun), dikonversi ke `durationDays` (SATU-SATUNYA field yang
// dikirim ke API — API tidak tahu/tidak peduli soal unit) cuma saat submit.
// § Keputusan Kecil (phase-43): 1 Bulan = 30 hari, 1 Tahun = 360 hari
// (12×30, BUKAN 365) — konsisten kebiasaan manual admin selama ini, dan
// bulat (1 Tahun = 12 Bulan persis, tidak ada sisa).
export type DurationUnit = "hari" | "bulan" | "tahun";

export const DURATION_UNIT_TO_DAYS: Record<DurationUnit, number> = {
  hari: 1,
  bulan: 30,
  tahun: 360,
};

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
  if (days > 0 && days % DURATION_UNIT_TO_DAYS.bulan === 0) {
    return { amount: days / DURATION_UNIT_TO_DAYS.bulan, unit: "bulan" };
  }
  return { amount: days, unit: "hari" };
}

// § format kolom "Durasi" di tabel daftar paket (mis. "1 Tahun" bukan
// "360 hari") — pakai unit yang sama dengan `inferDurationUnit`.
export function formatDuration(days: number): string {
  const { amount, unit } = inferDurationUnit(days);
  return `${amount} ${DURATION_UNIT_LABELS[unit]}`;
}
