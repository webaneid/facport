# Architecture — Purchase Return (Retur Pembelian)

> Fase 119 (Planned — arsitektur SAJA, implementasi belum dikerjakan).
> Modul ke-8 dari 21 katalog Accurate (kategori "Purchase"). Sumber:
> panduan client (`docs/referencehtml/facport/developmen-15-september-2026.xlsx`,
> sheet "Purchase Return" — **gitignored, JANGAN pernah commit**) + spec
> resmi Accurate `/api/purchase-return/save.do`.

## Posisi dalam Alur Procurement
Lihat `architecture-purchase-order.md` § "Posisi dalam Alur Procurement".
Purchase Return TIDAK punya SATU dokumen acuan tetap — `returnType`
menentukan dokumen mana yang dijadikan referensi (§ di bawah), beda dari
Purchase Payment yang SELALU mengacu ke Purchase Invoice.

## ⚠️ Kompleksitas Utama: `returnType` Menentukan Field Wajib Lain
```
returnType enum (REQUIRED): INVOICE | INVOICE_DP | NO_INVOICE | RECEIVE
```
- `INVOICE` / `INVOICE_DP` → retur terhadap **Purchase Invoice** yang
  sudah ada → butuh `invoiceNumber`.
- `RECEIVE` → retur terhadap **Receive Item** yang sudah ada (barang
  dikembalikan SEBELUM sempat ditagih) → butuh `receiveItemNumber`.
- `NO_INVOICE` → retur berdiri sendiri, tanpa acuan dokumen apa pun.

`taxDate` + `taxNumber` JUGA REQUIRED tanpa syarat (beda dari
`invoiceNumber`/`receiveItemNumber` yang kondisional per `returnType`)
— retur SELALU melibatkan Faktur Pajak (PPN keluar/masuk terdampak
retur), konsisten aturan pajak Indonesia.

## ⚠️ Keputusan Scope: `returnType` yang DIDUKUNG Fase Ini
**Update 2026-09-15 (dikonfirmasi user sebelum eksekusi Fase 122)**:
SEMUA 4 nilai `returnType` DIDUKUNG — `INVOICE`, `INVOICE_DP`, `RECEIVE`,
`NO_INVOICE`. Keputusan awal (draf riset Fase 119) sempat menolak
`INVOICE_DP` dengan alasan "Facport tidak punya konsep Invoice DP
sendiri" — ini KELIRU KERANGKA BERPIKIRNYA: Facport tidak perlu
MEMBANGUN atau MENGELOLA Invoice DP sebagai fitur sendiri supaya bisa
MEREFERENSIKANNYA di sini. `INVOICE_DP` di Purchase Return cuma butuh
`invoiceNumber` — PERSIS field yang sama dengan `INVOICE` — nomor faktur
DP itu sendiri dibuat/dikelola lewat fitur lain (Accurate langsung, atau
`create-down-payment.do` kalau nanti dibangun) di LUAR modul ini; retur
cuma perlu tahu nomornya. Konsisten prinsip scope Facport (§
`docs/lessons-learned.md`/memory "scope grows with client need if
Accurate API supports it") — kalau Accurate API mendukung dan Facport
BISA mengembangkannya tanpa fitur baru yang belum ada, bangun, jangan
tolak duluan. Validasi (§ di bawah): `INVOICE` DAN `INVOICE_DP`
sama-sama butuh `invoiceNumber` terisi; `RECEIVE` butuh
`receiveItemNumber`; `NO_INVOICE` tidak butuh keduanya.

## Endpoint Accurate
`POST /accurate/api/purchase-return/save.do`.

## Struktur Field `save.do` (Ringkas — Resmi dari OpenAPI Spec)
```
returnType: enum REQUIRED (§ di atas)
taxDate: string REQUIRED
taxNumber: string REQUIRED
vendorNo: string REQUIRED
detailItem[]: REQUIRED
detailExpense[]: REQUIRED (⚠️ BEDA dari Purchase Order yang opsional —
  di sini WAJIB ada minimal 1, walau isinya array kosong `[]` mungkin
  diterima — perlu verifikasi test call nyata)
invoiceNumber: string (kondisional, § returnType)
receiveItemNumber: string (kondisional, § returnType)
branchId/branchName, currencyCode, rate, fiscalRate, cashDiscount,
cashDiscPercent, description, fobName, inclusiveTax, taxable,
paymentTermName, shipmentName, toAddress, number, transDate

detailItem[] tiap baris:
  itemNo, unitPrice, quantity, itemUnitName, detailName, detailNotes,
  departmentName, projectNo, itemCashDiscount, itemDiscPercent,
  useTax1/2/3 (boolean), dataClassification1Name..10Name
  ⚠️ TIDAK ADA warehouseName di detailItem Purchase Return (beda dari
  Purchase Order/Receive Item yang ada) — dikonfirmasi dari spec.

detailExpense[] tiap baris:
  accountNo, expenseAmount, expenseName, expenseNotes, departmentName,
  purchaseOrderNumber, purchaseRequisitionNumber,
  dataClassification1Name..10Name
```

## Field Mapping Excel Client → API (Rencana)
| Excel Column | API Field | Catatan |
|---|---|---|
| Date | transDate | header |
| TransNo | number | header, opsional |
| Invoice No | invoiceNumber | header, WAJIB kalau `Return Type` = INVOICE/INVOICE_DP |
| Receive Item No | receiveItemNumber | header, WAJIB kalau `Return Type` = RECEIVE |
| Vendor No | vendorNo | header, REQUIRED |
| Return Type | returnType | header, REQUIRED, § validasi enum di bawah |
| To Address | toAddress | header |
| Branch | branchName | header, **WAJIB diisi** (§ preseden Fase 90) |
| Notes | description | header |
| Tax Date / Tax Num | taxDate / taxNumber | header, REQUIRED |
| Cash Disc / Cash Disc % | cashDiscount / cashDiscPercent | header |
| Currency Code / Rate / Fiscal Rate | currencyCode / rate / fiscalRate | header |
| FOB | fobName | header |
| Taxable / Include Tax | taxable / inclusiveTax | header, boolean |
| Pay Term | paymentTermName | header |
| Shipment Name | shipmentName | header |
| Item No/Name/Qty/Unit Name/Notes | itemNo/-/quantity/itemUnitName/detailNotes | detailItem[] |
| Item Department / Project No | departmentName / projectNo | detailItem[] |
| ITEM: Custom Character 1-10 | `detailItem[].charField1`-`charField15` | **Dikonfirmasi**, § "Atribut Tambahan" |
| ITEM: Custom Number 1-10 | `detailItem[].numericField1`-`numericField10` | sama |
| ITEM: Custom Date 1-2 | `detailItem[].dateField1`-`dateField2` | sama |
| ITEM: Finance Category 1-10 | dataClassification1Name..10Name | detailItem[] |
| Expense Acc No/Name/Amount/Notes | accountNo/expenseName/expenseAmount/expenseNotes | detailExpense[] |
| Expense Department | departmentName | detailExpense[] |
| Expense Project | **TIDAK ADA field API** — lihat koreksi di bawah | detailExpense[] tidak punya `projectNo` |
| EXPENSE: Finance Category 1-10 | dataClassification1Name..10Name | detailExpense[] |

**Koreksi 2026-09-15 (ditemukan saat eksekusi Fase 122)**: klaim
sebelumnya "Excel client TIDAK punya kolom Item Warehouse" TERNYATA
KELIRU — dibaca ulang langsung dari file, sheet "Purchase Return"
MEMANG punya kolom "Item Warehouse" (persis posisi setelah "Item
Notes"). TAPI dikonfirmasi ulang ke `accurate-openapi.json`:
`detailItem[]` Purchase Return **genuinely TIDAK PUNYA** field
`warehouseName` sama sekali (beda dari Purchase Order/Receive Item yang
punya) — bukan salah baca sebelumnya, field-nya memang tidak ada di API.
**Keputusan**: kolom "Item Warehouse" TIDAK dimasukkan ke
`defaultColumnMap`/opsi field mapping (tidak ada field Accurate valid
untuk dipetakan) — kalau user tetap punya kolom ini di file Excel-nya,
cukup dibiarkan "(tidak dipetakan)" saat konfirmasi mapping, tidak
memengaruhi baris lain. Tidak ada cara mengirim nilai ini ke Accurate
lewat endpoint ini, terlepas dari apa yang diminta client.

**Temuan kedua serupa**: kolom Excel "Expense Project" JUGA tidak punya
field API — dikonfirmasi `detailExpense[]` Purchase Return TIDAK punya
`projectNo` sama sekali (beda dari Purchase Order yang punya). Perlakuan
sama: tidak dimasukkan ke `defaultColumnMap`.

## Validasi `Return Type` (Wajib Sebelum Kirim ke Accurate)
```ts
// § rencana, mirror pola validatePlanKindModules/validateGroupCustomerConsistencyForReceipt
// (validasi custom di layer Facport, gagal cepat dengan pesan jelas —
// JANGAN kirim payload ambigu ke Accurate lalu tebak error-nya)
function validatePurchaseReturnType(returnType: string, row: {...}): { code: string } | null {
  if (!["INVOICE", "INVOICE_DP", "RECEIVE", "NO_INVOICE"].includes(returnType)) {
    return { code: "RETURN_TYPE_NOT_SUPPORTED" };
  }
  if ((returnType === "INVOICE" || returnType === "INVOICE_DP") && !row.invoiceNumber) return { code: "INVOICE_NUMBER_REQUIRED_FOR_RETURN_TYPE" };
  if (returnType === "RECEIVE" && !row.receiveItemNumber) return { code: "RECEIVE_ITEM_NUMBER_REQUIRED_FOR_RETURN_TYPE" };
  return null;
}
```

## Atribut Tambahan (Custom Character/Number/Date) — Field Resmi SUDAH Diketahui
Sama seperti `architecture-purchase-order.md` § "Atribut Tambahan" —
dikonfirmasi resmi Accurate Support (tiket #357901), konsisten lintas
jenis transaksi. Excel client cuma minta versi ITEM: `detailItem[].charField1`-`15`,
`numericField1`-`10`, `dateField1`-`2`. Rekomendasi: 1x verifikasi test
call nyata ke `purchase-return/save.do` sebelum full rollout.

## Keputusan Desain (Rencana)
1. **TIDAK auto-create vendor/item** — dokumen LANJUTAN (retur terhadap
   transaksi yang sudah ada), mirror Receive Item/Purchase Payment.
   Scope OAuth minimal: `item_view` + `data_classification_view`/`_save`
   (Kategori Keuangan dipakai) — TIDAK butuh `vendor_save`/`item_save`.
2. **Grouping multi-baris**: pola DEFAULT ADR-0011 (kunci `number`/
   "TransNo", opsional, kosong = 1 baris = 1 retur sendiri) — BUKAN
   kasus khusus seperti Receive Item, karena `number` di sini memang
   field utama pengenal dokumen (tidak ada field wajib terpisah yang
   lebih cocok jadi kunci).
3. **Semua 4 `returnType` didukung** (§ Keputusan Scope, update
   2026-09-15) — `INVOICE`/`INVOICE_DP` sama-sama cuma butuh
   `invoiceNumber`, TIDAK ada logic beda selain nilai enum-nya. Hanya
   nilai `returnType` DI LUAR 4 ini yang ditolak eksplisit
   (`RETURN_TYPE_NOT_SUPPORTED`).
4. **Tidak ada "Batal Import"** — konsisten pola modul non-invoice
   lain.

## Known Limitations / Butuh Konfirmasi Saat Eksekusi
- Field "Atribut Tambahan" (§ di atas) sudah punya dasar kuat tapi
  BELUM literal dites ke endpoint ini — 1x test call nyata direkomendasikan.
- `detailExpense[]` ditandai REQUIRED di spec tapi TIDAK semua retur
  logically punya biaya tambahan — perlu test call nyata untuk
  konfirmasi apakah array KOSONG `[]` diterima Accurate (kemungkinan
  besar iya, "required" di sini mungkin cuma berarti "field harus ada
  di payload", bukan "harus berisi minimal 1 elemen" — TIDAK boleh
  diasumsikan tanpa verifikasi, preseden Fase 90 soal branch).

## Referensi
- Spec resmi: `docs/referencehtml/accurate-openapi.json` `/api/purchase-return/save.do`
- Panduan client (gitignored): sheet "Purchase Return"
- Modul terkait: `architecture-purchase-order.md`, `architecture-receive-item.md`, `architecture-purchase-invoice.md`
