# Fase 184 — Nomor Formula otomatis (AutoProduksi)
**Status:** Done (menunggu verifikasi manual pemilik sebelum rilis) · **Mulai:** 2026-10-09

## Tujuan
Nama Formula boleh kembar (keputusan Fase 166 tetap), tetapi tiap Formula punya **nomor internal otomatis** (F-001, F-002, …) supaya yang kembar bisa dibedakan di List Formula, autocomplete Input Produksi, riwayat, dan pesan error. Nomor murni internal AutoProduksi — tidak dikirim ke Accurate.

## Keputusan (pemilik, 2026-10-09)
- Nomor otomatis, **tidak bisa dikustom**; tidak ada kolom nomor di Excel Import Formula **maupun** Import Produksi (agar user tidak mengira nomor bisa diketik/dikustom). Import Produksi tetap mencocokkan lewat nama; nama ganda → baris gagal dengan pesan menyebut nomor-nomor kandidat.
- Urutan **per Data Usaha**; penghitung = 1 kolom integer di `data_usaha` (diambil atomik, tanpa tabel baru). Nomor tidak dipakai ulang walau Formula dihapus. Formula lama diberi nomor menurut urutan dibuat.
- Pencarian nama **tidak peka huruf besar/kecil** di List Formula, autocomplete Input Produksi, dan pencocokan Import Produksi; pencarian juga bisa lewat nomor.
- Format tampilan `F-001` (minimal 3 digit; >999 tetap bertambah digit).

## Scope
- Migrasi 0047: `data_usaha.formula_last_number`, `autoproduksi_formulas.formula_number` (backfill, NOT NULL, unik per Data Usaha).
- Alokasi nomor di pembuatan manual & Import Formula; API mengembalikan `formulaCode`.
- Web: kolom No. di List Formula + pencarian by nomor; autocomplete Input Produksi `F-007 · Nama`; riwayat produksi.
- Worker Import Produksi: cocokkan nama tanpa peka huruf; pesan nama ganda menyebut nomor kandidat.

## Di luar scope
- Nomor di Excel, penggantian nama otomatis, perubahan format penomoran.

## Ringkasan Hasil
Migrasi 0047 (backfill urutan dibuat per Data Usaha, NOT NULL, unik per Data Usaha). `lib/formula-number.ts` (alokasi atomik, `F-001`). API List/detail/PATCH/POST/riwayat membawa `formulaCode`; edit tidak mengubah nomor; input nomor dari klien diabaikan. Worker Import Produksi: pencocokan nama `lower(trim())`, galat nama ganda menyebut nomor kandidat. Web: kolom No. + pencarian nama/nomor di List Formula, autocomplete Input Produksi `F-007 · Nama`, riwayat produksi; label template Import Produksi diperbarui. Tes: API 2124, web 402 lulus.

Security review (inline; tidak ada endpoint/input baru): nomor hanya dibuat server, diambil atomik (uji 4 pembuatan paralel), dibatasi unik per Data Usaha oleh indeks; Data Usaha lain tidak terlihat (query tetap ter-scope subscription).

## Known Limitations
- Formula yang namanya sama TETAP gagal di Import Produksi Excel sampai salah satu dinonaktifkan/diganti namanya (tidak ada nomor di Excel — keputusan pemilik).
- Nomor dari Data Usaha yang sudah berjalan diisi menurut `created_at` (Formula lama).
- Deploy butuh migrasi 0047 → runbook Full + backup.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error
- [x] Lint nol error
- [x] Security review dijalankan
- [x] Temuan Critical/High diperbaiki
- [ ] Verifikasi manual pemilik sebelum merge ke `main`
- [x] `docs/PROGRESS.md` diupdate
