# ADR-0015: Facport Tanpa Harga Sementara (Supporting App)

**Status:** Accepted
**Tanggal:** 2026-08-28

## Context
ADR-0008 (Model Langganan) menetapkan Facport sebagai "BUKAN aplikasi
gratis" — `plans.price` (Rupiah) wajib diisi tiap paket, flow checkout
lewat payment gateway direncanakan (walau providernya, Ipaymu/Xendit,
belum final).

User (product owner) sekarang menegaskan, saat mulai membangun admin
dashboard (Fase 10): **untuk fase ini, Facport berperan sebagai aplikasi
supporting dari aplikasi utama** (bukan produk mandiri yang dijual
terpisah) — **TIDAK ADA HARGA**. Paket (plan) tetap dipakai untuk
membedakan akses MODUL (Penjualan/Pembelian/dst, § ADR-0008 tetap
berlaku untuk mekanisme gating ini), tapi dimensi harga/pembayaran
dihilangkan dari alur admin untuk saat ini.

## Decision
1. **`plans.price`: `NOT NULL` → nullable.** Kolom TIDAK dihapus (bukan
   migrasi destruktif) — cuma dilonggarkan supaya boleh kosong. Data plan
   lama yang sudah punya angka harga TETAP tersimpan apa adanya (tidak
   diubah paksa jadi NULL).
2. **Form admin (`/admin/plans`) TIDAK punya field harga sama sekali** —
   bukan cuma disembunyikan di CSS, field itu tidak ada di request
   body/schema Elysia route create/update plan.
3. **Flow payment/checkout (ADR-0008 § Self-Service) TIDAK disentuh** —
   memang belum final/belum diimplementasikan penuh, jadi tidak ada
   fitur berjalan yang perlu di-nonaktifkan. Kalau nanti flow itu
   dibangun, keputusan ini (ADR-0015) perlu ditinjau ulang dulu (ADR
   baru lagi, bukan asumsi otomatis "harga aktif lagi").
4. **ADR-0008 TIDAK diedit** — sudah `Accepted`, konvensi immutability
   project. Bagian ADR-0008 yang TETAP berlaku tanpa perubahan: dua
   jalur registrasi (self-service/admin-provisioned), gating akses modul
   per-subscription, downgrade otomatis saat expired. Cuma premis "bukan
   aplikasi gratis"/kewajiban `price` yang dikoreksi ADR ini.

## Alternatif yang Dipertimbangkan
- **Hapus kolom `price` sama sekali** — DITOLAK: tidak reversibel tanpa
  migration tambahan nanti, padahal keputusan "tanpa harga" eksplisit
  dibingkai user sebagai kondisi SEMENTARA ("sementara, aplikasi ini
  hanya supporting aplikasi utama").
- **Set semua `price` jadi `0` (bukan nullable)** — DITOLAK: `0` secara
  semantik berarti "gratis" (masih ada konsep harga, cuma gratis),
  sedangkan maksud user adalah dimensi harga itu sendiri TIDAK RELEVAN
  untuk fase ini — `NULL` merepresentasikan itu lebih akurat daripada
  `0`.

## Konsekuensi
- Form `/admin/plans` lebih sederhana (nama, durasi, modul, status aktif
  saja).
- Kalau/ketika Facport nanti jadi produk mandiri berbayar lagi, tinggal:
  (1) tambah field harga balik ke form admin, (2) isi `price` plan yang
  relevan, (3) bangun flow payment yang sudah direncanakan ADR-0008 —
  TIDAK perlu migration schema baru karena kolomnya sudah ada (nullable),
  cuma diisi.

## Referensi
- ADR-0008 — model langganan (bagian gating modul & registrasi tetap berlaku).
- `docs/phases/phase-10-admin-dashboard.md` — eksekusi.
