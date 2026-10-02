# ADR-0040: Batal Import Generik untuk 19 Modul Sederhana

**Status:** Accepted
**Tanggal:** 2026-10-02

## Context

"Batal Import" (hapus transaksi ASLI dari Accurate, bukan cuma riwayat
lokal) sejak Fase 09/13 (ADR-0013/0014) cuma ada di 2 modul:
`purchase_invoice` & `sales_invoice`. User eksplisit meminta ini berlaku
untuk SEMUA modul, plus warning destructive yang eksplisit menyebut DUA
efek (hapus permanen di Accurate, DAN status lokal di Facport berubah).

Sambil investigasi permintaan ini, ditemukan BUG NYATA (dicatat terpisah
di `docs/lessons-learned.md` 2026-10-02): endpoint `/cancel` untuk PI/SI
TIDAK pernah di-gate `ownsDataUsaha` — anggota tim (seat) manapun bisa
memicu hapus transaksi akuntansi asli client. Sudah diperbaiki sebelum
ADR ini (bukan scope ADR ini, dicatat supaya tidak terulang di modul baru
di bawah).

## Riset Kunci

1. Kompleksitas PI/SI (susutkan faktur gabungan, blokir kalau ada baris
   tanpa `accurateDetailItemId`, § ADR-0013/0014) muncul HANYA karena
   fitur Retry Cerdas (ADR-0012) bisa APPEND item batch baru ke faktur
   `save.do` existing — 1 faktur Accurate bisa berisi item dari BANYAK
   batch. Grep `findExisting`/`append` di seluruh `import-mapping/*.ts`
   dan `workers/index.ts` mengonfirmasi **pola ini HANYA ada di
   purchase_invoice & sales_invoice** — modul lain SELALU 1 batch = 1
   dokumen Accurate (komentar eksplisit "TANPA findExisting/append" sudah
   ada di beberapa modul, mis. Receive Item/Sales Receipt/Purchase Order).
2. Cek `docs/referencehtml/accurate-openapi.json`: SETIAP modul transaksi
   punya `delete.do` pasangan `save.do`-nya, dengan kontrak IDENTIK —
   `DELETE`, query param `id` (integer), respons envelope polos `{s,d}`
   (bukan `{s,d,r}` seperti `save.do`).

Karena merge lintas-batch TIDAK ADA di 19 modul lain, logic Cancel-nya
JAUH lebih sederhana: tiap `accurateTransactionId` dalam 1 batch pasti
100% milik batch itu — tidak perlu cek `accurateDetailItemId`/blokir
lintas-batch sama sekali.

## Decision

1. **1 fungsi generic, bukan 19 wrapper duplikat.** `deleteAccurateDocument(ctx, accuratePath, id)`
   di `apps/api/src/lib/accurate-generic-delete.ts` dipakai semua 19
   modul (parameter `accuratePath` beda per modul) — kontrak HTTP-nya
   literal identik di spec Accurate, jadi ini BUKAN abstraksi prematur
   (beda dari filosofi "duplikasi dulu" project untuk logic BISNIS yang
   bisa berbeda-beda; ini murni kontrak eksternal tetap).
2. **Job worker cabang generic TERPISAH, BUKAN gabung ke logic PI/SI
   yang ada** — supaya logic PI/SI yang sudah teruji (dan rawan regresi
   kalau disentuh) tetap utuh. Cabang baru di `CANCEL_IMPORT`
   (`workers/index.ts`) jalan duluan untuk 19 modul ini (`return` di
   akhir), logic PI/SI lama tidak pernah tersentuh untuk module key lain.
3. **19 route baru WAJIB owner-gated SEJAK AWAL** (`ownsDataUsaha` →
   403 `CANCEL_OWNER_ONLY`), meniru fix PI/SI, BUKAN pola lama
   (`permission: "import.create"` polos) — supaya celah yang baru
   ditemukan di PI/SI tidak terulang di modul baru.
4. **OAuth scope `{module}_delete` BARU untuk 19 modul** — koneksi
   Accurate yang SUDAH terhubung sebelum rilis ini TIDAK otomatis dapat
   scope ini (1 otorisasi per akun Accurate, ADR-0036/0037, scope
   diberikan saat consent, bukan ditambah diam-diam). Decision: route
   `/cancel` cek `checkSubscriptionScopes` dulu (409
   `ACCURATE_SCOPE_MISSING` kalau belum) — BUKAN memaksa migrasi/re-auth
   otomatis. User existing cukup sambungkan ulang Accurate (gerbang
   koneksi yang sudah ada) kapan pun mereka butuh fitur ini — tidak
   mengganggu fitur lain yang sudah jalan dengan scope lama.
5. **1 dialog frontend generic** (`generic-cancel-import-dialog.tsx`),
   dipakai 19 modul via prop `onConfirm` (call Eden Treaty milik
   masing-masing modul ditulis di titik pakai, § `import-batch-table.tsx`)
   — BUKAN index string ke client Eden (butuh `as any`, kehilangan
   type-safety end-to-end yang jadi alasan ADR-0001 pilih Eden).
6. **Job Costing TIDAK termasuk** (2 dokumen Accurate berurutan per
   grup — `job-order/save.do` lalu `material-adjustment/save.do`, order
   hapus yang benar belum diputuskan) — sengaja ditunda ke fase terpisah
   (keputusan eksplisit user, pacing bertahap). `vendor_payable_account`
   juga TIDAK termasuk — modul itu sinkronisasi data master (Akun Hutang
   Pemasok), bukan transaksi, tidak punya semantik "batal".

## Alternatif yang Dipertimbangkan

- **Satu dialog + 1 endpoint generic lintas-modul (`POST
  /import/:batchId/cancel?module=X`)** — DITOLAK: melanggar konvensi
  project "1 file per modul" untuk route (`routes/*.ts`), dan
  `moduleAccess` macro Elysia butuh literal string per route untuk gate
  subscription per modul, bukan dinamis dari query param.
- **Reuse logic job PI/SI dengan tambahan `if` per modul** — DITOLAK:
  logic PI/SI (blokir faktur gabungan, dsb) sudah kompleks dan sudah
  diverifikasi empiris; menambah cabang di tengahnya menambah risiko
  regresi untuk fitur yang sudah stabil, padahal 19 modul baru ini logic
  aslinya JAUH lebih sederhana.

## Konsekuensi

- **Positif**: 19 modul dapat Cancel tanpa 19x kode nyaris identik;
  logic PI/SI yang sudah teruji tidak tersentuh sama sekali.
- **Trade-off**: customer existing yang sudah subscribe salah satu dari
  19 modul ini HARUS reconnect Accurate dulu sebelum bisa pakai Cancel
  (scope baru) — dikomunikasikan via toast jelas (`ACCURATE_SCOPE_MISSING`),
  bukan silent fail.
- **Trade-off**: Job Costing masih belum punya Cancel — known limitation
  eksplisit, bukan kelupaan (lihat phase doc).

## Referensi

- ADR-0013/0014 — asal mekanisme Cancel (PI/SI), alasan kompleksitas
  merge lintas-batch yang TIDAK berlaku di ADR ini.
- ADR-0036/0037 — model 1 otorisasi per akun Accurate, kenapa scope baru
  tidak otomatis ada di koneksi lama.
- `docs/architecture/architecture-batal-import-generic.md` — detail
  implementasi.
- `docs/phases/phase-165-batal-import-generik-19-modul.md` — eksekusi.
- `docs/lessons-learned.md` 2026-10-02 — bug ownership PI/SI yang jadi
  pemicu audit ini.
