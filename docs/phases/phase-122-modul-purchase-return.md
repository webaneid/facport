# Fase 122 — Modul Purchase Return (Retur Pembelian)

**Status:** Done
**Mulai:** 2026-09-15
**Selesai:** 2026-09-15

## Tujuan
Eksekusi modul Purchase Return (Retur Pembelian) — sub-modul ke-3 dari 5
sub-modul baru direncanakan Fase 119. BEDA STRUKTURAL dari Purchase
Order/Receive Item: punya field `returnType` enum yang menentukan
dokumen acuan (INVOICE/INVOICE_DP/RECEIVE/NO_INVOICE), TIDAK auto-create
vendor/item (dokumen lanjutan), grouping DEFAULT (by `number`/TransNo,
opsional — bukan kasus khusus seperti Receive Item).

## Keputusan Scope (dikonfirmasi user sebelum eksekusi)
1. **SEMUA 4 `returnType` didukung**, termasuk `INVOICE_DP`. Draf riset
   Fase 119 sempat menolak `INVOICE_DP` dengan alasan "Facport belum
   punya konsep Invoice DP sendiri" — user mengoreksi: itu bukan
   penghalang, karena `INVOICE_DP` di endpoint ini cuma butuh
   `invoiceNumber` (field SAMA dengan `INVOICE`) — Facport tidak perlu
   membangun/mengelola Invoice DP sebagai fitur sendiri, cukup
   referensikan nomornya. Konsisten prinsip scope: "kalau Accurate API
   mendukung dan bisa dikembangkan, bangun." Lihat
   `architecture-purchase-return.md` § "Keputusan Scope" update
   2026-09-15.
2. **2 kolom Excel client TIDAK bisa dipetakan** (ditemukan saat baca
   ulang Excel + cross-check OpenAPI spec, BUKAN keputusan bisnis):
   - "Item Warehouse" — `detailItem[]` Purchase Return TIDAK punya
     `warehouseName` sama sekali (beda dari Purchase Order/Receive Item).
   - "Expense Project" — `detailExpense[]` Purchase Return TIDAK punya
     `projectNo` sama sekali (beda dari Purchase Order).
   Kedua kolom ini TIDAK dimasukkan ke `defaultColumnMap` — kalau ada di
   file Excel user, otomatis "(tidak dipetakan)" saat konfirmasi mapping,
   tidak memengaruhi baris lain. Ini koreksi architecture doc Fase 119
   yang sebelumnya SALAH mengklaim "Item Warehouse" tidak ada di Excel
   client sama sekali (ternyata ADA di Excel, cuma tidak ada field API-nya).

## Scope
- [x] `apps/api/src/lib/module-catalog.ts` — entry `purchase_return`
- [x] `apps/api/src/lib/accurate-scopes.ts` — scope OAuth: HANYA
      `purchase_return_save` (tanpa `_view`, dikonfirmasi OpenAPI
      security block) + `data_classification_view`/`_save`. TIDAK butuh
      `vendor_save`/`item_save` (tidak ada auto-create).
- [x] `apps/api/src/routes/admin/plans.route.ts` — tambah literal union
- [x] `apps/api/src/lib/import-mapping/purchase-return.mapping.ts` (baru)
      — termasuk `returnTypeRowError()` (§ architecture doc, nama fungsi
      final beda dari draf awal `validatePurchaseReturnType` — mirror
      konvensi `debitCreditRowError` Journal Voucher: array field
      internal yang error, bukan objek `{code}`)
- [x] `apps/api/src/lib/import-mapping/template-guide.ts` — tambah guide
- [x] `apps/api/src/lib/accurate-purchase-return.ts` (baru) — `savePurchaseReturn()` saja
- [x] `apps/api/src/routes/purchase-return-import.route.ts` (baru) —
      edit-row/edit-bulk panggil `returnTypeRowError` (confirm sengaja
      TIDAK, sifatnya per-baris bukan per-mapping-kolom — worker adalah
      gerbang otoritatif final, § Keputusan Kecil)
- [x] `apps/api/src/workers/index.ts` — `processPurchaseReturnGroup` + dispatch
      (grouping DEFAULT by `number`, opsional — pola ADR-0011 biasa;
      `returnTypeRowError` WAJIB lolos SEBELUM payload dibangun)
- [x] `apps/api/src/app.ts` — daftarkan route baru
- [x] `apps/web/components/app-shell/sidebar.tsx` — nav item baru
- [x] `apps/web/lib/landing-content.ts` — entry icon+tagline baru
- [x] `apps/web/app/app/(protected)/purchase-return/import/page.tsx` (baru)
- [x] `apps/web/app/app/(protected)/purchase-return/import/[batchId]/page.tsx` (baru)
- [x] `apps/web/app/app/(protected)/purchase-return/import/riwayat/page.tsx` (baru)
- [x] `apps/web/components/purchase-return/edit-row-dialog.tsx` (baru)
- [x] `apps/web/components/purchase-return/delete-import-dialog.tsx` (baru)
- [x] Test: `purchase-return.mapping.test.ts` (38 test, termasuk 10 test
      `returnTypeRowError` utk ke-4 returnType + nilai invalid),
      `purchase-return-import.route.test.ts` (21 test)

## Referensi
- Architecture doc: `docs/architecture/architecture-purchase-return.md`
- Template terdekat (grouping default, no-auto-create, detailExpense
  WAJIB ada di payload walau kosong): `apps/api/src/lib/import-mapping/purchase-order.mapping.ts` (Fase 120, tapi detailExpense opsional di sana),
  `apps/api/src/lib/import-mapping/receive-item.mapping.ts` (Fase 121, no-auto-create pattern)

## Keputusan Kecil Selama Eksekusi
- `detailExpense` masuk `required` di top-level schema OpenAPI, TAPI
  item schema-nya sendiri tidak punya required field apa pun — diambil
  kesimpulan array KOSONG `[]` cukup memenuhi "key harus ada di payload"
  (beda dari "harus berisi minimal 1 elemen"). BELUM diverifikasi test
  call nyata — payload SELALU sertakan `detailExpense` (default `[]`
  kalau tidak ada baris Beban), BEDA dari Purchase Order yang omit key
  sepenuhnya kalau kosong.
- Ditemukan 2 ketidakcocokan Excel client vs API saat baca ulang sheet +
  cross-check `accurate-openapi.json`: kolom "Item Warehouse"
  (`detailItem[]` TIDAK punya `warehouseName`) dan "Expense Project"
  (`detailExpense[]` TIDAK punya `projectNo`) — keduanya TIDAK bisa
  dipetakan ke field API apa pun. Ini juga mengoreksi klaim architecture
  doc Fase 119 yang SALAH bilang "Item Warehouse" tidak ada di Excel
  client (ternyata ADA, cuma field API-nya yang tidak ada). Kedua kolom
  sengaja tidak dimasukkan `defaultColumnMap` — kalau ada di file user,
  otomatis "(tidak dipetakan)", tidak memengaruhi baris lain.
- Validasi `returnType` (`returnTypeRowError`) sengaja TIDAK dicek di
  endpoint confirm (beda dari requiredFields generik) — konsisten pola
  `debitCreditRowError` Journal Voucher, karena sifatnya validasi ISI
  per-baris (bukan keberadaan mapping kolom). Worker
  (`processPurchaseReturnGroup`) jadi gerbang otoritatif final: validasi
  ini WAJIB lolos SEBELUM `savePurchaseReturn` dipanggil, di SETIAP
  eksekusi (baik pertama kali maupun retry) — diverifikasi security
  review tidak ada jalur bypass.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — api+web, 0 error
- [x] Security review dijalankan — 0 temuan, termasuk verifikasi khusus
      tidak ada jalur returnType invalid/field companion kosong bisa
      lolos ke Accurate
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — tidak ada
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda — tidak ada temuan baru
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- **Belum ada verifikasi test call NYATA ke `/api/purchase-return/save.do`**
  — termasuk asumsi `detailExpense: []` diterima Accurate (§ Keputusan
  Kecil) dan Atribut Tambahan level ITEM. Perlu 1x verifikasi sebelum
  full rollout ke customer.
- Kolom Excel "Item Warehouse"/"Expense Project" (§ Keputusan Kecil)
  akan selalu "(tidak dipetakan)" — TIDAK ada cara mengirim nilainya ke
  Accurate lewat endpoint ini, terlepas dari kebutuhan client di masa
  depan (batasan API Accurate, bukan batasan Facport).
- `INVOICE_DP` didukung penuh secara STRUKTUR KODE (field companion
  sama dengan `INVOICE`), tapi belum pernah dites test call nyata dengan
  nomor Faktur Pembelian Uang Muka SUNGGUHAN — perilaku Accurate
  terhadap kombinasi ini belum diverifikasi.

## Ringkasan Hasil
Modul Purchase Return (Retur Pembelian) selesai diimplementasikan penuh:
mapping dengan validasi `returnType` enum (4 nilai: INVOICE, INVOICE_DP,
RECEIVE, NO_INVOICE — SEMUA didukung, keputusan dikoreksi dari draf awal
Fase 119 yang sempat menolak INVOICE_DP), TIDAK auto-create vendor/item
(mirror Receive Item), grouping DEFAULT ADR-0011 (opsional by TransNo,
beda dari Receive Item yang wajib), `detailExpense` selalu disertakan
(default array kosong). Ditemukan & dikoreksi 2 kesalahan dokumentasi
Fase 119 (kolom Item Warehouse/Expense Project ternyata tidak punya
field API). 59 test baru (38 unit + 21 integrasi, termasuk 10 test
khusus `returnTypeRowError` untuk semua kombinasi valid/invalid), 944
test total pass, typecheck+lint bersih, security review 0 temuan dengan
verifikasi eksplisit tidak ada jalur bypass validasi returnType.
