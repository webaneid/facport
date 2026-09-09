# Architecture — Modul Sales Invoice (Faktur Penjualan)

> Dipisah dari `architecture-accurate-integration.md` (2026-09-05, saat
> audit kematangan dokumentasi per-modul). File itu SEKARANG isinya
> cuma infra bersama (OAuth, skema bulk-import generik, rate limit,
> error handling Accurate) — baca dulu untuk konteks OAuth/sesi Data
> Usaha sebelum baca file ini.
>
> Status: **✅ Live sejak Fase 13.**

> Client minta 5 sub-modul aktif (2026-09-04): Sales Invoice (SI),
> Purchase Invoice (PI, § `architecture-purchase-invoice.md`), Sales
> Receipt/"Customer Receipt" (CR), Purchase Payment (PP), Journal
> Voucher/"Jurnal Umum" (JU). Fase 13 ini Sales Invoice SAJA — PP/CR/JU
> BELUM DIKERJAKAN (status per 2026-09-05, § `docs/PROGRESS.md`). Semua
> endpoint/scope di bawah diverifikasi langsung dari
> `docs/referencehtml/accurate-openapi.json` (OpenAPI spec resmi
> Accurate, bukan tebakan).

## Prinsip: SI Adalah Bayangan Cermin PI

`vendorNo`↔`customerNo`, Vendor↔Customer, semua pola generik yang sudah
diputuskan untuk PI (grouping multi-item per ADR-0011, retry cerdas per
ADR-0012, batal import per ADR-0013/ADR-0014) **diterapkan APA ADANYA
ke resource baru ini**, bukan didesain ulang. Dibangun LANGSUNG lengkap
(bukan bertahap seperti histori PI Fase 02→05→06→08→09) — keputusan
eksplisit user 2026-09-04, karena pola-nya sudah terbukti matang di PI.

## Endpoint Accurate

`/api/sales-invoice/*`, host dinamis dari sesi Data Usaha:

| Endpoint | Method | Scope |
|---|---|---|
| `/save.do` | POST | `sales_invoice_save` |
| `/detail.do` | GET | `sales_invoice_view` |
| `/list.do` | GET | `sales_invoice_view` |
| `/delete.do` | DELETE | `sales_invoice_delete` |

Scope `sales_invoice_view`/`sales_invoice_save` sudah ada di
`apps/api/src/lib/accurate-scopes.ts` sejak awal project — belum
pernah dipakai endpoint/service sampai Fase 13.

**Field wajib** `save.do`: `detailItem[].itemNo`, `detailItem[].unitPrice`
(persis PI). `customerNo` SECARA TEKNIS opsional di schema Accurate
(beda dari PI yang `vendorNo` juga opsional secara schema tapi WAJIB
secara bisnis) — tetap diperlakukan WAJIB di `requiredFields` mapping
kita, konsisten dengan PI.

## Customer (Data Master, Setara Vendor di PI)

`apps/api/src/lib/accurate-customer.ts`, mirror 1:1 `accurate-vendor.ts`:
- `findCustomerByNo` — `customer/list.do` + `filter.no.val`, sama pola
  `findVendorByNo`.
- `findOrCreateCustomer` — auto-create kalau `customerNo` di Excel
  belum ada, field opsional `customerName` (wajib diisi kalau memang
  mau buat baru), kategori/telepon/WA/email/alamat/negara — SEMUA
  create-only (tidak update customer existing), KECUALI:
- **`customerReceivableAccountListNo`** ("Akun Piutang") — setara
  `vendorPayableAccountListNo` di PI (§ `architecture-vendor-payable-account.md`):
  BOLEH update customer yang SUDAH ADA juga, bukan cuma saat create.
  Field asli Accurate dikonfirmasi ada di `customer/save.do` schema
  (`customerReceivableAccountListNo`, tipe String) — simetris persis
  dengan vendor, TIDAK perlu modul "Import Data Pelanggan" terpisah
  (beda dari PI yang punya Vendor sebagai modul mandiri berbayar sejak
  Fase 28 — di sini cukup jadi field opsional di Sales Invoice
  langsung karena tidak ada permintaan client spesifik soal itu, gampang
  ditambah modul terpisah nanti kalau ternyata dibutuhkan).

## Multi-Item, Retry Cerdas, Batal Import

Reuse fungsi generik `workers/index.ts` yang sudah ada untuk PI
(polanya, bukan fungsinya langsung), diterapkan lewat fungsi SI sendiri
(`groupSalesInvoiceRows`, `processSalesInvoiceGroup`,
`appendToExistingSalesInvoice`, `findExistingAccurateSalesInvoiceId`) —
kolom pengelompokan AWALNYA cuma **"PO Number"** (`poNumber`, field
resmi Accurate di `sales-invoice/save.do` — referensi nomor PO dari
customer, peran sama seperti Bill No vendor di PI).

> **Refinement Fase 67 (2026-09-08)**: guard idempotent
> `appendToExistingSalesInvoice` (skip `save.do` kalau semua item grup
> sudah match faktur existing, § ADR-0012) tadinya berlaku untuk SEMUA
> match lintas-batch — termasuk upload BARU yang kebetulan Nomor
> Transaksi + item + harga + qty-nya identik dengan batch test
> sebelumnya (bukan retry beneran), akibatnya field baru (PPN, Atribut
> Tambahan) tidak pernah terkirim tapi baris dilaporkan "success".
> Sekarang guard HANYA silent-success untuk match di BATCH YANG SAMA;
> match di batch lain tanpa baris baru → ditolak dengan pesan jelas.
> Detail → `docs/decisions/adr-0031-batasi-idempotent-guard-append-invoice-ke-batch-sama.md`.

**§ Fase 49 — DIREVISI, kolom pengelompokan DIGENERALISASI.** Audit
terhadap file Excel ASLI kompetitor (`docs/referencehtml/format_sales_inv_v7.xlsx`,
833 baris) menemukan **"PO Number" SELALU KOSONG** di praktik nyata,
padahal **52% faktur (77/149) itu multi-item** (sampai 58 baris/faktur)
— grouping by PO Number gagal TOTAL untuk pola data ini (tiap baris
kebaca faktur sendiri-sendiri, TANPA error, diam-diam salah). Kolom
"Trans No" (field `number` — nomor transaksi Accurate, SUDAH ada di
`defaultColumnMap` sejak awal) justru SELALU terisi & konsisten per
faktur di data yang sama, jadi jadi kunci grouping **UTAMA** sekarang
(PO Number tetap didukung sebagai fallback, TIDAK ada regresi untuk
siapa pun yang sudah mapping PO Number tanpa Trans No). Tipe
`SalesInvoiceGroup` generik (`groupKey`/`groupColumn`, bukan `poNumber`
literal) — lihat `groupSalesInvoiceRows` di `sales-invoice.mapping.ts`
untuk prioritas per-baris lengkap.

## Kolom Excel & UI

Pola 1:1 PI: `sales-invoice.mapping.ts` (`fieldToAccuratePath`,
`defaultColumnMap`, `customerAutoCreateMapping`), halaman
`app/app/(protected)/sales-invoice/import/*`, komponen
`components/sales-invoice/*`. Detail field lengkap → baca kode langsung
(bukan didokumentasikan ulang di sini, sesuai pola PI yang sudah
settle — dokumen ini cukup jadi peta konsep + rujukan ADR, bukan
duplikat kode).

## Atribut Tambahan (Data Classification) — Fase 55, dikoreksi Fase 61, auto-create Fase 68, rename kolom Fase 69, dikoreksi lagi Fase 71, field ITEM baru Fase 73, level EXPENSE Fase 74
**Status: SELESAI diimplementasi & DIKOREKSI dengan file Excel ASLI
client (2026-09-08).** `defaultColumnMap` sudah diperbarui ke nama
kolom SUNGGUHAN, `requiredFields` sudah disamakan dengan sheet
"Penjelasan Kolom" resmi client. Detail lengkap →
`docs/phases/phase-55-atribut-tambahan-sales-invoice.md` (implementasi
awal) dan `docs/phases/phase-61-koreksi-mapping-sales-invoice-format-client.md`
(koreksi setelah file asli diterima).

> **Update 2026-09-08 (Fase 68)** — Client retest (dengan Trans No baru,
> setelah fix Fase 67) dapat error Accurate: `Kategori Keuangan TES 1
> tidak ditemukan atau sudah dihapus`. Ternyata "Kategori Keuangan"
> adalah nama resmi Accurate untuk endpoint `/api/data-classification`
> — PERSIS field `dataClassificationNName` ini. Field ini **BUKAN teks
> bebas**: nilainya WAJIB sudah ada sebagai master data "Kategori
> Keuangan" di pembukuan Accurate, kalau belum ada ditolak. Karena
> aplikasi belum publish (masih testing internal tim client),
> diimplementasi **auto-create** (`findOrCreateDataClassification`,
> `apps/api/src/lib/accurate-data-classification.ts`, mirror pola
> auto-create Customer/Item Fase 05/13) — dipanggil untuk tiap nilai
> Atribut Tambahan yang terisi, SEBELUM `saveSalesInvoice`. Butuh scope
> OAuth baru `data_classification_view`/`data_classification_save`
> (`accurate-scopes.ts`) — koneksi Accurate yang connect SEBELUM fase
> ini WAJIB disconnect & reconnect ulang. Detail →
> `docs/phases/phase-68-auto-create-kategori-keuangan-sales-invoice.md`.

> **Update 2026-09-08 (Fase 69)** — Client verifikasi Fase 68 berhasil
> (screenshot Accurate: field label default "TES 1" = value "HWGRIO"
> persis seperti dikirim), lalu tunjukkan nama kolom Excel kita
> ("ITEM:CUSTOM CHARACTER N", § Fase 61) TIDAK cocok dengan label yang
> TAMPIL di UI Accurate sendiri — Accurate pakai "Kategori Keuangan N"
> sebagai label default (istilah resmi, § Fase 68). Kolom Excel di
> template download & dropdown konfirmasi mapping diganti ke "Kategori
> Keuangan N" — sinonim lama "ITEM:CUSTOM CHARACTER N" TETAP didukung
> (backward compat). Detail →
> `docs/phases/phase-69-rename-kolom-kategori-keuangan-item.md`.

> **Update 2026-09-08/09 (Fase 71-73) — SAGA LENGKAP "berapa banyak
> mekanisme Atribut Tambahan sebenarnya ada".** Setelah Fase 69, client
> tunjukkan Excel mereka sendiri (highlight kolom "ITEM: CUSTOM
> CHARACTER N" TERPISAH dari "Kategori Keuangan") — Fase 69 TERBUKTI
> SALAH menyamakan 2 field itu. **Fase 71**: sinonim salah dihapus,
> template dikembalikan bersih (belum tahu field aslinya apa).
> **Fase 72** (2026-09-09, tidak terkait langsung tapi searah): bug
> "Sudah ada data lain dengan Nama X" pada `findOrCreateDataClassification`
> — root cause asumsi shape response `list.do` yang tidak terverifikasi,
> lookup existing record SELALU gagal, diperbaiki (cocokkan by name
> saja + catch defensif). **Fase 73**: pertanyaan KEDUA ke Accurate
> Support (spesifik: "detail item di transaksi Sales Invoice") akhirnya
> mengungkap field ASLI "ITEM: CUSTOM CHARACTER N" — TERNYATA
> `charField`/`numericField`/`dateField` **JUGA ada versi ITEM-level**
> (nested di `detailItem`, BEDA dari versi header/root Fase 64), dengan
> **15 slot Karakter** (bukan 10!), 10 slot Angka, 2 slot Tanggal — field
> baru `attributItemKarakter1-15`/`attributItemAngka1-10`/
> `attributItemTanggal1-2` ditambahkan, kolom "ITEM: CUSTOM
> CHARACTER/NUMBER/DATE" dikembalikan dengan field API yang BENAR kali
> ini. **Total ada 3 mekanisme Atribut Tambahan** (bukan 2 seperti
> disimpulkan sempat di Fase 71, bukan 4 seperti istilah awal client):
> charField/numericField/dateField level FAKTUR (Fase 64), yang SAMA
> tapi level ITEM (Fase 73), dan dataClassificationNName/Kategori
> Keuangan level ITEM-atau-EXPENSE (Fase 55/68). **Lesson Learned**:
> spec resmi Accurate TIDAK LENGKAP untuk SELURUH keluarga fitur
> Atribut Tambahan (bukan cuma 1 field terisolasi) — pertanyaan ke
> Support HARUS sespesifik mungkin (sebut level: header vs item vs
> expense) untuk dapat jawaban lengkap sekali jalan. Detail →
> `docs/phases/phase-71-koreksi-item-custom-character-bukan-kategori-keuangan.md`,
> `docs/phases/phase-72-fix-lookup-kategori-keuangan-gagal-kenali-record-existing.md`,
> `docs/phases/phase-73-atribut-tambahan-item-level-charfield-numericfield-datefield.md`.

> **§ Penutup saga Fase 73 (2026-09-09)**: setelah field API-nya
> teridentifikasi benar, retest via API tetap gagal menampilkan data —
> ternyata BUKAN bug kode/Accurate sama sekali. Root cause SEBENARNYA:
> **worker production tidak ikut di-restart** saat deploy v1.19.0
> (cuma `api`+`web` yang di-restart, dianggap "cukup" karena perubahan
> "cuma mapping" — KELIRU, file mapping dipakai LANGSUNG oleh proses
> worker terpisah). Worker jalan dengan image LAMA (v1.18.2, sebelum
> field Fase 73 ada) sehingga field baru diam-diam diabaikan. Dibuktikan
> via test di environment LOCAL (worker JALAN dengan kode terbaru) yang
> BERHASIL — konfirmasi payload+konfigurasi Accurate sudah benar sejak
> awal. **Aturan baru**: perubahan APA PUN di `apps/api/src/lib/import-mapping/*.ts`
> atau file lain yang dipakai `workers/index.ts` WAJIB pakai Full
> runbook (termasuk restart `worker`), TIDAK BOLEH Minimal runbook,
> meski perubahannya "cuma" data/mapping — worker jalan sebagai
> container terpisah dengan image sendiri yang TIDAK ikut ter-update
> kalau tidak di-restart eksplisit. Dicatat di
> `docs/lessons-learned.md`.

> **Update 2026-09-09 (Fase 74)** — Kategori Keuangan level EXPENSE
> (`detailExpense.dataClassificationNName`) diimplementasikan, melengkapi
> versi level Item (Fase 68). Field dasar Expense (`accountNo`,
> `expenseName`, `expenseAmount`, `expenseNotes`, `departmentName`) juga
> ditambahkan — field API dikonfirmasi dari spec resmi
> (`detailExpense.items.properties`). Kolom Excel baru ("Akun Beban",
> "Nama Beban", "Jumlah Beban", "Catatan Beban", "Beban - Department",
> "Kategori Keuangan Beban 1-10") ditaruh PALING AKHIR template. 1 baris
> Excel bisa menyumbang 1 baris Barang DAN/ATAU 1 baris Beban sekaligus
> (tergantung kolom mana yang terisi, TIDAK ada kolom "Tipe Baris"
> terpisah). `accountNo`+`expenseAmount` WAJIB dua-duanya terisi supaya
> baris dianggap punya data Beban. BELUM diterapkan ke jalur
> `appendToExistingSalesInvoice` (Fase 67, retry lintas-batch) — cuma
> CREATE faktur baru. Detail →
> `docs/phases/phase-74-atribut-tambahan-level-expense-sales-invoice.md`.

> **Update 2026-09-09 (Fase 76)** — Field link alur penjualan
> (Penawaran → Pesanan → Pengiriman → Faktur) level ITEM ditambahkan:
> `detailItem.deliveryOrderNumber`/`salesOrderNumber`/
> `salesQuotationNumber` — DIKONFIRMASI RESMI di spec Accurate (beda
> dari saga Atribut Tambahan Fase 67-73, field ini SUDAH terdokumentasi
> lengkap sejak awal). Kolom Excel "ITEM: DELIVERY ORDER NO"/"ITEM:
> SALES ORDER NO"/"ITEM: SALES QUOT NO" ditaruh PALING AKHIR. ⚠️ Ketiga
> field SALING TERHUBUNG — Accurate cuma proses SATU kalau diisi
> bersamaan, prioritas: Delivery Order > Sales Order > Sales Quotation
> (deskripsi resmi Accurate). "ITEM: PURCHASE ORDER NO" SENGAJA TIDAK
> ditambahkan — tidak ada field API setara di level ITEM (sudah
> tercakup `poNumber`/"Bill No" level header). Detail →
> `docs/phases/phase-76-link-alur-penjualan-item-sales-invoice.md`.

> **Update 2026-09-09 (Fase 77)** — 3 perubahan digabung 1 fase: (1)
> judul kolom "Bill No" (Fase 70) DIKEMBALIKAN jadi **"PO No"** (client
> minta singkron nama field ASLI Accurate `poNumber`) — "Bill No"/"PO
> Number" TETAP didukung sebagai sinonim lama di `defaultColumnMap`,
> bukan dihapus; (2) SEMUA judul kolom Expense (Fase 74) diganti Bahasa
> Inggris: "Expense Acc No"/"Expense Name"/"Expense Amount"/"Expense
> Note"/"Expense Department"/"Expense Financial Category 1-10" — nama
> Indonesia lama ("Akun Beban" dkk) TETAP didukung sebagai sinonim; (3)
> field link alur penjualan level EXPENSE BARU:
> `detailExpense.salesOrderNumber`/`salesQuotationNumber` (mirror Fase
> 76 yang sebelumnya cuma di level ITEM) — DIKONFIRMASI RESMI di spec
> Accurate. ⚠️ **`detailExpense` TIDAK PUNYA `deliveryOrderNumber` sama
> sekali** (beda dari `detailItem` yang punya ketiganya) — deskripsi
> resmi Accurate untuk field ini TETAP menyebut `deliveryOrderNumber` di
> teksnya walau field itu tidak ada di array ini (kemungkinan besar
> quirk copy-paste deskripsi dari field `detailItem`, dicatat tapi TIDAK
> jadi alasan menambah field yang tidak ada) — prioritas yang berlaku
> cuma antara `salesOrderNumber` > `salesQuotationNumber`. Kolom "Expense
> Sales Order No"/"Expense Sales Quotation No" ditaruh PALING AKHIR
> template. Detail →
> `docs/phases/phase-77-po-no-rename-expense-english-link-expense.md`.

> **Update 2026-09-08 (Fase 61)** — File Excel asli client diterima
> (`docs/referencehtml/format_sales_inv_v7 (PLAN).xlsx`, sheet
> "Sales_Invoice" + "Penjelasan Kolom"). Riset MENYELURUH ke SEMUA 30+
> endpoint transaksi API Accurate (bukan cuma Sales Invoice) untuk
> pastikan batas field `dataClassificationNName` konsisten:
> - **Nama kolom ASLI**: `ITEM:CUSTOM CHARACTER 1` s/d `10` (LEVEL
>   ITEM) — BUKAN "Karakter 1-10" yang cuma tebakan awal.
>   `defaultColumnMap` sudah diupdate ke nama asli ini.
> - **Batas 10 dikonfirmasi UNIVERSAL** — dicek SEMUA endpoint
>   transaksi Accurate (Purchase Invoice, Sales Order, Journal Voucher,
>   Job Order, dst, 30+ jenis), field `dataClassificationNName`
>   KONSISTEN cuma ada 1-10 di MANA PUN, tidak pernah sampai 15. Excel
>   client punya slot sampai `ITEM:CUSTOM CHARACTER 15` (dan
>   `ITEM:CUSTOM NUMBER 1-10`, `ITEM:CUSTOM DATE 1-2`, `ITEM:CUSTOM
>   FINANCE CATEGORY 1-10`) — SEMUA itu (character 11-15, number, date,
>   finance category) **TIDAK PUNYA padanan field di API sama sekali**,
>   bukan soal jumlah/batasan kode kita.
> - **`detailExpense[]` (baris biaya) JUGA punya**
>   `dataClassification1Name`-`10Name` sendiri (field API sama, array
>   beda) — cocok dengan kolom Excel `EXPENSE:FINANCIAL CATEGORY 1-10`.
>   **BELUM diimplementasi** (Sales Invoice import kita cuma proses
>   `detailItem`, TIDAK ada `detailExpense` sama sekali) — kalau client
>   butuh ini, itu FITUR BARU terpisah (bukan remapping), status:
>   **menunggu konfirmasi client apakah dibutuhkan**.
> - ~~Kolom "CUSTOM CHARACTER/NUMBER/DATE" TANPA prefix (level
>   header/faktur)... TIDAK ADA padanan field API sama sekali.~~
>   **DIKOREKSI Fase 64 (2026-09-08) — klaim ini SALAH**, bukan karena
>   field-nya tidak ada, tapi karena `accurate-openapi.json` yang jadi
>   acuan riset ini TIDAK LENGKAP. Field resmi (dikonfirmasi email
>   Accurate Support, § "Atribut Tambahan LEVEL HEADER/FAKTUR — Fase 64"
>   di bawah): `charField1-10`, `numericField1-10`, `dateField1-2` — SUDAH
>   diimplementasi.
> - **`requiredFields` disamakan ke sheet "Penjelasan Kolom" resmi
>   client**: `number` (Trans No) DITAMBAH jadi wajib (sebelumnya tidak
>   — juga MEMPERKUAT grouping multi-item Fase 49 yang sudah pakai
>   `number` sebagai kunci grouping), `itemUnitName` (Item Unit Name)
>   DIHAPUS dari wajib (sebelumnya keliru diwajibkan).

### Konteks
Client (lewat screenshot menu Accurate "Faktur Penjualan" → "Rancangan
Formulir" → tab "Atribut Tambahan") minta 10 kolom teks bebas
tambahan ("Karakter 1" s/d "Karakter 10") bisa diisi lewat import
Excel. Di UI Accurate, admin Accurate BOLEH me-rename label tiap slot
(mis. "Karakter 1" → "Nomor SPK") lewat menu Preferensi — tapi
identitas field di API TETAP `dataClassificationNName` terlepas dari
label custom itu (rename cuma kosmetik sisi Accurate, tidak mengubah
nama field API).

### Temuan API (diverifikasi ke `docs/referencehtml/accurate-openapi.json`, BUKAN tebakan)
- Field resmi: `detailItem[].dataClassification1Name` s/d
  `dataClassification10Name` (`POST /api/sales-invoice/save.do`), tipe
  **string**, **per BARIS ITEM** (bukan per-header invoice).
- Tab "Tipe Angka" (Angka 1-10) di screenshot client **TIDAK diminta**
  client dan **TIDAK ADA field numerik setara** di API resmi (cuma
  varian `...Name`, string) — non-issue, selaras dengan permintaan yang
  memang cuma "Karakter".
- Field yang SAMA (`dataClassificationNName`) juga sudah ada di
  `detailExpense[]` (baris biaya) — TIDAK relevan untuk permintaan ini
  (client minta di level item barang/jasa, bukan biaya).

### Desain (kenapa TIDAK perlu ubah skema DB / migration sama sekali)
Arsitektur mapping import SUDAH generik sejak awal
(`sales-invoice.mapping.ts`):
- `fieldToAccuratePath`: `Record<internalFieldKey, "detailItem.<accurateFieldName>">`
- `defaultColumnMap`: `Record<"Nama Kolom Excel", internalFieldKey>` — cuma DEFAULT/tebakan awal, BUKAN posisi kaku
- `buildDetailItemFromRow()` iterasi generik atas `columnMapping` yang benar-benar dikonfirmasi user saat import (`POST .../confirm`, body `{columnMapping: Record<string,string>}`) — TIDAK hardcode field apa pun

**Implikasi penting**: posisi/nama kolom Excel yang client kirim TIDAK
PERLU sama persis dengan `defaultColumnMap` yang kita siapkan duluan.
`defaultColumnMap` cuma auto-suggest (match nama kolom case-insensitive)
— kalau nama kolom file client beda, user cukup **remap manual di UI
saat konfirmasi import** (mekanisme SUDAH ADA, dipakai semua modul,
bukan fitur baru). Jadi "mesin"-nya (`fieldToAccuratePath` + generic
builder) WAJIB disiapkan duluan (baru 10 field baru + isi
`dataClassificationNName`), tapi `defaultColumnMap`-nya BOLEH/WAJAR
disesuaikan lagi setelah lihat file asli client — 2 keputusan
terpisah, satu teknis-permanen (field ada di sistem), satu
kosmetik-fleksibel (nama kolom default).

### Implementasi Final (Fase 55 + koreksi Fase 61)
Semua di `sales-invoice.mapping.ts` SAJA (tidak ada file lain yang
disentuh — tidak ada endpoint baru, tidak ada migration, tidak ada
perubahan frontend, arsitektur sudah generik penuh):
```ts
// fieldToAccuratePath
attribut1: "detailItem.dataClassification1Name",
attribut2: "detailItem.dataClassification2Name",
// ... s/d attribut10

// defaultColumnMap — NAMA KOLOM ASLI client (Fase 61), bukan tebakan
"ITEM:CUSTOM CHARACTER 1": "attribut1",
"ITEM:CUSTOM CHARACTER 2": "attribut2",
// ... s/d "ITEM:CUSTOM CHARACTER 10"
```
Field `attributN` tetap OPSIONAL (tidak masuk `requiredFields`) — import
yang sudah berjalan (tanpa kolom atribut ini) TIDAK terpengaruh sama
sekali (backward compatible penuh).

## Atribut Tambahan LEVEL HEADER/FAKTUR — Fase 64 (KOREKSI Fase 61)
> **PENTING — koreksi klaim Fase 61**: Fase 61 sebelumnya menyimpulkan
> "level header/faktur TIDAK ADA field custom apa pun di API Accurate,
> tidak bisa diimport apa pun" berdasarkan `docs/referencehtml/accurate-openapi.json`
> (0 kemunculan field custom di level top-level payload). **Kesimpulan
> itu SALAH** — bukan karena API-nya tidak ada, tapi karena **spec yang
> jadi acuan TIDAK LENGKAP**. Dikoreksi 2026-09-08 setelah client
> forward email resmi Accurate Support (tiket #357901, dijawab
> 2026-04-24) yang eksplisit mengonfirmasi field ini ADA & BERFUNGSI.

### Field Resmi (dari Accurate Support, BUKAN dari OpenAPI spec)
Level HEADER (top-level payload, SEJAJAR `customerNo`/`transDate`,
BUKAN di dalam `detailItem`):
- **Karakter**: `charField1` s/d `charField10` (string)
- **Angka**: `numericField1` s/d `numericField10` (number)
- **Tanggal**: `dateField1`, `dateField2` (format DD/MM/YYYY, sama
  aturan tanggal lain)

Contoh body resmi dari Accurate Support (Purchase Invoice, tapi API
Accurate konsisten lintas jenis transaksi — dikonfirmasi juga independen
lewat kecocokan struktur Excel client, lihat di bawah):
```json
{
  "vendorNo": "V.00001",
  "transDate": "03/03/2025",
  "charField1": "atribut tambahan karakter 1",
  "charField2": "atribut tambahan karakter 2",
  "detailItem": [{ "itemNo": "100001", "unitPrice": 2000, ... }]
}
```

### Kenapa Ini Konsisten dengan Bukti Lain (Bukan Cuma "Percaya Email")
Excel asli client (`format_sales_inv_v7 (PLAN).xlsx`) SECARA INDEPENDEN
punya PERSIS 10 kolom "CUSTOM CHARACTER" + 10 "CUSTOM NUMBER" + 2
"CUSTOM DATE" TANPA prefix "ITEM:" (beda dari "ITEM:CUSTOM CHARACTER"
yang levelnya item) — cocok PERSIS jumlah `charField1-10`/
`numericField1-10`/`dateField1-2`. Client kemungkinan besar sudah
pernah tanya konsultan Accurate mereka sendiri saat menyusun template
ini, independen dari email yang di-forward ke kita.

### Implementasi (`sales-invoice.mapping.ts`)
```ts
// fieldToAccuratePath — TANPA prefix "detailItem." = otomatis masuk
// ROOT payload (logic generik `buildSalesInvoicePayload` yang sudah
// ada sejak awal, TIDAK perlu kode baru)
attributHeaderKarakter1: "charField1", // ... s/d attributHeaderKarakter10
attributHeaderAngka1: "numericField1", // ... s/d attributHeaderAngka10
attributHeaderTanggal1: "dateField1", attributHeaderTanggal2: "dateField2",

// defaultColumnMap — TANPA prefix "ITEM:" (beda dari level item)
"CUSTOM CHARACTER 1": "attributHeaderKarakter1", // ... s/d 10
"CUSTOM NUMBER 1": "attributHeaderAngka1", // ... s/d 10
"CUSTOM DATE 1": "attributHeaderTanggal1", "CUSTOM DATE 2": "attributHeaderTanggal2",
```
`attributHeaderTanggal1`/`2` ditambahkan ke `DATE_FIELDS` (konversi
format sama seperti `transDate`/`taxDate`/`shipDate`) — DAN ke
`DATE_INTERNAL_FIELDS` di frontend (`edit-row-dialog.tsx`, WAJIB
sinkron manual, tidak ada mekanisme share otomatis FE↔BE).

### Belum Terverifikasi End-to-End untuk Sales Invoice
Email Accurate Support secara eksplisit contoh-nya untuk **Purchase
Invoice**. BELUM ada konfirmasi tertulis terpisah bahwa `charField`/
`numericField`/`dateField` PERSIS berfungsi sama di endpoint
`/api/sales-invoice/save.do` — diasumsikan iya (API Accurate konsisten
lintas transaksi, § pola `dataClassificationNName` yang terbukti
seragam di 30+ endpoint, DIPERKUAT bukti independen Excel client di
atas), tapi WAJIB diverifikasi nyata begitu ada data test sungguhan
dari client (kirim 1 faktur test dengan kolom ini terisi, cek hasilnya
muncul benar di Accurate).

### Lesson Learned
**Spec API vendor pihak ketiga (`accurate-openapi.json`) TIDAK BOLEH
diperlakukan sebagai satu-satunya sumber kebenaran** — dokumen itu bisa
tidak lengkap tanpa pemberitahuan. Kalau ada permintaan fitur yang
"kelihatannya tidak didukung" berdasarkan spec, DAN ada indikasi kuat
lain (client sudah pakai fitur itu di UI Accurate, ATAU official
support vendor bisa dihubungi) — jangan berhenti di kesimpulan "tidak
bisa" hanya dari spec, minta konfirmasi tertulis ke vendor/support
resmi dulu sebelum menutup permintaan sebagai "keterbatasan platform".
§ `docs/lessons-learned.md` entri 2026-09-08.

## Nav & Dashboard Difilter oleh Langganan

§ ADR-0018, mulai fase ini — menu "Import Faktur Penjualan" di sidebar
customer HANYA muncul kalau plan langganan customer itu mencakup modul
`sales_invoice`. Pola ini BAKU untuk semua modul baru berikutnya (PP,
CR, JU), bukan kasus khusus SI.

## Referensi
- Infra OAuth/sesi Data Usaha/rate-limit/error-handling bersama →
  `docs/architecture/architecture-accurate-integration.md`
- Pola yang di-mirror → `docs/architecture/architecture-purchase-invoice.md`
- Eksekusi lengkap → `docs/phases/phase-13-sales-invoice.md`
- Kode: `apps/api/src/routes/sales-invoice-import.route.ts`,
  `apps/api/src/lib/accurate-sales-invoice.ts`,
  `apps/api/src/lib/accurate-customer.ts`,
  `apps/api/src/lib/import-mapping/sales-invoice.mapping.ts`
