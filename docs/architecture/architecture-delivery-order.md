# Architecture — Delivery Order (Pengiriman Pesanan)

> Fase 157. Modul ke-22 Facport (kategori "Sales") — MODUL BARU, sebelumnya
> Facport TIDAK punya modul ini sama sekali walau Sales Invoice sudah punya
> field referensi ke sana (`itemDeliveryOrderNo`, § architecture-sales-invoice.md).
> Sumber: kebutuhan client dari testing manual (bug lintas-dokumen "kode
> barang sama butuh Detail ID", § `docs/lessons-learned.md` 2026-09-24) +
> template Excel client (`docs/referencehtml/facport/developmen-15-september-2026.xlsx`
> sheet "Delivery Order", dan `FACPORT_Delivery Order_v8.xlsx` — **kedua
> file gitignored, JANGAN pernah commit**) + spec resmi Accurate
> `/api/delivery-order/save.do`.

## Posisi dalam Alur Sales
`Sales Quotation → Sales Order → Delivery Order → Sales Invoice`. Delivery
Order = bukti FISIK barang sudah dikirim ke customer, opsional referensi ke
Sales Order ATAU Sales Quotation (per baris item, prioritas `salesOrderNumber`
> `salesQuotationNumber` — hanya salah satu diproses kalau keduanya diisi,
sesuai spec resmi) — barang bisa dikirim tanpa SO/SQ formal juga.

## Endpoint Accurate
`POST /accurate/api/delivery-order/save.do`. Required: `customerNo`.

## Struktur Field `save.do` (Resmi dari OpenAPI Spec)
```
customerNo: string REQUIRED
detailItem[]: REQUIRED
branchId / branchName, cashDiscPercent, cashDiscount, contactInfoId,
  currencyCode, description, fobName, id, inclusiveTax, number,
  paymentTermName, poNumber, rate, shipmentName, taxable, toAddress,
  transDate, typeAutoNumber

detailItem[] tiap baris:
  itemNo, unitPrice, quantity, itemUnitName, detailName, detailNotes,
  warehouseName, departmentName, projectNo, controlQuantity,
  salesOrderNumber, salesQuotationNumber (saling terhubung, prioritas
  salesOrderNumber), reverseInvoiceNumber, salesmanListNumber,
  itemCashDiscount, itemDiscPercent, useTax1/2/3 (boolean),
  dataClassification1Name..10Name, detailSerialNumber[] (belum diverifikasi
  struktur nested-nya, § Known Limitations)
```

**TIDAK ADA `detailExpense[]`** — sama seperti Receive Item, dokumen
fulfillment fisik tidak punya baris biaya tambahan level dokumen.

## Grouping Multi-Baris
Standar ADR-0011 (grouping by `number`/Trans No, OPSIONAL — kosong = 1
baris = 1 dokumen sendiri). BEDA dari Receive Item yang grouping wajib by
`receiveNumber` — di Delivery Order tidak ada kolom setara itu di template
client, jadi ikut pola default seperti mayoritas modul lain (Sales Order,
Purchase Invoice, dst).

## Field Mapping Excel Client → API
| Excel Column | API Field | Level | Status |
|---|---|---|---|
| Trans Date | transDate | header | Wajib |
| Cust No | customerNo | header | Wajib |
| Trans No | number | header | Wajib (kosongkan = auto-number) |
| Branch Name | branchName | header | Opsional |
| Description | description | header | Opsional |
| To Address | toAddress | header | Opsional |
| PO No | poNumber | header | Opsional |
| Item No | detailItem.itemNo | item | Wajib |
| Item Unit Price | detailItem.unitPrice | item | Opsional |
| Item Qty | detailItem.quantity | item | Wajib |
| Item Unit Name | detailItem.itemUnitName | item | Wajib |
| Item Detail Name | detailItem.detailName | item | Opsional |
| Item Notes | detailItem.detailNotes | item | Opsional |
| Item Dept | detailItem.departmentName | item | Opsional |
| Item Warehouse | detailItem.warehouseName | item | Opsional |
| Item Project No | detailItem.projectNo | item | Opsional |
| Item Sales Order No | detailItem.salesOrderNumber | item | Opsional, prioritas > Sales Quot No |
| Item Sales Quot No | detailItem.salesQuotationNumber | item | Opsional |
| Item Reverse Invoice | detailItem.reverseInvoiceNumber | item | Opsional |
| CLS2/CLS5 (posisi ITEM, setelah "Item Reverse Invoice") | detailItem.dataClassification2Name/5Name | item | Opsional, AKTIF |
| Serial Num / Qty / Exp Date | detailItem.detailSerialNumber[] | item | Opsional, **belum diverifikasi struktur** |

## ⚠️ 3 Kolom DITUNDA — Field Ada di Mapping, TIDAK Dikirim ke Accurate
Keputusan eksplisit user 2026-09-24 ("biarkan tetap ada, besok kita cari
kegunaannya") — kolom-kolom ini TETAP ada di `fieldToAccuratePath` (supaya
bisa dipetakan user di UI tanpa error), tapi **sengaja TIDAK dimasukkan ke
`requiredFields` dan TIDAK di-include saat build payload** sampai
diklarifikasi. Ditandai jelas via komentar `// § DITUNDA 2026-09-24` di kode.

1. **`Sales Order Detail ID`** (kolom Excel client, posisi setelah "Item
   Sales Order No") — field API kemungkinan `salesOrderDetailId`, dipakai
   Accurate untuk membedakan 2 baris detail Sales Order yang punya `itemNo`
   sama (persis kasus `receiveItemDetailId` yang dikonfirmasi Accurate
   Support untuk Purchase Invoice←Receive Item, § lessons-learned
   2026-09-24). **TIDAK ADA di spec resmi** — harus dikonfirmasi ke
   Accurate Support presisi nama & perilaku fieldnya sebelum diaktifkan.
2. **CLS2/CLS5 versi HEADER** (posisi SEBELUM "Item No", beda dari versi
   ITEM yang posisinya setelah "Item Reverse Invoice" dan SUDAH aktif di
   atas) — dicek MENYELURUH ke SEMUA endpoint `save.do` di spec resmi
   Accurate (Sales Order, Sales Quotation, Purchase Invoice, Delivery
   Order sendiri, dst): **tidak ada SATU PUN endpoint yang punya Kategori
   Keuangan di level header** — classification di Accurate SELALU cuma
   ada di level detail/expense. Contoh nilai dari template client
   (`PONO0912332`/`Week 1` untuk header vs `ITMPONO098241231`/`WeekItem 1`
   untuk item) MEMANG berbeda secara nyata (bukan copy-paste error), tapi
   ini kemungkinan besar catatan internal client sendiri untuk tracking,
   BUKAN field yang benar-benar dikirim ke Accurate. Ditunda memutuskan
   sampai dikonfirmasi client.

## Keputusan Desain
1. **TIDAK auto-create customer/item** — mirror Receive Item. Delivery
   Order adalah dokumen LANJUTAN (customer & barang harusnya sudah ada dari
   Sales Order/Sales Quotation sebelumnya) — `customerNo`/`itemNo` dikirim
   APA ADANYA, Accurate validasi eksistensi.
2. **Grouping by `number`** (standar ADR-0011) — bukan pola custom seperti
   Receive Item.
3. **Tidak ada "Batal Import"** — konsisten pola Receive Item/Purchase
   Payment/Sales Receipt (dokumen fisik, bukan transaksi akuntansi mandiri).
4. **3 kolom ditunda** (§ di atas) — trade-off sengaja: rilis modul INTI
   sekarang (semua field yang jelas sudah kerja), retrofit kecil menyusul
   begitu klarifikasi client + Accurate Support masuk, DARIPADA menahan
   seluruh modul sampai 2 pertanyaan itu terjawab.

## Known Limitations / Butuh Konfirmasi Saat Eksekusi
- **Struktur `detailSerialNumber[]` (nested) belum diverifikasi** — spec
  resmi punya field ini tapi tanpa detail sub-schema jelas di level yang
  dibaca. Kalau tidak ada data uji barang serial-tracked saat eksekusi,
  JANGAN ditebak strukturnya — catat sebagai belum terverifikasi, kolom
  Serial Num/Qty/Exp Date tetap dipetakan best-effort tapi diberi catatan
  di UI/template guide bahwa ini belum full-tested.
- **2 kolom ditunda** (§ di atas) — follow-up wajib besok: (a) tanya
  Accurate Support presisi field `salesOrderDetailId` (nama + kapan wajib
  dikirim), (b) tanya client kegunaan CLS2/CLS5 versi header (dikirim ke
  Accurate atau murni internal).
- **6 relasi lintas-dokumen lain** yang punya potensi bug serupa
  (Purchase Invoice←Receive Item butuh `receiveItemDetailId`, Sales
  Order←Sales Quotation, Receive Item←Purchase Order, Purchase Order←
  Purchase Requisition, Item Requisition/Item Transfer←Sales Order, Sales
  Invoice←Delivery Order/Sales Order/Sales Quotation) — TIDAK disentuh
  fase ini, dicatat sebagai technical debt di `docs/lessons-learned.md`.

## Referensi
- Spec resmi: `docs/referencehtml/accurate-openapi.json` `/api/delivery-order/save.do`
- Panduan client (gitignored): `developmen-15-september-2026.xlsx` sheet
  "Delivery Order", `FACPORT_Delivery Order_v8.xlsx`
- Modul sejenis (template pola kode): `architecture-receive-item.md`
- Modul terkait dalam rantai: `architecture-sales-order.md`,
  `architecture-sales-quotation.md`, `architecture-sales-invoice.md`
- ADR rujukan: ADR-0011 (grouping default), ADR-0019 (SKU per sub-modul)
