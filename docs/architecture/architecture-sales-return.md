# Architecture — Sales Return (Retur Penjualan)

> Fase 119 (Planned — arsitektur SAJA, implementasi belum dikerjakan).
> Modul ke-10 dari 21 katalog Accurate (kategori "Sales"). Sumber:
> panduan client (`docs/referencehtml/facport/developmen-15-september-2026.xlsx`,
> sheet "Sales Return" — **gitignored, JANGAN pernah commit**) + spec
> resmi Accurate `/api/sales-return/save.do`. Bayangan cermin
> `architecture-purchase-return.md` (Customer ganti Vendor) — TAPI
> bukan mirror PERSIS, ada 2 perbedaan struktural nyata (§ di bawah).

## Posisi dalam Alur Penjualan
Lihat `architecture-sales-quotation.md` § diagram. Sama seperti Purchase
Return, `returnType` menentukan dokumen acuan — TIDAK selalu mengacu ke
Sales Invoice.

## ⚠️ `returnType` — 4 Pilihan, BEDA Susunan dari Purchase Return
```
returnType enum (REQUIRED): DELIVERY | INVOICE | INVOICE_DP | NO_INVOICE
```
- `DELIVERY` → retur terhadap **Delivery Order** → butuh
  `deliveryOrderNumber`. **Delivery Order BUKAN salah satu dari 21
  modul katalog Accurate yang dijual Facport** (tidak pernah ada
  rencana membangunnya) — beda dari Purchase Return yang opsi
  "RECEIVE"-nya cocok dengan modul yang SEDANG dibangun (Receive Item).
- `INVOICE` / `INVOICE_DP` → retur terhadap **Sales Invoice** → butuh
  `invoiceNumber`.
- `NO_INVOICE` → retur berdiri sendiri.

`taxDate` + `taxNumber` REQUIRED tanpa syarat (sama alasan Purchase
Return — PPN keluar terdampak retur).

## ⚠️ Keputusan Scope: Cuma `INVOICE` dan `NO_INVOICE` yang Didukung
**Didukung**: `INVOICE` (Sales Invoice sudah ada di Facport), `NO_INVOICE`.
**TIDAK didukung**: `DELIVERY` (Facport tidak punya & tidak berencana
punya modul Delivery Order — beda dari Purchase Return yang RECEIVE-nya
memang dibangun barengan), `INVOICE_DP` (sama alasan Purchase Return,
tidak ada konsep invoice DP terpisah). **WAJIB dikonfirmasi ke user**
sebelum eksekusi — 2 dari 4 opsi resmi Accurate TIDAK akan berfungsi di
Facport, harus jelas dari awal bukan ditemukan customer saat pakai.

## Endpoint Accurate
`POST /accurate/api/sales-return/save.do`.

## Struktur Field `save.do` (Ringkas — Resmi dari OpenAPI Spec)
```
customerNo: string REQUIRED
returnType: enum REQUIRED (§ di atas)
taxDate: string REQUIRED
taxNumber: string REQUIRED
detailItem[]: REQUIRED
detailExpense[]: REQUIRED (sama catatan Purchase Return soal "wajib
  ada array-nya, belum tentu wajib isi ≥1 elemen" — perlu test call)
invoiceNumber: string (kondisional, § returnType)
deliveryOrderNumber: string (kondisional, TIDAK DIDUKUNG § Keputusan Scope)
returnStatusType: enum (NOT_RETURNED | PARTIALLY_RETURNED | RETURNED)
  ⚠️ LEVEL ROOT — status retur keseluruhan dokumen
branchId/branchName, currencyCode, rate, fiscalRate, cashDiscount,
cashDiscPercent, description, fobName, inclusiveTax, taxable,
paymentTermName, shipmentName, toAddress, number, transDate

detailItem[] tiap baris:
  itemNo, unitPrice, quantity, itemUnitName, detailName, detailNotes,
  departmentName, projectNo, warehouseName, itemCashDiscount,
  itemDiscPercent, useTax1/2/3 (boolean), dataClassification1Name..10Name,
  returnDetailStatusType: enum (NOT_RETURNED | RETURNED) ⚠️ LEVEL ITEM,
    BEDA dari `returnStatusType` level root — item bisa beda status dari
    dokumen keseluruhan (retur SEBAGIAN)
  detailSerialNumber[]: array — ⚠️ NESTED 1 LEVEL LEBIH DALAM dari
    `detailItem[]`, tiap elemen: serialNumberNo, quantity, expiredDate
    (tracking barang bernomor seri, mis. elektronik/kendaraan)

detailExpense[] tiap baris:
  accountNo, expenseAmount, expenseName, expenseNotes, departmentName,
  salesOrderNumber, salesQuotationNumber, dataClassification1Name..10Name
```

**Dikonfirmasi TIDAK ADA** custom field level header apa pun
(`Header - CF1/CF2/CF3/DF1/DF2` di Excel client) di schema resmi —
dicek langsung ke daftar properti root, absen total. **Skip**, bukan
kelalaian.

## Field Mapping Excel Client → API (Rencana)
| Excel Column | API Field | Catatan |
|---|---|---|
| Transaction Date | transDate | header |
| Invoice No | invoiceNumber | header, WAJIB kalau `Return Type` = INVOICE/INVOICE_DP |
| Retur No | number | header, opsional |
| Customer No | customerNo | header, REQUIRED |
| Return Type | returnType | header, REQUIRED, § validasi enum (mirror Purchase Return) |
| To Address | toAddress | header |
| Transaction Description | description | header |
| Delivery Order No | deliveryOrderNumber | header, **TIDAK DIDUKUNG** (§ Keputusan Scope) — kalau diisi, tolak eksplisit |
| Currency Code / Rate | currencyCode / rate | header |
| Cash Disc / Cash Disc Percent | cashDiscount / cashDiscPercent | header |
| Return Status Type | returnStatusType | header (level dokumen) |
| Payment Term Name | paymentTermName | header |
| Taxable / Inclusive Tax | taxable / inclusiveTax | header, boolean |
| Tax Date / Tax Number | taxDate / taxNumber | header, REQUIRED |
| Branch Name | branchName | header, **WAJIB diisi** (§ preseden Fase 90) |
| Fiscal Rate | fiscalRate | header |
| FOB Name | fobName | header |
| Shipment Name | shipmentName | header |
| Header - CF1/CF2/CF3/DF1/DF2 | ⚠️ TIDAK ADA di schema | **skip** |
| Item No/Name/Unit Price/Qty/Unit Name/Note | itemNo/-/unitPrice/quantity/itemUnitName/detailNotes | detailItem[] |
| Item Return Status Type | returnDetailStatusType | detailItem[] (level item, beda dari header) |
| Item Project No / Department / Warehouse | projectNo / departmentName / warehouseName | detailItem[] |
| Item Cash Discount / Cash Disc Percent | itemCashDiscount / itemDiscPercent | detailItem[] |
| Item PPN (VAT) / PPNMB / PPH | useTax1 / useTax2 / useTax3 | detailItem[], boolean |
| Item CLS1/CLS2/CLS3 | dataClassification1Name/2Name/3Name | detailItem[] (cuma 3 dari 10 slot dipakai client, sisanya kosong) |
| Item Serial No / Serial Number Qty / Serial Number Exp Date | serialNumberNo / quantity / expiredDate | detailSerialNumber[] (NESTED, § catatan) |
| Expense Account No/Name/Amount/Note | accountNo/expenseName/expenseAmount/expenseNotes | detailExpense[] |
| Expense Department | departmentName | detailExpense[] |
| Expense Sales Order No / Sales Quotation No | salesOrderNumber / salesQuotationNumber | detailExpense[] |
| Expense CLS1/CLS2/CLS3 | dataClassification1Name/2Name/3Name | detailExpense[] |

## Keputusan Desain (Rencana)
1. **TIDAK auto-create customer/item** — dokumen LANJUTAN (retur
   terhadap transaksi yang sudah ada), mirror Purchase Return. Scope
   OAuth minimal: `item_view` + `data_classification_view`/`_save`.
2. **Grouping multi-baris**: pola DEFAULT ADR-0011 (`number`/"Retur No"
   opsional).
3. **`detailSerialNumber[]` — syarat minimal 1 baris punya data**:
   MINIMAL `serialNumberNo` DAN `quantity` terisi (mirror pola
   `buildDetailDiscountFromRowValues` — kalau cuma sebagian terisi,
   TIDAK dikirim setengah-setengah). Kolom ini KEMUNGKINAN BESAR jarang
   dipakai (barang bernomor seri bukan kasus umum) — tetap dipetakan
   karena diminta eksplisit di Excel client.
4. **`DELIVERY` dan `INVOICE_DP` ditolak eksplisit** dengan kode error
   jelas (mirror pola validasi Purchase Return) — termasuk kalau kolom
   `Delivery Order No` terisi tanpa `Return Type`-nya DELIVERY (data
   ambigu, gagalkan dengan pesan jelas, jangan diam-diam diabaikan).
5. **`returnStatusType` (root) vs `returnDetailStatusType` (item) — DUA
   FIELD BEDA, JANGAN disatukan jadi 1 kolom internal** — beri nama
   field internal yang jelas beda (mis. `returnStatusType` vs
   `itemReturnStatusType`) supaya tidak ketuker saat implementasi.
6. **Tidak ada "Batal Import"** — konsisten pola modul non-invoice
   lain.

## Known Limitations / Butuh Konfirmasi Saat Eksekusi
- **`DELIVERY` dan `INVOICE_DP` tidak didukung** (§ Keputusan Scope) —
  WAJIB dikonfirmasi user, bukan cuma dicatat.
- Kolom "Header - CF1/CF2/CF3/DF1/DF2" TIDAK ADA di schema resmi.
- `detailExpense[]` REQUIRED tapi belum jelas apakah array kosong
  diterima — sama catatan Purchase Return, perlu test call nyata.
- `detailSerialNumber[]` — belum ada preseden modul lain di project ini
  yang pakai struktur nested 2-level begini, perlu perhatian ekstra
  saat implementasi payload builder (bukan sekadar copy pola
  `detailDiscount`/`detailExpense` yang cuma 1 level).

## Referensi
- Spec resmi: `docs/referencehtml/accurate-openapi.json` `/api/sales-return/save.do`
- Panduan client (gitignored): sheet "Sales Return"
- Modul terkait: `architecture-purchase-return.md` (bayangan cermin, BUKAN mirror persis), `architecture-sales-invoice.md`, `architecture-sales-quotation.md`
