# Architecture — Purchase Order (Pesanan Pembelian)

> Fase 119 (Planned — arsitektur SAJA, implementasi belum dikerjakan).
> Modul ke-8 dari 21 katalog Accurate (kategori "Purchase"), sub-modul
> ke-7 yang dijual Facport. Sumber kebutuhan: panduan client
> (`docs/referencehtml/facport/developmen-15-september-2026.xlsx`, sheet
> "Purchase Order" — **file ini WAJIB gitignored, JANGAN pernah di-commit**)
> + spec resmi Accurate (`docs/referencehtml/accurate-openapi.json`
> `/api/purchase-order/save.do`).

## Posisi dalam Alur Procurement

Purchase Order adalah **titik AWAL** rantai pembelian di Accurate, BUKAN
transaksi akuntansi (tidak ada jurnal GL dari PO sendiri — cuma
"pesanan"/komitmen ke vendor):

```
Purchase Order → Receive Item → Purchase Invoice → Purchase Payment
   (pesan)         (terima barang)   (tagihan resmi)    (bayar)
                                            ↓
                                    Purchase Return (retur, bisa vs PO/Receive/Invoice)
```

Facport SUDAH punya Purchase Invoice & Purchase Payment (live). Fase ini
+ Receive Item + Purchase Return (2 doc terpisah, § dokumen masing-masing)
melengkapi SELURUH rantai. Konsekuensi desain: `detailItem[]`
Purchase Order TIDAK auto-jadi Purchase Invoice — itu tetap proses
import Excel TERPISAH (customer upload Excel Purchase Invoice sendiri
nanti, referensi manual by `purchaseOrderNumber` kalau relevan) — SAMA
filosofi modul lain (tidak ada auto-chaining antar modul, tiap modul 1
import 1 tujuan).

## Endpoint Accurate
`POST /accurate/api/purchase-order/save.do` — dikonfirmasi dari
`accurate-openapi.json` (bukan tebakan).

## Struktur Field `save.do` (Ringkas — Resmi dari OpenAPI Spec)
```
vendorNo: string REQUIRED
branchId / branchName: integer / string  (⚠️ lihat § "Branch Wajib" di bawah)
currencyCode, rate, cashDiscount, cashDiscPercent, description
fobName, shipDate, shipmentName, toAddress, paymentTermName
inclusiveTax, taxable
fillPriceByVendorPrice: boolean  (harga ambil dari data vendor, bukan input manual)
number (nomor transaksi PO, opsional — auto-number kalau kosong)
transDate

detailItem[] (item yang dipesan):
  itemNo, unitPrice, quantity, itemUnitName, detailName, detailNotes,
  warehouseName, departmentName, projectNo, purchaseRequisitionNumber,
  itemCashDiscount, itemDiscPercent, useTax1/2/3 (boolean),
  dataClassification1Name..10Name (Kategori Keuangan)

detailExpense[] (biaya tambahan level dokumen, opsional):
  accountNo, expenseAmount, expenseName, expenseNotes, departmentName,
  dataClassification1Name..10Name
```

## Field Mapping Excel Client → API (Rencana)
Kolom Excel client (`sheet "Purchase Order"`) 1:1 cocok field API di
atas (nama kolom sengaja mirror istilah Accurate) — TIDAK ada kolom
asing yang butuh riset tambahan. Konvensi grouping SAMA seperti Purchase
Invoice (ADR-0011): kolom header (`Trans Date`, `Trans No`, `Vendor No`,
dst) dari baris PERTAMA grup, `Trans No` (kalau diisi) jadi kunci
grouping banyak baris Excel jadi 1 `detailItem[]`. Kolom `PPN`/`PPnBM`/
`PPh` di Excel → `useTax1`/`useTax2`/`useTax3` boolean (posisi tax
slot 1/2/3 ini KONVENSI Accurate, bukan urutan bebas — perlu dikonfirmasi
company settingnya kalau ada ambiguitas saat eksekusi).

| Excel Column | API Field | Catatan |
|---|---|---|
| Trans Date | transDate | header |
| Trans No | number | header, opsional (kunci grouping) |
| Vendor No | vendorNo | header, REQUIRED |
| Pay Term Name | paymentTermName | header |
| To Address | toAddress | header |
| Branch Name | branchName | header, **WAJIB diisi** (§ di bawah) |
| Description | description | header |
| Fill Price By Vendor | fillPriceByVendorPrice | header, boolean |
| Cash Discount / Cash Disc Percent | cashDiscount / cashDiscPercent | header |
| Currency Code / Rate | currencyCode / rate | header |
| FOB Name | fobName | header |
| Shipment Date / Shipment Name | shipDate / shipmentName | header |
| Include Tax / Taxable | inclusiveTax / taxable | header, boolean |
| Item No/Name/Qty/Unit Name/Price/Note/Warehouse | itemNo/-/quantity/itemUnitName/unitPrice/detailName atau detailNotes/warehouseName | detailItem[] |
| ITEM: Cash Discount / Disc Percent | itemCashDiscount / itemDiscPercent | detailItem[] |
| ITEM: Requisite No | purchaseRequisitionNumber | detailItem[] |
| ITEM: Department / Project No | departmentName / projectNo | detailItem[] |
| ITEM: Custom Character/Number/Date 1-10 | ⚠️ TIDAK ADA di schema resmi `save.do` — kemungkinan field UI-only/report, BUKAN payload API | **skip**, § Known Limitations |
| PPN / PPnBM / PPh | useTax1 / useTax2 / useTax3 | detailItem[], boolean |
| ITEM: Finance Category 1-10 | dataClassification1Name..10Name | detailItem[], Kategori Keuangan |
| Expense Acc No/Name/Amount/Note | accountNo/expenseName/expenseAmount/expenseNotes | detailExpense[] |
| EXPENSE: Department/Project No | departmentName/projectNo | detailExpense[] |
| EXPENSE: Finance Category 1-10 | dataClassification1Name..10Name | detailExpense[] |

## Keputusan Desain (Rencana, Mirror Purchase Invoice)
1. **Auto-create Vendor + Item** — Purchase Order adalah dokumen
   PERTAMA di rantai (analog Purchase Invoice, BUKAN analog Purchase
   Payment/Sales Receipt yang mengacu ke dokumen SUDAH ADA). Konsisten
   pola `findOrCreateVendor`/`findOrCreateItem` (Fase 05/78) — customer
   yang order barang/vendor BARU tidak boleh gagal cuma karena master
   data belum ada. Scope OAuth: `vendor_view`+`vendor_save`+`item_save`+
   `data_classification_view`+`data_classification_save` (baseline
   `item_view` selalu ada, § `accurate-scopes.ts`).
2. **Grouping multi-baris** — SAMA persis pola Purchase Invoice (ADR-0011):
   `number` (Trans No) jadi kunci, kosong = 1 baris = 1 PO sendiri.
3. **Tidak ada "Batal Import"** — konsisten Purchase Payment/Sales
   Receipt (2 PO nominal sama bukan duplikat, bisa jadi 2 pesanan sah
   beda) — KECUALI ternyata client eksplisit minta beda, dikonfirmasi
   saat eksekusi.
4. **Kolom "ITEM: Custom Character/Number/Date 1-10" DI-SKIP** — tidak
   ada di schema resmi `save.do` (dicek exhaustif, beda dari
   Custom Character di LEVEL HEADER yang juga tidak ada di schema PO —
   Purchase Order TIDAK punya header-level custom field sama sekali per
   API, beda dari modul lain yang punya). Kalau nanti ternyata field ini
   ADA tapi under nama beda, revisit saat eksekusi (test call nyata).

## ⚠️ Branch Wajib (Preseden Fase 90)
Purchase Payment & Sales Receipt SUDAH terbukti (test call nyata, Fase
90) Accurate MENOLAK transaksi tanpa `branchName` eksplisit untuk company
multi-cabang, walau spec schema tandai opsional. **Asumsikan SAMA
berlaku di Purchase Order** — `Branch Name` WAJIB divalidasi non-kosong
di Facport SEBELUM kirim ke Accurate (fail-fast dengan pesan jelas),
bukan mengandalkan Accurate reject di detik terakhir. Perlu diverifikasi
ulang lewat test call nyata saat eksekusi (jangan cuma asumsi dari modul
lain).

## Known Limitations / Butuh Konfirmasi Saat Eksekusi
- Kolom "ITEM: Custom Character/Number/Date 1-10" di Excel client TIDAK
  ADA padanan di schema resmi `save.do` — kemungkinan besar field ini
  cuma ada di UI Accurate (custom field per-perusahaan), bukan expose
  API. Perlu test call nyata untuk pastikan (bukan asumsi dari absennya
  di OpenAPI spec saja — preseden Fase 90 membuktikan spec statis bisa
  tidak menangkap semua perilaku).
- `manual-close-order.do` (endpoint terpisah, "tutup PO manual" tanpa
  full receive) ADA di spec tapi TIDAK diminta client — sengaja tidak
  masuk scope fase ini.
- `bulk-save.do` (varian bulk) ADA tapi project ini KONSISTEN pakai
  `save.do` per-grup (pola semua modul lain) — tidak ada rencana pindah
  ke bulk-save.

## Referensi
- Spec resmi: `docs/referencehtml/accurate-openapi.json` `/api/purchase-order/save.do`
- Panduan client (gitignored): `docs/referencehtml/facport/developmen-15-september-2026.xlsx` sheet "Purchase Order"
- Pola grouping multi-item: ADR-0011, `architecture-purchase-invoice.md`
- Preseden Branch Wajib: `architecture-purchase-payment.md` § "Fase 90"
- Modul lanjutan dalam 1 rantai: `architecture-receive-item.md`, `architecture-purchase-invoice.md`, `architecture-purchase-payment.md`, `architecture-purchase-return.md`
