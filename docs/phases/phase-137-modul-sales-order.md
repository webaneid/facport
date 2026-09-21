# Fase 137 — Modul Sales Order

**Status:** Done
**Mulai:** 2026-09-21
**Selesai:** 2026-09-21

## Tujuan
Bangun modul import Sales Order (Pesanan Penjualan) end-to-end — kelanjutan
langsung Sales Quotation (Fase 123), sesuai `docs/architecture/architecture-sales-order.md`
yang sudah diverifikasi 100% field-per-field ke portal developer Accurate
live (0 gap dokumentasi API). Fase pertama dari 3 modul yang dieksekusi
berurutan (Sales Order → Inventory Adjustment → Job Costing) atas otorisasi
eksplisit user.

## Scope
- [x] `apps/api/src/lib/import-mapping/sales-order.mapping.ts` (+ `.test.ts`)
- [x] `apps/api/src/lib/accurate-sales-order.ts`
- [x] `apps/api/src/routes/sales-order-import.route.ts` (+ `.test.ts`)
- [x] `apps/web/app/app/(protected)/sales-order/import/page.tsx`
- [x] `apps/web/app/app/(protected)/sales-order/import/[batchId]/page.tsx`
- [x] `apps/web/app/app/(protected)/sales-order/import/riwayat/page.tsx`
- [x] `apps/web/components/sales-order/delete-import-dialog.tsx`
- [x] `apps/web/components/sales-order/edit-row-dialog.tsx`
- [x] Semua 11 titik registrasi existing (scopes, template-guide, module-catalog,
      plans.route, app.ts, workers/index.ts, landing-content.ts, sidebar.tsx,
      module-import-routes.ts, import-batch-table.tsx, admin batch-detail page)
- [x] Trik verifikasi diff (checklist § 3b) — 0 gap
- [x] `bun run typecheck` — 0 error
- [x] Security review (self-review, § catatan di bawah)

## Referensi
- Architecture doc: `docs/architecture/architecture-sales-order.md`
- Modul mirror: `apps/api/src/lib/import-mapping/sales-quotation.mapping.ts` dan seluruh berkas terkaitnya

## Keputusan Kecil Selama Eksekusi
- **`salesmanListNumber` split logic**: delimiter koma, tiap elemen di-trim,
  entri kosong dibuang (`toSalesmanList()`). Beda dari Sales Quotation yang
  cuma wrap 1 nilai — di sini genuinely array multi-elemen sesuai nama kolom
  Excel client "Sales List No (**separate with comma**)".
- **Icon sidebar/landing**: dipilih `ClipboardCheck` (belum dipakai modul
  manapun) untuk membedakan visual dari Sales Quotation (`FileSignature`)
  dan Purchase Order (`ShoppingCart`).
- **`SalesOrderView` (admin batch-detail)**: mirror PERSIS `SalesQuotationView`
  (row-view sederhana, tanpa grouping kolom khusus) — konsisten karena Sales
  Order tidak butuh tampilan grouping seperti Purchase Invoice/Sales Invoice.
- Nama kolom `defaultColumnMap`/template guide pakai istilah PERSIS sheet
  Excel client asli ("Cust No", "Trans No", dst) — BUKAN gaya generik lama
  Sales Quotation ("Customer Number", "Trans Number") — konsisten arahan user
  "jangan improvisasi tanpa acuan", field mapping ikut architecture doc
  yang sudah diverifikasi resmi.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — 0 error di apps/api & apps/web,
      diverifikasi ULANG independen oleh sesi utama (bukan cuma klaim fork)
- [x] Security review dijalankan via subagent `security-auditor` (dipanggil
      sesi utama setelah fork selesai, karena fork sendiri tidak boleh spawn
      subagent). Hasil: **0 Critical/0 High/0 Medium, 1 Low**. Temuan Low:
      validasi MIME upload cuma cek `Content-Type` header (bukan magic
      bytes) — POLA LAMA yang SAMA di SEMUA modul import lain (bukan
      regresi baru dari Sales Order), risiko efektif rendah karena
      `parseExcelBuffer()` tetap menolak file bukan-Excel di lapis kedua.
      Auditor juga konfirmasi eksplisit: 11 titik registrasi cocok persis
      Sales Quotation (0 gap), semua endpoint punya guard `permission`+
      `moduleAccess`, ownership check `ownsDataUsaha()` konsisten, 0 raw
      SQL, 0 secret hardcode.
- [x] Temuan Critical/High — tidak ada
- [x] Temuan Medium/Low — 1 Low (di atas), TIDAK perlu entri
      `lessons-learned.md` baru (pola sistemik pre-existing lintas-modul,
      sudah diterima sebagai risiko rendah, bukan temuan module-specific)
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- `manual-close-order.do` dan `bulk-save.do` (ADA di spec Accurate) sengaja
  TIDAK diimplementasikan — konsisten keputusan arsitektur (tidak diminta
  client, project konsisten pakai `save.do` per-grup).
- Field mapping BELUM pernah dites via test call nyata ke akun Accurate
  client sungguhan (arsitektur sudah 100% cocok dokumentasi, tapi belum ada
  transaksi asli yang berhasil masuk) — perlu retest client pertama sebelum
  dianggap tuntas end-to-end.

## Ringkasan Hasil
Modul Sales Order dibangun end-to-end, mirror ~1:1 Sales Quotation dengan
2 field tambahan (`poNumber`, `salesmanListNumber[]` hasil split koma).
Semua 19 titik registrasi (8 file baru + 11 titik existing) tersentuh,
diverifikasi via trik diff checklist § 3b — 0 gap ditemukan. Typecheck 0
error, test suite API penuh 1233 pass/0 fail (54 test baru: 33 unit mapping
+ 21 integrasi route). Test data dev DB dibersihkan via
`bun run db:cleanup-test-data`. Security review via subagent
`security-auditor` — 0 Critical/High/Medium, 1 Low (pola pre-existing
lintas-modul, bukan regresi). **Fase ditutup Done.**
