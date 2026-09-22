# Architecture — Item Transfer (Pindah Gudang)

> **Catatan 2026-09-22:** scope `glaccount_view` yang disebut di dokumen ini SUDAH DIBUANG dari registri (`accurate-endpoint-registry.ts`) — tidak ada kode yang memanggil `glaccount/*.do`. Sumber kebenaran scope modul ini = registri, bukan teks historis di bawah.

> Fase 134. Modul ke-14 dari katalog Accurate, kategori **"Inventory"**
> (kategori PERTAMA yang terisi — disiapkan strukturnya sejak Fase 126,
> sebelumnya 0 modul). Sumber: panduan client
> (`docs/referencehtml/facport/developmen-15-september-2026.xlsx`, sheet
> "Item Transfer" — **gitignored, JANGAN pernah commit**) + spec resmi
> Accurate `/api/item-transfer/save.do`.

## Konteks — Kenapa Ada 2 Modul (Item Transfer & Item Requisition) untuk 1 API yang Sama
Client mengirim 2 sheet Excel terpisah: "Item Requisition" dan "Item
Transfer". Diriset (2026-09-17): **Accurate TIDAK PUNYA endpoint
"item-requisition"** — dikonfirmasi grep `accurate-openapi.json`, cuma
ada `/api/item-transfer/*` dan `/api/purchase-requisition/*` (nama
"purchase-requisition" itu sendiri sebenarnya fitur "Permintaan Barang"
versi PRE-PURCHASE — beda konteks dari 2 sheet client). Setelah kedua
sheet client didiff kolom-per-kolom: **keduanya 100% cocok skema
`/api/item-transfer/save.do` yang SAMA persis** — satu-satunya beda,
sheet "Item Transfer" punya 1 kolom ekstra "Item Requisition No" (murni
catatan referensi, tidak ada padanan field API).

**Keputusan eksplisit user** (bukan asumsi teknis): tetap bangun **2
modul Facport terpisah** (menu/halaman/template Excel sendiri-sendiri),
walau keduanya berakhir memanggil endpoint Accurate yang SAMA — alasan:
"client kirim isinya 2 (item requisition dan item transfer) terpisah,
kita ikuti apa yang mereka minta, yang penting di Accurate benar sesuai
panduan masing-masing sheet." Detail lengkap riset & histori keputusan
ini ada di memory sesi (`project_item_requisition_vs_item_transfer.md`)
— dokumen ini ADALAH hasil akhirnya, dibaca sebagai sumber kebenaran
teknis, bukan riwayat diskusi.

**Konsekuensi desain**: modul ini ("Item Transfer") dan modul kembarannya
("Item Requisition", `architecture-item-requisition.md`) punya mapping
Excel + halaman + `import_batches.module` **masing-masing sendiri**
(pola sama semua modul lain, TIDAK di-share/inherit satu sama lain,
konsisten prinsip "3 file mirip lebih baik dari abstraksi prematur" yang
sudah dipakai project ini untuk pasangan modul mirip lain seperti Other
Payment/Other Deposit). **SATU pengecualian**: pemanggilan HTTP ke
Accurate (`saveItemTransfer()`, `lib/accurate-item-transfer.ts`) DI-SHARE
literal 1 fungsi oleh KEDUA modul — beda dari Other Payment/Other Deposit
yang punya wrapper masing-masing karena URL endpoint mereka BEDA
(`other-payment/save.do` vs `other-deposit/save.do`); di sini URL-nya
LITERAL SAMA (`item-transfer/save.do`), jadi bukan duplikasi logika
bisnis yang perlu dipisah, cuma 1 HTTP call yang kebetulan dipakai 2
Facport-module berbeda.

## Endpoint Accurate
`POST /accurate/api/item-transfer/save.do` — dipakai KEDUA modul.

## Struktur Field `save.do` (Resmi dari OpenAPI Spec, Diverifikasi Langsung)
```
transDate: string REQUIRED
itemTransferType: enum REQUIRED — TRANSFER_IN | TRANSFER_OUT
detailItem[]: REQUIRED (tiap elemen: itemNo REQUIRED)

number: string (opsional, nomor transaksi internal — kosongkan utk auto-number)
branchName / branchId
description
differenceItemTransferAccountNo — akun pencatatan SELISIH nilai barang saat pemindahan
fromItemTransferNo — nomor transaksi pemindahan ASAL (dipakai utk "Terima Barang")
saveAsStatusType: enum — APPROVED | DRAFT | NEXTUSER_TOAPPROVED | REJECTED | UNAPPROVED
warehouseName — "gudang tempat SUMBER barang dikeluarkan / TUJUAN barang diterima"
referenceWarehouseName — "gudang tempat TUJUAN barang dikeluarkan / SUMBER barang diterima"
typeAutoNumber

detailItem[] tiap baris:
  itemNo REQUIRED, detailName, detailNotes, quantity, itemUnitName,
  departmentName, projectNo, salesOrderNumber,
  dataClassification1Name..10Name,
  detailSerialNumber[]: { serialNumberNo, quantity, expiredDate }
```

## ⚠️ Quirk Penting: Makna `warehouseName`/`referenceWarehouseName` TERBALIK Tergantung `itemTransferType`
Dikonfirmasi dari deskripsi resmi field itu sendiri (bukan tebakan) —
**bukan** "Gudang Asal selalu A, Gudang Tujuan selalu B" yang statis:
- `warehouseName`: "gudang tempat **sumber barang dikeluarkan** / **tujuan
  barang diterima**" — perannya BERBEDA tergantung `itemTransferType`.
- `referenceWarehouseName`: kebalikannya.

Client mapping "Gudang Asal"/"Gudang Tujuan" (2 kolom Excel FIXED,
independen dari Tipe Transfer) di-mapping APA ADANYA ke
`warehouseName`/`referenceWarehouseName` (§ tabel di bawah) — Facport
**TIDAK** menerapkan logika swap otomatis berdasar `itemTransferType`,
karena Excel client sendiri tidak punya sinyal cukup untuk itu (2 kolom
tetap "Asal"/"Tujuan", bukan "Warehouse"/"Reference Warehouse" yang
eksplisit ikut arah transfer). Kalau di eksekusi nyata muncul kasus
Accurate menolak/salah interpretasi gara-gara arah TRANSFER_IN vs
TRANSFER_OUT, ini titik pertama yang perlu dicek — dicatat sebagai Known
Limitation, bukan diasumsikan sudah pasti benar.

## Field Mapping Excel Client → API
| Excel Column | Internal Field | API Path | Catatan |
|---|---|---|---|
| Tanggal | transDate | `transDate` | REQUIRED |
| No. Item Transfer | number | `number` | REQUIRED di Facport (§ kunci grouping di bawah — walau OPSIONAL di API asli, dipaksa wajib supaya grouping deterministik, konsisten pola Other Deposit/Purchase Order) |
| Tipe Transfer | itemTransferType | `itemTransferType` | REQUIRED, enum `TRANSFER_IN`/`TRANSFER_OUT` — divalidasi row-level (§ `itemTransferTypeRowError`) |
| Branch Name | branchName | `branchName` | REQUIRED (preseden semua modul lain — ditolak Accurate kalau perusahaan multi-cabang) |
| Keterangan | description | `description` | opsional — **digabung** dengan "Item Requisition No" & "Note Penting" (§ di bawah) kalau ada isinya |
| Difference Item Transfer Acc No | differenceAccountNo | `differenceItemTransferAccountNo` | opsional |
| From Item Transfer No | fromTransferNo | `fromItemTransferNo` | opsional |
| Save As Status | saveAsStatus | `saveAsStatusType` | opsional, enum 5 nilai — dikirim apa adanya (uppercase+trim), TIDAK divalidasi strict (beda dari `itemTransferType` yang REQUIRED) |
| Gudang Asal | warehouseName | `warehouseName` | opsional, § quirk arah di atas |
| Gudang Tujuan | referenceWarehouseName | `referenceWarehouseName` | opsional, § quirk arah di atas |
| Item No | itemNo | `detailItem[].itemNo` | REQUIRED |
| Item Name | itemName | `detailItem[].detailName` | opsional |
| Qty | quantity | `detailItem[].quantity` | REQUIRED di Facport (bisnis tidak masuk akal kosong, walau API tidak strict require) |
| Unit | itemUnitName | `detailItem[].itemUnitName` | REQUIRED di Facport, sama alasan Qty |
| Item Notes | itemNotes | `detailItem[].detailNotes` | opsional |
| Item Dept | departmentName | `detailItem[].departmentName` | opsional |
| Item Project No | projectNo | `detailItem[].projectNo` | opsional |
| Item Sales Order No | salesOrderNumber | `detailItem[].salesOrderNumber` | opsional |
| **Item Requisition No** | requisitionNo | — TIDAK ADA field API, § di bawah | **HANYA ada di sheet "Item Transfer"** (tidak ada di "Item Requisition") |
| Item Cls1/2/3 | attribut1/2/3 | `detailItem[].dataClassification1Name`/`2Name`/`3Name` | opsional, Kategori Keuangan (auto-create) |
| Serial No | serialNo | `detailItem[].detailSerialNumber[0].serialNumberNo` | opsional, § nested di bawah |
| Serial Qty | serialQty | `detailItem[].detailSerialNumber[0].quantity` | opsional |
| Serial ExpDate | serialExpDate | `detailItem[].detailSerialNumber[0].expiredDate` | opsional, tanggal |
| Note Penting | notePenting | — TIDAK ADA field API, § di bawah | |

## Kolom Tanpa Padanan API — Digabung ke `description`
2 kolom (`requisitionNo` khusus sheet "Item Transfer", `notePenting` di
KEDUA sheet) tidak punya field API sendiri. Keputusan (dikonfirmasi user
untuk `requisitionNo`, didokumentasikan eksplisit untuk `notePenting`
karena ARGUMENTS eksekusi fase ini secara literal bilang "putuskan saat
eksekusi: drop, atau gabung ke description juga" — dipilih **gabung**,
konsisten filosofi "jangan diam-diam buang data client" §
`feedback_facport_scope_and_check_existing_first`): kalau salah satu/
keduanya terisi, di-append ke `description` dengan format
`"{description asli} | No. Permintaan: {requisitionNo} | Catatan: {notePenting}"`
(bagian yang kosong dilewati, bukan dipaksa muncul kosong). Ini BUKAN
field API baru — murni string concatenation di `buildItemTransferPayload`
SEBELUM dikirim, `requisitionNo`/`notePenting` sendiri TIDAK PERNAH masuk
`fieldToAccuratePath` (supaya tidak disalahartikan sebagai path API asli
kalau ada yang baca mapping-nya nanti).

## Grouping Multi-Item
Pola **DEFAULT ADR-0011** (mirror Purchase Order/Other Deposit/Journal
Voucher) — kunci grouping = kolom "No. Item Transfer" (`number`).
BERBEDA dari Receive Item (`receiveNumber` WAJIB tapi bukan field
`number`) — di sini kuncinya LITERAL `number` sendiri, dipaksa REQUIRED
di `requiredFields` Facport (walau opsional di API asli) supaya grouping
selalu deterministik (§ pelajaran ADR-0011 — silent wrong data kalau
dikosongkan tanpa sengaja). Baris dengan "No. Item Transfer" sama →
digabung jadi 1 payload, `detailItem[]` diisi tiap baris. Field header
(transDate, itemTransferType, branchName, dst) diambil dari baris
PERTAMA grup, TIDAK divalidasi konsistensi antar-baris (beda dari
Purchase Order/Receive Item yang validasi `vendorNo` konsisten — modul
ini tidak punya "pihak ketiga" seperti vendor yang perlu konsisten,
murni pemindahan barang internal).

## Validasi `itemTransferType`
Mirror pola `returnTypeRowError` (Purchase Return) — fungsi
`itemTransferTypeRowError(rawRow, columnMapping)` mengecek nilai kolom
"Tipe Transfer" (setelah trim+uppercase) SALAH SATU dari
`TRANSFER_IN`/`TRANSFER_OUT`, dipanggil di 3 titik: konfirmasi mapping
awal (baris pertama tiap grup, di worker SEBELUM `buildItemTransferPayload`),
edit 1 baris gagal (`PUT .../rows/:rowId`), edit banyak baris gagal
(`PUT .../rows`) — sama persis titik pemanggilan `returnTypeRowError` di
`purchase-return-import.route.ts`.

## Kategori Keuangan (Item Cls1-3) — Auto-Create
Sama pola semua modul lain sejak Fase 68 — `dataClassification1-3Name`
di-auto-create via `findOrCreateDataClassification` SEBELUM
`saveItemTransfer` dipanggil (`ensureItemTransferDataClassifications`,
worker). Scope OAuth: `data_classification_view`/`data_classification_save`.

## Nested `detailSerialNumber[]` — 1 Baris Excel = Maksimal 1 Entri Serial
Beda dari `detailItem[]` (1 baris Excel = 1 elemen), `detailSerialNumber[]`
adalah array BERSARANG di dalam tiap `detailItem`. Excel client flat (1
baris = 1 barang), jadi Facport membatasi: **1 baris Excel bisa punya
maksimal 1 entri serial number** (kalau kolom "Serial No"/"Serial Qty"/
"Serial ExpDate" terisi, jadi TEPAT 1 elemen `detailSerialNumber[0]` —
bukan array multi-serial per baris). Kalau barang butuh multi-serial per
transfer, client perlu split jadi beberapa baris Excel dengan Item No
sama (Accurate sendiri yang gabungkan di `detailItem[]` — TIDAK
diverifikasi eksplisit, catat sebagai Known Limitation).

## OAuth Scope
`item_transfer_save` (dikonfirmasi OpenAPI security block `/api/item-transfer/save.do`
— HANYA butuh scope ini, TIDAK ada `item_transfer_view` terpisah, pola
sama Purchase Order/Receive Item/Sales Quotation/Sales Return),
`glaccount_view` (untuk `differenceItemTransferAccountNo`, mirror
Journal Voucher/Other Payment/Other Deposit), `data_classification_view`/
`data_classification_save` (Item Cls1-3, § di atas). TIDAK butuh
`vendor_*`/`customer_*` — modul ini murni internal (gudang↔gudang), tidak
ada pihak ketiga. `item_view` sudah baseline (`scopesForModules`).

## Keputusan Desain
1. **TIDAK auto-create item** — `itemNo` dikirim apa adanya, Accurate
   yang validasi eksistensi (mirror Receive Item — item seharusnya sudah
   terdaftar sebelum dipindah/diminta, bukan dibuat baru saat transfer).
2. **Tidak ada "Batal Import"** — konsisten pola modul non-invoice
   lainnya (Purchase Order, Receive Item, dst).
3. **`saveItemTransfer()` di-share** dengan modul kembaran Item
   Requisition (§ Konteks di atas) — SATU-SATUNYA bagian kode yang
   di-share lintas 2 modul ini, karena literal endpoint API sama.

## Known Limitations
- Quirk arah `warehouseName`/`referenceWarehouseName` (§ di atas) —
  Facport TIDAK swap otomatis berdasar `itemTransferType`, belum
  divalidasi test call nyata.
- `detailSerialNumber[]` dibatasi 1 entri per baris Excel (§ di atas) —
  kasus multi-serial per barang per transfer belum ditest end-to-end.
- `fromItemTransferNo` (link ke transaksi pemindahan asal, dipakai utk
  alur "Terima Barang") ADA di Excel client tapi belum ditest hubungan
  end-to-end-nya dengan `itemTransferType` (apakah WAJIB diisi kalau
  `TRANSFER_IN`, misalnya) — dikirim apa adanya, Accurate yang validasi.

## Referensi
- Spec resmi: `docs/referencehtml/accurate-openapi.json` `/api/item-transfer/save.do`
- Panduan client (gitignored): sheet "Item Transfer"
- Modul kembaran: `architecture-item-requisition.md`
- Riset & histori keputusan: memory sesi `project_item_requisition_vs_item_transfer.md`
