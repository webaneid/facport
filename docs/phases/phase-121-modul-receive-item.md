# Fase 121 — Modul Receive Item (Penerimaan Barang)

**Status:** Done
**Mulai:** 2026-09-15
**Selesai:** 2026-09-15

## Tujuan
Eksekusi modul Receive Item (Penerimaan Barang) — sub-modul ke-9 dari 21
katalog Accurate, modul ke-2 dari 5 sub-modul baru yang direncanakan Fase
119. BEDA STRUKTURAL dari Purchase Order (Fase 120): TIDAK auto-create
vendor/item (dokumen lanjutan, bukan titik awal procurement), grouping by
`receiveNumber` (BUKAN `number`), TIDAK ada `detailExpense[]` sama sekali.

## Keputusan Scope (dikonfirmasi user sebelum eksekusi)
1. **Kolom `ITEM: Purchase Order No` (link ke Purchase Order) DITAMBAHKAN**
   sebagai kolom OPSIONAL di template — TIDAK diminta di Excel client,
   tapi user eksplisit minta ditambahkan (nilai bisnis: menutup rantai
   PO→Receive Item di Accurate). Field API `detailItem[].purchaseOrderNumber`
   sudah resmi ada di spec, tinggal dipetakan.
2. **"ITEM: Description" → `detailNotes`** (bukan `detailName`) —
   diverifikasi dari struktur Excel client sendiri: sheet "Receive Item"
   PUNYA kolom "Item Name" terpisah (→ `detailName`, kode
   `detailItem.detailName`, konsisten pola Purchase Order/Purchase
   Invoice), jadi "ITEM: Description" pasti field LAIN — dan header-level
   "Description" (tanpa prefix ITEM) sudah mapping ke `description`
   generik, jadi versi item-nya paling konsisten ke `detailNotes`
   ("Catatan tambahan", bukan nama). Tetap flagged untuk verifikasi test
   call nyata (§ Known Limitations).

## Scope
- [x] `apps/api/src/lib/module-catalog.ts` — entry `receive_item`
- [x] `apps/api/src/lib/accurate-scopes.ts` — scope OAuth: HANYA
      `receive_item_save` (tanpa `_view` terpisah, dikonfirmasi OpenAPI
      security block) + `data_classification_view`/`_save` (Kategori
      Keuangan item-level). TIDAK butuh `vendor_view`/`vendor_save`/
      `item_save` (tidak ada auto-create).
- [x] `apps/api/src/routes/admin/plans.route.ts` — tambah literal union
- [x] `apps/api/src/lib/import-mapping/receive-item.mapping.ts` (baru)
- [x] `apps/api/src/lib/import-mapping/template-guide.ts` — tambah guide
- [x] `apps/api/src/lib/accurate-receive-item.ts` (baru) — `saveReceiveItem()` saja
- [x] `apps/api/src/routes/receive-item-import.route.ts` (baru)
- [x] `apps/api/src/workers/index.ts` — `processReceiveItemGroup` + dispatch
      (grouping by `receiveNumber`, TANPA `findOrCreateVendor`/`findOrCreateItem`)
- [x] `apps/api/src/app.ts` — daftarkan route baru
- [x] `apps/web/components/app-shell/sidebar.tsx` — nav item baru
- [x] `apps/web/lib/landing-content.ts` — entry icon+tagline baru
- [x] `apps/web/app/app/(protected)/receive-item/import/page.tsx` (baru)
- [x] `apps/web/app/app/(protected)/receive-item/import/[batchId]/page.tsx` (baru)
- [x] `apps/web/app/app/(protected)/receive-item/import/riwayat/page.tsx` (baru)
- [x] `apps/web/components/receive-item/edit-row-dialog.tsx` (baru)
- [x] `apps/web/components/receive-item/delete-import-dialog.tsx` (baru)
- [x] Test: `receive-item.mapping.test.ts` (25 test), `receive-item-import.route.test.ts` (20 test)

## Referensi
- Architecture doc: `docs/architecture/architecture-receive-item.md`
- Template terdekat (grouping/no-auto-create): `apps/api/src/lib/import-mapping/purchase-payment.mapping.ts`, `apps/api/src/lib/accurate-purchase-payment.ts` (untuk pola "no auto-create, no Batal Import")
- Template terdekat (multi-item detailItem[] + Atribut Tambahan + Kategori Keuangan): `apps/api/src/lib/import-mapping/purchase-order.mapping.ts` (Fase 120, TANPA bagian auto-create/detailExpense)

## Keputusan Kecil Selama Eksekusi
- Saat menulis `requiredFields`, ditemukan Fase 120 (Purchase Order)
  punya bug serupa yang jadi pelajaran: `branchName` tidak ikut masuk
  array validasi padahal architecture doc + frontend sudah anggap
  wajib. Diperbaiki LEBIH DULU di Fase 120 (commit terpisah,
  `docs/lessons-learned.md` 2026-09-15) sebelum melanjutkan eksekusi
  Fase 121 ini, supaya Receive Item tidak mewarisi kesalahan yang sama —
  `branchName` dimasukkan ke `requiredFields` sejak baris pertama ditulis.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — api+web, 0 error
- [x] Security review dijalankan — 0 temuan (mirror pola yang sudah
      direview Purchase Order, dan requiredFields diverifikasi konsisten
      di ketiga endpoint confirm/edit-row/edit-bulk karena membaca 1
      array yang sama, secara struktural tidak bisa drift)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — tidak ada
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda — tidak ada temuan baru
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- **Belum ada verifikasi test call NYATA ke `/api/receive-item/save.do`**
  — tidak ada kredensial/koneksi Accurate live di sesi eksekusi ini.
  Field mapping 100% diverifikasi dari `accurate-openapi.json` (spec
  resmi) + pola Atribut Tambahan yang sudah dikonfirmasi jalan di
  Purchase Invoice/Sales Invoice, tapi rekomendasi architecture doc
  untuk 1x test call nyata BELUM dieksekusi — perlu dilakukan sebelum
  full rollout ke customer.
- **"ITEM: Description" → `detailNotes` adalah keputusan yang
  DIINFERENSI** dari struktur Excel client (kolom "Item Name" terpisah
  sudah ada, jadi "ITEM: Description" pasti bukan `detailName`), BUKAN
  hasil test call langsung — spec resmi Accurate tidak menjelaskan beda
  `detailName`/`detailNotes` selain deskripsi teksnya masing-masing.
  Kalau test call nanti menunjukkan sebaliknya, cukup ubah 1 baris di
  `defaultColumnMap` (`"ITEM: Description": "itemNotes"` → `"itemName"`).
- Auto-suggest kolom Atribut Tambahan item-level (`defaultColumnMap`)
  cuma sampai slot ke-10 (sesuai kolom Excel client), walau field API
  (`fieldToAccuratePath`) mendukung sampai 15 — sama pola Purchase
  Order Fase 120.

## Ringkasan Hasil
Modul Receive Item (Penerimaan Barang) selesai diimplementasikan penuh:
mapping TANPA auto-create vendor/item (dokumen lanjutan, vendorNo/itemNo
dikirim apa adanya — beda dari Purchase Order), service Accurate
(`save.do` saja), route CRUD import (upload → confirm → processing →
retry/edit/delete, tanpa cancel), integrasi worker (grouping by
`receiveNumber` — BUKAN `number`, kunci grouping unik modul ini),
registrasi module key di 4 titik, dan UI frontend lengkap. Kolom
`ITEM: Purchase Order No` ditambahkan sebagai field opsional atas
permintaan eksplisit user (di luar apa yang diminta Excel client, demi
menutup rantai PO→Receive Item). 45 test baru (25 unit + 20 integrasi),
885 test total pass, typecheck & lint bersih, security review 0 temuan.

**Bonus fase ini**: menemukan & memperbaiki bug tersembunyi di Fase 120
(Purchase Order `requiredFields` kelupaan `branchName`) SEBELUM sempat
dirilis ke `main` — lihat `docs/lessons-learned.md` 2026-09-15.
