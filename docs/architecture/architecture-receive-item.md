# Architecture — Receive Item (Penerimaan Barang)

> Fase 119 (Planned — arsitektur SAJA, implementasi belum dikerjakan).
> Modul ke-8 dari 21 katalog Accurate (kategori "Purchase"). Sumber:
> panduan client (`docs/referencehtml/facport/developmen-15-september-2026.xlsx`,
> sheet "Receive Item" — **gitignored, JANGAN pernah commit**) + spec
> resmi Accurate `/api/receive-item/save.do`.

## Posisi dalam Alur Procurement
Lihat `architecture-purchase-order.md` § "Posisi dalam Alur Procurement"
untuk diagram lengkap. Receive Item = bukti FISIK barang sudah diterima
dari vendor (opsional referensi ke Purchase Order via `purchaseOrderNumber`
per baris item, TIDAK wajib — barang bisa diterima tanpa PO formal).

## ⚠️ Beda Paling Penting dari Purchase Order/Invoice: TIDAK ADA `detailExpense[]`
Dikonfirmasi dari spec resmi DAN Excel client — modul ini CUMA
`detailItem[]`, tidak ada biaya tambahan level dokumen sama sekali.
Konsekuensi: TIDAK ada kolom "Expense" apa pun di template Excel-nya
(beda dari Purchase Order/Purchase Return yang punya).

## Endpoint Accurate
`POST /accurate/api/receive-item/save.do`.

## Struktur Field `save.do` (Ringkas — Resmi dari OpenAPI Spec)
```
detailItem[]: REQUIRED
receiveNumber: string REQUIRED  ⚠️ BUKAN nomor dokumen Accurate — ini
  "Nomor transaksi pengiriman barang dari PENGIRIM" (nomor surat jalan/
  delivery note MILIK VENDOR). WAJIB diisi user, TIDAK auto-number.
vendorNo: string REQUIRED
branchId / branchName, currencyCode, rate, cashDiscount, cashDiscPercent
description, fobName, shipDate, shipmentName, toAddress, paymentTermName
inclusiveTax, taxable
number: string (opsional — nomor transaksi INTERNAL Accurate, auto kalau kosong.
  BEDA dari `receiveNumber` di atas — lihat § Grouping)
transDate

detailItem[] tiap baris:
  itemNo, unitPrice, quantity, itemUnitName, detailName, detailNotes,
  warehouseName, departmentName, projectNo,
  purchaseOrderNumber (opsional, link ke PO terkait),
  purchaseRequisitionNumber, reverseInvoiceNumber,
  itemCashDiscount, itemDiscPercent, useTax1/2/3 (boolean),
  dataClassification1Name..10Name
```

## ⚠️ Grouping Multi-Baris — BEDA dari Modul Lain (Kunci = `receiveNumber`, BUKAN `number`)
Semua modul multi-item lain (Purchase Invoice, Purchase Order, dst)
grouping pakai kolom `number`/`Trans No` yang **OPSIONAL** (kosong = 1
baris = 1 dokumen sendiri, § ADR-0011). Modul ini BEDA: `receiveNumber`
**REQUIRED per baris** (nomor surat jalan vendor, harus selalu diisi),
sedangkan `number` (nomor dokumen internal Accurate) OPSIONAL. Karena
itu **kunci grouping untuk modul ini adalah `receiveNumber`**, bukan
`number` — baris dengan `receiveNumber` yang SAMA (1 surat jalan berisi
beberapa item) digabung jadi 1 `detailItem[]`, `number` (kalau diisi
user) ikut header apa adanya (tetap dari baris pertama grup).

## Field Mapping Excel Client → API (Rencana)
| Excel Column | API Field | Catatan |
|---|---|---|
| Date | transDate | header |
| Vendor No | vendorNo | header, REQUIRED |
| Receive Number | receiveNumber | header, REQUIRED, **KUNCI GROUPING** (§ di atas) |
| Trans Number | number | header, opsional, nomor internal Accurate |
| Currency Code | currencyCode | header |
| Description | description | header |
| FOB Name | fobName | header |
| Shipment Name / Shipment Date | shipmentName / shipDate | header |
| To Address | toAddress | header |
| Branch Name | branchName | header, **WAJIB diisi** (§ preseden Fase 90, mirror Purchase Order) |
| Custom Character 1-10 (LEVEL HEADER) | `charField1`-`charField10` | **Dikonfirmasi**, § "Atribut Tambahan" |
| Custom Number 1-10 (LEVEL HEADER) | `numericField1`-`numericField10` | sama |
| Custom Date 1-2 (LEVEL HEADER) | `dateField1`-`dateField2` | sama |
| Item No/Name/Quantity/Unit Name | itemNo/-/quantity/itemUnitName | detailItem[] |
| Item Warehouse | warehouseName | detailItem[] |
| ITEM: Department / Project No | departmentName / projectNo | detailItem[] |
| ITEM: Description | detailNotes ATAU detailName (perlu dikonfirmasi test call — spec tidak jelas beda `detailName` vs `detailNotes`) | detailItem[] |
| ITEM: Finance Category 1-10 | dataClassification1Name..10Name | detailItem[] |
| ITEM: Custom Character 1-10 | `detailItem[].charField1`-`charField15` (15 slot tersedia, Excel client cuma pakai 10) | **Dikonfirmasi**, § "Atribut Tambahan" |
| ITEM: Custom Number 1-10 | `detailItem[].numericField1`-`numericField10` | sama |
| ITEM: Custom Date 1-2 | `detailItem[].dateField1`-`dateField2` | sama |

**Kolom yang DISEDIAKAN API tapi TIDAK ADA di Excel client** (opsional,
bisa ditambah admin manual kalau perlu nanti, TIDAK wajib dipetakan
sekarang): `purchaseOrderNumber` (link ke PO), `purchaseRequisitionNumber`,
`reverseInvoiceNumber`, `itemCashDiscount`, `itemDiscPercent`, `useTax1/2/3`,
`fillPriceByVendorPrice`, `cashDiscount`/`cashDiscPercent` header,
`paymentTermName`, `inclusiveTax`/`taxable`. Rekomendasi: tambah minimal
`purchaseOrderNumber` sebagai kolom opsional saat eksekusi (link balik
ke PO) — nilai bisnis tinggi (menutup rantai PO→Receive), effort kecil
(field sudah ada di spec, tinggal petakan), TAPI TIDAK diminta client di
Excel — konfirmasi dulu sebelum nambah kolom di luar apa yang diminta.

## Atribut Tambahan (Custom Character/Number/Date) — Field Resmi SUDAH Diketahui
Sama seperti `architecture-purchase-order.md` § "Atribut Tambahan" —
mekanisme ini SUDAH dikonfirmasi resmi Accurate Support (tiket #357901),
"konsisten lintas jenis transaksi". Beda dari Purchase Order, Receive
Item minta KEDUA level (header DAN item) — field resmi:
- **Header**: `charField1`-`charField10`, `numericField1`-`numericField10`,
  `dateField1`-`dateField2`.
- **Item** (nested `detailItem[]`): field SAMA (`charField1`-`15`,
  `numericField1`-`10`, `dateField1`-`2`).

Rekomendasi eksekusi sama: 1x verifikasi test call nyata ke
`receive-item/save.do` sebelum full rollout.

## Keputusan Desain (Rencana)
1. **TIDAK auto-create vendor/item** — beda dari Purchase Order. Receive
   Item adalah dokumen LANJUTAN (barang yang diterima harusnya sudah
   dari vendor yang dikenal, item yang sudah dipesan) — mirror pola
   Purchase Payment/Sales Receipt (vendorNo/itemNo dikirim APA ADANYA,
   Accurate yang validasi eksistensi). Scope OAuth minimal: `item_view`
   (baseline) — TIDAK butuh `vendor_save`/`item_save`.
2. **Grouping by `receiveNumber`** (§ di atas) — BUKAN pola default
   ADR-0011, WAJIB didokumentasikan jelas di kode + test khusus supaya
   tidak disamakan begitu saja dengan modul lain saat eksekusi.
3. **Tidak ada "Batal Import"** — konsisten pola Purchase Payment/Sales
   Receipt.

## Known Limitations / Butuh Konfirmasi Saat Eksekusi
- Field "Atribut Tambahan" (§ di atas) sudah punya dasar kuat tapi
  BELUM literal dites ke endpoint Receive Item — 1x test call nyata
  tetap direkomendasikan.
- `ITEM: Description` di Excel client — API punya 2 field mirip
  (`detailName`, `detailNotes`), belum jelas yang mana dimaksud tanpa
  test call nyata (§ tabel mapping di atas).
- `purchaseOrderNumber` (link ke PO) TIDAK ada di Excel client — kalau
  client mau modul ini "menutup" PO otomatis di Accurate, kolom ini
  perlu ditambah (di luar scope Excel yang diberikan, WAJIB konfirmasi
  dulu).

## Referensi
- Spec resmi: `docs/referencehtml/accurate-openapi.json` `/api/receive-item/save.do`
- Panduan client (gitignored): sheet "Receive Item"
- Modul sebelum/sesudah dalam rantai: `architecture-purchase-order.md`, `architecture-purchase-invoice.md`, `architecture-purchase-return.md`
