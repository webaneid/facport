# Fase 195 — Guard ukuran transaksi (nomor sama) + pesan timeout yang bermakna

**Status:** Done (2026-10-16, belum dirilis)
**Mulai:** 2026-10-16
**Selesai:** 2026-10-16

## Tujuan
Insiden 2026-10-14: file Sales Receipt pelanggan memakai SATU nomor penerimaan untuk ±1.250 baris → digabung jadi 1 transaksi → 1 panggilan `save.do` raksasa → Accurate tidak membalas dalam batas waktu ("The operation timed out." setelah ±6 menit), SEMUA baris gagal sekaligus; pelanggan mengulang 3x (1.248/1.239/1.539 baris) dan memakan antrean. Tingkat 1 (disepakati user): tolak lebih awal dengan pesan jelas + pesan timeout yang bermakna. Pecah-otomatis (tingkat 2) SENGAJA tidak dikerjakan: satu nomor = satu dokumen resmi (invoice/PO/DO) atau satu setoran bank (receipt), memecahnya mengubah catatan akuntansi — hanya boleh opsional dan eksplisit kalau pelanggan meminta.

## Scope
- [x] `lib/accurate-group-guard.ts`: `assertGroupSizeWithinLimit` (batas env `MAX_ROWS_PER_TRANSACTION`, default 1000, dijepit 50–10000), `GroupTooLargeError` (pesan: jumlah baris, batas, cara memperbaiki), `describeAccurateFailure` (timeout → penjelasan + "periksa dulu di Accurate agar tidak duplikat"; galat lain apa adanya).
- [x] Worker: guard dipasang di awal `try` pada 22 loop grup (SEMUA modul yang menggabungkan baris per nomor: Sales Receipt, Sales/Purchase Invoice, SO, DO, PO, Receive Item, dst); catatan galat baris lewat `describeAccurateFailure`.
- [x] Tes (9) + tes pagar: loop grup baru tanpa guard menggagalkan suite.
- [x] Env: `MAX_ROWS_PER_TRANSACTION` (opsional), contoh env, dokumen.

## Di luar scope
Pecah-otomatis per N baris; timeout buatan di HTTP (tidak mengubah perilaku koneksi); pengukuran batas aman nyata per modul.

## Keputusan Kecil Selama Eksekusi
- Batas default **1000 belum diukur** — konservatif dari kegagalan teramati (1.239–1.539 gagal; 1.249 sempat dibalas Accurate setelah ±4,7 menit). Tujuan utama: menolak kasus yang sudah terbukti gagal tanpa memblokir dokumen besar yang selama ini berhasil. Turunkan lewat env setelah ada ukuran.
- Guard di worker (bukan di route confirm): 22 loop seragam, kegagalan cepat (tanpa panggilan Accurate), pesan tampil di Detail per Baris. Pagar tes menjaga modul baru.
- Pesan timeout tidak mengklaim transaksi pasti gagal/berhasil; mengarahkan pelanggan cek di Accurate dulu. Pelanggan yang mengulang nomor yang sama biasanya ditolak Accurate bila transaksi pertama tersimpan ("nomor sudah ada") — inferensi, belum terbukti.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error
- [x] Suite API penuh hijau; data uji dibersihkan
- [x] Security review inline: 0 temuan (pesan hanya berisi angka; tidak ada input pengguna yang dirender; env di-parse dan dijepit)
- [x] `docs/PROGRESS.md`, lessons-learned

## Known Limitations
- Batas 1000 belum diukur; transaksi 500–1000 baris mungkin masih timeout (pesan timeout yang bermakna menangani itu).
- Tanpa batas waktu buatan, panggilan raksasa tetap menahan worker sampai timeout bawaan (±5–6 menit) untuk koneksi itu saja (Fase 167 membuat koneksi lain tetap jalan).
- Tingkat 2 (pecah-otomatis opsional) menunggu permintaan pelanggan.

## Ringkasan Hasil
Transaksi yang digabung dari baris bernomor sama dan melebihi batas ditolak seketika dengan pesan yang bisa ditindaklanjuti; timeout Accurate dijelaskan (cek Accurate dulu, jangan langsung import ulang). Berlaku untuk 22 modul bergrup lewat pagar tes.
