# Fase 56 — Fix: Baris Import Tidak Dapat Error Message Saat Batch Gagal Dini

**Status:** Done
**Mulai:** 2026-09-08
**Selesai:** 2026-09-08

## Tujuan
User temukan batch production nyata (`379b65d8-90e4-4f29-8abb-70af74ddff74`,
modul Purchase Invoice) — status batch `"failed"` (sudah `completed_at`),
TAPI kedua baris di dalamnya masih `"pending"` tanpa `errorMessage` sama
sekali. Admin lihat kolom "ID Transaksi Accurate / Error" kosong total
("-"), tidak tahu penyebab batch gagal. Ditelusuri: bug di
`apps/api/src/workers/index.ts`, SEBELUM percabangan per modul (baris
~790) — jadi berpotensi kena SEMUA 6 modul import, bukan cuma Purchase
Invoice.

## Root Cause
2 titik "gagal dini" (SEBELUM loop per-baris mulai) di job
`IMPORT_TO_ACCURATE`:
1. Koneksi Accurate belum ada / `accurateDbId` belum dipilih
2. `openAccurateSession()` gagal (token/sesi Data Usaha bermasalah)

Di kedua titik ini, cuma `importBatches.status` yang di-set `"failed"`
— baris-baris (`importBatchRows`) TIDAK PERNAH disentuh, tetap
`"pending"` tanpa `errorMessage`. Ini melanggar
`architecture-accurate-integration.md` § 5 yang eksplisit mewajibkan
`errorMessage` actionable untuk SEMUA kegagalan (bukan cuma kegagalan
per-baris DI DALAM loop, yang sudah benar sejak awal — lihat 6 titik
`errorMessage` lain di file yang sama, semua di DALAM percabangan per
modul, semua sudah benar).

## Scope
- [x] `apps/api/src/workers/index.ts` — helper baru `failAllPendingRows(batchId, errorMessage)`, dipanggil di KEDUA titik gagal-dini (sebelum percabangan per modul → otomatis berlaku ke ke-6 modul)
- [x] `docs/architecture/architecture-accurate-integration.md` § 5 — catatan bug ini + link ke phase doc

## Referensi
- Architecture doc: `docs/architecture/architecture-accurate-integration.md` § 5 "Error Handling"
- Batch production yang jadi bukti nyata: `379b65d8-90e4-4f29-8abb-70af74ddff74`

## Keputusan Kecil Selama Eksekusi
- Fix ditaruh SEBELUM percabangan `if (batch.module === "purchase_invoice")` dst — otomatis berlaku ke SEMUA modul tanpa perlu diulang 6x, sesuai instruksi eksplisit user ("pastikan worker ini bekerja di semua modul import kita").
- TIDAK menambah notifikasi customer baru untuk kasus ini — dicek dulu, ternyata TIDAK ADA notifikasi customer untuk hasil import batch sama sekali (baik sukses maupun gagal) di kode yang sudah ada, jadi menambah notifikasi di sini saja akan INKONSISTEN dengan pola existing. Dicatat sebagai potensi improvement terpisah di Known Limitations, bukan dikerjakan sekarang (di luar scope laporan bug ini).
- Filter row yang di-update: `status IN ('pending','failed')` — sama persis filter yang sudah dipakai buat fetch `rows` sebelum loop (baris ~778) — retry batch yang sebelumnya gagal-dini juga ikut ke-refresh error message-nya kalau gagal-dini lagi.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review dijalankan (inline) — `err.message` yang dimasukkan ke `errorMessage` diverifikasi TIDAK PERNAH berisi token/secret (ditelusuri sampai `openDatabase()`/`AccurateApiError`, cuma teks dari Accurate sendiri atau status HTTP generik)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — 0 temuan
- [x] Temuan Medium/Low dicatat — lihat Known Limitations
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- `apps/api/src/workers/index.ts` TIDAK PUNYA test file sama sekali
  (gap pre-existing, bukan cuma untuk fix ini — pg-boss `.work()`
  callback sulit di-unit-test tanpa refactor/extract function ke module
  scope + export, di luar scope perbaikan bug ini). Diverifikasi lewat
  code review manual + trace ke data production nyata, BUKAN test
  otomatis.
- Tidak ada notifikasi customer untuk import batch gagal-dini (atau
  gagal apa pun) — gap yang SUDAH ADA sebelumnya, bukan regresi dari
  fix ini. Kalau customer perlu tahu tanpa harus cek halaman sendiri,
  perlu fase terpisah nambah tipe notifikasi baru.
- Batch production `379b65d8-...` yang jadi bukti nyata TIDAK diperbaiki
  datanya secara retroaktif (baris-barisnya tetap "pending" tanpa
  errorMessage sampai sekarang) — fix ini cuma mencegah KEJADIAN BARU,
  bukan backfill data lama. User bisa retry batch itu manual (tombol
  retry yang sudah ada) untuk dapat error message yang benar kalau
  masih relevan.

## Ringkasan Hasil
Bug ditemukan dari data production nyata: batch bisa gagal SEBELUM
proses per-baris mulai (koneksi Accurate belum ada / sesi Data Usaha
gagal dibuka), dan sebelum fix ini baris-barisnya dibiarkan "pending"
tanpa error message — admin lihat batch "failed" tapi tabel baris
kosong total, tidak tahu penyebabnya. Fix: helper `failAllPendingRows()`
dipanggil di kedua titik gagal-dini, SEBELUM percabangan per modul —
otomatis berlaku ke ke-6 modul import (Purchase Invoice, Sales
Invoice, Purchase Payment, Sales Receipt, Journal Voucher, Vendor
Payable Account), bukan cuma modul tempat bug ditemukan.

Full suite `apps/api` 415 pass/0 fail (tidak ada test baru — gap
pre-existing worker tanpa test sama sekali, dicatat di Known
Limitations). Typecheck 0 error. Security review inline: 0 temuan.
