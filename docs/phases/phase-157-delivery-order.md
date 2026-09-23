# Fase 157 — Modul Baru: Delivery Order (Pengiriman Pesanan)

**Status:** Done
**Mulai:** 2026-09-24
**Selesai:** 2026-09-24

## Tujuan
Bangun modul Delivery Order ke-22 Facport dari nol — ditemukan Facport
belum punya modul ini sama sekali (padahal Sales Invoice sudah punya field
`itemDeliveryOrderNo` yang mereferensikannya) saat investigasi bug lintas-
dokumen yang dilaporkan client via testing manual + video tutorial (§
`docs/lessons-learned.md` 2026-09-24). Client sudah punya template Excel
siap (`developmen-15-september-2026.xlsx` sheet "Delivery Order" +
`FACPORT_Delivery Order_v8.xlsx`).

## Scope
- [x] `docs/architecture/architecture-delivery-order.md`
- [x] `apps/api/src/lib/module-catalog.ts` — entry `delivery_order` (category "Sales")
- [x] `apps/api/src/lib/accurate-endpoint-registry.ts` — entry `delivery_order`
- [x] `apps/api/src/lib/accurate-delivery-order.ts` — `saveDeliveryOrder` (mirror `accurate-receive-item.ts`)
- [x] `apps/api/src/lib/import-mapping/delivery-order.mapping.ts` — mapping lengkap + 3 kolom ditunda
- [x] `apps/api/src/lib/import-mapping/template-guide.ts` — `deliveryOrderTemplateGuide`
- [x] `apps/api/src/routes/delivery-order-import.route.ts` — mirror `receive-item-import.route.ts`
- [x] `apps/api/src/workers/index.ts` — `groupDeliveryOrderRows`/`processDeliveryOrderGroup`/`ensureDeliveryOrderDataClassifications` + branch `batch.module === "delivery_order"` (TIDAK ada cancel — no Batal Import)
- [x] `apps/api/src/app.ts` — register route
- [x] `apps/api/src/routes/admin/plans.route.ts` — `t.Literal("delivery_order")`
- [x] `apps/web/components/app-shell/sidebar.tsx` — nav item grup Sales
- [x] `apps/web/lib/landing-content.ts` — icon + tagline (Record exhaustive per `ModuleKeyForProductLine<"facport">`, WAJIB diisi)
- [x] `apps/web/lib/module-import-routes.ts` — entry `MODULE_IMPORT_BASE_PATH` (checklist yang pernah kelewat Fase 120-124, tidak diulang di sini)
- [x] `apps/web/app/app/(protected)/delivery-order/import/page.tsx` — upload+mapping
- [x] `apps/web/app/app/(protected)/delivery-order/import/[batchId]/page.tsx` — detail batch
- [x] `apps/web/app/app/(protected)/delivery-order/import/riwayat/page.tsx` — arsip
- [x] `apps/web/components/delivery-order/edit-row-dialog.tsx`
- [x] `apps/web/components/delivery-order/delete-import-dialog.tsx`
- [x] Test: `delivery-order.mapping.test.ts` (17 test — header/detail split, grouping, DEFERRED_FIELDS exclusion, serial number, consistency)
- [x] Typecheck + lint + test penuh
- [x] Security review ringan
- [x] `docs/lessons-learned.md` — catat modul baru + 3 kolom ditunda + technical debt 6 relasi lain

## Referensi
- Architecture doc: `docs/architecture/architecture-delivery-order.md`
- Modul template pola kode: `docs/architecture/architecture-receive-item.md`
- ADR: ADR-0011 (grouping default), ADR-0019 (SKU per sub-modul)

## Keputusan Kecil Selama Eksekusi
- **Field `salesOrderDetailId` TETAP dimasukkan ke `fieldToAccuratePath`** (bisa dipetakan tanpa error di UI,
  berlabel jelas "BELUM AKTIF") tapi di-exclude eksplisit via `DEFERRED_FIELDS` di `buildDetailItemFromRow` —
  supaya aktivasi nanti (begitu dikonfirmasi Accurate Support) cuma butuh hapus 1 baris exclude, bukan nulis
  ulang dari nol.
- **CLS2/CLS5 versi header TIDAK dimasukkan ke mapping sama sekali** (beda dari poin di atas) — tidak ada
  kandidat field Accurate yang plausible (dicek MENYELURUH ke semua endpoint `save.do` di spec resmi, nihil).
- **TIDAK ada auto-suggest untuk "CLS2"/"CLS5"** di `defaultColumnMap` — nama kolom itu MUNCUL 2× di Excel client
  (posisi beda), `parseExcelBuffer` dedupe jadi "CLS2"/"CLS2_1" berdasar urutan kolom (bukan makna) — auto-suggest
  berbasis teks akan comot occurrence pertama (versi header yang ditunda) untuk field aktif secara diam-diam
  salah. User wajib pilih manual sambil lihat preview data.
- **`requiredFields` TIDAK mengikuti "Penjelasan Kolom" sheet client secara harfiah** — sheet itu terbukti stale
  (tidak sinkron dengan header row sheet utama, ada kolom "Auto Number" yang tidak eksis, kelewat CLS2/CLS5/Sales
  Order Detail ID/PO No sama sekali) — jadi requiredFields diputuskan dari spec resmi Accurate (`customerNo`
  WAJIB) + baseline item-fields yang selalu wajib di modul lain (itemNo/quantity/itemUnitName), BUKAN dari status
  "Wajib"/"Tidak Wajib" sheet yang tidak bisa dipercaya penuh. `branchName`/`number` TIDAK dipaksa wajib (beda
  dari Receive Item) karena tidak ada sinyal kuat client butuh itu untuk Delivery Order spesifik.
- **Grouping by `number` (standar ADR-0011)**, bukan pola custom seperti Receive Item — tidak ada kolom setara
  "nomor surat jalan vendor" di template client Delivery Order.
- **TIDAK auto-create customer/item, TIDAK ada Batal Import** — mirror Receive Item, konsisten "dokumen
  fulfillment fisik, bukan transaksi akuntansi mandiri".

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review dijalankan (skill `security-review`)
- [x] Temuan Critical/High — tidak ada.
- [x] Temuan Medium/Low — tidak ada (pure mirror pola Receive Item yang sudah direview, tanpa permukaan baru).
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- **3 kolom ditunda** (`Sales Order Detail ID`, CLS2/CLS5 header) — field `Sales Order Detail ID` ada di mapping
  tapi tidak aktif (dikirim), CLS2/CLS5 header tidak ada mapping sama sekali — menunggu klarifikasi Accurate
  Support (nama/perilaku field `salesOrderDetailId`) + client (kegunaan CLS2/CLS5 header). **Follow-up wajib**,
  bukan ditutup selamanya.
- **6 relasi lintas-dokumen serupa** di modul LAIN (Purchase Invoice←Receive Item butuh `receiveItemDetailId`
  yang SUDAH dikonfirmasi tapi belum diimplementasi, Sales Order←Sales Quotation, Receive Item←Purchase Order,
  Purchase Order←Purchase Requisition, Item Requisition/Item Transfer←Sales Order, Sales Invoice←Delivery
  Order/Sales Order/Sales Quotation) — technical debt, di luar scope fase ini.
- **Belum diverifikasi test call nyata** ke Accurate sandbox/dev untuk `delivery-order/save.do` — tidak ada
  koneksi Accurate live untuk uji saat eksekusi fase ini. Struktur `detailSerialNumber[]` sendiri SUDAH
  terverifikasi (identik `material-slip.mapping.ts`, dikonfirmasi dari spec resmi) — bukan area belum jelas,
  cuma belum dites end-to-end ke API sungguhan.

## Ringkasan Hasil
Modul Delivery Order (ke-22 Facport) dibangun lengkap dari nol: lib Accurate client, mapping + template guide,
route import (upload/mapping/confirm/retry/edit-row/riwayat/delete — TANPA Batal Import), worker processing
(grouping + build payload + save), wiring katalog/registry/scope/sidebar/landing/module-import-routes, dan
seluruh halaman frontend (upload, detail batch, arsip riwayat, edit-row & delete dialog) — SEMUA mirror pola
Receive Item yang sudah teruji. 3 kolom Excel client (Sales Order Detail ID, CLS2/CLS5 header) sengaja ditunda
sesuai keputusan eksplisit user, tetap tercatat di kode+dokumen untuk follow-up. Typecheck 0 error, lint bersih,
test API 1653 pass (+17 baru untuk mapping delivery order)/0 fail, test web 268 pass/0 fail. Security review: 0
Critical/High/Medium. Ditemukan & diperbaiki sekaligus: gap checklist "Arsip Import" (`MODULE_IMPORT_BASE_PATH`)
yang pernah kelewat di 5 modul lama (Fase 120-124) — tidak diulang di modul baru ini. Siap push ke `develop`
(BUKAN rilis — menunggu instruksi eksplisit user seperti biasa).
