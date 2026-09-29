import { moduleProductLine, type ProductLineKey } from "./module-options";

// § Fase 161 — dipisah jadi fungsi murni (bukan inline di `page.tsx`)
// supaya bisa di-unit-test tanpa Next.js runtime, pola sama
// `resolve-nav-label.ts` (Fase 159). Dipakai Step 0 `/subscribe` untuk
// mendeteksi preselect dari landing (`?plans=<planId,...>`, § `module-features.tsx`)
// yang SUDAH di-resolve jadi daftar moduleKey oleh `subscribe-cart-context.tsx` —
// kalau moduleKey-moduleKey itu SEMUA berasal dari 1 Produk yang sama,
// customer langsung diarahkan ke halaman katalog Produk itu (bukan
// berhenti di Step 0) supaya alur klik-dari-landing tetap secepat sebelum
// redesain ini. Kalau preselect kosong atau lintas-Produk (jarang terjadi
// dalam praktik — landing selalu 1 checkbox-list per Produk), TIDAK ada
// auto-redirect, customer tetap di Step 0.
export function resolveSinglePreselectProductLine(moduleKeys: string[]): ProductLineKey | null {
  if (moduleKeys.length === 0) return null;
  const lines = new Set(moduleKeys.map((k) => moduleProductLine(k)).filter((l): l is ProductLineKey => Boolean(l)));
  return lines.size === 1 ? [...lines][0]! : null;
}
