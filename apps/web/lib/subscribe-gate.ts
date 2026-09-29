// § Fase 161 — dipisah jadi fungsi murni dari `SubscribeFormInner` lama
// (`subscribe-form.tsx`, sebelumnya inline 1 baris tanpa test sama sekali)
// supaya dapat unit test, konsisten prinsip project "logic murni dipisah
// dari file 'use client' supaya testable" (§ `resolve-nav-label.ts`).
//
// § Fase 127 lanjutan (diminta user 2026-09-15) — "Tambahan Anggota" cuma
// masuk akal begitu Data Usaha ini SUDAH punya minimal 1 fitur AKTIF YANG
// DIBAYAR (bukan trial — trial gratis, belum "membeli"), dari Produk
// MANAPUN (Facport/Konverter/AutoProduksi). `activeModuleMap` (dari
// `GET /me/subscriptions`, sudah di-scope 1 Data Usaha) map moduleKey ->
// `isTrial`; `=== false` berarti aktif ASLI.
export function hasAnyRealActiveSubscription(activeModuleMap: Map<string, boolean>): boolean {
  return [...activeModuleMap.values()].some((isTrial) => isTrial === false);
}
