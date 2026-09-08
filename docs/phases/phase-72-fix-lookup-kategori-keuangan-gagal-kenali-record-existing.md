# Fase 72 — Fix Lookup Kategori Keuangan Gagal Kenali Record yang Sudah Ada

**Status:** Done (kode selesai, SENGAJA belum di-push — menunggu konfirmasi user)
**Mulai:** 2026-09-09
**Selesai:** 2026-09-09

## Tujuan
Client retest isi beberapa slot "Kategori Keuangan" sekaligus ("ATES 1"
s/d "ATES 6", 1 nilai unik per slot) — batch GAGAL TOTAL dengan error
Accurate: `Sudah ada data lain dengan Nama "ATES 1"`. Ini pesan
PENOLAKAN `save.do` (mencoba CREATE record baru dengan nama yang
TERNYATA sudah ada) — bukan error validasi biasa. Artinya
`findDataClassificationByName` (Fase 68) GAGAL mengenali record "ATES
1" yang sebenarnya SUDAH ADA di Accurate (kemungkinan dari
attempt/retry sebelumnya), sehingga kode lanjut coba `save.do` CREATE
lagi dan ditolak — 1 error ini menggagalkan SELURUH grup/faktur
(exception dari `ensureDataClassifications` dilempar SEBELUM
`saveSalesInvoice` sempat dipanggil).

## Root Cause
`GET /api/data-classification/list.do` **responsnya TIDAK
terdokumentasi resmi** di spec Accurate (cuma "200: Success", tanpa
schema) — Fase 68 MENGASUMSIKAN field balik bernama persis `index`
(sama seperti nama parameter query `index` yang dikirim), lalu
mencocokkan `d.index === index` di sisi kita SEBELUM menganggap record
"ditemukan". Asumsi ini TIDAK PERNAH diverifikasi ke response nyata
(belum ada kesempatan test end-to-end sebelum Fase 68 di-deploy).
Kalau field itu TIDAK BERNAMA `index` di response asli (atau
tipe/formatnya beda), `d.index === index` SELALU `false` — jadi
`findDataClassificationByName` SELALU melaporkan "tidak ditemukan"
walau recordnya SEBENARNYA ada, memicu percobaan CREATE ulang yang
ditolak Accurate.

## Scope
- [x] `findDataClassificationByName` (`accurate-data-classification.ts`)
      — hapus syarat `d.index === index` yang tidak terverifikasi,
      cocokkan HANYA berdasarkan `name` (case-insensitive, trim) —
      percaya parameter query `index` yang SUDAH dikirim ke Accurate
      untuk filter server-side, jangan syaratkan bentuk field response
      yang tidak pasti.
- [x] `findOrCreateDataClassification` — tambah `try/catch` di sekitar
      `save.do`: kalau Accurate menolak dengan pesan mengandung "sudah
      ada data lain" (regex case-insensitive), diamkan (return
      `undefined`) alih-alih melempar exception — ini pengaman LAPIS
      KEDUA kalau lookup di atas MASIH gagal mengenali record existing
      karena alasan lain yang belum diketahui (mis. race condition
      antar baris, delay propagasi data di sisi Accurate, dst). Return
      value fungsi ini TIDAK dipakai caller (`ensureDataClassifications`),
      jadi aman.
- [x] Typecheck 0 error, full test suite pass (460 — TIDAK ada test
      baru, konsisten pola existing: fungsi yang manggil `fetch`
      langsung ke Accurate tidak ada test unit-nya, sama seperti
      `accurate-customer.ts`/`accurate-item.ts`).

## Referensi
- Architecture doc: `docs/architecture/architecture-sales-invoice.md`.
- Fase terkait: Fase 68 (implementasi awal `findOrCreateDataClassification`,
  asumsi response shape yang KELIRU dikoreksi di sini).

## Keputusan Kecil Selama Eksekusi
- Dipilih **2 lapis pengaman** (lookup diperlonggar DAN catch error
  "sudah ada") bukan cuma salah satu — lookup yang diperlonggar
  menangani root cause UTAMA (asumsi field `index` yang salah), catch
  error jadi jaring pengaman kalau ternyata ada penyebab lain yang
  belum ketahuan (lebih defensif, biaya implementasi kecil).
- TIDAK menambah test baru — konsisten dengan pola existing project ini
  untuk fungsi yang manggil Accurate API langsung (tidak dimock, tidak
  ada test unit), lihat `apps/api/CLAUDE.md` § testing convention.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review — tidak relevan (murni fix logic internal,
      tidak ada input baru dari client, tidak ada endpoint baru).
- [x] `docs/PROGRESS.md` diupdate.

## Known Limitations
- BELUM diverifikasi end-to-end ke Accurate SUNGGUHAN dengan skenario
  PERSIS yang bikin bug ini muncul (butuh retest client) — fix ini
  ditulis berdasarkan analisis pesan error + kode, BUKAN dari
  eksperimen langsung ke response `list.do` (karena Claude tidak boleh
  akses production/Accurate langsung, § kebijakan sesi).
- **SENGAJA BELUM di-push** — menunggu konfirmasi user, sama seperti
  Fase 71 (akan digabung sebelum commit+push+release).

## Ringkasan Hasil
Bug ditemukan dari laporan client (error Accurate "Sudah ada data lain
dengan Nama 'ATES 1'" saat isi ulang beberapa slot Kategori Keuangan).
Root cause: asumsi shape response `list.do` (field `index`) yang tidak
pernah terverifikasi menyebabkan lookup existing record SELALU gagal.
Fix: lookup diperlonggar (cocokkan by name saja) + catch defensif untuk
error "sudah ada data lain" sebagai lapis kedua. `bun run typecheck` 0
error, `bun test` 460 pass/0 fail.
