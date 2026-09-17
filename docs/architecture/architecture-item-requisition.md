# Architecture — Item Requisition (Permintaan Barang: Beli/Pindah Gudang)

> Fase 135. Modul ke-15 dari katalog Accurate, kategori "Inventory"
> (bersama `architecture-item-transfer.md`). Sumber: panduan client
> (`docs/referencehtml/facport/developmen-15-september-2026.xlsx`, sheet
> "Item Requisition" — **gitignored, JANGAN pernah commit**).

## Baca `architecture-item-transfer.md` Dulu
Dokumen ini SENGAJA singkat — modul ini adalah **kembaran** Item
Transfer: sama endpoint Accurate (`/api/item-transfer/save.do`), sama
skema field, sama scope OAuth, sama fungsi HTTP call
(`saveItemTransfer()`, di-share literal). Semua detail teknis (struktur
field API resmi, quirk arah `warehouseName`/`referenceWarehouseName`,
grouping, validasi `itemTransferType`, Kategori Keuangan, nested
`detailSerialNumber[]`) ada di `architecture-item-transfer.md` — TIDAK
diulang di sini, cuma DELTA (apa yang beda) yang didokumentasikan.

**Kenapa modul terpisah walau API-nya sama**: keputusan eksplisit user,
§ `architecture-item-transfer.md` bagian "Konteks".

## Satu-Satunya Beda dari Sheet "Item Transfer": Tanpa Kolom "Item Requisition No"
Sheet "Item Requisition" client (25 kolom) IDENTIK sheet "Item Transfer"
(26 kolom) MINUS 1 kolom: **"Item Requisition No"** (yang di sheet "Item
Transfer" di-append ke `description`, § `architecture-item-transfer.md`).
Karena sheet ini TIDAK punya kolom itu sama sekali, `itemRequisitionMapping`
(`apps/api/src/lib/import-mapping/item-requisition.mapping.ts`) juga
TIDAK punya field `requisitionNo` — `description` cuma digabung dengan
`notePenting` (kolom "Note Penting", ADA di kedua sheet, § mapping utama).

## Field Mapping Excel Client → API
Sama persis tabel di `architecture-item-transfer.md` § "Field Mapping
Excel Client → API", MINUS baris "Item Requisition No".

## `import_batches.module`
`"item_requisition"` — beda dari kembarannya (`"item_transfer"`),
supaya riwayat import 2 modul ini terpisah total di UI (Arsip Import,
admin batch detail, dst) walau backend-nya panggil endpoint yang sama.

## OAuth Scope
SAMA PERSIS Item Transfer: `item_transfer_save`, `glaccount_view`,
`data_classification_view`, `data_classification_save` — entri terpisah
di `accurate-scopes.ts` (`item_requisition: [...]`, isi array sama), BUKAN
di-share/reference ke entri `item_transfer` — customer yang subscribe
SALAH SATU modul (bukan keduanya) tetap dapat scope yang PAS untuk modul
itu saja (§ `scopesForModules` — union per subscription aktif, kalau
di-share pointer, subscribe 1 modul bisa keliru dianggap perlu ubah
scope 2 modul sekaligus saat plan berubah nanti).

## Keputusan Desain
Sama persis `architecture-item-transfer.md` § "Keputusan Desain" — tidak
diulang di sini.

## Known Limitations
Sama seperti `architecture-item-transfer.md` (quirk arah gudang, batas 1
serial/baris, `fromItemTransferNo` belum ditest end-to-end) — berlaku
identik di modul ini karena payload yang dikirim ke Accurate strukturnya
sama persis.

## Referensi
- Detail teknis lengkap: `architecture-item-transfer.md`
- Spec resmi: `docs/referencehtml/accurate-openapi.json` `/api/item-transfer/save.do`
- Panduan client (gitignored): sheet "Item Requisition"
- Riset & histori keputusan: memory sesi `project_item_requisition_vs_item_transfer.md`
