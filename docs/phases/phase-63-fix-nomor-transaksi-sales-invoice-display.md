# Fase 63 — Fix: Kolom "Nomor Faktur" di Halaman Hasil Import Sales Invoice Belum Sinkron dengan Grouping Trans No (Fase 49)

**Status:** Done
**Mulai:** 2026-09-08
**Selesai:** 2026-09-08

## Tujuan
Client evaluasi fitur Sales Invoice, poin 1: "PO Number/Bill No di
Accurate boleh sama walau beda transaksi, tapi Trans No harus
beda-beda per transaksi" — minta halaman ringkasan hasil import
menampilkan Nomor Transaksi (Trans No), bukan PO Number/Bill No.

## Root Cause
`apps/web/app/app/(protected)/sales-invoice/import/[batchId]/page.tsx`
(kolom tabel "Nomor Faktur", fungsi `invoiceNumberOf`/`siblingRowNumbersOf`/
`sortByInvoiceNumber`) adalah peninggalan Fase 13 — HANYA pakai kolom
PO Number, dan TIDAK PERNAH disinkronkan ke backend
`groupSalesInvoiceRows` (`sales-invoice.mapping.ts`) yang sejak **Fase
49** sudah DIUTAMAKAN "Trans No" (field `number`) per baris, fallback
ke PO Number kalau Trans No kosong/tidak termapping (Fase 49 sendiri
lahir dari audit data nyata yang menemukan PO Number SELALU KOSONG di
praktik, sementara Trans No SELALU terisi & konsisten per faktur).
Akibat: tampilan "Nomor Faktur" di halaman ini BISA beda dari
pengelompokan faktur yang SEBENARNYA dipakai backend saat kirim ke
Accurate — bug tampilan murni (backend sudah benar sejak Fase 49),
tapi membingungkan admin/client yang melihat halaman ini.

## Scope
- [x] `apps/web/lib/sales-invoice-batch-helpers.ts` (baru) — logic
  `findNumberColumn`/`findPoNumberColumn`/`invoiceNumberOf`/
  `siblingRowNumbersOf`/`sortByInvoiceNumber`, Trans No diutamakan
  (SINKRON backend), diekstrak dari page.tsx supaya testable tanpa
  import modul Next.js
- [x] `apps/web/app/app/(protected)/sales-invoice/import/[batchId]/page.tsx`
  — pakai helper baru, label kolom "Nomor Faktur" → "Nomor Transaksi"
- [x] `apps/web/components/sales-invoice/edit-row-dialog.tsx` — teks
  peringatan sibling-row "(PO Number sama)" → "(Nomor Transaksi/PO
  Number sama)" (akurat, karena grouping sekarang bisa dari salah satu)
- [x] `apps/web/lib/sales-invoice-batch-helpers.test.ts` (baru, 8 test)

## Referensi
- `docs/phases/phase-49-grouping-sales-receipt-dan-invoice.md` — root
  cause asli kenapa Trans No diutamakan dari PO Number di backend
- `apps/api/src/lib/import-mapping/sales-invoice.mapping.ts` §
  `groupSalesInvoiceRows` — logic backend yang jadi acuan sinkronisasi

## Keputusan Kecil Selama Eksekusi
- Fungsi diekstrak ke `lib/sales-invoice-batch-helpers.ts` (BUKAN
  dites langsung dari `page.tsx`) — ditemukan konflik nyata:
  `mock.module("next/navigation", ...)` di file test LAIN
  (`login-form.test.tsx`) mencemari module registry global Bun, bikin
  import `page.tsx` (yang pakai `useParams`) gagal dengan error
  "Export named 'useParams' not found" kalau test dijalankan bersamaan
  satu suite. Ekstraksi ke file lib tanpa dependency Next.js
  menghindari masalah ini sepenuhnya.
- Cuma scope Sales Invoice (sesuai laporan client) — dicek modul lain
  (Purchase Invoice dkk) TIDAK dicek ulang di fase ini, di luar scope
  laporan yang diterima.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review — tidak relevan (murni logic tampilan frontend,
  tidak ada input/endpoint baru)
- [x] Temuan Critical/High — tidak ada
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Poin lain dari evaluasi client (Karakter/Unit Price tidak muncul di
  form edit; permintaan dukungan Number/Date custom field) BELUM
  ditangani di fase ini — masih menunggu klarifikasi/reproduksi dari
  user sebelum dikerjakan sebagai fase terpisah.

## Ringkasan Hasil
Kolom "Nomor Faktur" di halaman hasil import Sales Invoice diganti
"Nomor Transaksi" dan logic-nya disinkronkan dengan backend (Fase 49):
Trans No diutamakan, fallback PO Number — konsisten dengan aturan
Accurate bahwa PO Number/Bill No boleh sama walau beda transaksi,
sementara Trans No harus unik per transaksi.

Typecheck 0 error. Full suite `apps/web` 36 pass/0 fail (8 baru).
Build sukses. Security review: tidak relevan (bukan perubahan
endpoint/keamanan).
