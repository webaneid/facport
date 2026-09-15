# Fase 120 — Modul Purchase Order (Pesanan Pembelian)

**Status:** Done
**Mulai:** 2026-09-15
**Selesai:** 2026-09-15

## Tujuan
Eksekusi modul Purchase Order (Pesanan Pembelian) — sub-modul ke-8 dari
21 katalog Accurate, modul pertama dari 5 sub-modul baru yang direncanakan
Fase 119. Mengikuti pola Purchase Invoice (mirror terdekat): auto-create
vendor+item, grouping multi-baris by `number`, `detailItem[]`+
`detailExpense[]`.

## Scope
- [x] `apps/api/src/lib/module-catalog.ts` — entry `purchase_order`
- [x] `apps/api/src/lib/accurate-scopes.ts` — scope OAuth (`vendor_view`,
      `vendor_save`, `item_save`, `data_classification_view`/`_save`)
- [x] `apps/api/src/routes/admin/plans.route.ts` — tambah literal union
- [x] `apps/api/src/lib/import-mapping/purchase-order.mapping.ts` (baru)
- [x] `apps/api/src/lib/import-mapping/template-guide.ts` — tambah guide
- [x] `apps/api/src/lib/accurate-purchase-order.ts` (baru) — `savePurchaseOrder()`
- [x] `apps/api/src/routes/purchase-order-import.route.ts` (baru)
- [x] `apps/api/src/workers/index.ts` — `processPurchaseOrderGroup` + dispatch
- [x] `apps/api/src/app.ts` — daftarkan route baru
- [x] `apps/web/components/app-shell/sidebar.tsx` — nav item baru
- [x] `apps/web/app/app/(protected)/purchase-order/import/page.tsx` (baru)
- [x] `apps/web/app/app/(protected)/purchase-order/import/[batchId]/page.tsx` (baru)
- [x] `apps/web/app/app/(protected)/purchase-order/import/riwayat/page.tsx` (baru)
- [x] `apps/web/components/purchase-order/edit-row-dialog.tsx` (baru)
- [x] `apps/web/components/purchase-order/delete-import-dialog.tsx` (baru)
- [x] Test: `purchase-order.mapping.test.ts` (32 test), `purchase-order-import.route.test.ts` (20 test)

## Referensi
- Architecture doc: `docs/architecture/architecture-purchase-order.md`
- Template terdekat: `apps/api/src/lib/import-mapping/purchase-invoice.mapping.ts`, `apps/api/src/lib/accurate-purchase-invoice.ts`, `apps/api/src/routes/purchase-invoice-import.route.ts`

## Keputusan Kecil Selama Eksekusi
- OAuth scope awal ditulis termasuk `purchase_order_view`, dikoreksi
  sendiri jadi HANYA `purchase_order_save` setelah cek ulang `security`
  block `/api/purchase-order/save.do` di `accurate-openapi.json` — beda
  dari modul lain yang minta `_view` juga untuk `save.do`.
- `landing-content.ts` (`LANDING_MODULE_ICON`/`LANDING_MODULE_TAGLINE`,
  exhaustive `Record<ModuleKey, ...>`) sempat bikin `bun run typecheck`
  gagal karena lupa tambah entri `purchase_order` — ini SUDAH
  didokumentasikan sebagai kewajiban di komentar file itu sendiri
  ("WAJIB tambah entri baru di sini kalau ada sub-modul baru"), langsung
  diperbaiki (icon `ShoppingCart`, konsisten dengan sidebar).
- `defaultColumnMap` untuk Atribut Tambahan level ITEM cuma sediakan
  auto-suggest utk kolom Custom Character/Number 1-10 (bukan 1-15 penuh
  seperti `fieldToAccuratePath`) — sesuai Excel client yang cuma minta
  10 slot, field 11-15 tetap bisa di-mapping manual kalau suatu saat
  dibutuhkan (kapasitas Accurate API tidak dibatasi, cuma UI-suggest-nya).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — api+web, 0 error
- [x] Security review dijalankan — 0 temuan (mirror pola yang sudah
      direview di modul Purchase Invoice/Sales Receipt/Journal Voucher)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — tidak ada
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda — tidak ada temuan baru untuk dicatat
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- **Belum ada verifikasi test call NYATA ke `/api/purchase-order/save.do`**
  — tidak ada kredensial/koneksi Accurate live di sesi eksekusi ini.
  Field mapping 100% diverifikasi dari `accurate-openapi.json` (spec
  resmi) + pola Atribut Tambahan yang SUDAH dikonfirmasi jalan di
  Purchase Invoice/Sales Invoice (tiket Accurate Support #357901), tapi
  rekomendasi `architecture-purchase-order.md` untuk 1x test call nyata
  sebelum rollout penuh ke customer BELUM dieksekusi — perlu dilakukan
  sebelum/saat rilis modul ini ke production.
- Auto-suggest kolom (`defaultColumnMap`) untuk Atribut Tambahan Custom
  Character/Number cuma sampai slot ke-10 (sesuai kolom Excel client
  hari ini) — kalau client suatu saat butuh slot 11-15, field-nya SUDAH
  didukung backend (`fieldToAccuratePath` sampai charField15), tinggal
  tambah baris di `defaultColumnMap` atau user mapping manual.

## Ringkasan Hasil
Modul Purchase Order (Pesanan Pembelian) selesai diimplementasikan penuh:
mapping+auto-create vendor/item, service Accurate (`save.do` saja, tanpa
cancel/update — bukan transaksi akuntansi), route CRUD import (upload →
confirm → processing → retry/edit/delete), integrasi worker (grouping by
`number`, TANPA fallback Bill No berbeda dari Purchase Invoice karena
`number` wajib sejak awal), registrasi module key di 4 titik, dan UI
frontend lengkap (halaman import, detail progres, riwayat, edit-row/
delete dialog). 52 test baru (32 unit mapping + 20 integrasi route), 840
test total pass, typecheck & lint bersih, security review tanpa temuan.
