// § diminta user 2026-09-06 — estimasi "efisiensi waktu kerja" yang
// ditampilkan ke customer di dashboard (`GET /me/stats`): total baris
// sukses diimport dikali estimasi rata-rata detik input manual per
// baris di Accurate Online (kalau TIDAK pakai Facport). Angka ini
// SUBJEKTIF/estimasi admin (bukan hasil pengukuran nyata per pelanggan)
// — makanya dibuat setting yang bisa admin sesuaikan, bukan konstanta
// hardcode, supaya bisa dikalibrasi ulang kalau ada bukti lebih akurat.
export const MANUAL_INPUT_SECONDS_SETTING_KEY = "data.manualInputSecondsPerRow";
export const DEFAULT_MANUAL_INPUT_SECONDS_PER_ROW = 30;
export const MIN_MANUAL_INPUT_SECONDS_PER_ROW = 1;
export const MAX_MANUAL_INPUT_SECONDS_PER_ROW = 3600; // 1 jam/baris — batas atas masuk akal, cegah admin salah ketik
