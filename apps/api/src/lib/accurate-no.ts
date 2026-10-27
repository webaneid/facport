// Nomor master Accurate (customerNo dst) dicocokkan PERSIS oleh `list.do` (huruf besar-kecil diabaikan, spasi TIDAK) — spasi di ujung hasil
// salinan Excel ("CUST IN ") membuat customer yang sudah ada dianggap tidak ada (Fase 210). NBSP/zero-width ikut dibuang.
export function normalizeAccurateNo(value: unknown): string {
  return String(value ?? "").replace(/[ ​﻿]/g, " ").trim();
}
