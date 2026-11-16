# Fase 219 — Keterangan otomatis pada Penyesuaian Persediaan (AutoProduksi)

**Status:** Done sisi kode + terverifikasi ke Accurate nyata 2026-11-17 (belum commit/rilis)
**Rencana induk:** `docs/phases/evaluasi-client-2026-11-16-rencana.md` (butir 1 + 2)

## Scope
- [x] `description` = `Input Dari AutoProduksi - <nama Barang Jadi>` (cadangan nama Formula)
- [x] `detailNotes` per baris: `Bahan Baku` / `Barang Jadi`
- [x] Tes unit payload (19 expect baru/ubah; suite `autoproduksi.test.ts` 17 pass), typecheck nol
- [x] `saveInventoryAdjustment()` meneruskan payload apa adanya (tidak ada daftar putih field)
- [x] Verifikasi nyata (akun uji dev, dokumen IA.2026.11.00001): respons Accurate memuat `description` = "Input Dari AutoProduksi - Bolu Kukus" dan `detailNotes` = "Bahan Baku" (baris ADJUSTMENT_OUT) / "Barang Jadi" (ADJUSTMENT_IN). Dokumen uji dihapus lagi.
- [ ] Tutup fase (PROGRESS) saat commit/rilis

## Catatan
Tidak ada migrasi, endpoint, atau input baru → tinjauan keamanan: tidak ada permukaan baru (teks berasal dari nama Formula milik pelanggan sendiri, dikirim sebagai JSON). Tes lain tidak mengacu literal lama.

## Temuan sampingan (untuk fase berikut)
- Akun Accurate dev tidak sama dengan data Formula lokal (kode barang/akun Formula lama tidak ada di sana); uji nyata memakai barang `BENCH-INV1/2`, akun `110403`, `Cabang 1`, gudang `Utama` dan Formula tiruan di memori. Akun multi-cabang menolak dokumen tanpa `branchName`.
- Baris ADJUSTMENT_OUT tanpa `unitCost` diterima Accurate (unitCost 0 di respons); ADJUSTMENT_IN dengan `unitCost` 1000 tercatat totalAmount 1000. Perilaku ADJUSTMENT_IN TANPA `unitCost` belum diuji → Fase 220.
