# Architecture — Job Costing (Pekerjaan Pesanan / Job Order)

> **Catatan 2026-09-22:** scope `glaccount_view` yang disebut di dokumen ini SUDAH DIBUANG dari registri (`accurate-endpoint-registry.ts`) — tidak ada kode yang memanggil `glaccount/*.do`. Sumber kebenaran scope modul ini = registri, bukan teks historis di bawah.

> Fase 136 (Planned — arsitektur SAJA, implementasi belum dikerjakan).
> Modul PERTAMA dari kategori "Manufacture" (0% built sebelumnya, §
> `architecture-product-lines.md`). Sumber kebutuhan: panduan client
> (`docs/referencehtml/facport/developmen-15-september-2026.xlsx`,
> sheet "Job Costing" — **gitignored**) + spec resmi Accurate
> (`docs/referencehtml/accurate-openapi.json` `/api/job-order/save.do`
> + **portal developer LIVE** `account.accurate.id/developer/api-docs.do`
> `/api/material-adjustment/save.do` — endpoint KEDUA yang TIDAK ADA di
> snapshot JSON lokal, ketemu 2026-09-21 lewat verifikasi browser
> langsung, § "✅ RESOLVED: 2 Endpoint" di bawah).
> **PENTING**: sheet tracker "Note" di file yang sama menandai kolom
> "Panduan"/"Eksekusi" untuk Job Costing/Roll Over/Work Order KOSONG —
> TAPI ketiga sheet-nya TETAP punya screenshot panduan lengkap (dicek
> langsung, bukan asumsi dari tracker). Tracker "Note" tidak bisa
> dipercaya mentah-mentah untuk 3 modul terakhir ini.

## Posisi dalam Alur Manufacture

Accurate punya 2 sistem produksi PARALEL dan TERPISAH (dikonfirmasi
lewat OpenAPI — endpoint beda total, tidak saling terhubung):
1. **Job Order / Job Costing** (dokumen ini + Roll Over) — metode
   "biaya per pekerjaan", TANPA Bill of Material — cocok untuk produksi
   custom/pesanan yang komponennya beda-beda tiap kali.
2. **Work Order** (`architecture-work-order.md`) — metode BOM (Bill of
   Material) baku — cocok untuk produksi massal/berulang dengan formula
   tetap.

Rantai Job Costing (3 dokumen API, 2 modul Facport TERPISAH):
```
Job Costing (Job Order + Material Adjustment) → Roll Over
  (buat pekerjaan, catat         (tutup pekerjaan → hasilkan
   pemakaian RM via GUDANG)       Finished Good + alokasi biaya)
```
Roll Over WAJIB mereferensikan `jobOrderNumber` yang sudah ada
(field REQUIRED) — jadi modul ini (Job Costing) HARUS dibangun/
dieksekusi LEBIH DULU sebelum Roll Over (dependensi urutan fase,
konsisten filosofi "no auto-chaining" modul lain).

## ✅ RESOLVED (2026-09-21, verifikasi portal developer LIVE): 2 Endpoint, BUKAN 1
User bertanya balik ("warehouse itu pasti API yang berbeda") setelah
klaim awal "warehouseName tidak ada di spec resmi" — dugaan itu BENAR.
Verifikasi langsung ke `account.accurate.id/developer/api-docs.do`
(portal live, BUKAN cuma file JSON snapshot lokal) menemukan endpoint
KEDUA yang SAMA SEKALI TIDAK ADA di `accurate-openapi.json` lokal:

**`POST /api/material-adjustment/save.do`** — "Membuat data Penambahan
Bahan Baku baru" (scope `material_adjustment_save` — spec resmi menetapkan `_save` untuk `POST material-adjustment/save.do`; `_view` hanya untuk endpoint baca yang TIDAK dipanggil modul ini,
TERPISAH dari `job_order_*` DAN dari `item_adjustment_*` yang dipakai
modul "Inventory Adjustment"). Field kuncinya:
```
jobOrderNumber: string REQUIRED  -- referensi ke Job Order yang SUDAH ADA
materialAdjustmentAccountNo: string REQUIRED
materialAdjustmentType: enum REQUIRED ['ITEM_PICK', 'ITEM_RETURN']
transDate: string REQUIRED
branchId / branchName, description, number

detailItem[] (REQUIRED, minimal 1, itemNo REQUIRED per baris):
  itemNo, quantity, itemUnitName, detailName, detailNotes,
  departmentName, projectNo, warehouseName,  ✅ ADA DI SINI (resmi!)
  dataClassification1Name..10Name (Kategori Keuangan)
  detailSerialNumber[] (nested):  ✅ JUGA ADA DI SINI (resmi!)
    serialNumberNo, quantity, expiredDate
```

**Kesimpulan arsitektur baru**: Job Costing BUKAN 1 dokumen API, tapi
**2 panggilan berurutan per grup Excel**:
1. `job-order/save.do` — bikin/update SHELL Job Order (header:
   `jobAccountNo`, `differenceAccountNo`, `branchName`, `description`,
   `number`) + `detailExpense[]` (Expense No/Name/Amount).
   `detailItem[]` di endpoint ini TIDAK dipakai untuk RM (lihat poin 2)
   — cukup dikirim kosong `[]` kalau memang tidak ada kebutuhan RM
   level "estimasi" terpisah dari realisasi.
2. `material-adjustment/save.do` — catat REALISASI pemakaian Raw
   Material (`ITEM_PICK`) TERHADAP Job Order dari langkah 1, pakai
   `jobOrderNumber` = nilai "No. Job Order" yang sama. **Field
   `warehouseName` dan `detailSerialNumber[]` ADA DI SINI, resmi
   didokumentasikan** — bukan endpoint yang sama sekali salah tebak.

Ini pola BARU untuk Facport — bukan cuma "cross-API lookup" (find-or-
create master data) seperti Work Order/`wo-pic`, tapi **2 transaksi
Accurate BERURUTAN dalam 1 grup import**, yang kedua mereferensikan
nomor transaksi dari yang pertama. Field mapping Excel client SEKARANG
kebagi ke 2 endpoint berbeda, bukan 1 (§ tabel mapping di bawah, sudah
direvisi).

## Endpoint Accurate
`POST /accurate/api/job-order/save.do` (header + expense) DAN
`POST /accurate/api/material-adjustment/save.do` (realisasi RM +
gudang + serial) — KEDUANYA dikonfirmasi, yang kedua dari portal
developer live (tidak ada di `accurate-openapi.json` lokal sama
sekali, snapshot lokal genuinely tidak lengkap untuk kasus ini).

## Struktur Field `job-order/save.do` (Ringkas — Resmi dari OpenAPI Spec)
```
transDate: string REQUIRED
branchId / branchName, customerNo, description, number, typeAutoNumber
jobAccountNo, differenceAccountNo, manualClosed (boolean)

detailItem[] (opsional secara spec — TIDAK dipakai untuk RM Excel, § di atas):
  itemNo, quantity, itemUnitName, detailName, detailNotes,
  departmentName, projectNo, dataClassification1Name..10Name

detailExpense[] (biaya tambahan, opsional):
  accountNo, expenseAmount, expenseName, expenseNotes, departmentName,
  dataClassification1Name..10Name
```

## Field Mapping Excel Client → API (2 Endpoint)

**→ `job-order/save.do`** (header + expense, dipanggil PERTAMA):

| Excel Column | API Field | Catatan |
|---|---|---|
| Tanggal | transDate | header, REQUIRED |
| No. Job Order | number | header, opsional (kunci grouping DAN nilai yang dipakai ulang sebagai `jobOrderNumber` di panggilan kedua) |
| Job Account No | jobAccountNo | header |
| Difference Account No | differenceAccountNo | header |
| Keterangan | description | header |
| Nama Cabang | branchName | header, **WAJIB diisi** (§ Branch Wajib) |
| Expense No | detailExpense[].accountNo | akun biaya (BEDA dari Work Order — di sini `detailExpense` genuinely akun GL, bukan item) |
| Expense Name | detailExpense[].expenseName | |
| Expense Amount | detailExpense[].expenseAmount | |
| Note (kolom terakhir) | detailExpense[].expenseNotes | asumsi merujuk ke catatan expense, perlu konfirmasi posisi kolom saat eksekusi |

**→ `material-adjustment/save.do`** (realisasi RM, dipanggil KEDUA,
referensi `jobOrderNumber` = "No. Job Order" dari panggilan pertama,
`materialAdjustmentType` = `ITEM_PICK` untuk konsumsi RM normal):

| Excel Column | API Field | Catatan |
|---|---|---|
| No. Job Order (sama kolom) | jobOrderNumber | REQUIRED, referensi ke hasil `job-order/save.do` |
| Job Account No (sama kolom) | materialAdjustmentAccountNo | REQUIRED — **perlu konfirmasi**: apakah akun ini SAMA dengan `Job Account No` atau butuh akun terpisah (Excel client cuma 1 kolom akun, API minta akun berbeda konsep) |
| RM_Item No | detailItem[].itemNo | REQUIRED per baris |
| RM_Qty | detailItem[].quantity | |
| RM_Unit | detailItem[].itemUnitName | |
| SN - Qty | detailItem[].detailSerialNumber[].quantity | **RESMI didokumentasikan di endpoint ini** (beda dari dugaan awal) |
| Serial No | detailItem[].detailSerialNumber[].serialNumberNo | sama |
| SN - Exp Date | detailItem[].detailSerialNumber[].expiredDate | sama |
| Project No | detailItem[].projectNo | |
| Dept Name | detailItem[].departmentName | |
| Warehouse | detailItem[].warehouseName | **RESMI didokumentasikan di endpoint ini** (beda dari dugaan awal) |
| RM_CLS1/CLS2/CLS3 | dataClassification1/2/3Name | Kategori Keuangan |
| Note Penting | detailItem[].detailNotes | |

Client TIDAK minta kolom `customerNo`/`manualClosed` (job-order) di
Excel — field ini ADA di API tapi di luar scope yang diminta (boleh
dikosongkan default).

## Keputusan Desain (Rencana)
1. **2 panggilan API per grup, bukan 1** — `job-order/save.do` DULU,
   baru `material-adjustment/save.do` referensi nomornya. Kalau
   panggilan kedua gagal setelah yang pertama sukses, Job Order
   SUDAH TERLANJUR dibuat tanpa RM — perlu keputusan penanganan error
   (retry manual? tampilkan partial-success ke user?) — **pola BARU,
   belum ada preseden 2-transaksi-berurutan di modul lain manapun**
   (beda dari find-or-create master data yang sifatnya idempotent/aman
   diulang).
2. **Tidak ada auto-create Vendor/Customer** — `customerNo` opsional
   dan TIDAK diminta client. Auto-create yang relevan: `item_save`
   untuk Raw Material baru (dipakai di `material-adjustment`, bukan
   `job-order`). Scope OAuth kandidat: `job_order_save`,
   `material_adjustment_save`, `item_save`, `glaccount_view` (lookup
   `jobAccountNo`/`differenceAccountNo`/`materialAdjustmentAccountNo`),
   `data_classification_view`+`data_classification_save`.
3. **Grouping multi-baris** — SAMA pola modul lain: `No. Job Order`
   (kalau diisi) jadi kunci grouping — TAPI sekarang grup yang sama
   menghasilkan 2 payload API (satu per endpoint), bukan 1.
4. **`detailItem[]` di `material-adjustment` REQUIRED minimal 1**
   (beda dari asumsi awal "opsional") — masuk akal karena Job Costing
   tanpa realisasi RM tidak ada gunanya. Facport WAJIBKAN minimal 1
   baris RM per grup Excel.
5. **Nested `detailSerialNumber[]`** — SAMA pola Item Transfer/Item
   Requisition/Inventory Adjustment: 1 baris Excel = maksimal 1 entri
   serial. Sekarang RESMI didokumentasikan (bukan tebakan), jadi bisa
   langsung diimplementasi tanpa test call verifikasi tambahan untuk
   field ini.

## Atribut Tambahan / Kategori Keuangan
Excel client Job Costing minta "RM_CLS1/2/3" — ini `dataClassification`
(Kategori Keuangan), SUDAH pasti didukung resmi (ada di spec). TIDAK
ada permintaan kolom "Custom Character/Number/Date" (charField dst) di
sheet ini.

## ⚠️ Branch Wajib (Preseden Fase 90)
Sama seperti modul baru lain — `Nama Cabang` WAJIB divalidasi non-kosong
di Facport SEBELUM kirim ke Accurate. Verifikasi ulang via test call
nyata saat eksekusi.

## Known Limitations / Butuh Konfirmasi Saat Eksekusi
- **RESOLVED 2026-09-21**: `warehouseName`/`detailSerialNumber[]`
  BUKAN field job-order yang undocumented — itu field RESMI di
  endpoint KEDUA (`material-adjustment/save.do`) yang ketemu via
  verifikasi portal developer live (§ "RESOLVED: 2 Endpoint" di atas).
  Tidak perlu test call spekulatif lagi untuk field ini — sudah pasti
  ada di spec resmi.
- **BARU**: `materialAdjustmentAccountNo` (REQUIRED di endpoint kedua)
  — Excel client cuma punya 1 kolom akun ("Job Account No"), belum
  jelas apakah nilai yang sama dipakai untuk `jobAccountNo` DAN
  `materialAdjustmentAccountNo`, atau client perlu kolom akun terpisah
  yang belum ada di Excel mereka. **Perlu ditanyakan ke client**
  sebelum eksekusi.
- **BARU**: penanganan kegagalan PARSIAL — kalau `job-order/save.do`
  sukses tapi `material-adjustment/save.do` gagal (atau sebaliknya
  saat update), Job Order sudah terlanjur ada di Accurate tanpa/dengan
  RM tidak lengkap. Perlu didesain saat eksekusi (retry, rollback
  manual, atau laporan partial-success ke user) — pola 2-transaksi-
  berurutan ini BARU, belum ada preseden di modul lain.
- Scope OAuth `material_adjustment_save` (SELESAI, Fase 139): dideklarasikan lewat registri endpoint
  (`accurate-endpoint-registry.ts`, `POST material-adjustment/save.do`); `material_adjustment_view` TIDAK dibutuhkan.
- Posisi kolom "Note" terakhir di header Excel (apakah `detailExpense[].expenseNotes`
  atau catatan level dokumen lain) perlu dikonfirmasi ulang lewat Excel
  asli (bukan cuma header CSV) saat eksekusi.
- Ini modul PERTAMA kategori "Manufacture" — pastikan taksonomi
  `MODULE_CATEGORIES` (§ `architecture-product-lines.md`) sudah
  mendukung render section "Manufacture" begitu modul pertamanya live
  (per desain Fase 126/127, section kosong = tidak render — jadi
  seharusnya otomatis muncul tanpa perubahan kode tambahan, TAPI perlu
  di-spot-check saat eksekusi, belum pernah dites modul pertama di
  kategori yang sebelumnya benar-benar 0%).
- `bulk-save.do` ADA tapi project ini KONSISTEN pakai `save.do`
  per-grup.

## Referensi
- Spec resmi (endpoint 1): `docs/referencehtml/accurate-openapi.json` `/api/job-order/save.do`
- Spec resmi (endpoint 2, TIDAK ADA di JSON lokal): portal developer live `account.accurate.id/developer/api-docs.do` → `/api/material-adjustment/save.do`
- Panduan client (gitignored): `docs/referencehtml/facport/developmen-15-september-2026.xlsx` sheet "Job Costing"
- Modul lanjutan: `architecture-roll-over.md` (WAJIB job order number dari modul ini)
- Modul manufacture lain (sistem BOM terpisah): `architecture-work-order.md`
- Endpoint lain ditemukan sesi sama, BELUM dieksplor (di luar scope fase ini): `/api/manufacture-order/save.do` ("Rencana Produksi" — kemungkinan terkait `workOrderType=MANUFACTURE_ORDER` di Work Order, § catatan di `architecture-work-order.md`)
- Preseden field undocumented-tapi-jalan: `architecture-purchase-order.md` § "Atribut Tambahan"
- Preseden Branch Wajib: `architecture-purchase-payment.md` § "Fase 90"
- **Pelajaran metodologi**: `accurate-openapi.json` lokal TERBUKTI tidak lengkap untuk endpoint yang genuinely tidak dikenal sebelumnya (bukan cuma field yang "hilang" dari endpoint yang sudah dikenal) — verifikasi portal developer LIVE via browser lebih diandalkan untuk modul benar-benar baru, bukan cuma grep file JSON snapshot.
