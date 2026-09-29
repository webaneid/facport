import type { NavItem } from "./sidebar";

// § Fase 159 — DIPISAH dari sidebar.tsx (file "use client" yang import
// `next/navigation` dkk) supaya bisa di-unit-test murni tanpa runtime
// Next.js — ketemu SAAT eksekusi: import langsung dari sidebar.tsx bikin
// test gagal ("Export named 'usePathname' not found") begitu dijalankan
// sebagai bagian full suite (bukan file tunggal terisolasi).
//
// Fungsi ini fix bug NYATA yang ditemukan saat browser-test AutoProduksi:
// substitusi lama "tampilkan nama Plan" (§ `app/(protected)/layout.tsx`,
// diminta user 2026-09-05 "biar customer tahu link itu bagian paket apa")
// ASUMSI 1 moduleKey = 1 item nav (benar untuk SEMUA 23 modul Facport + 16
// Konverter). AutoProduksi PERTAMA KALI melanggar asumsi itu — 3 item nav
// ("List Formula"/"Input Produksi"/"Riwayat Produksi") sengaja berbagi
// SATU moduleKey yang sama (`autoproduksi_production`, 1 SKU/plan yang
// sama, § architecture-autoproduksi.md) — substitusi lama bikin KETIGANYA
// tampil nama Plan yang SAMA PERSIS, tidak bisa dibedakan sama sekali.
//
// Fix: substitusi HANYA dipakai kalau moduleKey itu CUMA dipakai 1 item di
// antara item-item SAUDARA (`siblingItems`, konteks render yang sama) —
// begitu moduleKey dipakai >1 item, fallback ke `item.label` (label
// fungsional tiap halaman) untuk SEMUA item itu, supaya customer tetap
// bisa membedakan mana yang mana.
export function resolveNavLabel(item: NavItem, siblingItems: NavItem[], modulePlanNames?: Record<string, string>): string {
  if (!item.moduleKey) return item.label;
  const sameModuleCount = siblingItems.filter((i) => i.moduleKey === item.moduleKey).length;
  if (sameModuleCount > 1) return item.label;
  return modulePlanNames?.[item.moduleKey] || item.label;
}
