# Fase 124 — Modul Sales Return (Retur Penjualan)

**Status:** Done
**Mulai:** 2026-09-15
**Selesai:** 2026-09-15

## Tujuan
Eksekusi modul Sales Return (Retur Penjualan) — sub-modul TERAKHIR dari
5 sub-modul baru direncanakan Fase 119. Bayangan cermin Purchase Return
(Customer ganti Vendor), TAPI BUKAN mirror persis — 2 perbedaan
struktural: `returnStatusType` (root) vs `returnDetailStatusType` (item,
field BEDA), dan `detailSerialNumber[]` (nested 2 level, belum ada
preseden modul lain di project ini).

## Keputusan Scope (dikonfirmasi user sebelum eksekusi)
**SEMUA 4 `returnType` didukung** (`DELIVERY`, `INVOICE`, `INVOICE_DP`,
`NO_INVOICE`) — draf awal Fase 119 sempat menolak `DELIVERY` (Facport
tidak punya/berencana punya modul Delivery Order) dan `INVOICE_DP`
(sama alasan Purchase Return). Dikoreksi: `DELIVERY` cuma butuh
`deliveryOrderNumber` sebagai REFERENSI TEKS (dokumen sesungguhnya
dikelola di Accurate langsung, Facport tidak perlu membangun modul
Delivery Order untuk bisa merujuk nomornya), `INVOICE_DP` cuma butuh
`invoiceNumber` (field sama dengan `INVOICE`). Konsisten keputusan
Purchase Return Fase 122 dan prinsip scope umum Facport. Lihat
`architecture-sales-return.md` § "Keputusan Scope" update 2026-09-15.

## Scope
- [x] `apps/api/src/lib/module-catalog.ts` — entry `sales_return`
- [x] `apps/api/src/lib/accurate-scopes.ts` — scope OAuth: HANYA
      `sales_return_save` (tanpa `_view`, dikonfirmasi OpenAPI security
      block) + `data_classification_view`/`_save`. TIDAK butuh
      `customer_save`/`item_save` (tidak ada auto-create, dokumen
      lanjutan mirror Purchase Return).
- [x] `apps/api/src/routes/admin/plans.route.ts` — tambah literal union
- [x] `apps/api/src/lib/import-mapping/sales-return.mapping.ts` (baru)
      — termasuk `returnTypeRowError()` (mirror Purchase Return, 4 nilai
      SUSUNAN BEDA: DELIVERY bukan RECEIVE) dan
      `buildDetailSerialNumberFromRow()` (NESTED 2 level, struktur baru
      di codebase ini)
- [x] `apps/api/src/lib/import-mapping/template-guide.ts` — tambah guide
- [x] `apps/api/src/lib/accurate-sales-return.ts` (baru) — `saveSalesReturn()` saja
- [x] `apps/api/src/routes/sales-return-import.route.ts` (baru)
- [x] `apps/api/src/workers/index.ts` — `processSalesReturnGroup` + dispatch
      (grouping DEFAULT by `number`, opsional; TANPA auto-create)
- [x] `apps/api/src/app.ts` — daftarkan route baru
- [x] `apps/web/components/app-shell/sidebar.tsx` — nav item baru
- [x] `apps/web/lib/landing-content.ts` — entry icon+tagline baru
- [x] `apps/web/app/app/(protected)/sales-return/import/page.tsx` (baru)
- [x] `apps/web/app/app/(protected)/sales-return/import/[batchId]/page.tsx` (baru)
- [x] `apps/web/app/app/(protected)/sales-return/import/riwayat/page.tsx` (baru)
- [x] `apps/web/components/sales-return/edit-row-dialog.tsx` (baru)
- [x] `apps/web/components/sales-return/delete-import-dialog.tsx` (baru)
- [x] Test: `sales-return.mapping.test.ts` (34 test, termasuk
      `returnTypeRowError` utk ke-4 returnType dan
      `detailSerialNumber[]` builder), `sales-return-import.route.test.ts`
      (21 test)

## Referensi
- Architecture doc: `docs/architecture/architecture-sales-return.md`
- Template terdekat (returnType validation, no auto-create, grouping
  default): `apps/api/src/lib/import-mapping/purchase-return.mapping.ts`
  (Fase 122) — TAPI TIDAK punya `detailSerialNumber[]`, struktur nested
  baru untuk fase ini.

## Keputusan Kecil Selama Eksekusi
- `returnStatusType` (root, status retur DOKUMEN keseluruhan) dan
  `itemReturnStatusType` (item, field internal `detailItem.returnDetailStatusType`)
  sengaja dipetakan ke 2 field internal BEDA nama (bukan disatukan),
  sesuai keputusan desain architecture doc #5 — dicek eksplisit lewat
  test regresi supaya tidak ketuker kalau ada refactor nanti.
- `detailSerialNumber[]` — struktur nested 2 level PERTAMA di codebase
  ini (semua modul lain sebelumnya cuma 1 level: `detailItem[]` atau
  `detailExpense[]`). Ditangani dengan builder terpisah
  (`buildDetailSerialNumberFromRow`) yang dipanggil DARI DALAM
  `buildDetailItemFromRow`, bukan disatukan ke loop generik — supaya
  syarat minimal (serialNumberNo+quantity) tetap bisa dicek independen
  dari field detailItem lainnya.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — api+web, 0 error
- [x] Security review dijalankan — 0 temuan, termasuk verifikasi khusus
      isolasi data `detailSerialNumber[]` per-baris dan gerbang worker
      untuk validasi returnType
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — tidak ada
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda — tidak ada temuan baru
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- **Belum ada verifikasi test call NYATA ke `/api/sales-return/save.do`**
  — termasuk asumsi `detailExpense: []` diterima Accurate,
  `detailSerialNumber[]` (struktur nested BARU, belum ada preseden),
  dan kombinasi `DELIVERY`/`INVOICE_DP` dengan nomor dokumen sungguhan.
  Perlu 1x verifikasi sebelum full rollout ke customer.
- Atribut Tambahan header cuma 3 slot Karakter + 2 slot Tanggal (sesuai
  Excel client) — TIDAK ada slot Angka sama sekali di modul ini (beda
  dari modul lain), field API tetap mendukung 10/10/2 kalau suatu saat
  dibutuhkan.

## Ringkasan Hasil
Modul Sales Return (Retur Penjualan) — modul TERAKHIR dari 5 sub-modul
Fase 119 — selesai diimplementasikan penuh. Bayangan cermin Purchase
Return (TIDAK auto-create customer/item, grouping DEFAULT ADR-0011),
tapi 2 perbedaan struktural ditangani hati-hati: `returnStatusType`
(root) vs `returnDetailStatusType`/`itemReturnStatusType` (item) sebagai
2 field terpisah, dan `detailSerialNumber[]` sebagai struktur nested 2
level PERTAMA di codebase ini. SEMUA 4 nilai `returnType` didukung
(termasuk `DELIVERY` dan `INVOICE_DP` yang sempat ditolak draf Fase 119)
setelah dikonfirmasi user — konsisten koreksi Purchase Return: Facport
tidak perlu membangun modul Delivery Order/Invoice DP untuk bisa
merujuk nomornya.

55 test baru (34 unit + 21 integrasi), 1052 test total pass, typecheck+
lint bersih, security review 0 temuan. Dengan ini, kelima sub-modul
Fase 119 (Purchase Order, Receive Item, Purchase Return, Sales
Quotation, Sales Return) SELESAI dieksekusi satu-satu — batch release
ke `main` menunggu keputusan user.
