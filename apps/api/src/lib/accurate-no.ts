import { cleanCell } from "./input-hygiene";

// Nomor master Accurate (customerNo dst) dicocokkan PERSIS oleh `list.do` (huruf besar-kecil diabaikan, spasi TIDAK) - spasi/karakter tak terlihat
// hasil salin Excel ("CUST IN ") membuat customer yang sudah ada dianggap tidak ada (Fase 210). Pembersihan karakter tak terlihat dipusatkan di
// `input-hygiene.ts` (Fase 211, ADR-0052); fungsi ini tempat lapis 2 (normalisasi kolom kunci) dipasang.
export function normalizeAccurateNo(value: unknown): string {
  return cleanCell(String(value ?? ""));
}
