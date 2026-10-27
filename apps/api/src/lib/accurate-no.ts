import { normalizeKeyValue } from "./input-hygiene";

// Nomor master Accurate (customerNo dst) dicocokkan PERSIS oleh `list.do` (huruf besar-kecil diabaikan, spasi TIDAK) - Fase 210 (spasi ujung), Fase 211 lapis 2
// (ADR-0052): aturan normalisasi kolom kunci dipusatkan di `input-hygiene.ts`; fungsi ini tinggal pintu pakai untuk satu nilai.
export function normalizeAccurateNo(value: unknown): string {
  return normalizeKeyValue(String(value ?? ""));
}
