# Architecture — Sales Order (Pesanan Penjualan)

> Fase 136 (Planned — arsitektur SAJA, implementasi belum dikerjakan).
> Modul ke-6 dari kategori "Sales" (setelah Sales Quotation, Sales
> Invoice, Sales Receipt, Sales Return). Sumber kebutuhan: panduan
> client (`docs/referencehtml/facport/developmen-15-september-2026.xlsx`,
> sheet "Sales Order" — **file ini gitignored** (`docs/referencehtml/`),
> **JANGAN pernah di-commit**) + spec resmi Accurate
> (`docs/referencehtml/accurate-openapi.json` `/api/sales-order/save.do`).
> Fase 119 (2026-09-15) sengaja SKIP modul ini karena client belum
> siapkan panduannya — sekarang sudah tersedia.

## Posisi dalam Alur Penjualan

Sales Order adalah kelanjutan LANGSUNG dari Sales Quotation (Fase 123,
Done) — client mengonfirmasi penawaran jadi pesanan resmi:

```
Sales Quotation → Sales Order → Sales Invoice → Sales Receipt
   (penawaran)      (pesanan)     (faktur resmi)   (pelunasan)
                                        ↓
                                 Sales Return (retur, vs Invoice)
```

Sama filosofi modul lain: TIDAK ada auto-chaining. `Sales Quot No` di
Sales Order cuma REFERENSI (field `salesQuotationNumber`, tidak
divalidasi lokal), bukan trigger otomatis apa pun di Accurate.

## Endpoint Accurate
`POST /accurate/api/sales-order/save.do` — dikonfirmasi dari
`accurate-openapi.json`. Strukturnya HAMPIR IDENTIK dengan Sales
Quotation (`architecture-sales-quotation.md`) — perbedaan utama cuma
field `poNumber` (referensi PO customer) yang tidak ada di Quotation.

## Struktur Field `save.do` (Ringkas — Resmi dari OpenAPI Spec)
```
customerNo: string REQUIRED
branchId / branchName, paymentTermName, toAddress, description, poNumber
cashDiscount, cashDiscPercent, currencyCode, rate, fobName
shipDate, shipmentName, inclusiveTax, taxable, number, transDate

detailItem[] (REQUIRED, minimal 1):
  itemNo, unitPrice, quantity, itemUnitName, detailName, detailNotes,
  warehouseName, departmentName, projectNo, salesQuotationNumber,
  itemCashDiscount, itemDiscPercent, useTax1/2/3 (boolean),
  salesmanListNumber[] (array nomor sales),
  dataClassification1Name..10Name (Kategori Keuangan)

detailExpense[] (REQUIRED oleh spec, tapi array kosong `[]` diterima
jika tidak ada baris Expense di Excel — konsisten pola modul lain):
  accountNo, expenseAmount, expenseName, expenseNotes, departmentName,
  salesQuotationNumber, dataClassification1Name..10Name
```

## Field Mapping Excel Client → API
Kolom Excel 1:1 cocok field API (nama kolom sengaja mirror istilah
Accurate) — TIDAK ada kolom asing yang butuh riset tambahan, TIDAK ada
kebutuhan cross-API. Grouping multi-baris SAMA pola Sales Quotation/
Purchase Invoice (ADR-0011): `Trans No` (kalau diisi) jadi kunci
grouping.

| Excel Column | API Field | Catatan |
|---|---|---|
| Trans Date | transDate | header |
| Trans No | number | header, opsional (kunci grouping) |
| Cust No | customerNo | header, REQUIRED |
| Pay Term Name | paymentTermName | header |
| To Address | toAddress | header |
| Description | description | header |
| PO Number | poNumber | header, referensi PO customer (BUKAN field yang ada di Sales Quotation) |
| Branch Name | branchName | header, **WAJIB diisi** (§ Branch Wajib) |
| Cash Discount / Cash Disc Percent | cashDiscount / cashDiscPercent | header |
| Currency Code / Rate | currencyCode / rate | header |
| FOB Name | fobName | header |
| Shipment Date / Shipment Name | shipDate / shipmentName | header |
| Include Tax / Taxable | inclusiveTax / taxable | header, boolean |
| Item No / Item Name / Item Price / Qty / Unit Name / Item Note | itemNo / detailName / unitPrice / quantity / itemUnitName / detailNotes | detailItem[] |
| Sales Quot No | salesQuotationNumber | detailItem[], referensi Sales Quotation (tidak divalidasi lokal) |
| Item Cash Discount / Item Disc Percent | itemCashDiscount / itemDiscPercent | detailItem[] |
| Item Dept / Item Project No | departmentName / projectNo | detailItem[] |
| Sales List No (separate with comma) | salesmanListNumber[] | detailItem[], split by koma jadi array |
| PPN / PPnBM / PPh | useTax1 / useTax2 / useTax3 | detailItem[], boolean |
| Item CLS1/CLS2/CLS3 | dataClassification1/2/3Name | detailItem[], Kategori Keuangan |
| Expense Acc No/Name/Amount/Note | accountNo/expenseName/expenseAmount/expenseNotes | detailExpense[] |
| Expense Sales Quot No | salesQuotationNumber | detailExpense[] |
| Expense Dept | departmentName | detailExpense[] |
| Expense CLS1/2/3 | dataClassification1/2/3Name | detailExpense[] |

## Keputusan Desain (Rencana, Mirror Sales Quotation)
1. **Auto-create Customer + Item** — Sales Order adalah dokumen yang
   customer-nya BISA baru (belum tentu sudah quotation duluan). Pola
   `findOrCreateCustomer`/`findOrCreateItem` (mirror Sales Quotation
   Fase 123, Sales Invoice Fase 05). Scope OAuth: `sales_order_save`,
   `customer_view`+`customer_save`, `item_save`,
   `data_classification_view`+`data_classification_save`.
2. **Grouping multi-baris** — SAMA persis pola Sales Quotation/Purchase
   Invoice (ADR-0011).
3. **Tidak ada "Batal Import"** — konsisten Sales Quotation/Purchase
   Payment (dokumen bisa duplikat sah, bukan direplace).
4. **`salesmanListNumber` array dari 1 kolom Excel** — kolom "Sales
   List No (separate with comma)" perlu di-split manual jadi array
   string sebelum kirim ke API (bukan 1:1 seperti field lain) — pola
   parsing baru, belum ada preseden persis di modul lain (paling dekat:
   parsing serial number Item Transfer, tapi itu nested object bukan
   array string sederhana).

## Atribut Tambahan (Custom Character/Number/Date)
Excel client Sales Order **TIDAK** minta kolom "Custom Character/
Number/Date" (beda dari Purchase Order/Sales Invoice) — cuma minta
"Item CLS1-3" (Kategori Keuangan `dataClassification`, SUDAH pasti
didukung resmi). Tidak ada scope tambahan atau field mapping baru untuk
Atribut Tambahan di modul ini.

## ⚠️ Branch Wajib (Preseden Fase 90)
Sama seperti semua modul baru lain sejak Fase 90 — `Branch Name` WAJIB
divalidasi non-kosong di Facport SEBELUM kirim ke Accurate. Perlu
diverifikasi ulang lewat test call nyata saat eksekusi.

## Known Limitations / Butuh Konfirmasi Saat Eksekusi
- `manual-close-order.do` (endpoint terpisah, "tutup SO manual" tanpa
  full invoice) ADA di spec tapi TIDAK diminta client — sengaja tidak
  masuk scope fase ini (mirror keputusan sama di Purchase Order § Fase
  119).
- `bulk-save.do` ADA tapi project ini KONSISTEN pakai `save.do` per-grup.
- Parsing `salesmanListNumber` dari string "separate with comma" perlu
  ditentukan delimiter exact (koma + spasi opsional?) saat eksekusi.

## Referensi
- Spec resmi: `docs/referencehtml/accurate-openapi.json` `/api/sales-order/save.do`
- **✅ Portal developer live, diverifikasi lengkap 2026-09-21**: SEMUA
  field (`detailItem[]`, `detailExpense[]`, header) cocok 100% dengan
  spec lokal — 0 gap ditemukan. Modul ini SIAP eksekusi tanpa risiko
  dokumentasi API. Verifikasi via `account.accurate.id/developer/api-docs.do`.
- Panduan client (gitignored): `docs/referencehtml/facport/developmen-15-september-2026.xlsx` sheet "Sales Order"
- Modul kembar/pendahulu: `architecture-sales-quotation.md`
- Pola grouping multi-item: ADR-0011, `architecture-purchase-invoice.md`
- Preseden Branch Wajib: `architecture-purchase-payment.md` § "Fase 90"

## Fase 169 (2026-10-06) — Ambil baris item dari Sales Quotation
Sales Order memuat kolom "Sales Quot No" (`detailItem.salesQuotationNumber`) yang selama ini hanya meneruskan nomor. Spec Accurate mewajibkan `itemNo`+`unitPrice` di `detailItem`, jadi isi penawaran tidak ikut tertarik otomatis — Facport yang harus menyediakannya.
**Aturan:** baris dengan Sales Quot No terisi DAN Item No, Item Name, Item Price, Item Note, Qty, Unit Name semuanya kosong → diperluas menjadi semua baris item penawaran (dibaca via `GET sales-quotation/detail.do?number=`, scope `sales_quotation_view`); salah satu kolom itu terisi → seluruhnya dari Excel (tidak ada "isi sebagian dari penawaran" — qty order bisa lebih kecil dari penawaran). Kolom lain pada baris itu berlaku ke semua baris hasil perluasan. Barang hasil perluasan tidak melalui auto-create (sudah pasti ada di Accurate).
**Scope OAuth:** `sales_quotation_view` ditambahkan sebagai KEBUTUHAN modul `sales_order` (registri endpoint) — customer Sales Order yang ada diminta "Perbarui izin" sekali (keputusan user: wajib, bukan opsional).
**Validasi "wajib" per baris** (edit baris/edit massal, API + UI) dikecualikan untuk baris perluasan: `missingRequiredFieldsForRow`.
⚠️ Bentuk respons `sales-quotation/detail.do` tidak terdokumentasi di spec; parser ketat (baris tanpa itemNo/harga/qty/satuan terbaca = error jelas, tidak ada data setengah terkirim) — verifikasi dengan respons asli.

## Fase 172 (2026-10-07) — Tarik juga header, atribut baris, dan Beban dari Sales Quotation
Permintaan client (kolom kuning di template uji): selain baris item (Fase 169), baris perluasan menarik juga **Pay Term Name, To Address,
Description, Cash Discount, Cash Disc Percent, Currency Code** (header), **Item Cash Discount, Item Disc Percent, Item Dept, Item Project No,
Sales List No, PPN, PPh** (atribut baris) dan **baris Expense (Acc No/Name/Amount/Note)**. Tidak butuh scope baru (`sales_quotation_view` sama).
- **Isian Excel menang.** Kolom terisi dipakai apa adanya; hanya yang KOSONG diisi dari penawaran. PPN/PPh `FALSE` di Excel dianggap terisi.
- Header diambil dari penawaran PERTAMA yang diperluas dalam 1 Sales Order (kalau beberapa penawaran berbeda, header mengikuti yang pertama).
- Expense penawaran ditarik **hanya bila Excel tidak punya baris Expense sama sekali** (hindari ganda), dibawa dengan `salesQuotationNumber` penawarannya.
- Nilai tambahan yang tidak terbaca dari respons Accurate = **tidak ditarik** (bukan error); Expense penawaran yang ada tapi akun/jumlahnya tidak
  terbaca = **gagal jelas** (data akuntansi). Diskon 0 tidak ditarik.
- ✅ Nama field BACA diverifikasi respons ASLI 2026-10-07 (Retail Demo, 100 penawaran dipindai lewat skrip probe read-only): `paymentTerm.name`,
  `currency.code`, `toAddress`, `description`, `cashDiscount`/`cashDiscPercent` (string), baris `department.name`, `salesmanList[].number`,
  `useTax1/2/3` boolean, `itemCashDiscount`/`itemDiscPercent`. ⚠️ BELUM terbukti: `project` baris (null di semua contoh; diasumsikan `projectNo`/`no`)
  dan `detailExpense[]` (kosong di semua contoh; diasumsikan `account.no`) — retest begitu ada penawaran dengan proyek/Beban.
- Diskon persen DAN nominal sama-sama terisi di respons asli → bila persen ada, hanya persen yang ditarik (nominal turunan; hindari bentrok pembulatan).
- **Expense Project (kolom ungu) tidak dibuat**: `detailExpense[]` Sales Order/Quotation tidak punya `projectNo` di spec (hanya `detailItem[]`).
