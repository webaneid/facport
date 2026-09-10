# Architecture — Modul Purchase Payment (Pembayaran Pembelian)

> **Status: ✅ DIEKSEKUSI (Fase 33, Done 2026-09-05)** — semua
> endpoint/field di bawah diverifikasi langsung dari
> `docs/referencehtml/accurate-openapi.json`, OpenAPI spec resmi
> Accurate, bukan tebakan, SEBELUM implementasi ditulis. Baca
> `docs/architecture/architecture-accurate-integration.md` dulu untuk
> konteks OAuth/sesi Data Usaha sebelum baca file ini. Detail eksekusi →
> `docs/phases/phase-33-modul-purchase-payment.md`.
>
> Melengkapi rangkaian "Pembelian": Purchase Invoice (bikin tagihan) →
> Vendor/Akun Hutang Pemasok (setting akun hutang per vendor) →
> **Purchase Payment (bayar tagihan yang sudah ada)**.
>
> **§ Fase 50 (2026-09-06) — REVISI:** grouping multi-faktur DITAMBAHKAN
> (mirror pola Sales Receipt Fase 49) setelah audit data kompetitor
> menemukan 43% pembayaran ASLI bayar >1 faktur sekaligus. Detail →
> `docs/phases/phase-50-grouping-purchase-payment-dan-journal-voucher.md`.

## ⚠️ Temuan Riset Paling Penting: BUKAN Mirror Purchase Invoice

Dugaan awal (sebelum riset): modul ini akan "bayangan cermin" Purchase
Invoice, sama seperti Sales Invoice dulu. **SALAH** — dicek langsung ke
schema `purchase-payment/save.do`, modul ini punya SIFAT BERBEDA TOTAL:

| | Purchase Invoice (bikin tagihan) | Purchase Payment (bayar tagihan) |
|---|---|---|
| Apa yang dibuat | Transaksi BARU di Accurate | APLIKASI PEMBAYARAN ke transaksi yang SUDAH ADA |
| Field acuan | `detailItem[].itemNo` (barang) | `detailInvoice[].invoiceNo` (nomor faktur EXISTING) |
| Precondition | Vendor harus ada (auto-create kalau belum) | **Invoice harus SUDAH ADA di Accurate** (Facport TIDAK cek/buat ini) |
| 1 transaksi = | 1 faktur, N barang | 1 pembayaran, **BISA bayar N faktur sekaligus** |

Implikasi: pola "Bill No/PO Number → grup jadi 1 payload" (ADR-0011,
dipakai PI & SI) **TIDAK otomatis relevan** — di sana grouping
menyelesaikan masalah "banyak baris = banyak barang di 1 faktur", di
sini soal beda sama sekali: "banyak baris = bayar banyak faktur
sekaligus". Perlu keputusan desain BARU, bukan reuse pola lama mentah
(§ "Keputusan yang Perlu Dikonfirmasi" di bawah).

## Endpoint Accurate

`/api/purchase-payment/*`, host dinamis dari sesi Data Usaha:

| Endpoint | Method | Scope |
|---|---|---|
| `/bulk-save.do` | POST | `purchase_payment_save` |
| `/save.do` | POST | `purchase_payment_save` |
| `/list.do` | GET | `purchase_payment_view` |
| `/detail.do` | GET | `purchase_payment_view` |
| `/delete.do` | DELETE | (tidak ada scope delete terpisah di spec — cek ulang saat implementasi) |

Scope `purchase_payment_view`/`purchase_payment_save` + `glaccount_view`
SUDAH disiapkan di `apps/api/src/lib/accurate-scopes.ts` sejak Fase 14
(belum pernah dipakai). `glaccount_view` relevan karena `bankNo` (di
bawah) adalah nomor akun COA (Chart of Accounts) bank/kas customer,
BUKAN nama bank harfiah — kemungkinan perlu lookup `glaccount/list.do`
kalau mau validasi/auto-suggest.

## Struktur Field `save.do`

**Wajib (top-level)**: `bankNo`, `chequeAmount`, `detailInvoice`,
`transDate`, `vendorNo`.

| Field | Tipe | Keterangan |
|---|---|---|
| `vendorNo` | String | Nomor identitas vendor — WAJIB SUDAH ADA di Accurate (Facport TIDAK auto-create di sini, beda dari PI yang auto-create kalau belum ada — vendor ini seharusnya SUDAH ada dari transaksi Purchase Invoice sebelumnya) |
| `bankNo` | String | Nomor akun COA bank/kas yang dipakai bayar (bukan nama bank literal) |
| `chequeAmount` | Number | Total nilai pembayaran (maks 999 miliar, 6 desimal) |
| `transDate` | Date | Tanggal transaksi pembayaran |
| `detailInvoice[]` | Array | **WAJIB minimal 1 elemen** — daftar faktur yang dibayar |
| `detailInvoice[].invoiceNo` | String | Nomor faktur Purchase Invoice yang dibayar (WAJIB SUDAH ADA di Accurate) |
| `detailInvoice[].paymentAmount` | Number | Nilai yang dibayarkan untuk faktur itu (bisa partial, tidak harus lunas) |

Field opsional lain: `chequeNo`, `chequeDate`, `description`, `number`
(nomor transaksi Payment, kosongkan untuk auto-number), `currencyCode`,
`branchName`/`branchId`, `paymentMethod`, `rate` (kurs, kalau mata uang
asing), `typeAutoNumber`. `detailInvoice[]` juga punya sub-field
opsional `paidPph`, `pphNumber`, `detailDiscount[]` untuk diskon
per-faktur (⚠️ **KOREKSI 2026-09-10** — paragraf ini sebelumnya salah
sebut `departmentName` sebagai sub-field `detailInvoice[]`; DICEK ULANG
LANGSUNG ke `accurate-openapi.json`: `detailInvoice[]` Purchase Payment
**TIDAK PUNYA** `departmentName` sama sekali — beda dari Sales Receipt.
`departmentName` yang ADA di sini cuma nested LEBIH DALAM lagi, di
dalam `detailDiscount[]`). Semua field ini SEDANG DIRENCANAKAN untuk
diimplementasi — lihat § "Ekspansi Field Opsional — Fase 89 (RENCANA)"
di bawah, status "TIDAK relevan untuk MVP" sudah usang.

## Keputusan yang Perlu Dikonfirmasi Sebelum Eksekusi

### 1. Granularitas Excel: 1 baris = 1 pembayaran (1 faktur), atau grouping N-faktur?
**~~Rekomendasi awal: 1 baris Excel = 1 pembayaran = 1 faktur~~ —
DIREVISI § Fase 50 (2026-09-06).** Audit data ASLI kompetitor
(`docs/referencehtml/FACPORT_purchase_payment.xlsx`, 646 baris)
menemukan 258 transaksi, **110 (43%) bayar >1 faktur sekaligus**
(sampai 30 faktur dalam 1 pembayaran) — bukti kebutuhan nyata yang
disebut versi awal dokumen ini sebagai syarat menambah grouping.

**Desain baru**: field opsional `paymentNumber` (→ Accurate `number`)
jadi kunci grouping — mirror PERSIS pola Sales Receipt (Fase 49,
`receiptNumber`). Baris dengan nilai kolom ini SAMA digabung jadi 1
payload `save.do`, `detailInvoice[]` berisi 1 elemen PER BARIS,
`chequeAmount` (total) = SUM semua `paymentAmount`. Baris TANPA nilai
di kolom ini tetap "1 baris = 1 pembayaran" seperti sebelumnya — zero
regression. Implementasi: `groupPurchasePaymentRows`,
`paymentNumberColumnOf`, `validateGroupVendorConsistencyForPayment`
(`purchase-payment.mapping.ts`), `processPurchasePaymentGroup`
(`workers/index.ts`) — SEDERHANA, TANPA findExisting/append (alasan
sama § Keputusan #2 di bawah: precondition "faktur harus sudah ada"
tidak berubah, dan "Batal Import" tetap tidak didukung modul ini, lihat
Worker Processing).

### 2. Precondition "invoice harus sudah ada" — bagaimana kalau tidak ketemu?
Accurate PASTI menolak (`s:false`) kalau `invoiceNo` tidak ditemukan di
Data Usaha itu. Ini BUKAN kesalahan mapping yang bisa di-auto-fix
(beda dari vendor/item yang bisa auto-create) — **row gagal, error
message ke user harus jelas**: "Faktur {invoiceNo} tidak ditemukan di
Accurate — pastikan faktur ini sudah pernah diimpor/dibuat sebelumnya."
Tidak ada retry otomatis yang masuk akal untuk kasus ini (beda dari PI
yang retry-nya "CREATE vs UPDATE otomatis", di sini kalau invoiceNo
salah ketik, solusinya edit baris & retry manual, sama seperti alur
Edit Baris yang sudah ada).

### 3. Vendor harus sudah ada — auto-create atau tolak?
**Rekomendasi: TOLAK (jangan auto-create)**, beda dari Purchase
Invoice. Alasan: kalau vendor belum ada di Accurate, hampir pasti
berarti fakturnya JUGA belum ada (karena PI mewajibkan vendor ada) —
jadi kegagalan `invoiceNo` (poin 2) akan lebih dulu ketahuan sebagai
akar masalah sebenarnya. Auto-create vendor "kosong" tanpa histori
transaksi apa pun tidak ada gunanya di sini.

## Field Mapping Excel (As-Implemented, § Fase 50)

```ts
// apps/api/src/lib/import-mapping/purchase-payment.mapping.ts
export const purchasePaymentMapping = {
  requiredFields: ["vendorNo", "bankNo", "chequeAmount", "transDate", "invoiceNo"] as const,
  fieldToAccuratePath: {
    vendorNo: "vendorNo",
    bankNo: "bankNo",
    chequeAmount: "chequeAmount",
    transDate: "transDate",
    invoiceNo: "detailInvoice[].invoiceNo",
    paymentNumber: "number", // § Fase 50 — kunci grouping (OPSIONAL)
  },
  defaultColumnMap: {
    // § Fase 50 — label kompetitor jadi alias UTAMA (client familiar)
    "Purchase Payment No": "paymentNumber",
    "No. Bank Account": "bankNo",
    "No. Supplier": "vendorNo",
    "Invoice No": "invoiceNo",
    "Payment": "chequeAmount", // BUKAN "Cheque Amount" — sering kosong di data asli
    "Date": "transDate",
    // label Indonesia lama, tetap didukung
    "No Pemasok": "vendorNo", "Akun Bank/Kas": "bankNo",
    "Jumlah Bayar": "chequeAmount", "Tanggal": "transDate", "No Faktur": "invoiceNo",
  },
};
```

**✅ Keputusan dikonfirmasi user 2026-09-05: dukung KEDUANYA (pelunasan
penuh maupun sebagian)** — `paymentAmount` TIDAK divalidasi Accurate
harus sama dengan sisa tagihan faktur. 1 kolom "Payment"/"Jumlah Bayar"
sudah cukup: isi PENUH → pelunasan; isi LEBIH KECIL → pembayaran
sebagian, Accurate yang hitung sisa saldo. Ini TIDAK berubah oleh Fase
50 — yang berubah cuma UNTUK FAKTUR MANA nominal itu berlaku (per
baris dalam grup, bukan lagi diasumsikan 1 faktur per pembayaran).

## Worker Processing (As-Implemented, § Fase 50)

Diproses PER GRUP (`groupPurchasePaymentRows`, `processPurchasePaymentGroup`
di `workers/index.ts`) — beda dari rencana awal yang cuma pakai
`processImportRow()` generik. TETAP SEDERHANA seperti sebelumnya: TIDAK
ada `findExisting`/append-lintas-batch (Purchase Payment secara alami
idempotent-unfriendly: dua pembayaran ke faktur yang sama dengan
nominal sama adalah 2 transaksi SAH yang beda, bukan duplikat yang
perlu dideteksi) — tiap grup SELALU lewat jalur CREATE. TIDAK ada fitur
"Batal Import" untuk modul ini — TIDAK berubah oleh Fase 50.

## Update 2026-09-10 (Fase 88) — Audit Pra-Ekspansi: 2 Bug Ditemukan & Diperbaiki
Sebelum lanjut ekspansi field (mirror Fase 85/86 Sales Receipt), audit
kode aktual vs dokumentasi ini menemukan:
1. **Dropdown mapping kolom manual TIDAK PUNYA opsi `paymentNumber`**
   ("Purchase Payment No") — backend sudah dukung sejak Fase 50, tapi
   dropdown `import/page.tsx` tidak pernah di-update (bug SAMA PERSIS
   Fase 84 Sales Receipt). Field ini cuma bisa ke-mapping OTOMATIS kalau
   nama kolom Excel PERSIS "Purchase Payment No" — client yang pakai
   nama kolom lain tidak bisa akses grouping sama sekali. **Diperbaiki**:
   opsi ditambahkan ke dropdown.
2. **`transDate` TIDAK PERNAH dinormalisasi** — beda dari Sales
   Receipt/Purchase Invoice yang sudah punya `toAccurateDate()`. Kalau
   Excel client pakai kolom tanggal ASLI (bukan diketik manual sebagai
   teks), nilai yang terbaca adalah angka serial Excel mentah, dikirim
   apa adanya ke Accurate — **pasti ditolak setiap kali** (persis
   insiden `lessons-learned.md` 2026-08-19). **Diperbaiki**: `toAccurateDate()`
   ditambahkan ke `purchase-payment.mapping.ts`, PERSIS pola modul lain.

Juga diperbaiki beberapa komentar basi (route & `accurate-purchase-payment.ts`
masih bilang "TIDAK ada grouping"/"PER-BARIS" padahal Fase 50 sudah
menambahkan grouping/PER-GRUP). Detail lengkap → `docs/phases/phase-88-audit-bug-purchase-payment.md`.

## Ekspansi Field Opsional — Fase 89 (✅ DIEKSEKUSI, 2026-09-10)

> **Status: ✅ DONE** — SEMUA 16 field di bawah SUDAH diimplementasikan
> di `purchasePaymentMapping.fieldToAccuratePath` (`purchase-payment.mapping.ts`).
> Nama field internal final "Cheque Amount" eksplisit: **`paymentTotalAmount`**
> (dikonfirmasi user). Field "Branch": ⚠️ **DIKOREKSI Fase 90 — JADI
> WAJIB** (awalnya diputuskan opsional ikut spec resmi, TAPI test call
> NYATA ke Accurate membuktikan company multi-cabang MENOLAK transaksi
> tanpa branch — lihat § "Fase 90" di bawah).
> Detail eksekusi lengkap → `docs/phases/phase-89-ekspansi-field-purchase-payment.md`,
> koreksi → `docs/phases/phase-90-fix-multicurrency-branch-wajib.md`.

### Sumber & Metodologi Riset
**5 sumber independen** (lebih ketat dari Fase 85 Sales Receipt yang
cuma 3-4) — semua dicek SEBELUM rencana ini ditulis, bukan tebakan:
1. **Wishlist client** — `template-purchase-payment.xlsx` sheet
   "Sheet1" (BUKAN sheet "NOTE" seperti Sales Receipt — client isi
   langsung di sheet template), 23 kolom.
2. **Template kompetitor** `Sample_Format_Import_PP_v4.0.xlsx` — header
   **PERSIS SAMA** (nama & urutan) dengan wishlist client, konfirmasi
   client contoh dari file ini utuh (pola sama Fase 85).
3. **Data TRANSAKSI ASLI kompetitor** (595 baris gabungan Sheet1+Sheet2,
   BUKAN cuma template kosong) — dicek pemakaian NYATA tiap kolom,
   bukan cuma asumsi dari label "Wajib/Tidak Wajib".
4. **Spec resmi Accurate** (`accurate-openapi.json` §
   `/api/purchase-payment/save.do`) — sumber kebenaran nama field &
   enum yang BENERAN ada, dicek LANGSUNG (bukan diasumsikan sama persis
   Sales Receipt walau memang mirip).
5. **5 screenshot UI Accurate ASLI** dikirim client (form "Pembayaran
   Pembelian" sungguhan) — verifikasi final, berhasil klarifikasi
   struktur "Informasi Diskon" (tab terpisah, ada tombol "+" untuk
   banyak entri diskon) dan alur "Dipotong PPh" (checkbox → detail PPh
   muncul, nominal PPh READ-ONLY/auto-computed).

Temuan metodologi (pola SAMA seperti Fase 85): **Penjelasan Kolom
kompetitor untuk `Payment Method` cuma sebut 8 nilai** (tidak sebut
`CREDIT_CARD`/`DEBIT_CARD`/`E_WALLET`) — DICEK ULANG ke spec resmi,
enum SEBENARNYA tetap 11 nilai (IDENTIK Sales Receipt). Kalau cuma
percaya dokumentasi kompetitor, 3 metode bayar ini akan gagal.

### Tabel Keputusan — 23 Kolom Wishlist Client

| Kolom Wishlist | Keputusan | Field API (level) | Catatan |
|---|---|---|---|
| Date | ✅ SUDAH ADA (Fase 33/88) | `transDate` (root) | Normalisasi tanggal sudah diperbaiki Fase 88 |
| Purchase Payment No | ✅ SUDAH ADA (Fase 50) | `number` (root) | Kunci grouping, dropdown sudah diperbaiki Fase 88 |
| No. Bank Account | ✅ SUDAH ADA (Fase 33) | `bankNo` (root) | — |
| No. Supplier | ✅ SUDAH ADA (Fase 33) | `vendorNo` (root) | — |
| Description | 🆕 Rencana Implementasi | `description` (root) | String, opsional |
| Branch | ✅ DIIMPLEMENTASI — **WAJIB** (⚠️ dikoreksi Fase 90) | `branchName` (root) | Spec resmi tandai OPSIONAL di level schema, kompetitor tandai "WAJIB" & screenshot #4 tunjukkan "Cabang*" — awalnya diputuskan ikut spec (opsional), TAPI **test call NYATA ke Accurate** (§ Fase 90) MEMBUKTIKAN validasi RUNTIME Accurate menolak transaksi tanpa branch untuk company multi-cabang ("Profil pengguna anda memiliki akses ke lebih dari satu cabang..."). Dikoreksi jadi WAJIB di SEMUA kasus — kompetitor & screenshot TERNYATA benar, spec schema statis tidak menangkap validasi runtime ini. |
| Currency Code | 🆕 Rencana Implementasi | `currencyCode` (root) | String, opsional |
| Rate | 🆕 Rencana Implementasi | `rate` (root) | Number, opsional — dikonfirmasi screenshot #1 ("Kurs") |
| Cheque Amount | 🆕 Rencana Implementasi (khusus, § desain di bawah) | `chequeAmount` (root) | SAMA persis kasus Sales Receipt — field internal `chequeAmount` SUDAH dipakai historis untuk arti BEDA (per-baris), perlu nama field baru untuk versi eksplisit root |
| Cheque No | 🆕 Rencana Implementasi | `chequeNo` (root) | String, opsional — dikonfirmasi screenshot #4 |
| Cheque Date | 🆕 Rencana Implementasi | `chequeDate` (root) | Date, opsional — dikonfirmasi screenshot #4 |
| Payment Method | 🆕 Rencana Implementasi | `paymentMethod` (root) | ENUM 11 nilai (SAMA PERSIS Sales Receipt), dikonfirmasi spec + screenshot #4 ("Metode Bayar" = "Cek/Giro") |
| Invoice No | ✅ SUDAH ADA (Fase 33) | `detailInvoice[].invoiceNo` | — |
| Payment | ✅ SUDAH ADA (Fase 33) | `detailInvoice[].paymentAmount` | Field internal namanya `chequeAmount` (historis) |
| Paid PPH | 🆕 Rencana Implementasi | `detailInvoice[].paidPph` | Boolean, konvensi "Y"/kosong — dikonfirmasi screenshot #5 ("Dipotong PPh" checkbox) |
| PPh No | 🆕 Rencana Implementasi | `detailInvoice[].pphNumber` | String — dikonfirmasi screenshot #5 ("No. Bukti Potong") |
| **PPh ID** | 🆕 Rencana Implementasi — VALIDASI-ONLY (mirror Fase 86 Tax ID) | — (TIDAK ada path payload, cuma lookup) | Deskripsi kompetitor: *"ID PPh, Lihat detail pada daftar master pajak"* — TANPA referensi aneh "Fitur Facport" (beda dari Sales Receipt kemarin, ini murni Accurate) — REUSE `accurate-tax.ts` (`findTaxByIdentifier`) yang SUDAH ada dari Fase 86, tinggal tambah scope `tax_view` ke modul `purchase_payment` |
| **PPh Amount** | ❌ SKIP (CONFIRMED, mirror Fase 85 Tax Amount) | — | Screenshot #5 tunjukkan nilai ini muncul sebagai hasil KOMPUTASI OTOMATIS ("Jasa Kebersihan: Rp 2.000", read-only) — BUKAN field yang diisi user/API, PERSIS pola "Tax Amount" Sales Receipt |
| Discount | 🆕 Rencana Implementasi | `detailInvoice[].detailDiscount[].amount` | Number — dikonfirmasi screenshot #3 (tab "Informasi Diskon") |
| Discount Acc | 🆕 Rencana Implementasi | `detailInvoice[].detailDiscount[].accountNo` | String — screenshot #3 ("Akun Diskon") |
| Discount Note | 🆕 Rencana Implementasi | `detailInvoice[].detailDiscount[].discountNotes` | String — screenshot #3 ("Keterangan Diskon") |
| Discount - Dept | 🆕 Rencana Implementasi | `detailInvoice[].detailDiscount[].departmentName` | String — screenshot #3 ("Departemen") |
| Discount - Project No | 🆕 Rencana Implementasi | `detailInvoice[].detailDiscount[].projectNo` | String — screenshot #3 ("Proyek") |

**Hasil**: 6 field SUDAH ADA, **16 field BARU direncanakan**, **1 field
di-skip** (PPh Amount) — total 23/23 kolom wishlist client TERAKOMODIR
(sesuai instruksi: tidak ada satu kolom pun yang tertinggal, walau 1
di antaranya secara sadar di-skip dengan alasan jelas, bukan lupa).

**Perbandingan dengan Sales Receipt Fase 85**: Purchase Payment TIDAK
punya padanan "Pass Validate Inv Date"/"Use credit"/"Existing Credit"/
"Return Overpay"/"Department" (level-faktur) — DIKONFIRMASI ke spec
resmi field ini MEMANG TIDAK ADA di `purchase-payment/save.do` sama
sekali (bukan lupa diriset), DAN client wishlist Purchase Payment juga
TIDAK menyebutnya — konsisten, bukan gap.

### Data Nyata Kompetitor (595 baris, konfirmasi prioritas)
| Selalu dipakai (100%) | Sering (90%) | Kadang (4-10%) | Tidak pernah (0%) |
|---|---|---|---|
| Date, Purchase Payment No, No. Bank Account, No. Supplier, Payment Method, Invoice No, Payment | Description | Discount (10%), Discount Acc (4%) | Branch, Currency Code, Rate, Cheque Amount, Cheque No, Cheque Date, Paid PPH, PPh No, PPh ID, PPh Amount, Discount Note, Discount-Dept, Discount-Project No |

Catatan: dari 595 baris, 506 nomor pembayaran unik, **81 grup (16%)
bayar >1 faktur sekaligus** (sampai 4 faktur) — fitur grouping Fase 50
SUDAH benar dan sesuai pola pemakaian nyata, tidak perlu perubahan.

### Keputusan Desain

**1. "Cheque Amount" — root total EKSPLISIT vs auto-SUM (mirror PERSIS
Fase 85 Sales Receipt)**
Desain SEKARANG: root `chequeAmount` dihitung OTOMATIS = SUM semua
`detailInvoice[].paymentAmount` dalam 1 grup. Kolom Excel BARU "Cheque
Amount" (opsional), mapping ke field internal baru **`paymentTotalAmount`**
(hindari bentrok makna dengan `chequeAmount` yang sudah dipakai untuk
`paymentAmount` per baris). Kalau diisi, dipakai APA ADANYA sebagai
root `chequeAmount` (override); kalau kosong, tetap fallback ke
auto-SUM (zero regression).

**2. Konvensi Boolean "Y"/kosong**
`paidPph` pakai konvensi "isikan Y jika ..., kosongkan jika tidak" —
KONSISTEN dengan Sales Receipt (§ Fase 85 poin 2), reuse
`TRUE_TEXT_VALUES`/`toAccurateBoolean` (fungsi baru di file ini, style
sama, TIDAK di-share lintas file per prinsip project).

**3. `paymentMethod` — ENUM 11 nilai, IDENTIK Sales Receipt**
Sama persis 11 nilai (lihat § Sumber & Metodologi di atas) — reuse
`VALID_PAYMENT_METHODS`/`PAYMENT_METHOD_LABEL_MAP` (duplikat isi
identik di file ini, bukan di-share, konsisten pola "3 baris mirip
lebih baik dari abstraksi prematur").

**4. `detailDiscount[]` — nested DI DALAM `detailInvoice[]`, IDENTIK
Sales Receipt**
Confirmed via spec DAN screenshot #3 (tab "Informasi Diskon" per
faktur, dengan tombol "+" untuk banyak entri — TAPI implementasi kita
tetap MAKSIMAL 1 entri per baris Excel, konsisten keputusan Sales
Receipt Fase 85 poin 4, karena 1 baris Excel = 1 elemen `detailInvoice`
= paling banyak 1 set kolom Discount di Excel; kalau client butuh >1
diskon per faktur, itu di luar scope kemampuan format Excel datar,
sama seperti Sales Receipt). Syarat minimal: `discountAmount`+
`discountAccountNo` (mirror pola sama).

**5. Penempatan kolom Excel — IKUTI PERSIS urutan wishlist client**
(instruksi eksplisit user, sama alasan Sales Receipt Fase 85 koreksi):
Date → Purchase Payment No → No. Bank Account → No. Supplier →
Description → Branch → Currency Code → Rate → Cheque Amount → Cheque
No → Cheque Date → Payment Method → Invoice No → Payment → Paid PPH →
PPh No → PPh ID → Discount → Discount Acc → Discount Note → Discount -
Dept → Discount - Project No. (PPh Amount dilewati tanpa celah, sama
pola Sales Receipt.)

**6. Nama kolom Excel — ikuti istilah PERSIS kompetitor/client**
`defaultColumnMap` pakai nama kolom PERSIS seperti wishlist ("Description",
"Branch", "Currency Code", "Rate", "Cheque No", "Cheque Date", "Payment
Method", "Paid PPH", "PPh No", "PPh ID", "Discount", "Discount Acc",
"Discount Note", "Discount - Dept", "Discount - Project No") — SATU-
SATUNYA nama, belum ada sinonim Indonesia lama untuk field yang benar-
benar baru.

**7. Presisi Desimal — 6 digit di belakang koma (konsisten Fase 85,
bukan permintaan baru — fakta teknis spec)**
`chequeAmount`, `paymentAmount` (Excel "Payment"), dan
`detailDiscount[].amount` SEMUA didokumentasikan spec dengan contoh
PERSIS `95275.123456`. `rate` juga Number, diperlakukan sama (izinkan
6 desimal) demi konsistensi. Implikasi implementasi SAMA PERSIS Fase
85 poin 7 (JANGAN `Math.round()`/`parseInt`, WAJIB `Number()`/`parseFloat()`).

**8. PPh ID — validasi-only, REUSE infrastruktur Fase 86 (BUKAN
membangun ulang dari nol)**
`findTaxByIdentifier` (`accurate-tax.ts`) sudah generik (menerima
`AccurateSessionContext` + identifier string, tidak spesifik modul) —
tinggal panggil fungsi baru `validateTaxIdsForPurchasePayment` di
`workers/index.ts` (mirror `validateTaxIdsForReceipt`), dipanggil
SEBELUM `buildPurchasePaymentPayload`, di dalam `processPurchasePaymentGroup`.
**Prasyarat**: scope `tax_view` ditambahkan ke modul `purchase_payment`
di `accurate-scopes.ts` (project masih tahap building, belum ada
customer produksi — aman ditambahkan sekarang, § pelajaran sesi ini
soal `tax_view` Sales Receipt).

### Rencana File yang Akan Diubah
- `apps/api/src/lib/import-mapping/purchase-payment.mapping.ts` — 16
  field baru di `fieldToAccuratePath`/`defaultColumnMap` (urutan
  mengikuti wishlist client), fungsi baru `toAccuratePaymentMethod`,
  `buildDetailDiscountFromRowValues`, `extractTaxIdsFromRows` (mirror
  Sales Receipt), `buildPurchasePaymentPayload` diperluas.
- `apps/api/src/lib/import-mapping/purchase-payment.mapping.test.ts` —
  test baru mirror pola `sales-receipt.mapping.test.ts`.
- `apps/api/src/lib/import-mapping/template-guide.ts` —
  `purchasePaymentTemplateGuide` (VERIFIED nama export-nya) diperluas 16
  baris baru, urutan sesuai wishlist.
- `apps/api/src/workers/index.ts` — `validateTaxIdsForPurchasePayment`
  baru, dipanggil di `processPurchasePaymentGroup`.
- `apps/api/src/lib/accurate-scopes.ts` — tambah `tax_view` ke
  `purchase_payment`.
- `apps/web/app/app/(protected)/purchase-payment/import/page.tsx` — 16
  opsi dropdown baru, urutan sesuai wishlist.
- `apps/web/components/purchase-payment/edit-row-dialog.tsx` — field
  hints & date fields baru (mirror Sales Receipt).
- `docs/phases/phase-89-ekspansi-field-purchase-payment.md` — phase
  doc baru.

### Sudah Diputuskan (Riwayat Singkat)
- ~~Rencana ini BELUM DIEKSEKUSI~~ — user konfirmasi eksplisit
  ("jalankan sesuai SOP... lalu eksekusi") setelah 3 pertanyaan
  dijawab: (1) PPh ID validasi-only OK, (2) Branch ikut spec resmi
  (opsional) — **⚠️ DIKOREKSI Fase 90 jadi WAJIB** setelah test call
  nyata, lihat di bawah, (3) nama field internal terserah asal tidak
  membingungkan.
- ~~Nama field internal final "Cheque Amount" eksplisit~~ — **`paymentTotalAmount`**
  (analog `receiptTotalAmount` Sales Receipt), dipertahankan.

## Fase 90 (✅ DIEKSEKUSI, 2026-09-10) — Koreksi via Test Call Nyata: Branch Wajib & Bug Auto-SUM Multi-Currency

Setelah Fase 89 dieksekusi, user minta test NYATA ke Accurate (bukan
cuma unit test) sebelum push — dan test itu langsung menemukan 2 hal
yang TIDAK MUNGKIN ketahuan dari spec/unit test saja.

### Setup Test
Subscription + koneksi Accurate BARU dibuat khusus untuk test ini
(company "Retail Demo", sama seperti dipakai Fase 86 Sales Receipt) —
koneksi LAMA (dipakai Fase 86 dulu) ternyata sudah mati total (access
TOKEN & refresh token SAMA-SAMA di-revoke Accurate — `invalid_grant`),
kemungkinan karena aktivitas login manual langsung di Accurate oleh
user lain (screenshot sebelumnya menunjukkan user "Reza" aktif). Data
nyata dipakai: vendor "ASMUS" (`VJKT-0003`, mata uang **SGD**), faktur
"CONTOH1" (terhutang 1 SGD), bank "Bank BCA IDR Jakarta" (`111.102-01`).

### Temuan 1 — Branch WAJIB untuk company multi-cabang
Test call PERTAMA (tanpa `branchName`) DITOLAK Accurate:
> *"Profil pengguna anda memiliki akses ke lebih dari satu cabang. Anda
> harus menentukan cabang saat penulisan data."*

Ini MEMBUKTIKAN validasi Accurate untuk `branchName` bersifat **RUNTIME/BUSINESS-LOGIC**,
bukan sekadar schema — spec resmi (OpenAPI) menandainya opsional karena
memang secara TIPE DATA opsional, tapi Accurate MEWAJIBKANNYA secara
kondisional (company dengan >1 cabang & user profile akses banyak
cabang). Kompetitor ("WAJIB") dan screenshot UI ("Cabang*") yang
sebelumnya dianggap "kontradiksi dengan spec" TERNYATA benar dari sudut
pandang lain.

**Keputusan**: `branchName` DIJADIKAN WAJIB (`requiredFields`) di
**KEDUA modul** (Purchase Payment DAN Sales Receipt — pola desain
identik, risiko sama) — bukan cuma kondisional, supaya client company
1-cabang cukup isi 1x, client company multi-cabang tidak pernah kena
error membingungkan ini di tengah proses import besar.

### Temuan 2 — Bug Auto-SUM `chequeAmount` untuk Mata Uang Asing
Setelah Branch ditambahkan, test call KEDUA (masih tanpa `currencyCode`/`rate`)
DITOLAK dengan pesan BEDA:
> *"Total Debit dan Kredit tidak cocok sebesar 12,599.000001, saat
> melakukan jurnal: Hutang Usaha Jakarta - SGD (12,600.000001), Bank
> BCA IDR Jakarta (069-773-3993) (-1)"*

**Akar masalah**: root `chequeAmount` HARUS dalam mata uang BANK
(basis perusahaan, di sini IDR), SEDANGKAN `detailInvoice[].paymentAmount`
(dari kolom Excel "Payment") tetap dalam mata uang FAKTUR ASLI (SGD).
Desain auto-SUM SEBELUMNYA (Fase 50/85) menjumlahkan `paymentAmount`
POLOS tanpa konversi — untuk transaksi mata uang DASAR (IDR, kasus
PALING UMUM) ini kebetulan benar (rate implisit 1), TAPI untuk mata
uang ASING, hasilnya SALAH TOTAL (mengirim "1" padahal seharusnya
"12600.000001").

Test call KETIGA (dengan `currencyCode: "SGD"`, `rate: 12600.000001`,
DAN "Cheque Amount" eksplisit override = `12600.000001`) **BERHASIL**
— payment tersimpan (`111.102-01.2026.09.00001`), invoice CONTOH1
berstatus PAID, semua field baru (Description, Branch, Currency Code,
Rate, Payment Method) tersimpan benar.

**Keputusan**: auto-SUM (fallback saat "Cheque Amount" eksplisit
KOSONG) DIKALIKAN `rate` (default 1 kalau `rate` tidak diisi — ZERO
REGRESSION untuk transaksi mata uang dasar yang jadi mayoritas kasus).
Rumus baru: `autoSummedChequeAmount = SUM(paymentAmount) × (rate ?? 1)`.
Berlaku di **KEDUA modul** (Purchase Payment DAN Sales Receipt).

### Kenapa Ini TIDAK Ketahuan dari Unit Test/Spec Saja
Unit test yang sudah ditulis Fase 85/89 SEMUANYA pakai skenario mata
uang dasar (IDR) — `rate` kalau diisi cuma untuk cek presisi desimal,
BUKAN untuk cek dampaknya ke `chequeAmount`. Spec resmi Accurate JUGA
tidak mendokumentasikan hubungan `paymentAmount`↔`chequeAmount`↔`rate`
secara eksplisit (masing-masing didokumentasikan independen). Hanya
test call SUNGGUHAN ke Accurate (dengan transaksi mata uang asing
nyata) yang bisa menemukan bug ini — **inilah kenapa user secara
eksplisit minta test nyata sebelum push, bukan cuma percaya unit test**.

### File yang Diubah (Fase 90)
- `apps/api/src/lib/import-mapping/sales-receipt.mapping.ts` — auto-SUM
  dikalikan `rate`, `branchName` ditambah ke `requiredFields`.
- `apps/api/src/lib/import-mapping/purchase-payment.mapping.ts` — sama.
- `apps/api/src/lib/import-mapping/sales-receipt.mapping.test.ts`,
  `purchase-payment.mapping.test.ts` — 3 test baru per file (rate
  dikalikan, rate kosong = kali 1, Cheque Amount eksplisit tidak ikut
  dikalikan rate).
- `apps/api/src/routes/sales-receipt-import.route.test.ts`,
  `purchase-payment-import.route.test.ts` — fixture existing diupdate
  (tambah kolom Branch) supaya tidak gagal karena field baru wajib.
- `apps/web/components/sales-receipt/edit-row-dialog.tsx`,
  `purchase-payment/edit-row-dialog.tsx` — `branchName` ditambah ke
  `REQUIRED_INTERNAL_FIELDS`.
- `apps/web/app/app/(protected)/sales-receipt/import/page.tsx`,
  `purchase-payment/import/page.tsx` — label dropdown Branch jadi
  "(wajib)".
- `apps/api/src/lib/import-mapping/template-guide.ts` — `required: true`
  untuk kolom Branch di kedua template guide.
- Detail lengkap → `docs/phases/phase-90-fix-multicurrency-branch-wajib.md`.

## Referensi
- Infra OAuth/sesi Data Usaha/rate-limit/error-handling bersama →
  `docs/architecture/architecture-accurate-integration.md`
- Modul yang di-bayar tagihannya → `docs/architecture/architecture-purchase-invoice.md`
- Akun Hutang per vendor (`vendorPayableAccountListNo`, konsep terkait
  tapi BUKAN field yang dipakai di sini) → `docs/architecture/architecture-vendor-payable-account.md`
- Katalog sub-modul → ADR-0019
