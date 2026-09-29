import type { ProductLineKey } from "./module-options";

// § diminta user 2026-09-23 — judul+deskripsi section Produk di `/subscribe` (§ `ProductCatalogSection`)
// SEBELUMNYA cuma `productLineLabel()` (nama Produk pendek, dipakai LUAS di tempat lain — radio "Jenis Paket"
// admin, invoice, dst, JANGAN diubah jadi kalimat panjang) + deskripsi HARDCODE generik yang sama utk semua
// Produk ("Pilih fitur yang ingin Anda gunakan"). Map ini KHUSUS copy marketing section /subscribe per Produk —
// terpisah dari `productLineLabel()` supaya nama pendek itu tetap pendek di tempat lain.
// § Fase 161 — sekarang jadi judul+deskripsi HALAMAN KATALOG per-Produk
// (`/subscribe/[productLine]`), BUKAN lagi judul section yang ditumpuk
// (Fase 127 lama). Deskripsi AutoProduksi diperbarui dari placeholder
// (modulnya belum ada saat map ini ditulis) jadi deskripsi asli sekarang
// modulnya sudah live (Fase 159).
export const PRODUCT_LINE_SUBSCRIBE_COPY: Record<ProductLineKey, { title: string; description: string }> = {
  facport: {
    title: "Facport",
    description: "Pilih fitur yang ingin Anda gunakan",
  },
  konverter: {
    title: "Konverter XML Accurate Desktop",
    description: "Pilih fitur untuk konversi dari Excel ke XML untuk pengguna Accurate Desktop.",
  },
  autoproduksi: {
    title: "AutoProduksi",
    description: "Definisikan Formula/Resep produksi Anda, lalu pilih fitur Input Produksi di bawah ini.",
  },
};

// § Fase 161 — teaser 1 kalimat KHUSUS card Step 0 (`/subscribe`, pilih
// Produk dulu sebelum masuk katalog) — SENGAJA terpisah dari
// `PRODUCT_LINE_SUBSCRIBE_COPY` di atas (beda tujuan/panjang: ini harus
// muat di kartu kecil berdampingan, `PRODUCT_LINE_SUBSCRIBE_COPY` jadi
// judul halaman penuh). "Tambahan Anggota" BUKAN `ProductLineKey`
// (§ `architecture-user-tambahan.md`, ADR-0032 — seat menempel ke Data
// Usaha, bukan ke salah satu Produk) makanya di luar `Record<ProductLineKey,...>`,
// digabung manual di halaman Step 0.
export const PRODUCT_LINE_CARD_COPY: Record<ProductLineKey, string> = {
  facport: "Import ribuan transaksi Excel ke Accurate Online lewat cloud, satu klik — untuk pengguna Accurate Online.",
  konverter: "Konversi Excel jadi file XML siap-impor — untuk pengguna Accurate Desktop (Accurate 5), tanpa koneksi cloud.",
  autoproduksi: "Definisikan Formula/Resep produksi — sistem otomatis hitung & catat pemakaian bahan baku ke Accurate tiap produksi.",
};

export const SEAT_ADDON_CARD_COPY = "Ajak anggota tim akses Data Usaha ini — otomatis dapat semua fitur yang sedang aktif, apapun Produknya.";
