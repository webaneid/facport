import type { ProductLineKey } from "./module-options";

// § diminta user 2026-09-23 — judul+deskripsi section Produk di `/subscribe` (§ `ProductCatalogSection`)
// SEBELUMNYA cuma `productLineLabel()` (nama Produk pendek, dipakai LUAS di tempat lain — radio "Jenis Paket"
// admin, invoice, dst, JANGAN diubah jadi kalimat panjang) + deskripsi HARDCODE generik yang sama utk semua
// Produk ("Pilih fitur yang ingin Anda gunakan"). Map ini KHUSUS copy marketing section /subscribe per Produk —
// terpisah dari `productLineLabel()` supaya nama pendek itu tetap pendek di tempat lain.
export const PRODUCT_LINE_SUBSCRIBE_COPY: Record<ProductLineKey, { title: string; description: string }> = {
  facport: {
    title: "Facport",
    description: "Pilih fitur yang ingin Anda gunakan",
  },
  konverter: {
    title: "Konverter XML Accurate Desktop",
    description: "Pilih fitur untuk konversi dari Excel ke XML untuk pengguna Accurate Desktop.",
  },
  // § AutoProduksi belum punya modul apa pun (§ ADR-0033 "Eksplisit Di Luar Scope") — section-nya TIDAK PERNAH
  // dirender (`ProductCatalogSection` return null kalau 0 grup), copy ini cuma placeholder aman.
  autoproduksi: {
    title: "AutoProduksi",
    description: "Pilih fitur yang ingin Anda gunakan",
  },
};
