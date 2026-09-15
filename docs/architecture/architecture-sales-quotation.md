# Architecture — Sales Quotation (Penawaran Harga)

> Fase 119 (Planned — arsitektur SAJA, implementasi belum dikerjakan).
> Modul ke-9 dari 21 katalog Accurate (kategori "Sales"). Sumber:
> panduan client (`docs/referencehtml/facport/developmen-15-september-2026.xlsx`,
> sheet "Sales Quotation" — **gitignored, JANGAN pernah commit**) + spec
> resmi Accurate `/api/sales-quotation/save.do`.

## Posisi dalam Alur Penjualan
```
Sales Quotation → Sales Order (BELUM dibangun) → Sales Invoice → Sales Receipt
   (penawaran)      (pesanan resmi)                (tagihan)      (bayar)
                                                          ↓
                                                   Sales Return
```
Sales Quotation adalah dokumen **PALING AWAL**, sifatnya "proposal/
penawaran harga" — TIDAK ada dampak akuntansi (tidak ada jurnal GL,
tidak ada perubahan stok). Beda dari Purchase Order (yang PALING AWAL di
rantai Purchase), Sales Quotation TIDAK punya field link BALIK ke
dokumen lain (wajar — tidak ada yang mendahuluinya).

**Sales Order sengaja TIDAK termasuk fase ini** (client belum siapkan
panduannya, § sheet "Note" kolom Status kosong untuk baris ini, beda
dari 5 modul lain yang berstatus "Proses") — kalau nanti dibangun,
dokumennya idealnya link `detailItem[].salesQuotationNumber` balik ke
sini (field ini SUDAH terlihat di schema Sales Return sebagai referensi
tidak langsung, konfirmasi ulang saat Sales Order benar-benar digarap).

## Endpoint Accurate
`POST /accurate/api/sales-quotation/save.do`.

## Struktur Field `save.do` (Ringkas — Resmi dari OpenAPI Spec)
```
customerNo: string REQUIRED
detailItem[]: REQUIRED
branchId/branchName, currencyCode, cashDiscount, cashDiscPercent,
description, fobName, inclusiveTax, taxable, paymentTermName,
shipmentName, toAddress, number, transDate
detailExpense[]: opsional

detailItem[] tiap baris:
  itemNo, unitPrice, quantity, itemUnitName, detailName, detailNotes,
  departmentName, projectNo, itemCashDiscount, itemDiscPercent,
  useTax1/2/3 (boolean), dataClassification1Name..10Name,
  salesmanListNumber: array of string  ⚠️ ARRAY, bukan single value
    (Kategori Keuangan) — § catatan mapping di bawah

detailExpense[] tiap baris:
  accountNo, expenseAmount, expenseName, expenseNotes, departmentName,
  dataClassification1Name..10Name
  ⚠️ TIDAK ADA field link ke dokumen lain di detailExpense (beda dari
  Purchase Return yang punya purchaseOrderNumber) — wajar, Quotation
  tidak mengacu ke dokumen sebelumnya.
```

**Field yang TIDAK ADA di modul ini** (beda dari Purchase Order/Sales
Invoice): TIDAK ADA `rate` (mata uang asing) di level root schema resmi
— kalau `currencyCode` bukan IDR, perlu verifikasi test call nyata
apakah `rate` tetap diterima meski tidak didokumentasikan eksplisit di
schema (preseden: field lain juga pernah "tidak di spec tapi ternyata
diterima" — jangan asumsikan TIDAK BISA tanpa test).

## Field Mapping Excel Client → API (Rencana)
| Excel Column | API Field | Catatan |
|---|---|---|
| Date | transDate | header |
| Trans Number | number | header, opsional |
| Customer Number | customerNo | header, REQUIRED |
| Currency Code | currencyCode | header |
| Payterm Name | paymentTermName | header |
| To Address | toAddress | header |
| Description | description | header |
| Branch Name | branchName | header, **WAJIB diisi** (§ preseden Fase 90) |
| Cash Discount / Cash Discount Percent | cashDiscount / cashDiscPercent | header |
| FOB Name | fobName | header |
| Taxable / Include Tax | taxable / inclusiveTax | header, boolean |
| Custom Character/Number/Date 1-10 (LEVEL HEADER) | ⚠️ TIDAK ADA di schema | **skip** |
| Item Number/Name/price/Quantity/Unit Name | itemNo/-/unitPrice/quantity/itemUnitName | detailItem[] |
| Item Salesman No | salesmanListNumber | detailItem[], **ARRAY** — 1 sel Excel → 1-elemen array `[nilai]`, KECUALI client butuh multi-salesman per baris (perlu konvensi pemisah, mis. koma, kalau iya — konfirmasi saat eksekusi) |
| Item Cash Discount / Discount Percent | itemCashDiscount / itemDiscPercent | detailItem[] |
| Item Tax1 / Tax2 / Tax3 | useTax1 / useTax2 / useTax3 | detailItem[], boolean |
| Item Note | detailNotes | detailItem[] |
| Item Project No / Department | projectNo / departmentName | detailItem[] |
| ITEM: Finance Category 1-10 | dataClassification1Name..10Name | detailItem[] |
| ITEM: Custom Character/Number/Date 1-10 | ⚠️ TIDAK ADA di schema | **skip** |
| Expense Account no/Name/Amount/Note | accountNo/expenseName/expenseAmount/expenseNotes | detailExpense[] |
| Expense Department / Project No | departmentName / projectNo | detailExpense[] |
| Expense: Finance Category 1-10 | dataClassification1Name..10Name | detailExpense[] |

## Keputusan Desain (Rencana, Mirror Sales Invoice)
1. **Auto-create Customer + Item** — Sales Quotation adalah dokumen
   PALING AWAL rantai Sales (analog Purchase Order di rantai Purchase),
   BUKAN dokumen lanjutan seperti Sales Receipt. Konsisten pola
   `findOrCreateCustomer`/`findOrCreateItem` (Fase 13). Scope OAuth:
   `customer_view`+`customer_save`+`item_save`+
   `data_classification_view`+`data_classification_save`.
2. **Grouping multi-baris**: pola DEFAULT ADR-0011 (`number`/"Trans
   Number" opsional, kosong = 1 baris = 1 quotation sendiri).
3. **`salesmanListNumber` sebagai array**: default 1 nilai per baris
   Excel (`[value]`) kecuali client eksplisit minta multi-salesman split
   per baris — JANGAN over-engineer parsing multi-value sebelum
   dikonfirmasi butuh.
4. **Tidak ada dampak GL/stok** — konsisten sifat "quotation" (bukan
   transaksi final), jadi TIDAK relevan bicara soal "Batal Import" sama
   sekali (tidak ada apa pun untuk dibatalkan di sisi akuntansi,
   `delete.do` di Accurate cukup untuk hapus quotation langsung kalau
   perlu — di luar scope Facport untuk sekarang, sama pola modul lain).

## Known Limitations / Butuh Konfirmasi Saat Eksekusi
- Kolom "Custom Character/Number/Date 1-10" (header maupun ITEM) TIDAK
  ADA di schema resmi — pola sama modul lain.
- `salesmanListNumber` array — konvensi input Excel untuk multi-value
  belum ditentukan (§ tabel mapping).
- `rate` (kurs mata uang asing) TIDAK terlihat di schema resmi level
  root — perlu test call nyata kalau company client transaksi
  quotation multi-currency.
- Sales Order (kelanjutan alami dari modul ini) SENGAJA belum masuk
  scope — client belum siapkan panduannya.

## Referensi
- Spec resmi: `docs/referencehtml/accurate-openapi.json` `/api/sales-quotation/save.do`
- Panduan client (gitignored): sheet "Sales Quotation"
- Modul terkait: `architecture-sales-invoice.md`, `architecture-sales-return.md`
