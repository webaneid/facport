# Architecture — Material Slip (Pengambilan Bahan Baku)

> Fase 136 (arsitektur) sempat ditunda karena panduan client kosong. Panduan sudah terisi 2026-09-22 (sheet "Material Slip",
> `docs/referencehtml/facport/developmen-15-september-2026.xlsx`) — dokumen ini dibuat sekaligus dengan hasil VERIFIKASI LIVE
> portal developer Accurate (`account.accurate.id/developer/api-docs.do`, 2026-09-22), bukan cuma spec lokal.
> Kategori "Manufacture", bagian dari rantai **Work Order → Material Slip → Finished Good Slip** (§ `architecture-work-order.md`
> "Posisi dalam Alur Manufacture") — Material Slip mencatat REALISASI pengambilan bahan baku dari sebuah Work Order.

## Posisi dalam Alur Manufacture
```
Work Order (rencana: bahan baku + biaya + proses + FG utama & tambahan)
        ↓
   Material Slip  →  mencatat bahan baku yang BENAR-BENAR diambil/dikembalikan
        ↓
   Finished Good Slip  →  mencatat barang jadi yang BENAR-BENAR diselesaikan
```
Material Slip dan Finished Good Slip SAMA-SAMA mereferensikan `workOrderNumber` (bukan `workOrderMaterialId`/dsb sebagai
header) — WAJIB Work Order-nya sudah ada di Accurate lebih dulu (TIDAK divalidasi lokal, Accurate yang menolak bila nomor
tidak ada, mirror preseden Roll Over→Job Costing).

## Endpoint Accurate
`POST /accurate/api/material-slip/save.do` — SATU-SATUNYA endpoint (beda dari Work Order yang butuh 2). Deskripsi resmi
portal: **"Membuat data Pengambilan Bahan Baku baru atau mengedit data Pengambilan Bahan Baku yang sudah ada"**. Scope
`material_slip_save` (+ `material_slip_view`/`material_slip_delete` untuk `list.do`/`detail.do`/`delete.do`, tidak dipakai
modul ini). **100% cocok** antara spec lokal (`accurate-openapi.json`) dan portal live — tidak ada field/requirement yang
berubah antara keduanya.

## Struktur Field `save.do` (Resmi, Diverifikasi Live 2026-09-22)
```
materialSlipType: enum REQUIRED ['ITEM_PICK', 'ITEM_RETURN']
transDate: date REQUIRED
workOrderNumber: string REQUIRED — Nomor Perintah Kerja yang akan melakukan pengambilan bahan baku
branchId, branchName: integer/string, KEDUANYA OPSIONAL (§ Quirk di bawah — BEDA dari Work Order/Finished Good Slip)
description, id, number, typeAutoNumber: opsional (header)

detailItem[] (REQUIRED, "Detail barang yang akan diambil untuk pengambilan bahan baku"):
  itemNo: string REQUIRED — "Nomor/Kode barang yang digunakan untuk transaksi detail terkait"
  quantity, itemUnitName, detailName, detailNotes, projectNo, departmentName, id: opsional
  warehouseId (Long), warehouseName (string): KEDUANYA OPSIONAL
  workOrderMaterialId (Long): opsional — id baris bahan baku Work Order terkait (TIDAK dipetakan, § Keputusan Desain)
  dataClassification1Name..10Name: opsional (Kategori Keuangan)
  detailSerialNumber[]: opsional — { serialNumberNo, quantity, expiredDate, id, _status }
```

## ✅ Quirk Cabang & Gudang — BEDA dari Work Order/Finished Good Slip
Work Order dan Finished Good Slip mewajibkan `branchId`/`warehouseId` (integer) secara literal di spec. **Material Slip
TIDAK** — `branchId` DAN `branchName` sama-sama opsional (portal: keduanya "Harus diisi: Tidak"), begitu juga
`warehouseId`/`warehouseName`. Ini dikonfirmasi LANGSUNG di portal live (bukan cuma spec lokal), bukan dugaan.

**Keputusan desain**: kirim `branchName`/`warehouseName` SAJA (string, apa adanya) — TIDAK perlu `resolveBranchId`/lookup
gudang seperti Work Order (§ `architecture-work-order.md` "RESET"). Ini SATU-SATUNYA dari 4 sub-modul Manufacture yang
genuinely tidak butuh resolusi ID cabang/gudang — konsisten dengan preseden modul non-Manufacture lain (`itemUnitName`,
`warehouseName` dst di Job Costing/Roll Over selalu string).

## `materialSlipType` — Dictionary Istilah Excel Client
Excel client kolom "Material Slip Type" (D) — nilai ISI belum ada (sheet baru berisi header). Dictionary tebakan terbaik
(mirror pola Roll Over/Work Order — istilah Indonesia umum untuk "pengambilan"/"pengembalian" bahan baku):
- `pengambilan`, `ambil`, `keluar`, `pick`, `item_pick` → `ITEM_PICK`
- `pengembalian`, `kembali`, `retur`, `return`, `item_return` → `ITEM_RETURN`
Baris dengan nilai tidak dikenali GAGAL dengan pesan jelas (bukan default diam-diam) — mirror `resolveRollOverType`/
`resolveWorkOrderType`. **Perlu diverifikasi ke isi Excel riil client saat eksekusi** (sama seperti Roll Over/Work Order).

## Field Mapping Excel Client → API
Excel: `Branch Name, Trans Date, Trans No, Material Slip Type, Work Order No, Description, Item No, Item Name, Qty,
Unit Name, Item Note, Project No, Dept Name, Warehouse Name, Work Order Material ID, CLS1-5, Serial No, Qty, Expired Date`
(23 kolom, header row saja — TANPA data isi).

| Excel Column | API Field | Catatan |
|---|---|---|
| Branch Name | branchName | header, OPSIONAL (§ Quirk — beda dari Work Order) |
| Trans Date | transDate | header, REQUIRED |
| Trans No | number | header, OPSIONAL (kunci grouping DEFAULT ADR-0011) |
| Material Slip Type | materialSlipType | header, REQUIRED enum, dictionary § di atas |
| Work Order No | workOrderNumber | header, REQUIRED |
| Description | description | header |
| Item No | detailItem[].itemNo | REQUIRED per baris |
| Item Name | detailItem[].detailName | |
| Qty | detailItem[].quantity | |
| Unit Name | detailItem[].itemUnitName | |
| Item Note | detailItem[].detailNotes | |
| Project No | detailItem[].projectNo | |
| Dept Name | detailItem[].departmentName | koreksi 2026-09-22: sebelumnya salah ditulis "tidak ada di spec" — SUDAH dicek ulang live, field ini ADA |
| Warehouse Name | detailItem[].warehouseName | OPSIONAL, TIDAK perlu lookup ID (§ Quirk) |
| Work Order Material ID | **TIDAK dipetakan** | § Keputusan Desain — id internal Accurate, bukan sesuatu yang user Excel tahu |
| CLS1-5 | detailItem[].dataClassification1-5Name | HANYA 5 slot dipakai Excel client (dari 10 yang didukung API) |
| Serial No | detailItem[].detailSerialNumber[].serialNumberNo | |
| Qty (kolom ke-2) | detailItem[].detailSerialNumber[].quantity | header Excel duplikat "Qty" — § Header Duplikat |
| Expired Date | detailItem[].detailSerialNumber[].expiredDate | |

## ⚠️ Header Duplikat — Sama Pola Work Order
Excel client punya 2 kolom "Qty" (U1 = qty barang, V1 = qty serial number) — `parseExcelBuffer` (diperbaiki Fase 147) sudah
menamai kemunculan ke-2 `Qty_1`, jadi `defaultColumnMap` cukup memetakan `Qty` dan `Qty_1` ke field berbeda — TIDAK perlu
perbaikan baru di parser.

## Keputusan Desain
1. **TIDAK auto-create item** (konsisten Fase 138/139/146/147) — `itemNo` dikirim apa adanya.
2. **TIDAK ada lookup cabang/gudang** (§ Quirk di atas) — SATU-SATUNYA sub-modul Manufacture dengan pola ini.
3. **`workOrderMaterialId` TIDAK dipetakan** — field ini adalah ID internal baris Work Order di Accurate (didapat dari
   `work-order/detail.do`/response `save.do`), bukan sesuatu yang user isi manual di Excel. Kolom Excel yang sama
   namanya (`Work Order Material ID`) dibiarkan opsional/kosong di template — kalau client ternyata punya cara mengisi
   ini secara manual, perlu klarifikasi (dianggap TIDAK dipakai untuk sekarang, mirror keputusan "Save As Status Type"
   Work Order yang ditunda).
4. **Grouping DEFAULT ADR-0011 by "Trans No"** (opsional, kosong = 1 baris = 1 dokumen) — mirror Roll Over, BUKAN pola
   "1 baris lebar = 1 dokumen" Work Order (Material Slip cuma 1 section, tidak ada section majemuk).
5. **Hanya 5 slot Kategori Keuangan** (CLS1-5, bukan 10) — Excel client eksplisit cuma sediakan 5 kolom CLS di sheet ini.

## Known Limitations / Butuh Konfirmasi Saat Eksekusi
- ~~`materialSlipType` dictionary belum bisa diverifikasi~~ — **RESOLVED 2026-09-22**, § "Data Riil Client" di bawah:
  contoh terisi dari client mengonfirmasi nilai enum LITERAL `"ITEM_PICK"` langsung (mirror `"PRODUCT"` Work Order),
  bukan istilah Indonesia dictionary.
- **Belum ada bukti pola grouping serial multi-baris** (mirip Finished Good Slip) untuk Material Slip spesifik — contoh
  client baru 2 baris (dibuat manual, bukan ekspor produksi bervolume seperti Finished Good Slip 536 baris), jadi
  belum ada baris "1 barang, banyak serial di baris terpisah". Kode dirancang generik supaya aman untuk kedua pola
  (§ Keputusan Desain #4 baru) — tapi kalau nanti client kirim data bervolume lebih besar dan pola beda, cek ulang.
- **`workOrderMaterialId`** — lihat Keputusan Desain #3, perlu konfirmasi client kalau ternyata dipakai.

> **Koreksi 2026-09-22** (verifikasi ulang atas permintaan user): draft pertama dokumen ini salah menulis "Dept Name
> TIDAK ada field API yang cocok" — ternyata SALAH BACA saat scroll portal (baris `departmentName` terlewat di antara
> `dataClassification9Name` dan `detailName`). Sudah dicek ulang langsung di portal live: `detailItem[n].departmentName`
> ADA (String, opsional, "Nama record departemen untuk pencatatan cost/profit center") — dipetakan normal di tabel di
> atas, TIDAK ada lagi yang hilang.

## ✅ Data Riil Client (2026-09-22) — Contoh Terisi
File `material-slip-temp-v1 (1) (1).xlsx` (2 baris, dibuat manual client sebagai contoh — BUKAN ekspor produksi
bervolume seperti Finished Good Slip): 1 dokumen (`Trans No="MS-001"`) berisi **2 barang berbeda** (`Item No` 10001 &
10002, masing-masing qty 10, unit PCS), masing-masing dengan 1 nomor seri di baris yang sama (`XX1`/`XX2`, exp
22/09/2027). Field lain: `Branch Name="Jakarta"`, `Material Slip Type="ITEM_PICK"` (enum literal, BUKAN istilah
Indonesia — `resolveMaterialSlipType` cek literal dulu sebelum dictionary, sudah benar by design), `Work Order
No="WO-001"`, `Warehouse Name="GD. JAKARTA"` (teks bebas, TIDAK di-lookup, konsisten § Quirk). `Item Note`, `Project
No`, `Dept Name`, `CLS1-5`, `Work Order Material ID` semua kosong di contoh ini (opsional, belum ada contoh
pemakaian). Ini MENGKONFIRMASI grouping multi-item per "Trans No" adalah kasus nyata yang dipakai client (beda dari
Finished Good Slip yang di data riilnya 0% multi-item) — desain grouping HARUS mendukung >1 `detailItem` per dokumen.

## Keputusan Desain (lanjutan)
4. **Grouping 2-level, SAMA seperti Finished Good Slip** (§ `architecture-finished-good-slip.md` "Data Riil Client")
   — dalam 1 grup "Trans No": baris dengan `Qty` barang (kolom I) terisi = detailItem BARU; baris tanpa `Qty` barang
   tapi ada `Serial No` = entri `detailSerialNumber[]` TAMBAHAN milik detailItem TERAKHIR. Ini SATU implementasi
   grouping yang dipakai BERSAMA oleh Material Slip dan Finished Good Slip (beda dari Roll Over/Work Order yang
   masing-masing 1 detailItem per baris) — pertimbangkan helper `groupDetailItemsWithContinuationRows` di modul
   `import-mapping` bersama (mis. `lib/import-mapping/manufacture-slip-shared.ts`) supaya tidak duplikasi logic.

## Referensi
- Spec resmi: `docs/referencehtml/accurate-openapi.json` `/api/material-slip/save.do`
- **Portal developer live, diverifikasi 2026-09-22**: `account.accurate.id/developer/api-docs.do` → `/api/material-slip`
  (semua field & requirement 100% cocok spec lokal; `branchId`/`branchName`/`warehouseId`/`warehouseName` SEMUA opsional,
  dikonfirmasi live) dan `/api/warehouse` (scope `warehouse_view`/`warehouse_save` ada, TIDAK dipakai modul ini karena
  tidak perlu lookup).
- Panduan client: `docs/referencehtml/facport/developmen-15-september-2026.xlsx` sheet "Material Slip" (23 kolom, header saja)
- Modul terkait: `architecture-work-order.md`, `architecture-finished-good-slip.md`, `architecture-roll-over.md`,
  `architecture-job-costing.md`

## Registri endpoint & scope (siap dipakai saat dibangun)
Saat modul dibangun, daftarkan entry `material_slip` di `apps/api/src/lib/accurate-endpoint-registry.ts`: `POST
material-slip/save.do` (`material_slip_save`) + Kategori Keuangan (`CLASSIFICATION`, 5 slot dipakai dari 10 yang tersedia
di API — scope-nya sama, `data_classification_view`/`_save`). TIDAK ada `branch_view`/`warehouse_view` (§ Quirk — tidak
perlu lookup). Scope diturunkan otomatis; jalankan `bun run scopes:sync` bila endpoint belum ada di snapshot (SUDAH ada,
diverifikasi § di atas), tes `accurate-scopes.test.ts` hijau, pasang `checkSubscriptionScopes` di route import.
