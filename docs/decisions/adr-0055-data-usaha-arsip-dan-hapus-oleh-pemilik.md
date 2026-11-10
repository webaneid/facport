# ADR-0055: Data Usaha — pemilik dapat menghapus yang kosong dan mengarsipkan yang punya riwayat

**Status:** Proposed (2026-11-10, menunggu persetujuan rencana Fase 218)
**Tanggal:** 2026-11-10
**Terkait:** ADR-0037 (koneksi per akun Accurate), ADR-0045 (siklus hidup akun), ADR-0054 (trial per database), `docs/architecture/architecture-data-usaha-archive.md`, Fase 218

## Context
Halaman `/pilih-usaha` hanya bisa membuat dan mengganti nama Data Usaha. Pelanggan yang salah membuat atau tidak melanjutkan tidak bisa merapikan daftarnya. Satu-satunya hapus ada di hapus permanen akun oleh Super Admin, dan hanya untuk Data Usaha kosong. Kekhawatiran awal (trial dipakai ulang lewat Data Usaha baru) sudah tertutup oleh ADR-0054: klaim trial menempel pada database Accurate, bukan Data Usaha, jadi menghapus atau mengarsipkan Data Usaha tidak mereset trial.

Fakta kode: Data Usaha dirujuk tanpa cascade oleh langganan, pesanan, seat User Tambahan, transfer kepemilikan, log konversi, dan data AutoProduksi. Hapus permanen hanya aman bila tidak ada baris yang merujuk.

## Decision (disetujui user 2026-11-10)
1. **Pemilik saja** yang boleh, tanpa persetujuan Super Admin. Member seat tidak boleh.
2. **Kosong → hapus permanen** (tidak ada baris yang merujuknya di tabel mana pun, diperiksa fail-closed dari katalog FK dengan logika yang sama dengan `account-erasure-db.ts`, dan hitungan import 0). Menghapus hanya membuang Data Usaha itu; koneksi akun Accurate tidak disentuh.
3. **Punya riwayat → arsip** (`data_usaha.archived_at`). Diarsipkan = disembunyikan dari `/pilih-usaha` dan tidak bisa dipakai (semua pemeriksaan kepemilikan/akses menolaknya), riwayat invoice/langganan/import/audit tetap utuh.
4. **Bisa dipulihkan oleh pemilik** kapan saja dari bagian "Diarsipkan".
5. **Arsip ditolak bila masih ada**: langganan aktif (berbayar maupun trial), pesanan/invoice belum selesai, transfer kepemilikan tertunda, import berjalan, atau User Tambahan aktif. Pelanggan diberi daftar penghalang yang jelas.
6. Aksi diaudit (`archive`, `restore`, `delete`) dengan pelaku; ada pembatasan laju; konfirmasi ketik nama Data Usaha untuk arsip dan hapus.
7. Klaim trial (ADR-0054) tidak dilepas oleh arsip maupun hapus.

## Alternatif yang Dipertimbangkan
- **Hapus permanen sampai ke riwayat:** merusak catatan keuangan dan jejak audit; ditolak.
- **Hanya Super Admin:** menambah beban tim; user memilih pemilik langsung.
- **Hanya hapus yang kosong:** Data Usaha yang pernah dipakai tidak bisa dirapikan sama sekali; ditolak user.

## Konsekuensi
- Data Usaha terarsip tetap memegang database Accurate-nya (aturan 1 database ↔ 1 Data Usaha). Membuat Data Usaha baru untuk database yang sama ditolak `DATABASE_ALREADY_USED`; pesan perlu mengarahkan ke "Pulihkan".
- Pemeriksaan kepemilikan/akses terpusat (`ownsDataUsaha`, `hasAccessToDataUsaha`, daftar akses seat) harus mengecualikan yang diarsipkan; admin tetap melihatnya dengan penanda.
- Perlu migrasi (satu kolom), tes tiap penghalang, dan audit keamanan (otorisasi, IDOR).
