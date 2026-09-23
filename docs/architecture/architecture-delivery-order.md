# Architecture — Delivery Order (Pengiriman Pesanan)

> Fase 157-158. Modul ke-22 Facport (kategori "Sales") — MODUL BARU, sebelumnya
> Facport TIDAK punya modul ini sama sekali walau Sales Invoice sudah punya
> field referensi ke sana (`itemDeliveryOrderNo`, § architecture-sales-invoice.md).
> Sumber: kebutuhan client dari testing manual (bug lintas-dokumen "kode
> barang sama butuh Detail ID", § `docs/lessons-learned.md` 2026-09-24) +
> template Excel client (`docs/referencehtml/facport/developmen-15-september-2026.xlsx`
> sheet "Delivery Order", dan `FACPORT_Delivery Order_v8.xlsx` — **kedua
> file gitignored, JANGAN pernah commit**) + spec resmi Accurate
> `/api/delivery-order/save.do`. Fase 158 menambah **auto-resolve Sales
> Order Detail ID server-side** — reverse-engineering legacy tool client
> sendiri (facport.com/FAC Institute, alat yang sedang digantikan project
> ini) menemukan proses manualnya (cek halaman "Sales Order Item Check" →
> VLOOKUP Excel), kita ganti jadi otomatis di server.

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
  dataClassification1Name..10Name, detailSerialNumber[] (struktur
  DIKONFIRMASI dari spec resmi, `{serialNumberNo, quantity, expiredDate}`,
  identik `material-slip.mapping.ts`)
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
| Sales Order Detail ID | detailItem.salesOrderDetailId | item | Opsional — **AUTO-RESOLVE server-side sejak Fase 158**, § di bawah |
| Item Sales Quot No | detailItem.salesQuotationNumber | item | Opsional |
| Item Reverse Invoice | detailItem.reverseInvoiceNumber | item | Opsional |
| CLS2/CLS5 (posisi ITEM, setelah "Item Reverse Invoice") | detailItem.dataClassification2Name/5Name | item | Opsional, AKTIF — CLS5 dipakai client sebagai label "Week N" (§ di bawah) |
| Serial Num / Qty / Exp Date | detailItem.detailSerialNumber[] | item | Opsional |

## Fase 158 — Auto-Resolve `Sales Order Detail ID` Server-Side
**Ditemukan dari reverse-engineering legacy tool client sendiri**
(facport.com, brand "facport #Excel to Accurate Online" milik FAC
Institute — alat yang SEDANG DIGANTIKAN oleh project ini, developer lama
tidak mau serahkan source code-nya ke client). Alur manual legacy tool:

1. User buka halaman "Sales Order Item Check" (`sales-order-detail-search`),
   masukkan No. Sales Order (bisa banyak, pisah koma).
2. Sistem tarik dari Accurate: tabel `Item No | Item Name | Quantity |
   Description | Sales Order Detail ID` per baris SO itu — kolom
   "Description" di sini SEBENARNYA CLS5 (`dataClassification5Name`) SO
   itu, dipakai client sebagai label **"Week N"** (batch produksi) untuk
   membedakan baris dengan `itemNo` sama.
3. User copy hasil ke sheet bantu Excel, bikin kolom "Rumus" = `Item No &
   Description(Week)`, lalu di sheet utama kolom "Item Project No" diisi
   rumus `Item No & CLS5` (bukan projectNo asli — di-overload jadi kunci
   komposit), dan "Sales Order Detail ID" diisi
   `VLOOKUP(ItemProjectNo, SheetBantu!A:F, 6, 0)`.

**Kesimpulan**: fakta bahwa user WAJIB lakukan proses manual ini SEBELUM
upload adalah bukti backend legacy-nya cuma **pass-through** (baca kolom
"Sales Order Detail ID" dari Excel, kirim apa adanya ke Accurate) — TIDAK
ada resolusi otomatis di server mereka. Facport **melakukan resolusi ini
sendiri di server**, menghilangkan seluruh beban manual dari user:

- `getSalesOrderDetailByNumber` (`accurate-sales-order.ts`) — panggil
  `GET sales-order/detail.do?number=...` (endpoint resmi, params `id`
  atau `number` — TAPI struktur respons TIDAK terdokumentasi di spec,
  cuma "Success" tanpa skema).
- **DIKONFIRMASI test call NYATA 2026-09-24** (Data Usaha "Webane
  Indonesia", database "Retail Demo", akun `kurikulum.fac@gmail.com`):
  `detailItem[].id` = ID BARIS per-item (BUKAN id header SO) —
  dibuktikan pakai SO nyata "SO-IDR-01" (2 baris `itemNo` "9900014" sama)
  yang balik `id` 102300 & 102301 (beda, urut). `detailItem[].item.no`
  nested — persis pola `getPurchaseInvoiceDetail` (ADR-0012).
  `detailItem[].dataClassification5` — OBJEK nested `{id, name}` (BUKAN
  string flat `dataClassification5Name`) — konsisten field relasi lain di
  respons ini, TAPI belum ada data uji CLS5 TERISI (semua SO uji di
  database demo ini `dataClassification5: null`) untuk konfirmasi 100%
  bentuk saat terisi.
- `resolveSalesOrderDetailId` (`delivery-order.mapping.ts`, PURE function,
  ditest tanpa mock HTTP) — logic disambiguasi: `itemNo` UNIK di SO
  tersebut → langsung resolve, TIDAK BUTUH CLS5. `itemNo` DUPLIKAT → WAJIB
  cocok juga CLS5 (Week) baris Delivery Order dengan CLS5 baris Sales
  Order yang sesuai — kalau tetap tidak bisa dipastikan SATU baris cocok,
  **LEMPAR ERROR** (aman, bukan tebak — mirror filosofi ADR-0013).
- `resolveSalesOrderDetailIds` (`workers/index.ts`) — orchestrator: dedupe
  fetch per nomor SO unik dalam 1 grup (cache lokal per-panggilan), skip
  kalau user SUDAH isi `salesOrderDetailId` manual (override tetap
  didukung untuk kasus edge/data dari tool lama).

## CLS2/CLS5 Versi HEADER — Field Accurate TIDAK ADA (Tetap Tidak Dipetakan)
Posisi Excel SEBELUM "Item No" (beda dari versi ITEM di atas yang SUDAH
aktif). Dicek MENYELURUH ke SEMUA endpoint `save.do` di spec resmi
Accurate (Sales Order, Sales Quotation, Purchase Invoice, Delivery Order
sendiri, dst): **tidak ada SATU PUN endpoint yang punya Kategori Keuangan
di level header** — classification di Accurate SELALU cuma ada di level
detail/expense. Contoh nilai di template client (`PONO0912332`/`Week 1`
untuk header vs `ITMPONO098241231`/`WeekItem 1` untuk item) MEMANG berbeda
secara nyata (bukan copy-paste error), tapi tidak ada kandidat field
Accurate yang plausible untuk ini — TIDAK dimasukkan ke `fieldToAccuratePath`
sama sekali, kolom ini kalau ada di Excel user cuma tampil "(tidak
dipetakan)", aman diabaikan. **Masih perlu klarifikasi client** kegunaan
kolom ini (murni internal atau ada maksud lain yang belum kita tangkap).

## Keputusan Desain
1. **TIDAK auto-create customer/item** — mirror Receive Item. Delivery
   Order adalah dokumen LANJUTAN (customer & barang harusnya sudah ada dari
   Sales Order/Sales Quotation sebelumnya) — `customerNo`/`itemNo` dikirim
   APA ADANYA, Accurate validasi eksistensi.
2. **Grouping by `number`** (standar ADR-0011) — bukan pola custom seperti
   Receive Item.
3. **Tidak ada "Batal Import"** — konsisten pola Receive Item/Purchase
   Payment/Sales Receipt (dokumen fisik, bukan transaksi akuntansi mandiri).
4. **`salesOrderDetailId` AUTO-RESOLVE server-side (Fase 158)**, bukan
   diminta manual dari user — nilai lebih baik dari legacy tool client
   sendiri (§ di atas), sambil TETAP dukung override manual untuk kasus
   edge.

## Known Limitations / Butuh Konfirmasi
- **CLS2/CLS5 versi header** — masih perlu klarifikasi client soal
  kegunaannya (§ di atas), belum ada kandidat field Accurate yang cocok.
- **Bentuk `dataClassification5` saat TERISI belum ada data uji nyata**
  (semua SO di database demo yang dites `null`) — diasumsikan `{id, name}`
  mengikuti pola konsisten field relasi lain di respons `sales-order/
  detail.do`, tapi belum 100% dikonfirmasi dengan data yang benar-benar
  terisi. Kalau nanti ketemu SO dengan CLS5 terisi dan resolusinya gagal,
  cek dulu bentuk objek ini sebelum curiga ke tempat lain.
- **6 relasi lintas-dokumen lain** yang punya potensi bug serupa
  (Purchase Invoice←Receive Item butuh `receiveItemDetailId` yang SUDAH
  dikonfirmasi Accurate Support tapi belum diimplementasi, Sales Order←
  Sales Quotation, Receive Item←Purchase Order, Purchase Order←Purchase
  Requisition, Item Requisition/Item Transfer←Sales Order, Sales Invoice←
  Delivery Order/Sales Order/Sales Quotation) — TIDAK disentuh fase ini
  (keputusan eksplisit user: fokus Delivery Order dulu, pola yang sama
  di-copy ke modul lain setelah ini terbukti jalan), dicatat sebagai
  technical debt di `docs/lessons-learned.md`.

## Referensi
- Spec resmi: `docs/referencehtml/accurate-openapi.json` `/api/delivery-order/save.do`
- Panduan client (gitignored): `developmen-15-september-2026.xlsx` sheet
  "Delivery Order", `FACPORT_Delivery Order_v8.xlsx`
- Modul sejenis (template pola kode): `architecture-receive-item.md`
- Modul terkait dalam rantai: `architecture-sales-order.md`,
  `architecture-sales-quotation.md`, `architecture-sales-invoice.md`
- ADR rujukan: ADR-0011 (grouping default), ADR-0019 (SKU per sub-modul)
