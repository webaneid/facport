# Fase 189I — Halaman Profil: Data Diri Lengkap (Nama, Email, Perusahaan, Telepon, WhatsApp)

**Status:** Done
**Mulai:** 2026-10-13
**Selesai:** 2026-10-13

## Tujuan
Temuan setelah rilis v2.34.0: tabel Insight menampilkan Nama·Email·Perusahaan·Telepon·WhatsApp, tetapi halaman `/profile` (pelanggan dan admin) hanya punya Nama + Ganti Password. Kontak hanya bisa diisi lewat modal Lengkapi Profil (layout pelanggan; admin/staf tidak pernah melihatnya) → banyak kolom Insight kosong dan pelanggan yang sudah menutup modal tidak punya tempat mengubahnya. Fase ini menambahkan seluruh data diri ke `/profile` agar bisa dilihat dan diubah mandiri.

## Mode kerja
Kecil, murni UI web (API `GET /me` dan `PATCH /me/contact` sudah ada, Fase 189A) → eksekusi langsung + TDD, tanpa subagent. Security review di sesi utama (≤3 file). **Tidak dirilis** sampai user memerintahkan.

## Scope
- [x] W1 `ProfileSettings` (dipakai surface `app` & `admin`): kartu **Data Diri** — Nama (bisa diubah, `authClient.updateUser`), Email (hanya baca), Nama Perusahaan, Telepon, WhatsApp (`ContactFields`, `PATCH /me/contact`), satu tombol Simpan.
- [x] W2 Validasi klien sama dengan modal (`validateContact`); galat server per-field (`INVALID_CONTACT`) ditampilkan; nilai terisi dari `GET /me`.
- [x] W3 Tes komponen (muat nilai, simpan nama saja bila kontak tak berubah, validasi, galat server, sukses).
- [x] D1 `architecture-contact.md` (alur "Profil"), PROGRESS, phase doc.

## Di luar scope
Mengubah email sendiri (tetap lewat admin); verifikasi OTP nomor; menjadikan kontak wajib untuk admin/staf; mengubah modal Lengkapi Profil.

## Keputusan
- Kontak disimpan lewat endpoint yang sama dengan modal (validasi + normalisasi E.164 di server); semua tiga isian wajib sah saat Simpan (aturan API tidak diubah).
- Satu form/satu tombol: nama dan kontak disimpan berurutan; kegagalan salah satunya tidak menyembunyikan yang lain (pesan terpisah).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error; lint bersih
- [x] Tes web hijau (suite penuh)
- [x] Security review
- [x] Dokumen + PROGRESS diupdate

## Known Limitations
- Akun yang kontaknya masih kosong tetap kosong sampai pemiliknya membuka `/profile` (atau modal untuk pelanggan); Insight akan menampilkan `—` untuk mereka. Pengisian massal tidak dibuat (bukan wewenang kita menebak data).
- Email tetap tidak bisa diubah sendiri (admin lewat detail user).
- Tampilan belum dilihat di browser.

## Ringkasan Hasil
Kartu **Data Diri** di `/profile` (surface pelanggan & admin; komponen `ProfileSettings` bersama): Nama, Email (baca saja), Nama Perusahaan, Telepon, WhatsApp, satu tombol Simpan. Nama lewat Better Auth `updateUser`, kontak lewat `PATCH /me/contact` (tanpa perubahan API). Kontak dikirim hanya bila berubah; kontak kosong yang tidak disentuh tidak memaksa validasi.
**Verifikasi:** typecheck + lint bersih; web 552 lulus (8 tes baru). Tanpa perubahan API/DB → tes API tidak dijalankan ulang.
**Security review (sesi utama, ≤3 file):** tidak ada endpoint/izin baru; id dari sesi (tanpa IDOR); validasi + normalisasi tetap di server (`parseContact`); kontak tidak masuk log; teks dirender sebagai teks React. Tidak ada temuan.
**Status rilis:** BELUM dirilis (instruksi user).
