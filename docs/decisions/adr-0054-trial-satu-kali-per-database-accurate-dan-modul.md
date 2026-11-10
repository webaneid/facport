# ADR-0054: Trial satu kali per database Accurate + modul (buku besar permanen), diklaim saat import pertama

**Status:** Proposed (2026-11-10, menunggu persetujuan user atas rencana Fase 217)
**Tanggal:** 2026-11-10
**Terkait:** `docs/architecture/architecture-subscription.md` § Trial, Fase 43 (trial), Fase 108 (trial per Data Usaha), ADR-0037 (koneksi per akun Accurate), `docs/architecture/architecture-trial-database-ledger.md`, Fase 217

## Context
Trial kini dibatasi "1x per modul per Data Usaha" (`POST /subscriptions/trial`, Fase 108), dan kuota 100 baris dihitung dari `import_batch_rows`. Dua celah:
1. `dataUsahaId` hanya entitas lokal Facport. Pelanggan membuat Data Usaha baru (atau akun baru) lalu mendapat trial lagi di database Accurate yang sama.
2. Kuota dihitung dari `import_batch_rows` yang dipurge (retensi ±2 hari), sehingga pemakaian lama hilang dan kuota bisa dipakai ulang (tercatat di lessons-learned, belum diperbaiki).

Bukti produksi (2026-11-10, query hanya-baca): `accurate_db_id` konsisten (satu id tidak pernah punya dua alias) dan muncul lintas akun, jadi layak sebagai kunci global. Pengulangan trial belum terbukti terjadi, tetapi riwayat batch trial hampir seluruhnya sudah hilang karena retensi, sehingga ketiadaan bukti lemah. Total trial sepanjang waktu hanya 32. Beberapa database dipakai bersama banyak akun (satu id oleh 49 akun, dugaan database contoh Accurate).

## Decision
1. Trial dibatasi **satu kali seumur hidup per `(accurate_db_id, modul)`**, di seluruh akun dan Data Usaha, lewat tabel buku besar permanen `trial_claims` (indeks unik `(accurate_db_id, module)`).
2. **Klaim terjadi saat import pertama dikonfirmasi**, bukan saat trial dibuat. Pembuatan trial tetap boleh tanpa koneksi Accurate (alur "coba-coba dulu", Fase 109 tidak berubah). Pada `confirm`/`retry`, `checkTrialRowBudget` memastikan klaim: bila `(db, modul)` sudah diklaim langganan trial LAIN → tolak `TRIAL_DATABASE_ALREADY_USED`; bila milik langganan ini → lanjut.
3. **Kuota baris trial dihitung dari `trial_claims.rows_used`** (counter permanen, naik atomik saat baris berhasil), bukan dari `import_batch_rows`.
4. **Satu langganan trial hanya boleh mengklaim satu database** per modul (cegah celah memutus koneksi lalu memilih database lain).
5. **Daftar pengecualian** (pengaturan admin, `trial.exemptDbIds`): database contoh/pelatihan yang dipakai bersama banyak akun tidak dikunci; trial di sana tetap dibatasi per langganan seperti sekarang. Isi daftar diputuskan user, bukan oleh kode.
6. Admin (Super Admin, `users.manage`) dapat **melepas klaim** (diaudit) untuk salah klaim atau pengecualian yang disetujui.
7. Langganan berbayar TIDAK terpengaruh. Dua akun yang membeli paket asli untuk database yang sama tetap diizinkan.
8. Cakupan: modul import Accurate. Produk Konverter (Excel→XML Desktop, tanpa database Accurate) tidak punya kunci database, aturannya tidak berubah.
9. Data lama: buku besar diisi dari langganan trial yang sudah punya database terpilih (sekitar 7 pasangan, `rows_used` tidak diketahui → dianggap sudah dicoba). Tidak ada backfill baris (riwayat sudah dipurge).

## Alternatif yang Dipertimbangkan
- **Klaim saat trial dibuat (wajib pilih database dulu):** lebih ketat, tetapi mengubah alur "coba-coba dulu" Fase 109. Ditolak user: klaim saat import pertama saja.
- **Kunci per akun/email:** mudah dilewati dengan akun baru.
- **Kunci per perusahaan Accurate (bukan database):** id perusahaan belum terbukti stabil di data kita; ditunda.
- **Hanya memperbaiki counter kuota:** tidak menutup pengulangan lewat Data Usaha/akun baru.

## Konsekuensi
- Menutup pengulangan trial pada database yang sama dan kebocoran kuota akibat purge.
- Tidak menutup pelanggan yang membuat database baru di Accurate; diterima karena trial dibatasi 100 baris dan data lama tidak ikut pindah.
- Database yang dipakai bersama (konsultan, staf satu perusahaan) hanya mendapat satu trial per modul; disengaja. Database contoh perlu dimasukkan daftar pengecualian, jika tidak trial pertama mengunci semua akun lain.
- Perlu tes atomik (balapan dua trial mengklaim bersamaan) dan audit keamanan ringan.
