# Fase 123 — Modul Sales Quotation (Penawaran Harga)

**Status:** Done
**Mulai:** 2026-09-15
**Selesai:** 2026-09-15

## Tujuan
Eksekusi modul Sales Quotation (Penawaran Harga) — sub-modul ke-4 dari 5
sub-modul baru direncanakan Fase 119. Dokumen PALING AWAL rantai
penjualan (analog Purchase Order di rantai pembelian) — mirror Sales
Invoice: auto-create Customer+Item, grouping DEFAULT ADR-0011 (opsional
by `number`), TIDAK ada dampak GL/stok, TIDAK ada "Batal Import".

## Keputusan Kecil (diverifikasi sebelum eksekusi, TIDAK butuh konfirmasi user)
- **`salesmanListNumber`**: field API berupa ARRAY of string, Excel
  client cuma py 1 kolom "Item Salesman No" — dipetakan sebagai
  1-elemen array `[value]` per baris, TIDAK ada parsing multi-value
  (pemisah koma dst) — sesuai rekomendasi eksplisit architecture doc
  ("JANGAN over-engineer sebelum dikonfirmasi butuh").
- **Koreksi architecture doc** (ditemukan saat baca ulang Excel +
  cross-check OpenAPI spec, pola SAMA seperti Purchase Return): kolom
  Excel "Expense Project No" TIDAK punya field API — `detailExpense[]`
  Sales Quotation TIDAK punya `projectNo` sama sekali. Tabel mapping doc
  sebelumnya KELIRU mengklaim field ini ada. Kolom ini TIDAK dimasukkan
  `defaultColumnMap`.
- Tidak ada `rate` di root schema (dikonfirmasi, konsisten klaim
  architecture doc) — tidak dipetakan, sama seperti dokumen aslinya.

## Scope
- [x] `apps/api/src/lib/module-catalog.ts` — entry `sales_quotation`
- [x] `apps/api/src/lib/accurate-scopes.ts` — scope OAuth: HANYA
      `sales_quotation_save` (tanpa `_view`, dikonfirmasi OpenAPI
      security block) + `customer_view`/`customer_save` (auto-create
      customer) + `item_save` (auto-create item, baseline `item_view`
      selalu ada) + `data_classification_view`/`_save`.
- [x] `apps/api/src/routes/admin/plans.route.ts` — tambah literal union
- [x] `apps/api/src/lib/import-mapping/sales-quotation.mapping.ts` (baru)
- [x] `apps/api/src/lib/import-mapping/template-guide.ts` — tambah guide
- [x] `apps/api/src/lib/accurate-sales-quotation.ts` (baru) — `saveSalesQuotation()` saja
- [x] `apps/api/src/routes/sales-quotation-import.route.ts` (baru)
- [x] `apps/api/src/workers/index.ts` — `processSalesQuotationGroup` + dispatch
      (grouping DEFAULT by `number`, opsional; auto-create
      `findOrCreateCustomer`+`findOrCreateItem`, create-only mirror
      Purchase Order — TANPA findExisting/append seperti Sales Invoice)
- [x] `apps/api/src/app.ts` — daftarkan route baru
- [x] `apps/web/components/app-shell/sidebar.tsx` — nav item baru
- [x] `apps/web/lib/landing-content.ts` — entry icon+tagline baru
- [x] `apps/web/app/app/(protected)/sales-quotation/import/page.tsx` (baru)
- [x] `apps/web/app/app/(protected)/sales-quotation/import/[batchId]/page.tsx` (baru)
- [x] `apps/web/app/app/(protected)/sales-quotation/import/riwayat/page.tsx` (baru)
- [x] `apps/web/components/sales-quotation/edit-row-dialog.tsx` (baru)
- [x] `apps/web/components/sales-quotation/delete-import-dialog.tsx` (baru)
- [x] Test: `sales-quotation.mapping.test.ts` (33 test), `sales-quotation-import.route.test.ts` (20 test)

## Referensi
- Architecture doc: `docs/architecture/architecture-sales-quotation.md`
- Template terdekat (auto-create customer+item, grouping default):
  `apps/api/src/lib/import-mapping/sales-invoice.mapping.ts`,
  `apps/api/src/lib/accurate-sales-invoice.ts`
- Template struktur generik (prefix-based fieldToAccuratePath):
  `apps/api/src/lib/import-mapping/purchase-order.mapping.ts`

## Keputusan Kecil Selama Eksekusi
- Auto-create customer/item mapping (`customerAutoCreateMapping`/
  `itemAutoCreateMapping`, kolom "Nama Customer" dkk) tetap disediakan
  penuh walau Excel client Sales Quotation TIDAK punya kolom detail
  customer/item (cuma "Customer Number"/"Item Number") — memberi
  kapasitas penuh fitur auto-create kalau user menambah kolom sendiri
  saat konfirmasi mapping, konsisten precedent Purchase Order.
  `findOrCreateCustomer` tetap gagal jelas (bukan crash diam-diam) kalau
  customer belum ada di Accurate DAN kolom nama tidak diisi.
- `processSalesQuotationGroup` mengikuti pola CREATE-ONLY Purchase Order
  (bukan pola findExisting/append Sales Invoice) — sesuai keputusan
  desain architecture doc: Sales Quotation tidak py dampak GL/stok, 2
  quotation nominal sama bukan duplikat.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — api+web, 0 error
- [x] Security review dijalankan — 0 temuan (mirror pola yang sudah
      direview Purchase Order untuk auto-create + tenant isolation)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — tidak ada
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda — tidak ada temuan baru
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- **Belum ada verifikasi test call NYATA ke `/api/sales-quotation/save.do`**
  — termasuk field `salesmanListNumber` (array), Atribut Tambahan level
  header+item, dan `rate` (kurs mata uang asing, TIDAK terlihat di
  schema resmi level root — kalau company client transaksi multi-currency,
  perlu verifikasi apakah tetap diterima meski tidak didokumentasikan).
- `salesmanListNumber` cuma dipetakan sebagai array 1-elemen (1 salesman
  per baris) — TIDAK ada dukungan multi-salesman per baris (pemisah
  koma dst), sesuai rekomendasi architecture doc untuk tidak
  over-engineer sebelum dikonfirmasi butuh.
- Sales Order (kelanjutan alami Sales Quotation) masih di luar scope —
  client belum siapkan panduannya.

## Ringkasan Hasil
Modul Sales Quotation (Penawaran Harga) selesai diimplementasikan penuh:
mapping dengan auto-create Customer+Item (mirror Sales Invoice, pola
create-only mirror Purchase Order), grouping DEFAULT ADR-0011 (opsional
by Trans Number), field `salesmanListNumber` bertipe ARRAY dipetakan
dari 1 kolom Excel, Atribut Tambahan didukung di KEDUA level (header
DAN item — beda dari Purchase Order yang cuma level item). Ditemukan &
dikoreksi 1 kesalahan dokumentasi Fase 119 lagi (kolom "Expense Project
No" ternyata tidak punya field API, pola sama seperti Purchase Return).
53 test baru (33 unit + 20 integrasi), 997 test total pass, typecheck+
lint bersih, security review 0 temuan.
