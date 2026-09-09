# Architecture — Modul Purchase Invoice (Faktur Pembelian)

> Dipisah dari `architecture-accurate-integration.md` (2026-09-05, saat
> audit kematangan dokumentasi per-modul — file lama itu isinya
> berantakan: section modul ini SAMPAI DUPLIKAT 2x, dan judul Fase 06
> masih tertulis "DIRENCANAKAN" padahal sudah lama Done). File itu
> SEKARANG isinya cuma infra bersama (OAuth, skema bulk-import generik,
> rate limit, error handling Accurate) — baca dulu untuk konteks OAuth/
> sesi Data Usaha sebelum baca file ini.
>
> Status: **✅ Live** — modul PERTAMA yang dibangun (Fase 02), paling
> matang & paling banyak iterasi (Fase 05, 06, 08, 09). Jadi TEMPLATE
> pola untuk Sales Invoice (§ `architecture-sales-invoice.md`, "bayangan
> cermin PI").

## Endpoint Accurate

Semua di bawah `/api/purchase-invoice/*`, host dinamis dari sesi Data
Usaha (§ `architecture-accurate-integration.md` § "Sesi Data Usaha"):

| Endpoint | Method | Scope |
|---|---|---|
| `/bulk-save.do` | POST | `purchase_invoice_save` |
| `/save.do` | POST | `purchase_invoice_save` |
| `/create-down-payment.do` | POST | `purchase_invoice_save` |
| `/list.do` | GET | `purchase_invoice_view` |
| `/detail.do` | GET | `purchase_invoice_view` |
| `/delete.do` | DELETE | `purchase_invoice_delete` |

`bulk-save.do` dipakai import Excel (max 100 data per request — untuk
file lebih besar, WAJIB dipecah beberapa request oleh worker, bukan
satu request raksasa). Field diprefix `data[n].` per baris (index mulai
0).

**Field wajib (`required: true`)** per baris transaksi:
| Field | Tipe | Keterangan |
|---|---|---|
| `vendorNo` | String | Nomor identitas vendor (header transaksi) |
| `detailItem.itemNo` | String | Kode barang (per baris item) |
| `detailItem.unitPrice` | Money | Harga beli barang (per baris item) |

**Field penting lain** (opsional, tapi kemungkinan perlu di-mapping):
`transDate` (Date), `number` (String, nomor faktur — kosongkan untuk
auto-number), `description` (String), `detailItem.quantity` (Money),
`detailItem.warehouseName`, `detailItem.itemUnitName`,
`taxable`/`inclusiveTax` (Boolean), `currencyCode`, `branchName`,
`paymentTermName`, `detailItem.purchaseOrderNumber` (relevan kalau
Purchase Order dikerjakan — belum ada di Facport). Field lengkap (~90
field termasuk `detailExpense.*`/`detailDownPayment.*`, klasifikasi
keuangan `dataClassification1Name`..`10Name`) ada di
`docs/referencehtml/accurate-openapi.json` — jangan duplikasi semuanya
ke sini.

**Header wajib khusus**: `X-Session-ID` (§ "Sesi Data Usaha").

**Response schema `save.do`**: record hasil faktur ADA di field **`r`**
(BUKAN `d` — `d` cuma pesan status). `r` berisi objek faktur lengkap
(puluhan field turunan: `id`, `number`, `apAccount`, `vendor`,
`detailItem[]` dst) — kode kita cuma ambil `id`+`number` buat
`accurateTransactionId`. **Parse pakai `parseAccurateSaveEnvelope()`**
(`lib/accurate.ts`), BUKAN `parseAccurateEnvelope()` biasa — § alasan
lengkap `docs/lessons-learned.md` (pola envelope Accurate TIDAK
konsisten lintas jenis endpoint).

```ts
// apps/api/src/lib/import-mapping/purchase-invoice.mapping.ts
export const purchaseInvoiceMapping = {
  requiredFields: ["vendorNo", "detailItem.itemNo", "detailItem.unitPrice"] as const,
  defaultColumnMap: {
    "No Pemasok": "vendorNo",
    "Tanggal": "transDate",
    "Kode Barang": "detailItem.itemNo",
    "Harga": "detailItem.unitPrice",
    "Qty": "detailItem.quantity",
  },
};
```

## Soal "Akun Hutang" — BUKAN Field Purchase Invoice

Field "Akun Hutang" (Accounts Payable) BUKAN input yang bisa diisi
manual saat `purchase-invoice/save.do` — tidak ada di schema request
resmi (35 field, 0 terkait akun). Accurate otomatis menentukannya dari
**default AP account yang sudah di-setting di data Pemasok**
(`vendor.apAccountId`/`apAccount`, muncul di `r` hasil save sebagai
OUTPUT, bukan parameter input). Kebutuhan "set Akun Hutang per pemasok"
didukung, tapi lewat endpoint Vendor — § `docs/architecture/architecture-vendor-payable-account.md`.

## Fase 05 — Auto-create Vendor & Item ✅ VERIFIED 2026-08-20

Kalau `vendorNo`/`itemNo` di baris Excel BELUM ada di Accurate,
dibuatkan otomatis dulu (`vendor/save.do`/`item/save.do` CREATE, bukan
cuma error "tidak ditemukan") sebelum Faktur Pembelian dibuat — pakai
field OPSIONAL tambahan (kategori, telepon, WhatsApp, email, alamat,
negara, Akun Hutang untuk vendor baru). Kalau vendor/item SUDAH ada,
field ini diabaikan sama sekali (tidak pernah update data existing).
Detail lengkap (field, fungsi `findOrCreateVendor`/`findOrCreateItem`,
keputusan desain) → `docs/phases/phase-05-purchase-invoice-auto-create.md`.

## Fase 06 — Multi-Item per Faktur ✅ Done

Client feedback pasca-presentasi: 1 faktur pembelian nyata sering
punya banyak barang, tapi Fase 02 sengaja di-scope "1 baris Excel = 1
faktur = TEPAT 1 `detailItem`" (Known Limitation eksplisit). Baris
Excel dikelompokkan berdasarkan kolom **"Bill No"** (`billNumber`) —
baris dengan Bill No sama digabung jadi 1 payload `save.do` dengan
`detailItem[]` banyak elemen, bukan dikirim sebagai faktur terpisah.
Baris dengan Bill No kosong tetap 1 grup isi 1 baris (non-breaking
untuk user existing). Field header (`transDate`, `vendorNo`, dst)
diambil dari baris pertama tiap grup; semua baris dalam grup WAJIB
`vendorNo` sama (validasi sebelum kirim). Hasil
(`accurateTransactionId`/status) di-apply ke semua baris
`import_batch_rows` anggota grup yang sama, tanpa kolom DB baru.
Rasional lengkap (kenapa Bill No, bukan kolom baru/Trans No, dan
trade-off retry per-grup) → `docs/decisions/adr-0011-purchase-invoice-multi-item.md`.
Detail eksekusi → `docs/phases/phase-06-purchase-invoice-multi-item.md`.

## Fase 08 — Update Faktur Existing / Retry Cerdas ✅ VERIFIED 2026-08-28

Batch yang diproses SEBELUM Fase 06 ada bisa punya baris `success` (1
faktur, 1 item) + baris `failed` lain dengan Bill No sama (ditolak
Accurate sebagai duplikat nomor faktur). Retry biasa tidak bisa
memperbaiki ini — mencoba CREATE ulang tetap ditolak dengan alasan
sama. **Dikonfirmasi EMPIRIS** (test call nyata ke faktur `#150`, Data
Usaha "PT Frozen Food"): `purchase-invoice/save.do` MENDUKUNG mode
UPDATE kalau payload menyertakan `id` faktur — bukan cuma create.
`detailItem` yang dikirim REPLACE seluruh array (bukan merge), jadi
item lama WAJIB direferensikan lewat `id`-nya (`{ "id": <id lama> }`,
tanpa field lain) supaya tidak hilang; item baru dikirim tanpa `id`.
Field header lain (`vendorNo`, `transDate`, dst) TIDAK perlu disertakan
di payload update — dipertahankan otomatis oleh Accurate. Ini
mengoreksi klaim ADR-0011 yang bilang `save.do` tidak punya mode
append — SALAH, dikoreksi di `docs/decisions/adr-0012-purchase-invoice-update-existing.md`
(ADR-0011 sendiri tidak diedit, sudah Accepted).

Retry sekarang otomatis pilih CREATE vs UPDATE: cari lintas-batch
apakah Bill No grup itu sudah pernah `success` di subscription yang
sama — kalau ketemu, jalur UPDATE (dengan safety check vendor-match +
duplicate-guard per item, § ADR-0012); kalau tidak, jalur CREATE
seperti biasa (Fase 06, tidak berubah). Tidak ada tombol/endpoint baru
— logic ada di worker. Detail lengkap → ADR-0012 dan
`docs/phases/phase-08-purchase-invoice-update-existing.md`.

> **Refinement Fase 67 (2026-09-08)**: guard "semua item sudah match →
> skip `save.do`, anggap sukses" tadinya berlaku untuk SEMUA match
> lintas-batch, termasuk kalau ternyata batch itu BUKAN retry (upload
> baru yang kebetulan Bill No + item + harga + qty-nya identik dengan
> batch lama) — akibatnya field lain (pajak/atribut tambahan) di baris
> baru itu TIDAK PERNAH terkirim tapi dilaporkan "success". Sekarang
> guard HANYA silent-success kalau match ditemukan di BATCH YANG SAMA;
> match di batch lain tanpa baris baru → ditolak dengan pesan jelas.
> Detail → `docs/decisions/adr-0031-batasi-idempotent-guard-append-invoice-ke-batch-sama.md`.

## Fase 09 — Batal Import / Hapus Faktur ✅ VERIFIED 2026-08-28

"Batal Import" menghapus/melepas transaksi Accurate yang dibuat oleh 1
batch import — BUKAN cuma menyembunyikan record lokal. **Dikonfirmasi
EMPIRIS** (create test invoice → hapus lagi, Data Usaha "PT Frozen
Food"):
- `purchase-invoice/delete.do` (`HTTP DELETE`, scope
  `purchase_invoice_delete`) terima SATU `id` (Long) atau `number`
  (String) per panggilan — BUKAN bulk. Menghapus SELURUH faktur (semua
  `detailItem`), tidak ada mode hapus sebagian. Envelope respons `{s,
  d}` (BUKAN `parseAccurateSaveEnvelope` — tidak ada field `r`, beda
  dari `save.do`). Dikonfirmasi BENAR-BENAR menghapus (bukan
  soft-delete): `detail.do` sesudahnya balas `{s:false, d:["Faktur
  Pembelian tidak tepat"]}`.
- `save.do` respons CREATE (`r`) **mengandung `detailItem[].id`** per
  item (dikonfirmasi test nyata: item baru dapat `id` sendiri, terpisah
  dari `id` faktur) — fondasi tracking per-item yang dipakai fase ini.
- ⚠️ **`save.do` mode update TIDAK BISA menghapus 1 detailItem via omit
  dari array** — DIKONFIRMASI EMPIRIS (buang 1 dari 2 item, tunggu 45
  detik biar bukan isu timing kalkulasi biaya, `save.do` balas `s:true`
  TANPA error, tapi `detail.do` fresh sesudahnya menunjukkan item yang
  di-omit MASIH ADA). `detailItem[]` bersifat **upsert-only** (tambah/
  update via `id`), BUKAN full-replace seperti draf awal ADR-0012/0013
  duga. Koreksi lengkap → ADR-0014.

**Masalah yang diselesaikan**: sejak Fase 08, 1 faktur bisa berisi item
dari BEBERAPA batch (append lintas-batch) — `delete.do` polos bisa
menghapus data batch LAIN yang menumpang di faktur yang sama. **Karena
tidak ada cara aman "menyusutkan" faktur gabungan** (temuan di atas),
solusinya: cek dulu lintas-batch siapa saja pemilik faktur itu — kalau
murni 1 batch → `delete.do` (hapus utuh, SATU-SATUNYA kasus yang aman
di-auto-cancel); kalau gabungan (batch lain juga punya item di faktur
itu) → **DIBLOKIR**, sama seperti baris lama tanpa tracking id-per-item
(`accurateDetailItemId` NULL). Detail lengkap → ADR-0013 (desain awal)
dan ADR-0014 (koreksi "susutkan" → "blokir"), eksekusi →
`docs/phases/phase-09-batal-import.md`.

## Fase 75 — Atribut Tambahan & Kategori Keuangan (mirror Sales Invoice)

**Status: Done (2026-09-09), BELUM diverifikasi end-to-end nyata.** Mirror
LENGKAP dari implementasi Sales Invoice (Fase 55/61/64/68/73/74) — lihat
`docs/architecture/architecture-sales-invoice.md` § "Atribut Tambahan"
untuk narasi lengkap saga penemuan field-nya (Fase 67-73). Tiga
mekanisme yang sama diterapkan di sini:

1. **Kategori Keuangan level ITEM** (`detailItem.dataClassification1-10Name`,
   kolom "Kategori Keuangan 1-10") — auto-create via
   `findOrCreateDataClassification` (fungsi SAMA yang dipakai Sales
   Invoice, reusable lintas modul). **DIKONFIRMASI ADA di spec resmi
   Accurate untuk Purchase Invoice langsung** (`accurate-openapi.json`,
   beda dari 2 poin di bawah).
2. **Atribut Tambahan level FAKTUR** (`charField`/`numericField`/`dateField`
   1-10 slot, ROOT payload, kolom "CUSTOM CHARACTER/NUMBER/DATE") dan
   **level ITEM** (`detailItem.charField1-15`/`numericField1-10`/
   `dateField1-2`, kolom "ITEM: CUSTOM CHARACTER/NUMBER/DATE") — field
   API **DIASUMSIKAN konsisten** dengan Sales Invoice (API Accurate
   konsisten lintas jenis transaksi, terbukti berulang kali untuk
   `dataClassificationNName`), TAPI **BELUM dikonfirmasi resmi oleh
   Accurate Support khusus untuk Purchase Invoice** (baru dikonfirmasi
   untuk Sales Invoice, § Fase 73). Kalau ternyata beda, ini yang paling
   mungkin perlu dikoreksi.
3. **Level EXPENSE** (`detailExpense.accountNo`/`expenseName`/
   `expenseAmount`/`expenseNotes`/`departmentName`/`dataClassification1-10Name`,
   kolom "Akun Beban" dst + "Kategori Keuangan Beban 1-10") — SEMUA
   field (termasuk `dataClassificationNName`) dikonfirmasi ADA di spec
   resmi untuk `detailExpense` Purchase Invoice, DENGAN field TAMBAHAN
   yang TIDAK diimplementasikan di sini (`allocateToItemCost`,
   `chargedVendorName`, `amountCurrency`, `expenseCurrencyCode` — di
   luar scope, bisa ditambah nanti kalau dibutuhkan).

Semua kolom Excel baru (73 kolom) ditaruh **PALING AKHIR** template
(setelah "Kategori Barang"), TIDAK diselipkan di tengah — permintaan
eksplisit user. Scope OAuth `data_classification_view`/
`data_classification_save` ditambah ke modul `purchase_invoice`
(`accurate-scopes.ts`) — koneksi existing WAJIB disconnect & reconnect
untuk dapat scope baru. 1 baris Excel bisa menyumbang 1 baris Barang
DAN/ATAU 1 baris Beban sekaligus (`accountNo`+`expenseAmount` wajib
dua-duanya terisi). Detail lengkap →
`docs/phases/phase-75-atribut-tambahan-purchase-invoice.md`.

## Referensi
- Infra OAuth/sesi Data Usaha/rate-limit/error-handling bersama →
  `docs/architecture/architecture-accurate-integration.md`
- ADR: 0011 (multi-item), 0012 (update existing), 0013+0014 (batal
  import), 0019 (katalog sub-modul)
- Kode: `apps/api/src/routes/purchase-invoice-import.route.ts`,
  `apps/api/src/lib/accurate-purchase-invoice.ts`,
  `apps/api/src/lib/accurate-vendor.ts`,
  `apps/api/src/lib/import-mapping/purchase-invoice.mapping.ts`,
  `apps/api/src/workers/index.ts` (`processPurchaseInvoiceGroup`)
