# Architecture — Item Requisition (Permintaan Barang)

> **Fase 164 — REBUILD TOTAL (2026-09-30).** Modul ini SEBELUMNYA (Fase 135)
> dibangun sebagai "kembaran" Item Transfer, panggil endpoint
> `/api/item-transfer/save.do` yang sama. Itu keputusan yang **TERNYATA
> salah** — draft client yang dipakai waktu itu (sheet "Item Requisition"
> di `developmen-15-september-2026.xlsx`, versi lama) bukan spec asli,
> cuma isi placeholder yang kebetulan berbentuk item-transfer. Client
> mengirim ulang draft final (`Format_PREQ_v2.xlsx` — 249 baris data
> nyata + sheet "Penjelasan Kolom" — digabung dengan sheet "Item
> Requisition" terbaru di `developmen-15-september-2026.xlsx`, KEDUANYA
> gitignored, JANGAN pernah commit) yang membuktikan Item Requisition itu
> genuinely **`/api/purchase-requisition/save.do`** (Permintaan Barang) —
> dokumen TERPISAH dari Item Transfer, bukan kembarannya. Riset & histori
> keputusan lengkap: memory sesi `project_item_requisition_vs_item_transfer`.
>
> **`item-transfer.mapping.ts`/modul "Item Transfer" TIDAK ikut berubah
> sama sekali** — keputusan eksplisit, client cuma kirim ulang draft
> untuk "Item Requisition", bukan "Item Transfer".
>
> **Subscriber existing (bentuk item-transfer lama) SENGAJA TIDAK
> dimigrasikan.** Keputusan eksplisit user: *"gk masalah, abaikan yg
> sudah subscribe, krn sebelumnya salah total"*. Riwayat `import_batches`
> lama (mis. milik reza.eka17@gmail.com) tetap ada di DB sebagai histori,
> tapi tidak dibaca ulang/dikonversi — upload BARU langsung pakai mapping
> baru di dokumen ini. Kalau user itu retry batch lamanya, worker akan
> memproses dengan payload BARU (field-nya sudah beda total dari yang
> mereka upload) — behavior ini DITERIMA, bukan bug.

## Posisi & Endpoint Accurate
Permintaan Barang — dokumen permintaan internal SEBELUM PO resmi ke
vendor (kalau `requisitionType=PURCHASE`) ATAU sebelum pemindahan gudang
(kalau `requisitionType=TRANSFER`). `POST /accurate/api/purchase-requisition/save.do`.
Required root: `detailItem`, `transDate`. Required detailItem: `itemNo`,
`requiredDate`, `unitPrice`.

## 46 Kolom Final = Gabungan 2 File Client
**Bukan salah satu dipilih — UNION dari keduanya**, diminta eksplisit
user ("kombinasikan aja... Format_PREQ_v2.xlsx dari kompetitor lama").

**14 kolom inti** (sama di kedua file): Transaction Date, Transaction No,
Requisition Type, Branch Name, Description, Item No, Item Name, Item
Price, Qty, Item Unit Name, Item Detail Notes, Item Req Date, Department
Name, Project No.

**10 kolom dari `Format_PREQ_v2.xlsx`** (249 baris data nyata + sheet
"Penjelasan Kolom" tertulis client): Save as Status Type, Warehouse, Item
Cash Disc, Item Cash Disc Percent, PPN, PPnBM, PPH, Item CLS1, Item CLS2,
Item CLS3.

**22 kolom dari `developmen-15-september-2026.xlsx`** (Atribut custom,
DIPOTONG dari draft asli client yang sampai "Atribut Tambahan 11" — maks
Accurate cuma 10, dikonfirmasi lewat screenshot Rancangan Formulir
Accurate client sendiri, menu "Permintaan Barang" > tab "Atribut
Tambahan": Karakter 1-10 / Angka 1-10 / Tanggal 1-2, tidak lebih):
Atribut Tambahan 1-10, Atribut Number 1-10, Atribut Tanggal 1-2.

## Field Mapping Excel Client → API
| Excel Column | API Field | Level | Status |
|---|---|---|---|
| Transaction Date | transDate | header | Wajib |
| Transaction No | number | header | Wajib (249/249 data nyata terisi) |
| Requisition Type | requisitionType | header | Wajib — enum `PURCHASE`/`TRANSFER` (client cuma pakai 2 dari 3 nilai resmi Accurate, `ALL` tetap diterima kalau ada) |
| Save as Status Type | saveAsStatusType | header | Wajib — enum `APPROVED`/`DRAFT` (client cuma pakai 2 dari 5 nilai resmi Accurate) |
| Branch Name | branchName | header | Opsional |
| Warehouse | warehouseName | header | Opsional — "gudang tujuan barang diterima" |
| Description | description | header | Opsional |
| Item No | detailItem.itemNo | item | Wajib |
| Item Name | detailItem.detailName | item | Opsional |
| Item Price | detailItem.unitPrice | item | **Wajib di spec Accurate, TAPI tidak dipaksa dari form kita** — default `0` kalau kosong, § "2 Penyimpangan" di bawah |
| Qty | detailItem.quantity | item | Wajib |
| Item Unit Name | detailItem.itemUnitName | item | **Opsional** (bukan salah satu dari 3 field wajib resmi Accurate) — di-skip kalau kosong, § "2 Penyimpangan" |
| Item Detail Notes | detailItem.detailNotes | item | Opsional |
| Item Req Date | detailItem.requiredDate | item | **Wajib di spec Accurate, TAPI tidak dipaksa dari form kita** — default ke Transaction Date kalau kosong, § "2 Penyimpangan" |
| Item Cash Disc | detailItem.itemCashDiscount | item | Opsional |
| Item Cash Disc Percent | detailItem.itemDiscPercent | item | Opsional — dikirim STRING (support diskon bertingkat "5 + 2"), BUKAN number |
| Department Name | detailItem.departmentName | item | Opsional |
| Project No | detailItem.projectNo | item | Opsional |
| PPN | detailItem.useTax1 | item | Opsional, boolean — isi "Y" untuk true. Pola SUDAH ada di Purchase Invoice/Purchase Order/Sales Order, bukan baru |
| PPnBM | detailItem.useTax2 | item | Sama pola PPN |
| PPH | detailItem.useTax3 | item | Sama pola PPN (PPh23) |
| Item CLS1/2/3 | detailItem.dataClassification1/2/3Name | item | Opsional, Kategori Keuangan — auto-create kalau belum ada (§ `ensureItemRequisitionDataClassifications`, workers/index.ts) |
| Atribut Tambahan 1-10 | detailItem.charField1-10 | item | Opsional — § "Atribut Custom" di bawah |
| Atribut Number 1-10 | detailItem.numericField1-10 | item | Opsional |
| Atribut Tanggal 1-2 | detailItem.dateField1-2 | item | Opsional |

## 3 Penyimpangan dari Label "Wajib"/"Tidak Wajib" Client — Semua Keputusan Eksplisit User
1. **Item Price (unitPrice)** — client label WAJIB, spec Accurate juga
   WAJIB, TAPI **249/249 baris data nyata client KOSONG semua**. User
   diberi pilihan, jawabannya: *"Unit price dibuat ga wajib saja"* — TIDAK
   di-enforce di form/validasi kita, default `0` kalau kosong saat kirim
   ke Accurate (mirror `unitCost` di Inventory Adjustment).
2. **Item Req Date (requiredDate)** — client label TIDAK WAJIB, TAPI
   spec Accurate WAJIB. Data nyata client tetap 249/249 terisi (jarang
   jadi masalah praktis), tapi untuk jaga-jaga: default ke `Transaction
   Date` dokumen kalau kosong, sama filosofi unitPrice — field tanggal
   TIDAK PERNAH dikirim kosong/undefined ke Accurate.
3. **Item Unit Name (itemUnitName)** — client label WAJIB, TAPI TIDAK
   ADA di 3 field wajib resmi Accurate. 100/249 baris data nyata kosong —
   diverifikasi TERKONSENTRASI cuma untuk 2 Item No ("14007"/"13201",
   item non-fisik semacam "Sales Promo Cut"), item barang fisik SELALU
   terisi. Kesimpulan: opsional secara genuine, TIDAK dipaksa wajib di
   form — di-skip (bukan dikirim string kosong) kalau tidak diisi.

## Atribut Custom (Karakter/Angka/Tanggal) — Known Limitation
`charField1-10`/`numericField1-10`/`dateField1-2` **TIDAK ADA di spec
resmi OpenAPI Accurate** untuk endpoint ini (grep menyeluruh terhadap
`docs/referencehtml/accurate-openapi.json`, nihil). Ini SAMA situasi
dengan Inventory Adjustment (field custom serupa dikonfirmasi lewat
**tiket resmi Accurate #357901**, bukan dari spec publik) — TAPI untuk
Item Requisition **belum ada tiket serupa**. Bukti yang ADA: screenshot
Rancangan Formulir Accurate milik client sendiri (menu "Permintaan
Barang" > tab "Atribut Tambahan", Karakter 1-10/Angka 1-10/Tanggal 1-2
genuinely dikonfigurasi di sana, cuma Karakter 2 & 3 yang client
aktifkan saat ini — TIDAK relevan untuk desain, kita tetap sediakan
semua 10/10/2 slot supaya client tidak perlu minta tambah kolom lagi
kalau nanti mengaktifkan slot lain). **Belum diverifikasi test call
nyata** — kalau saat retest client pertama field ini ternyata ditolak
Accurate, jangan curiga ke tempat lain dulu, cek ini duluan.

## Grouping Multi-Baris
Standar ADR-0011 by `number` (Transaction No), WAJIB — client label
Wajib + 249/249 data nyata selalu terisi, konsisten dengan modul lain
yang grouping-nya dipaksa (Item Transfer).

## Kategori Keuangan (Item CLS1-3)
Cuma **3 slot** (BEDA dari modul lain yang sampai 10, mis. Purchase
Invoice) — sesuai kolom Excel client. Auto-create lewat
`ensureItemRequisitionDataClassifications` (workers/index.ts), pola sama
persis Item Transfer.

## Keputusan Desain
1. **TIDAK auto-create item** — mirror Item Transfer/Receive Item.
   `itemNo` dikirim apa adanya, Accurate validasi eksistensi.
2. **Grouping WAJIB by Transaction No** (bukan opsional seperti
   Inventory Adjustment) — beda dari desain lama yang juga wajib, jadi
   TIDAK ada perubahan perilaku di titik ini walau field lain berubah
   total.
3. **Tidak ada "Batal Import"** — konsisten pola Item Transfer/Receive
   Item.
4. **Subscriber existing TIDAK dimigrasikan** — § catatan di atas.

## `import_batches.module`
Tetap `"item_requisition"` — TIDAK berubah, cuma isi mapping/endpoint di
baliknya yang berubah total. Riwayat batch lama tetap ke-tag modul yang
sama, secara historis akan terlihat "salah bentuk" dibanding batch baru
kalau dilihat detail `raw_data`/`column_mapping`-nya — ini WAJAR
(konsekuensi keputusan #4 di atas), bukan bug data.

## OAuth Scope
**BERUBAH TOTAL** — dulu sama persis Item Transfer
(`item_transfer_save`, `data_classification_view`,
`data_classification_save`), SEKARANG jadi (§
`accurate-endpoint-registry.ts`, ADR-0036): `purchase_requisition_save`
(diturunkan otomatis dari `POST purchase-requisition/save.do`),
`data_classification_view`, `data_classification_save` — endpoint scope
`glaccount_view` yang dulu disebut di dokumen versi lama SUDAH DIBUANG
sejak 2026-09-22 (tidak ada kode yang memanggil `glaccount/*.do`,
berlaku sejak sebelum rebuild ini juga). Customer yang subscribe modul
ini akan diminta **"Hubungkan Ulang"** Accurate begitu upload pertama
setelah rebuild ini deploy, kalau koneksi existing mereka belum punya
scope `purchase_requisition_save` (pola standar `ACCURATE_SCOPE_MISSING`,
sudah ada di semua modul).

## Known Limitations
- **Atribut Custom (charField/numericField/dateField) belum
  ter-konfirmasi tiket resmi Accurate untuk endpoint ini** — § di atas.
- **`requisitionType=ALL`/`saveAsStatusType` selain APPROVED/DRAFT belum
  ada data uji nyata** — client cuma pakai 2 dari 3 (Requisition Type)
  dan 2 dari 5 (Save as Status Type) nilai resmi di 249 baris data
  mereka. Validator tetap terima full enum resmi (forward-compatible),
  tapi jalur itu belum divalidasi test call nyata.
- **`Warehouse = "Others"` di SEMUA 249 baris data nyata client** —
  dikonfirmasi user ini memang nama gudang asli terdaftar di Accurate
  mereka, bukan placeholder — dicatat di sini supaya sesi berikutnya
  tidak curiga ini bug parsing.
- **Item No duplikat dalam 1 dokumen (19 dari ~130 Transaction No di
  data client) BUKAN masalah** — dikonfirmasi user, beda kelas dari
  kasus Delivery Order (CLS5 disambiguation) karena modul ini CREATE
  dokumen baru (bukan resolve referensi ke dokumen lain yang sudah ada).

## Referensi
- Spec resmi: `docs/referencehtml/accurate-openapi.json` `/api/purchase-requisition/save.do`
- Panduan client (gitignored): `developmen-15-september-2026.xlsx` sheet
  "Item Requisition" (versi terbaru, mtime berubah beberapa kali dalam
  1 hari — SELALU re-verify mtime sebelum percaya isi lama) +
  `Format_PREQ_v2.xlsx` (sheet "Format_PREQ" + "Penjelasan Kolom")
- Modul sejenis (pola kode charField/numericField/dateField): `architecture-inventory-adjustment.md`
- Modul sejenis (pola kode PPN/PPnBM/PPH useTax1-3): `purchase-invoice.mapping.ts`/`purchase-order.mapping.ts`/`sales-order.mapping.ts`
- Modul TERPISAH, TIDAK berubah: `architecture-item-transfer.md`
- Riset & histori keputusan lengkap: memory sesi `project_item_requisition_vs_item_transfer`
- ADR rujukan: ADR-0011 (grouping default), ADR-0019 (SKU per sub-modul), ADR-0036 (scope diturunkan dari endpoint registry)
