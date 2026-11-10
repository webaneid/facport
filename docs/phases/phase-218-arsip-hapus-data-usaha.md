# Fase 218 — Hapus & arsip Data Usaha oleh pemilik

**Status:** Done — dirilis v2.51.0 (2026-11-10); diuji manual di browser dev
**Mulai:** 2026-11-10
**Selesai:** 2026-11-10

## Tujuan
Pemilik dapat merapikan daftar di `/pilih-usaha`: Data Usaha kosong dihapus bersih, yang punya riwayat diarsipkan (bisa dipulihkan). Keputusan: ADR-0055. Rancangan: `docs/architecture/architecture-data-usaha-archive.md`.

## Scope
- [x] Migrasi `data_usaha.archived_at`
- [x] `lib/data-usaha-lifecycle.ts`: klasifikasi (delete/archive/blocked) dan penghalang; tes unit
- [x] Endpoint lifecycle, delete, archive, restore, daftar terarsip (pemilik saja, transaksi + kunci baris, audit, laju)
- [x] Putus Accurate wajib saat arsip dan hapus (pointer + database dikosongkan, koneksi dicabut bila tak dipakai Data Usaha lain, peristiwa riwayat)
- [x] Job pembersihan harian arsip > 30 hari (cakupan menunggu keputusan, arch § 9)
- [x] Pengecualian terarsip di `ownsDataUsaha`, `hasAccessToDataUsaha`, akses seat, default Data Usaha; cek semua pemakai
- [x] Pesan `DATABASE_ALREADY_USED` mengarahkan ke Pulihkan
- [x] UI `/pilih-usaha`: menu aksi, dialog, bagian Diarsipkan + Pulihkan; penanda di admin
- [x] Tes rute + web; typecheck nol; tinjauan keamanan (sendiri); bersihkan DB dev; docs

## Di Luar Scope
Aksi admin atas nama pelanggan; hapus catatan keuangan; aksi massal.

## Keputusan (semua disetujui user 2026-11-10)
1. ~~Kosong tapi terhubung Accurate~~ — DISETUJUI: boleh dihapus, koneksi diputus dulu.
2. ~~User Tambahan aktif~~ — DISETUJUI: menghalangi arsip, dicabut manual.
3. Masa simpan arsip 30 hari lalu dibersihkan — DISETUJUI, cakupan pembersihan disetujui (arch § 9).
4. ~~Arsip wajib memutus Accurate~~ — DISETUJUI (pelanggan mengira sudah tiada).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error
- [x] Security review dijalankan
- [x] Temuan Critical/High diperbaiki
- [x] Temuan Medium/Low dicatat di lessons-learned bila ditunda
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
Lihat `architecture-data-usaha-archive.md` § 8.

## Keputusan Kecil Selama Eksekusi
- Kolom `archive_cleaned_at` ditambahkan di migrasi 0054 (selain `archived_at`) supaya job harian tidak memproses ulang cangkang tiap hari dan pulihkan tertolak setelah dibersihkan.
- Pembersihan 30 hari membuang data AutoProduksi dan sisa riwayat import; baris `member_seats` (termasuk yang sudah dicabut), invoice, pesanan, langganan, `conversion_logs`, audit, klaim trial tetap (membuat cangkang tersembunyi bila masih ada yang merujuk).
- Putus Accurate saat arsip/hapus memakai pola `admin/data-usaha.route.ts` (pointer + database dikosongkan; koneksi akun dicabut bila tak dipakai Data Usaha lain; audit `disconnect_accurate` dengan `via`).
- Pemeriksaan akses terpusat: `ownsDataUsaha`, `hasAccessToDataUsaha`, `memberAccessibleDataUsahaIds`, default Data Usaha, dan pemilihan koneksi menolak yang diarsipkan; rute admin yang memakai `ownsDataUsaha` ikut tertolak.

## Ringkasan Hasil
Pemilik dapat menghapus Data Usaha kosong dan mengarsipkan yang punya riwayat dari `/pilih-usaha`, dengan Accurate diputus, penghalang jelas (langganan aktif, pesanan belum selesai, transfer tertunda, import berjalan, User Tambahan aktif), konfirmasi ketik nama, pulihkan dalam 30 hari, dan job harian pembersihan. Tes baru: 14 tes API (lifecycle) + 9 tes web; typecheck nol, lint bersih. Uji manual browser dev (akun uji sekali pakai) lolos: dialog arsip, arsip (kartu hilang, Accurate terputus, audit), pulihkan, hapus Data Usaha kosong yang terhubung (baris dan koneksi terhapus), tampilan penghalang (langganan aktif), cookie Data Usaha aktif yang menunjuk arsip dikembalikan ke `/pilih-usaha`. Temuan visual: bagian Diarsipkan awalnya menempel di dasar halaman, dipindah ke bawah daftar. Belum: rilis (migrasi 0054 menambah dua kolom, worker berubah).

## Known Limitations (tambahan)
- Tidak ada kunci terhadap langganan yang dibuat bersamaan dengan arsip (balapan oleh pemilik sendiri; dampak: arsip dengan langganan baru, tertangkap pembersihan hanya bila langganan itu tidak ada).
- Laporan Insight masih menghitung Data Usaha terarsip dalam total Data Usaha per pelanggan (koneksinya sudah diputus; tidak dihitung terhubung).
