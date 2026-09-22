# Architecture — Finished Good Slip (Penyelesaian Barang Jadi)

> Fase 136 (arsitektur) sempat ditunda karena panduan client kosong. Panduan sudah terisi 2026-09-22 (sheet "Finished Good
> Slip", `docs/referencehtml/facport/developmen-15-september-2026.xlsx`) — dokumen ini dibuat sekaligus dengan hasil
> VERIFIKASI LIVE portal developer Accurate (`account.accurate.id/developer/api-docs.do`, 2026-09-22), bukan cuma spec
> lokal. Kategori "Manufacture", bagian TERAKHIR dari rantai **Work Order → Material Slip → Finished Good Slip** (§
> `architecture-work-order.md` "Posisi dalam Alur Manufacture") — mencatat REALISASI barang jadi yang diselesaikan dari
> sebuah Work Order (beda dari Roll Over yang menyelesaikan Job Costing — 2 jalur produksi terpisah, § `architecture-job-costing.md`).

## Posisi dalam Alur Manufacture
```
Work Order (rencana: bahan baku + biaya + proses + FG utama & tambahan)
        ↓
   Material Slip  →  realisasi pengambilan/pengembalian bahan baku
        ↓
   Finished Good Slip  →  realisasi barang jadi yang BENAR-BENAR diselesaikan (modul ini)
```
Mereferensikan `workOrderNumber` (header) — WAJIB Work Order-nya sudah ada di Accurate lebih dulu (TIDAK divalidasi
lokal, Accurate yang menolak bila nomor tidak ada).

## Endpoint Accurate
`POST /accurate/api/finished-good-slip/save.do` — SATU-SATUNYA endpoint. Deskripsi resmi portal: **"Membuat data
Penyelesaian Barang Jadi baru atau mengedit data Penyelesaian Barang Jadi yang sudah ada"**. Scope
`finished_good_slip_save` (+ `finished_good_slip_view`/`_delete` untuk `list.do`/`detail.do`/`delete.do`, tidak dipakai
modul ini). **100% cocok** antara spec lokal dan portal live.

## Struktur Field `save.do` (Resmi, Diverifikasi Live 2026-09-22)
```
branchId: integer REQUIRED (⚠️ Quirk — sama seperti Work Order, BEDA dari Material Slip)
transDate: date REQUIRED
workOrderNumber: string REQUIRED — "Nomor Perintah Kerja yang akan melakukan Penyelesaian barang jadi"
branchName, description, id, number, typeAutoNumber: opsional (header)

detailItem[] (REQUIRED, "Detail barang yang akan selesai untuk penyelesaian barang jadi"):
  itemNo: string REQUIRED
  portion: money REQUIRED — "Porsi produk perintah kerja untuk penyelesaian barang jadi" (%)
  quantity: money REQUIRED
  warehouseId: integer REQUIRED (⚠️ Quirk — BEDA dari Material Slip, SAMA seperti Work Order detailExtraFinishGood)
  warehouseName: string opsional (redundan dengan warehouseId, mirror pola branchName/branchId)
  itemUnitName, detailName, detailNotes, projectNo, departmentName, secondQualityOfItemNo, id: opsional
  dataClassification1Name..10Name: opsional (Kategori Keuangan)
  detailSerialNumber[]: opsional — { serialNumberNo, quantity, expiredDate, id, _status }
```
TIDAK ada field tipe/enum (beda dari Material Slip `materialSlipType`) — Finished Good Slip selalu 1 "jenis" transaksi.

## ⚠️ Quirk `branchId` DAN `warehouseId` — Keduanya REQUIRED (Integer)
**Ini sub-modul PALING KETAT soal resolusi ID** dari seluruh rantai Manufacture: Work Order cuma butuh `branchId`
(warehouse tidak dipakai di header), Material Slip TIDAK butuh keduanya, Finished Good Slip butuh **KEDUANYA**
`branchId` DAN `detailItem[].warehouseId` sebagai integer REQUIRED — dikonfirmasi LANGSUNG di portal live (bukan cuma
spec lokal, bukan dugaan).

**Keputusan desain**: REUSE helper yang sudah ada, TIDAK bikin baru:
- `branchId` → `resolveBranchId(branchName)` dari `accurate-work-order.ts` (lookup `branch/list.do`, TIDAK auto-create,
  fail dengan pesan jelas kalau tidak ketemu — persis pola Work Order).
- `warehouseId` → helper BARU `resolveWarehouseId(warehouseName)`, pola IDENTIK `resolveBranchId` tapi target
  `GET /api/warehouse/list.do` (scope `warehouse_view`, dikonfirmasi ADA di portal — § Referensi). TIDAK auto-create
  (gudang = data struktural, bukan entitas transaksional, mirror alasan cabang tidak auto-create).

Rekomendasi implementasi: generalisasi `findByExactName` yang sudah ada di `accurate-work-order.ts` (saat ini menerima
literal `"branch" | "wo-pic"`) supaya menerima `"warehouse"` juga — HINDARI duplikasi logic pencocokan nama.

## Field Mapping Excel Client → API
Excel: `Branch Name, Trans Date, Trans No, Work Order No, Description, Item No, Item Name, Qty, Portion, Unit Name,
Item Note, Project No, Dept Name, Warehouse Name, CLS1-5, Serial No, Qty, Expired Date` (22 kolom, header saja).

| Excel Column | API Field | Catatan |
|---|---|---|
| Branch Name | branchName + **lookup → branchId** | header, REQUIRED via branchId (§ Quirk) |
| Trans Date | transDate | header, REQUIRED |
| Trans No | number | header, OPSIONAL (kunci grouping DEFAULT ADR-0011) |
| Work Order No | workOrderNumber | header, REQUIRED |
| Description | description | header |
| Item No | detailItem[].itemNo | REQUIRED per baris |
| Item Name | detailItem[].detailName | |
| Qty | detailItem[].quantity | REQUIRED per baris |
| Portion | detailItem[].portion | REQUIRED per baris (§ Quirk — beda dari Material Slip, portion TIDAK ada di sana) |
| Unit Name | detailItem[].itemUnitName | |
| Item Note | detailItem[].detailNotes | |
| Project No | detailItem[].projectNo | |
| Dept Name | detailItem[].departmentName | ADA di API modul ini (beda dari Material Slip yang tidak punya field ini) |
| Warehouse Name | detailItem[].warehouseName + **lookup → warehouseId** | REQUIRED via warehouseId (§ Quirk) |
| CLS1-5 | detailItem[].dataClassification1-5Name | HANYA 5 slot dipakai Excel (dari 10 yang didukung API) |
| Serial No | detailItem[].detailSerialNumber[].serialNumberNo | |
| Qty (kolom ke-2) | detailItem[].detailSerialNumber[].quantity | header Excel duplikat "Qty" — § Header Duplikat |
| Expired Date | detailItem[].detailSerialNumber[].expiredDate | |

**Catatan**: kolom Excel client TIDAK punya "Second Quality Of Item No" (field API `secondQualityOfItemNo` ada di spec
tapi tidak diminta client) — TIDAK dipetakan, konsisten prinsip "API boleh lebih lengkap dari Excel, Excel tidak boleh
minta yang API tidak punya" (§ `feedback_facport_scope_and_check_existing_first`).

## ⚠️ Header Duplikat — Sama Pola Work Order/Material Slip
2 kolom "Qty" (H1 = qty barang jadi, U1 = qty serial number) — `parseExcelBuffer` (Fase 147) menamai kemunculan ke-2
`Qty_1`. Tidak perlu perbaikan parser baru.

## Keputusan Desain
1. **TIDAK auto-create item** (konsisten seluruh modul Manufacture) — `itemNo` dikirim apa adanya.
2. **Lookup cabang & gudang WAJIB** (§ Quirk) — REUSE `resolveBranchId`, tambah `resolveWarehouseId` baru (generalisasi
   `findByExactName`).
3. **Grouping DEFAULT ADR-0011 by "Trans No"** (opsional) — mirror Material Slip/Roll Over, bukan pola "1 baris lebar"
   Work Order (modul ini cuma 1 section `detailItem[]`, tidak ada section majemuk).
4. **`portion` WAJIB per baris** (dikonfirmasi live) — validasi baris (`finishedGoodSlipRowError` atau sejenis) mewajibkan
   `itemNo`, `quantity`, DAN `portion` sekaligus (mirror `detailExtraFinishGood` Work Order yang juga 3 field wajib
   berbarengan).
5. **Hanya 5 slot Kategori Keuangan** (CLS1-5) — sama seperti Material Slip.

## Known Limitations / Butuh Konfirmasi Saat Eksekusi
- **Belum diuji ke Accurate sungguhan** — payload dari spec + portal + data riil client (§ di bawah), TAPI belum pernah
  dikirim ke API Accurate yang sesungguhnya. Uji dengan Work Order + Finished Good Slip yang benar-benar berantai
  (Work Order dibuat dulu, baru Finished Good Slip mereferensikan `workOrderNumber`-nya) WAJIB sebelum rilis.
- ~~Portion dalam skala apa~~ — **RESOLVED** oleh data riil client (§ di bawah): persen (0-100), bukan asumsi lagi.
- **Grouping multi-baris-per-serial** (§ di bawah) — desain SUDAH ditentukan dari data riil, TAPI implementasinya lebih
  rumit dari pola Roll Over/Work Order yang ada (bukan sekadar "1 baris = 1 entri"), perlu tes unit khusus mengcover
  penggabungan lintas-baris ini sebelum dianggap selesai.

## ✅ Data Riil Client (2026-09-22) — Konfirmasi & 1 Temuan Struktural Baru
File `finished-good-slip-temp-v1_Uploud SN.xlsx` (sheet "Sheet2", 536 baris = 252 dokumen "Trans No") berisi data
produksi RIIL client (bukan contoh buatan) — mengonfirmasi beberapa hal dan mengungkap 1 pola baru yang PERLU
KEPUTUSAN DESAIN sebelum eksekusi:

1. **`portion` TERKONFIRMASI skala persen (0-100)** — seluruh 252 dokumen memakai nilai **`100`** (bukan `1`), karena
   tiap dokumen di data ini menyelesaikan HANYA 1 barang jadi (tidak ada split porsi ke beberapa output). Ini
   menjawab pertanyaan skala di § "Known Limitations" versi sebelumnya — TIDAK perlu tebak-tebakan lagi.
2. **⚠️ POLA BARU: 1 barang jadi bisa punya BEBERAPA nomor seri, ditulis di BEBERAPA BARIS Excel terpisah** (bukan 1
   baris = 1 serial seperti asumsi awal / pola Roll Over). Contoh nyata (Trans No `18320`):
   ```
   Baris 1: Item No=3300500719, Qty=101, Portion=100, Unit=CTN, Warehouse=WH FG   (SN kosong)
   Baris 2: Item No=3300500719 (diulang), Qty/Portion/Unit/Warehouse KOSONG, Serial No="28/10/2025", Qty=15, Exp=22/10/2026
   Baris 3: Item No=3300500719 (diulang), Qty/Portion/Unit/Warehouse KOSONG, Serial No="29/10/2025", Qty=1500, Exp=23/10/2026
   ```
   241 dari 252 dokumen (96%) punya struktur ini (2-15 baris per dokumen) — BUKAN kasus tepi, ini pola UTAMA dipakai
   client. Sinyal baris "item" vs baris "lanjutan serial": baris item punya kolom **Qty barang** (H) terisi; baris
   lanjutan punya kolom itu KOSONG tapi **Serial No** (T) terisi. **Keputusan desain WAJIB sebelum coding**: grouping
   tidak cukup "1 baris = 1 detailItem" (pola Roll Over) — perlu 2 level: (a) grup by "Trans No" seperti biasa, (b)
   DALAM grup itu, gabungkan baris-baris berurutan yang Item No-nya sama jadi SATU `detailItem`, kumpulkan SEMUA baris
   "lanjutan serial" (Qty barang kosong + Serial No terisi) jadi banyak entri `detailSerialNumber[]` milik item
   TERAKHIR yang punya Qty terisi. Data ini TIDAK PERNAH punya >1 Item No berbeda dalam 1 Trans No (0 dari 252), jadi
   praktiknya per dokumen = 1 `detailItem` + N `detailSerialNumber`, TAPI desain kode harus tetap benar kalau nanti ada
   dokumen dengan >1 barang (spec API mendukungnya).
3. **Nomor seri berupa STRING TANGGAL** (`"28/10/2025"`) — bukan bug, kemungkinan konvensi lot number client (tanggal
   produksi dijadikan kode lot). Dikirim apa adanya sebagai string ke `serialNumberNo`, TIDAK diparse sebagai tanggal.
4. **Cabang & gudang nyata**: `branchName` selalu `"Kantor Pusat"`, `warehouseName` selalu `"WH FG"` — SATU nilai
   konsisten di semua 252 dokumen (data client belum menunjukkan variasi multi-cabang/gudang, tapi `resolveBranchId`/
   `resolveWarehouseId` harus tetap general, bukan hardcode).
5. **CLS1-5, Project No, Dept Name TIDAK PERNAH terisi** di data ini — field-nya tetap didukung (opsional), cuma
   belum ada contoh nyata pemakaiannya.
6. **`Work Order No` (kolom D) terverifikasi nyata ter-link** ke Trans No modul Work Order (sheet "spk" di file yang
   sama, kolom B — nilai `"6682"`, `"6683"`, dst cocok persis). `Work Order Type` di data riil `spk` memakai LITERAL
   ENUM `"PRODUCT"` langsung (bukan istilah Indonesia "Kode Produk") — `resolveWorkOrderType` (Fase 147) SUDAH benar
   menangani ini (cek enum literal dulu sebelum dictionary), tidak perlu ubah apa pun di Work Order.
7. **1 sheet terpisah ("Sheet3", 252 baris) mencatat kegagalan Accurate**: pesan **"Tanggal Penyelesaian barang lebih
   kecil dari perintah kerja"** — validasi bisnis Accurate sendiri (`transDate` Finished Good Slip lebih awal dari
   tanggal Work Order-nya) untuk SET Trans No yang BERBEDA dari 252 dokumen "baik" di atas (0 tumpang tindih). Ini
   BUKAN sesuatu yang perlu divalidasi di Facport — Accurate yang menolak, pesannya sudah jelas dan akan tampil apa
   adanya ke user (mirror pola error-passthrough modul lain). Dicatat sebagai kelas error yang REALISTIS ditemui tim
   penguji, bukan bug.

## Referensi
- Spec resmi: `docs/referencehtml/accurate-openapi.json` `/api/finished-good-slip/save.do`
- **Portal developer live, diverifikasi 2026-09-22**: `account.accurate.id/developer/api-docs.do` → `/api/finished-good-slip`
  (semua field & requirement 100% cocok spec lokal; `branchId` DAN `detailItem[].warehouseId` DIKONFIRMASI REQUIRED live)
  dan `/api/warehouse` (scope `warehouse_view`/`warehouse_save`/`warehouse_delete` ada, `list.do`/`save.do` tersedia).
- Panduan client: `docs/referencehtml/facport/developmen-15-september-2026.xlsx` sheet "Finished Good Slip" (22 kolom, header saja)
- Modul terkait: `architecture-work-order.md`, `architecture-material-slip.md`

## Registri endpoint & scope (siap dipakai saat dibangun)
Saat modul dibangun, daftarkan entry `finished_good_slip` di `apps/api/src/lib/accurate-endpoint-registry.ts`: `POST
finished-good-slip/save.do` (`finished_good_slip_save`), lookup cabang `GET branch/list.do` (`branch_view`, REUSE dari
Work Order), lookup gudang `GET warehouse/list.do` (`warehouse_view`, BARU — belum ada modul lain yang memintanya) +
Kategori Keuangan (5 slot dipakai). Scope diturunkan otomatis; jalankan `bun run scopes:sync` bila perlu (endpoint SUDAH
ada di snapshot, diverifikasi § di atas), tes `accurate-scopes.test.ts` hijau, pasang `checkSubscriptionScopes` di route
import. Scope `warehouse_view` BARU bagi katalog Facport — pelanggan yang membeli modul ini akan melihat popup "Perbarui
Izin" (gerbang Fase 144), sama seperti efek scope baru Work Order.
