# Architecture — Work Order (Perintah Kerja)

> Fase 136 (arsitektur) → **diimplementasikan Fase 147 (2026-09-22, di `develop`, belum dirilis)**. Keputusan eksekusi (bentuk Excel per-baris-lebar, header duplikat, tanpa auto-create item, `branchId` via lookup): `docs/phases/phase-147-modul-work-order.md`.
> Modul kategori "Manufacture", sistem produksi BOM (Bill of Material) —
> TERPISAH TOTAL dari Job Costing/Roll Over (metode job-costing tanpa
> BOM, § `architecture-job-costing.md`). Menggantikan slot "Other
> Deposit" di rencana awal user — Other Deposit SUDAH dibangun (Fase
> 128, live sejak v2.5.0), jadi diganti Work Order (0% built, kategori
> Manufacture). Sumber kebutuhan: panduan client
> (`docs/referencehtml/facport/developmen-15-september-2026.xlsx`,
> sheet "Work Order" — **gitignored**) + spec resmi Accurate
> (`docs/referencehtml/accurate-openapi.json` `/api/work-order/save.do`,
> `/api/wo-pic/list.do`, `/api/wo-pic/save.do`).

## Posisi dalam Alur Manufacture

Work Order adalah dokumen produksi berbasis BOM (`billOfMaterialNo`) —
merangkum SEMUANYA dalam 1 dokumen: bahan baku, biaya produksi, tahapan
proses, produk utama, DAN produk sampingan (extra finish good). Rantai
lengkap "Manufacture" di Accurate (per Note sheet client) sebenarnya
punya 3 dokumen: **Work Order → Material Slip → Finished Good Slip**
(pemakaian bahan & hasil produksi dicatat granular per slip) — TAPI
Excel client sesi ini CUMA menyiapkan panduan untuk Work Order (Material
Slip & Finished Good Slip Panduan-nya KOSONG di tracker "Note", scope
fase depan, bukan fase ini).

```
[BOM/Formula Produksi, data master — bukan transaksi]
        ↓
   Work Order  →  (Material Slip, Finished Good Slip — BELUM di-scope)
 (1 dokumen: bahan baku + biaya + proses + FG utama + FG tambahan)
```

## Endpoint Accurate
`POST /accurate/api/work-order/save.do` — endpoint UTAMA. **Plus 1
endpoint tambahan WAJIB untuk resolve field `personInChargeId`**:
`GET /accurate/api/wo-pic/list.do` (cari PIC by nama → dapat `id`
integer) dan `POST /accurate/api/wo-pic/save.do` (auto-create PIC baru
kalau belum ada di master data — cuma butuh field `name`). Ini SATU-
SATUNYA dari 5 modul fase ini yang genuinely butuh **2 endpoint**
(cross-API sederhana: lookup/create dulu baru save transaksi utama) —
pola identik `findOrCreateVendor`/`findOrCreateItem`, cuma target API
beda (`wo-pic` bukan `vendor`/`item`).

## Struktur Field `save.do` (Ringkas — Resmi dari OpenAPI Spec)
```
transDate, startDate, endDate: string REQUIRED
branchId: integer REQUIRED (⚠️ HARUS integer ID, BUKAN branchName — beda dari semua modul lain! § Quirk di bawah)
billOfMaterialNo: string REQUIRED
itemNo: string REQUIRED (Produk Utama)
quantity: number REQUIRED (Qty Produk Utama)
workAccountNo: string REQUIRED
varianceAccountNo: string REQUIRED
workOrderType: enum REQUIRED ['BILL_OF_MATERIAL','MANUFACTURE_ORDER','PRODUCT']
branchName, description, itemUnitName, manualClosed (boolean),
manualFinalDate, number, personInChargeId (integer — § endpoint wo-pic),
secondQualityProductNo, typeAutoNumber

detailMaterial[] (REQUIRED, Raw Material/Bahan Baku):
  itemNo, quantity — REQUIRED per baris
  itemUnitName, detailName, detailNotes, processCategoryName,
  standardCost, standardCostDate, totalStandardCost,
  departmentName, projectNo, dataClassification1Name..10Name

detailExpense[] (REQUIRED oleh spec, Item/Jasa Biaya Produksi — BUKAN
  akun GL seperti modul lain, field-nya `itemNo` bukan `accountNo`!):
  itemNo, quantity — REQUIRED per baris
  itemUnitName, detailName, detailNotes, processCategoryName,
  standardCost, standardCostDate, totalStandardCost,
  departmentName, projectNo, dataClassification1Name..10Name

detailProcess[] (opsional, tahapan proses produksi):
  processCategoryName, sortNumber (integer), instruction, subCon (boolean)

detailExtraFinishGood[] (array opsional, TAPI itemNo/quantity/portion
  REQUIRED per baris kalau array ini dipakai — dikonfirmasi portal
  developer live 2026-09-21):
  itemNo, quantity, portion (number, %) — REQUIRED per baris
  itemUnitName, detailName, detailNotes, departmentName, projectNo,
  dataClassification1Name..10Name
```

## ✅ RESET (2026-09-21, riset lanjutan): `branchId` REQUIRED (Integer), Bukan `branchName` — Sudah Ada Jalur Resolusinya
SEMUA modul lain di Facport (termasuk 4 modul lain fase ini) pakai
`branchName` (string) sebagai field utama, `branchId` opsional/tidak
ada. Work Order KEBALIKAN: `branchId` (integer) yang REQUIRED oleh
spec, `branchName` cuma opsional/redundan.

**Endpoint resolusi SUDAH ketemu**: `GET /api/branch/list.do` (dicek
`accurate-openapi.json`) — support parameter `keywords` (pencarian by
nama, pola PERSIS SAMA dengan `vendor`/`item`/`customer`/`wo-pic`
list.do yang sudah dipakai di modul lain), plus `POST
/api/branch/save.do` (cuma butuh field `name`, bisa auto-create kalau
mau). Scope resmi ADA di 222 daftar scope Accurate: `branch_view` +
`branch_save` (bukan cuma dugaan seperti `wo_pic_*` — ini eksplisit
terdaftar).

**2 jalur implementasi, urutan rekomendasi test saat eksekusi:**
1. **Coba dulu kirim `branchName` SAJA (tanpa `branchId`)** ke
   `work-order/save.do` lewat 1x test call nyata. ALASAN: preseden di
   fase ini SUDAH 2x ketemu field yang status "REQUIRED"/"tidak ada di
   spec" ternyata tetap fleksibel di praktik nyata (`charField` dulu,
   `warehouseName` Job Costing sekarang) — Accurate SERING resolve
   field `*Name` ke ID internal secara otomatis di banyak endpoint lain
   (`itemUnitName`, `warehouseName`, `paymentTermName`, dst SEMUA
   resolve by name, bukan minta ID). Kalau `branchName` saja SUDAH
   cukup, Work Order jadi SAMA PERSIS pola 4 modul lain — 0
   kompleksitas tambahan.
2. **Kalau (1) gagal/ditolak** (Accurate benar-benar minta `branchId`
   literal) → implementasi `resolveBranchId(branchName)`: panggil
   `branch/list.do?keywords={branchName}`, ambil `id` dari hasil match.
   **REKOMENDASI: JANGAN auto-create branch baru** kalau tidak ketemu
   (beda kebijakan dari `findOrCreateVendor`/`findOrCreateItem`/
   `findOrCreateWoPic`) — cabang adalah data struktural perusahaan yang
   biasanya sudah given/tetap, BUKAN entitas transaksional yang wajar
   dibuat otomatis dari typo/nama baru di Excel. Kalau nama cabang
   tidak ketemu, FAIL dengan pesan jelas ("Cabang '{nama}' tidak
   ditemukan di Accurate, cek ejaan atau buat dulu di Accurate") —
   bukan diam-diam bikin cabang baru.

Ini SATU-SATUNYA hal yang tersisa dari 3 ambiguitas awal Work Order
yang masih butuh test call nyata saat eksekusi (2 lainnya sudah
RESOLVED via klarifikasi client, § di bawah) — TAPI sudah tidak
"terbuka" lagi dalam arti "tidak tahu harus mulai dari mana", jalur
konkretnya sudah jelas.

## ✅ RESOLVED (2026-09-21, konfirmasi client): "Work Order Type" vs "Save As Status Type" adalah 2 HAL BERBEDA
Client mengonfirmasi langsung:

1. **"Work Order Type" SAJA yang dipakai** sebagai field `workOrderType`
   (enum `BILL_OF_MATERIAL`/`MANUFACTURE_ORDER`/`PRODUCT`) — sesuai
   dugaan awal (dropdown "Tipe" di `image56.png`, BUKAN dropdown
   kanan-atas "Perintah Kerja" yang cuma label form generik, konsisten
   pola di semua modul lain). Ketiga nilai enum menentukan **sumber
   referensi** yang dipakai form Accurate untuk mengisi Work Order:
   - `PRODUCT` → diambil dari **Kode Produk** (`itemNo`, langsung pilih
     barang jadi)
   - `BILL_OF_MATERIAL` → diambil dari **Nomor Formula**
     (`billOfMaterialNo`, resep produksi)
   - `MANUFACTURE_ORDER` → diambil dari **Nomor Rencana Produksi**

   **⚠️ Koreksi 2026-09-21** (semula ditulis "tidak ada endpoint
   terpisah" — TERNYATA ADA, ditemukan lewat verifikasi portal
   developer live saat riset Job Costing): **`/api/manufacture-order/save.do`**
   ("Membuat data Rencana Produksi baru", scope `manufacture_order_save`,
   field `detailManufactureOrder[].billOfMaterialNumber`+`startDate`+
   `endDate`+`quantity`) adalah resource TERPISAH TOTAL dari
   `work-order/save.do` — namanya PERSIS "Rencana Produksi" yang
   disebut client. **BELUM dieksplor lebih lanjut** (di luar scope
   riset ini) apakah Work Order dengan `workOrderType=MANUFACTURE_ORDER`
   butuh `manufacture-order` record dibuat/direferensikan LEBIH DULU
   (pola cross-transaksi sama seperti Job Costing→Material Adjustment,
   § `architecture-job-costing.md`), atau field ini independen. Excel
   client Work Order TIDAK punya kolom eksplisit untuk referensi
   "Rencana Produksi" — kalau client TIDAK benar-benar pakai
   `workOrderType=MANUFACTURE_ORDER` dalam praktik (cuma pakai
   `PRODUCT`/`BILL_OF_MATERIAL`), ini tidak blocking. **Perlu
   dikonfirmasi ke client**: apakah mereka akan pakai opsi
   "Nomor Rencana Produksi" di data riil mereka?

   Dampak untuk Excel mapping: kolom `Work Order Type` di Excel WAJIB
   diisi salah satu dari 3 istilah client di atas (bukan istilah enum
   API literal) — perlu dictionary/lookup mapping ("Kode Produk"→
   `PRODUCT`, "Nomor Formula"→`BILL_OF_MATERIAL`, "Nomor Rencana
   Produksi"→`MANUFACTURE_ORDER`), SAMA pola seperti `Tipe Adj` di
   Inventory Adjustment atau `Tipe Penyesuaian` di Roll Over — nilai
   literal 3 istilah ini perlu dicocokkan lagi ke isi Excel riil client
   saat eksekusi (istilah di atas dari penjelasan lisan client, bukan
   screenshot header Excel).

2. **"Save As Status Type" adalah field APPROVAL, TERPISAH TOTAL dari
   `workOrderType`** — kalau diisi `APPROVED`, client ingin transaksi
   otomatis ter-approve tanpa approval manual (Accurate punya fitur
   approval workflow bawaan untuk transaksi tertentu). § "⚠️ Field
   Approval Belum Ditemukan di Spec" di bawah — field ini TIDAK ada di
   skema resmi `work-order/save.do`, butuh keputusan lanjutan.

## ⚠️→✅ Field Approval ("Save As Status") — Riset & Keputusan Final
Dicek langsung ke `accurate-openapi.json`: **TIDAK ADA** field
`approvalStatus`/`status`/sejenis di skema request body
`work-order/save.do` (24 field top-level, semua sudah terdaftar di §
"Struktur Field" di atas — tidak ada yang cocok). Juga **TIDAK ADA**
endpoint `/api/approval/*` sama sekali di spec ini (dicek exhaustive,
0 hasil) — padahal scope `approval_view`/`approval_save` ADA di daftar
222 scope resmi Accurate (mengisyaratkan fitur approval itu nyata ada
di Accurate, cuma endpoint-nya tidak/belum terdokumentasi di spec versi
ini). Yang DITEMUKAN: parameter **`approvalStatusFilter`** dan
**`filter.approvalStatus.*`** muncul berkali-kali sebagai QUERY
PARAMETER di endpoint `list.do` banyak modul (termasuk kemungkinan
`work-order/list.do`) — ini cuma untuk MEMFILTER data yang SUDAH ada
berdasarkan status approval-nya, BUKAN untuk MENGUBAH/MENGESET status
approval saat `save.do`.

**Kesimpulan sementara**: field untuk "auto-approve saat Save As
Status=APPROVED" kemungkinan besar:
- (a) TIDAK bisa diset langsung lewat `work-order/save.do` (perlu
  panggilan KEDUA ke endpoint approval terpisah yang tidak terdaftar
  di spec ini — kalau ada, butuh dicari manual di dokumentasi portal
  developer Accurate, BUKAN cuma dari file JSON lokal), ATAU
- (b) sebenarnya bukan urusan API sama sekali — auto-approve/skip
  approval biasanya diatur company-wide di **pengaturan "Approval
  Rules" internal Accurate** (threshold nominal, jenis transaksi mana
  yang butuh approval) yang dikonfigurasi client SENDIRI di Accurate
  (bukan per-transaksi via Facport), ATAU
- (c) field undocumented yang tetap diterima kalau dikirim (preseden
  `charField`/`warehouseName` di modul lain fase ini) — perlu 1x test
  call coba kirim field tebakan (`approvalStatus: "APPROVED"`) untuk
  lihat reaksi Accurate.

**✅ RESOLVED (2026-09-21, keputusan client)**: DITUNDA — kolom "Save
As Status Type" jadi **OPSIONAL, TIDAK WAJIB diisi customer**. TIDAK
di-mapping ke field API apa pun di fase eksekusi awal (tidak ada
kebutuhan cari endpoint approval tersembunyi/tanya Accurate Support
sekarang). Kolom boleh tetap ada di template Excel (dibiarkan kosong)
atau dihapus dari template — keputusan final soal itu di eksekusi UI
import, bukan blocking untuk arsitektur. Kalau di masa depan client
benar-benar butuh fitur auto-approve, ini jadi fase/scope terpisah
(butuh riset ulang endpoint approval Accurate saat itu).

## Field Mapping Excel Client → API

| Excel Column | API Field | Catatan |
|---|---|---|
| Transaction Date | transDate | header, REQUIRED |
| Trans No | number | header, opsional (kunci grouping) |
| Work Acc No | workAccountNo | header, REQUIRED |
| Work Order Type | workOrderType | header, REQUIRED enum — nilai Excel pakai istilah client ("Kode Produk"/"Nomor Formula"/"Nomor Rencana Produksi"), perlu dictionary mapping ke `PRODUCT`/`BILL_OF_MATERIAL`/`MANUFACTURE_ORDER`, § "RESOLVED" di atas |
| Bill Material no | billOfMaterialNo | header, REQUIRED |
| Save As Status Type | **TIDAK di-mapping (opsional, ditunda)** | field approval, keputusan client 2026-09-21: kolom opsional, tidak wajib diisi customer, § "Field Approval" di atas |
| Branch Name | branchName + **lookup → branchId** | header, REQUIRED via `branchId` (§ Quirk di atas), `branchName` cuma pendukung |
| Description | description | header |
| Product: Item No | itemNo | header (top-level, Produk Utama), REQUIRED |
| Product: Qty | quantity | header (top-level), REQUIRED |
| Product: Unit Name | itemUnitName | header (top-level) |
| Second Quality Product No | secondQualityProductNo | header |
| Variance Acc No | varianceAccountNo | header, REQUIRED |
| Manual Closed | manualClosed | header, boolean |
| Manual Final Date | manualFinalDate | header |
| PIC ID | **lookup/create via `wo-pic/list.do`+`save.do` → personInChargeId** | header — nilai Excel kemungkinan NAMA (string), BUKAN ID integer literal, § "Endpoint Accurate" di atas |
| Start Date / End Date | startDate / endDate | header, REQUIRED |
| Item No (baris ke-2, RM) | detailMaterial[].itemNo | REQUIRED per baris |
| Item Name | detailMaterial[].detailName | |
| Qty | detailMaterial[].quantity | REQUIRED per baris |
| Unit Name | detailMaterial[].itemUnitName | |
| Item Notes | detailMaterial[].detailNotes | |
| Process Category Name (RM) | detailMaterial[].processCategoryName | |
| Standard Cost / Date / Total | detailMaterial[].standardCost / standardCostDate / totalStandardCost | |
| Project No / Department Name | detailMaterial[].projectNo / departmentName | |
| CLS1/CLS2/CLS3 (RM) | dataClassification1/2/3Name | detailMaterial[] |
| Expense No | detailExpense[].itemNo | **BUKAN akun GL** — item/jasa biaya produksi, beda semantik dari "Expense" di modul lain (Sales Order/Job Costing) |
| Expense Name | detailExpense[].detailName | |
| Expense Qty | detailExpense[].quantity | |
| Expense Unit Name | detailExpense[].itemUnitName | |
| Expense Notes | detailExpense[].detailNotes | |
| Process Category Name (Expense) | detailExpense[].processCategoryName | |
| Standard Cost / Date / Total (Expense) | detailExpense[].standardCost / standardCostDate / totalStandardCost | |
| Project No / Department Name (Expense) | detailExpense[].projectNo / departmentName | |
| CLS1/CLS2/CLS3 (Expense) | dataClassification1/2/3Name | detailExpense[] |
| Process Category Name (berdiri sendiri) | detailProcess[].processCategoryName | list tahapan proses TERPISAH dari RM/Expense |
| Sort No | detailProcess[].sortNumber | |
| Instruction | detailProcess[].instruction | |
| subCon | detailProcess[].subCon | boolean |
| Extra FG: Item No | detailExtraFinishGood[].itemNo | produk sampingan |
| Extra FG: Item Name | detailExtraFinishGood[].detailName | |
| Extra FG: Qty | detailExtraFinishGood[].quantity | REQUIRED per baris (dikonfirmasi portal live) |
| Extra FG: Unit Name | detailExtraFinishGood[].itemUnitName | |
| Extra FG: Notes | detailExtraFinishGood[].detailNotes | |
| Extra FG: Portion | detailExtraFinishGood[].portion | %, REQUIRED per baris (dikonfirmasi portal live) |
| Project No / Department (Extra FG) | detailExtraFinishGood[].projectNo / departmentName | |
| CLS1/CLS2/CLS3 (Extra FG) | dataClassification1/2/3Name | detailExtraFinishGood[] |

**4 array nested berbeda dalam 1 dokumen** (`detailMaterial`,
`detailExpense`, `detailProcess`, `detailExtraFinishGood`) — grouping
Excel-ke-array PALING KOMPLEKS dari seluruh modul Facport sampai saat
ini. Perlu skema kolom "section marker" atau posisi kolom tetap
(seperti pola saat ini di header CSV: field diulang nama sama
"Process Category Name"/"Project No"/dst 3-4 kali di posisi kolom
berbeda) untuk membedakan baris masuk section mana — TIDAK bisa
mengandalkan nama kolom Excel (karena namanya SAMA persis di beberapa
section), harus pakai **posisi kolom absolut**.

## Keputusan Desain (lihat phase-147 untuk perubahan saat eksekusi)
1. **Cross-API: `findOrCreateWoPic(name)`** — helper baru, pola
   IDENTIK `findOrCreateVendor`/`findOrCreateItem` tapi target
   `/api/wo-pic/list.do` (cari by nama) + `/api/wo-pic/save.do` (cuma
   butuh field `name`, auto-create simpel). **✅ Scope OAuth RESOLVED
   (2026-09-21, verifikasi portal developer live)**: scope resminya
   **`wo_person_in_charge_view`**/**`wo_person_in_charge_save`**/
   **`wo_person_in_charge_delete`** — TERPISAH dari `work_order_*`
   (dugaan awal "terbundel" TERBUKTI SALAH, bukan cuma tidak
   terverifikasi). Nama scope-nya pakai istilah penuh "Person In
   Charge" (`wo_pic` cuma nama path endpoint, BUKAN nama scope) —
   WAJIB ditambahkan eksplisit ke `MODULE_ACCURATE_SCOPES['work_order']`
   saat eksekusi, jangan asumsi ikut scope `work_order_save`.
2. **`resolveBranchId(branchName)`** — helper baru, dipanggil HANYA
   kalau test call pertama (kirim `branchName` polos) ternyata ditolak
   Accurate (§ "RESET" di atas). Target `GET /api/branch/list.do`
   (`keywords` search, scope `branch_view`). **TIDAK auto-create**
   kalau tidak ketemu (beda kebijakan dari item/vendor/wo-pic) — fail
   dengan pesan jelas, karena cabang adalah data struktural yang wajar
   ditolak kalau salah ketik/belum ada, bukan dibuat otomatis.
3. **~~Auto-create Item~~ (DIBATALKAN saat eksekusi Fase 147 — produk utama tanpa kolom nama; item dikirim apa adanya)** — rencana awal: auto-create Item — Produk Utama, Raw Material, Extra Finish
   Good semuanya referensi `itemNo` — pola `findOrCreateItem` dipakai
   di ke-3 konteks ini sekaligus (multi-role item dalam 1 dokumen,
   belum ada preseden modul lain yang punya 3 "peran" item berbeda
   dalam 1 transaksi).
4. **Grouping multi-baris Excel → 4 array** — PALING KOMPLEKS di
   seluruh Facport. Desain konkret (section marker per posisi kolom,
   bukan per nama kolom) WAJIB difinalisasi di Langkah Eksekusi
   sebelum coding dimulai, idealnya dengan contoh Excel data ISI
   (bukan cuma header) dari client.
5. **`workOrderType` ambiguitas** (§ di atas) — keputusan final
   ditunda sampai konfirmasi client.

## Atribut Tambahan / Kategori Keuangan
Excel client Work Order minta "CLS1-3" di 3 dari 4 section
(`detailMaterial`, `detailExpense`, `detailExtraFinishGood`) — semua
`dataClassification` (Kategori Keuangan), SUDAH resmi didukung di
spec. TIDAK ada permintaan "Custom Character/Number/Date" (charField
dst) di sheet ini — jadi modul ini TIDAK perlu test call verifikasi
Atribut Tambahan seperti 3 modul lain fase ini.

## ⚠️ Branch Wajib — TAPI Beda Bentuk dari Modul Lain
Preseden Fase 90 ("Branch Name wajib diisi") tetap berlaku secara
PRINSIP di sini, TAPI implementasinya beda: karena API butuh `branchId`
(integer, § Quirk di atas) bukan `branchName`, validasi "wajib diisi"
harus terjadi SETELAH lookup nama→ID berhasil (gagal lookup = gagal
validasi), bukan sekadar cek string kosong seperti modul lain.

## Known Limitations / Butuh Konfirmasi Saat Eksekusi
- **`workOrderType`** SUDAH resolved (§ di atas) — TAPI dictionary
  mapping istilah client ("Kode Produk"/"Nomor Formula"/"Nomor Rencana
  Produksi") ke isi kolom Excel RIIL belum diverifikasi (istilah dari
  penjelasan lisan client, belum dicocokkan ke data Excel aktual).
- **"Save As Status Type" (approval)** — RESOLVED (keputusan client
  2026-09-21): kolom OPSIONAL, tidak wajib diisi customer, TIDAK
  di-mapping ke field API apa pun untuk sekarang (field approval-nya
  sendiri tidak ketemu di spec resmi — § "Field Approval" di atas).
  Fitur auto-approve jadi scope terpisah di masa depan kalau
  benar-benar dibutuhkan.
- **✅ RESOLVED 2026-09-21 (verifikasi portal developer live)**:
  `branchId` REQUIRED terkonfirmasi ULANG persis (kolom "Harus diisi:
  Ya" di portal live, bukan cuma spec JSON lokal) — jalur resolusi
  `resolveBranchId()` via `branch/list.do` (scope `branch_view`,
  dikonfirmasi ADA di portal) tetap berlaku, TAPI rekomendasi "coba
  `branchName` polos dulu" (§ RESET) TETAP perlu 1x test call nyata ke
  akun Accurate — verifikasi dokumentasi TIDAK bisa memastikan perilaku
  runtime Accurate saat `branchId` dikosongkan tapi `branchName` diisi.
- **✅ RESOLVED 2026-09-21 (verifikasi portal developer live)**:
  Scope `wo-pic` **BUKAN** dugaan lagi — dikonfirmasi eksplisit
  `wo_person_in_charge_view`/`wo_person_in_charge_save`/
  `wo_person_in_charge_delete`, TERPISAH dari `work_order_*` (dugaan
  awal "kemungkinan terbundel" TERBUKTI SALAH). Field lengkap
  `work-order/save.do` JUGA diverifikasi ulang 100% cocok dengan
  dokumentasi ini (semua `detailMaterial[]`/`detailExpense[]`/
  `detailProcess[]`/`detailExtraFinishGood[]` field persis sama).
  **1 koreksi kecil ditemukan**: `detailExtraFinishGood[].portion` DAN
  `.quantity` ternyata **REQUIRED** ("Harus diisi: Ya") di portal live,
  bukan opsional seperti tertulis semula di § "Struktur Field" —
  perbaiki validasi Facport untuk mewajibkan kedua kolom ini kalau ada
  baris "Extra FG" di Excel.
- **Grouping 4-array dari Excel** — perlu contoh data Excel BERISI
  (bukan cuma header kosong) untuk pastikan skema "section marker"
  posisi-kolom benar sebelum coding.
- Material Slip & Finished Good Slip (2 modul Manufacture lanjutan
  per Note sheet client) **SENGAJA TIDAK masuk scope fase ini** —
  Panduan-nya belum disiapkan client, jadi fase terpisah nanti.
- `bulk-save.do` (varian bulk untuk `work-order`) TIDAK ditemukan di
  daftar endpoint spec (beda dari 4 modul lain fase ini yang semua
  punya `bulk-save.do`) — dikonfirmasi ULANG di portal live, memang
  tidak ada, bukan salah baca — konfirmasi tidak relevan untuk modul ini.
- **BELUM dieksplor tuntas** (di luar scope fase ini): relevansi
  `/api/manufacture-order/save.do` ("Rencana Produksi") ke
  `workOrderType=MANUFACTURE_ORDER` — Excel client tidak punya kolom
  eksplisit untuk ini, jadi TIDAK blocking, tapi perlu dikonfirmasi ke
  client apakah opsi ini akan benar-benar dipakai.

## Referensi
- Spec resmi: `docs/referencehtml/accurate-openapi.json` `/api/work-order/save.do`, `/api/wo-pic/list.do`, `/api/wo-pic/save.do`
- **Portal developer live, SUDAH diverifikasi lengkap 2026-09-21**:
  `account.accurate.id/developer/api-docs.do` → `/api/work-order`
  (semua field 100% cocok), `/api/wo-pic` (scope
  `wo_person_in_charge_*` dikonfirmasi), `/api/branch` (scope
  `branch_view`/`branch_save` dikonfirmasi). `/api/manufacture-order`
  ADA tapi relevansinya ke Work Order BELUM dieksplor tuntas (§ di atas).
- Panduan client (gitignored): `docs/referencehtml/facport/developmen-15-september-2026.xlsx` sheet "Work Order"
- Modul manufacture lain (sistem job-costing terpisah): `architecture-job-costing.md`, `architecture-roll-over.md`
- Pola auto-create find-or-create: Fase 05 (`findOrCreateVendor`), Fase 78
- Preseden Branch Wajib: `architecture-purchase-payment.md` § "Fase 90"

## Registri endpoint & scope (sudah terpasang di `accurate-endpoint-registry.ts`, Fase 147; scope turunan: `work_order_save`, `branch_view`, `wo_person_in_charge_view/save`, `data_classification_view/save` + baseline `item_view`)
Saat modul dibangun, daftarkan entry `work_order` di `apps/api/src/lib/accurate-endpoint-registry.ts`: `POST work-order/save.do` (`work_order_save`), lookup PIC
`GET wo-pic/list.do` (`wo_person_in_charge_view`) + `POST wo-pic/save.do` (`wo_person_in_charge_save`, bila auto-create PIC), lookup cabang `GET branch/list.do`
(`branch_view`; `POST branch/save.do` = `branch_save` HANYA bila cabang boleh dibuat otomatis — keputusan desain, default TIDAK). `manufacture_order_save`
HANYA bila kode memanggil `manufacture-order/save.do`. Scope diturunkan otomatis dari endpoint; jangan menulis scope manual. Jalankan `bun run scopes:sync`,
tes `accurate-scopes.test.ts` hijau, dan pasang `checkSubscriptionScopes` di route import. Catatan: Work Order menambah scope BARU yang dulu belum
dipakai modul mana pun — customer yang membeli modul ini akan melihat popup "Perbarui Izin" (gerbang koneksi Fase 144).
