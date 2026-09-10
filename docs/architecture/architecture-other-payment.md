# Architecture — Modul Other Payment (Pembayaran Bank/Kas)

> **Status: ✅ DIEKSEKUSI (Fase 96, 2026-09-10)** — riset field
> diverifikasi dari `docs/referencehtml/accurate-openapi.json` (spec
> resmi Accurate, versi 1.5806.4763) DAN 4 screenshot UI Accurate ASLI
> dari client (`docs/referencehtml/CLIENT_other-payment-v1.2.xlsx`,
> gambar di `docs/referencehtml/op-client-images/`), bukan tebakan.
> Detail eksekusi → `docs/phases/phase-96-modul-other-payment.md`.
>
> **Koreksi saat eksekusi**: kolom "Expense Name" (WAJIB di Accurate,
> `detailAccount[].expenseName`) TERNYATA TIDAK ADA di template client
> — rencana awal keliru asumsikan kolom "Account Name" cukup (padahal
> field itu display-only). Keputusan eksplisit user: tambah kolom BARU
> "Expense Name" ke template Facport (bukan repurpose "Account Name"
> atau biarkan kosong) — lihat § komentar `otherPaymentMapping` di
> `other-payment.mapping.ts`. Auto-create Kategori Keuangan
> (`findOrCreateDataClassification`) diimplementasikan DARI AWAL modul
> ini dibangun (pelajaran dari gap Fase 98 Jurnal Voucher), bukan
> ditambah belakangan.

## Apa Itu "Other Payment" — BEDA dari Purchase Payment
Purchase Payment = pembayaran untuk FAKTUR PEMBELIAN yang sudah ada
(mengurangi utang vendor). **Other Payment = pembayaran BANK/KAS untuk
BEBAN LANGSUNG** (listrik, gaji, sewa, dll) — TIDAK terkait faktur/vendor
apa pun, langsung debit akun beban tertentu dan kredit akun kas/bank.
Konsep akuntansi: "pengeluaran kas non-faktur". Mirror konsepnya:
"Other Deposit" adalah kebalikannya (penerimaan kas non-faktur, TIDAK
termasuk scope fase ini — client baru minta Other Payment).

## Endpoint Accurate
```
POST /accurate/api/other-payment/save.do   → create/edit
POST /accurate/api/other-payment/bulk-save.do
GET  /accurate/api/other-payment/detail.do
GET  /accurate/api/other-payment/list.do
POST /accurate/api/other-payment/delete.do
```
Scope: `other_payment_view`, `other_payment_save` (dikonfirmasi ke
daftar 222 scope resmi Accurate, § `architecture-accurate-integration.md`
§ "Dokumentasi Resmi" — nama scope sudah pernah dikoreksi di riwayat
`accurate-scopes.ts` walau modul-nya sendiri belum pernah dibangun).

## Struktur Field `save.do` (As-Verified dari Spec)
```
{
  "transDate": "10/09/2026",       // WAJIB
  "bankNo": "111.101-01",           // WAJIB — akun kas/bank sumber dana
  "payee": "PLN",                   // WAJIB — informasi penerima
  "number": "OP.2026.09.00001",     // opsional, manual numbering
  "branchName": "JAKARTA",          // opsional di spec — WAJIB di project ini (§ Keputusan di bawah)
  "chequeNo": "...", "chequeDate": "...", // opsional
  "description": "...",             // opsional
  "rate": 15800,                    // opsional, mata uang asing
  "detailAccount": [                 // WAJIB, minimal 1 elemen
    {
      "accountNo": "6-30100",        // WAJIB — akun beban
      "amount": 500000,              // WAJIB
      "expenseName": "Pembayaran listrik", // WAJIB — nama beban ("Paid to" di UI)
      "departmentName": "...",        // opsional
      "memo": "...",                   // opsional
      "dataClassification1Name": "...", // ...sampai 10, opsional
    }
  ]
}
```
**Bukti dari 4 screenshot UI Accurate asli** (`op-client-images/`):
form utama "Kas/Bank"+"No Bukti #"+"Tanggal"+tabel "Payment Detail"
(Akun/Nama Akun/Nilai) cocok PERSIS dengan `bankNo`/`number`/`transDate`/
`detailAccount[]`; dialog "Payment Detail" per baris (tab "Payment
Detail": Akun/"Paid to"/Nilai = `accountNo`/`expenseName`/`amount`; tab
"Additional Info": Departemen/Proyek/Catatan = `departmentName`/
`projectNo`(§ gap)/`memo`); tab "Additional Info" HEADER (No Cek#/
Penerima/**Branch WAJIB tanda merah \***/Catatan = `chequeNo`/`payee`/
`branchName`/`description`).

## ⚠️ 3 Gap Ditemukan — Kolom Template Client Tanpa Padanan Langsung di Spec `other-payment/save.do`
Dicek exhaustif ke SEMUA 5 endpoint other-payment (save/bulk-save/
delete/detail/list) — field berikut **TIDAK ADA** di spec resmi untuk
endpoint ini SPESIFIK:

1. **"Proyek" (`projectNo`)** — ✅ **AKAN DIIMPLEMENTASIKAN** (per
   keputusan user, riset lanjutan). Field ini TIDAK ADA di
   `other-payment/save.do`, TAPI dikonfirmasi ADA di **48 endpoint LAIN**
   Accurate (termasuk `purchase-payment/save.do`, `journal-voucher/save.do`)
   — field ini SUNGGUHAN ada di sistem Accurate, kemungkinan besar cuma
   spec `other-payment` yang tidak lengkap (pola sama seperti temuan di
   bawah). Diimplementasi sebagai `detailAccount[].projectNo`, dengan
   catatan **belum diverifikasi end-to-end untuk endpoint spesifik ini**
   — kalau ternyata Accurate menolak/mengabaikan, sama seperti kasus PPh
   Sales Receipt (§ `lessons-learned.md` 2026-09-10).
2. **"Atribut Tambahan 1-10"/"Atribut Number 1-10"/"Atribut Tanggal 1-2"
   (`charField1-10`/`numericField1-10`/`dateField1-2`, LEVEL ROOT/HEADER)**
   — ✅ **AKAN DIIMPLEMENTASIKAN**. Field ini **0 kemunculan di SELURUH
   `accurate-openapi.json`** untuk endpoint APA PUN — TAPI sudah
   dikonfirmasi RESMI oleh Accurate Support (email, tiket #357901,
   2026-04-24, § `sales-invoice.mapping.ts` Fase 64) untuk Purchase
   Invoice, dengan pola body: field TOP-LEVEL sejajar
   `vendorNo`/`transDate` (BUKAN di dalam array detail). Diasumsikan
   konsisten lintas jenis transaksi Accurate (pola sama argumen
   `dataClassificationNName` yang konsisten di 30+ endpoint) — belum
   diverifikasi end-to-end KHUSUS untuk `other-payment/save.do`.
3. **Tab "Deferral"** — ❌ **TIDAK PERLU diimplementasi sama sekali,
   BUKAN cuma "ditunda"**. Diverifikasi langsung ke file Excel template
   client (`CLIENT_other-payment-v1.2.xlsx`, 19 kolom A-S): **tidak ada
   satu pun kolom bernama "Deferral" atau mengandung kata "defer"** di
   header maupun isi sheet. "Deferral" yang terlihat di screenshot
   (`image2.png`/`image3.png`) adalah TAB ke-3 di dialog "Payment Detail"
   Accurate (di samping tab "Payment Detail" dan "Additional Info") —
   murni elemen UI Accurate yang TIDAK diminta diisi lewat kolom Excel
   apa pun oleh client. Karena tidak ada kolom sumber data untuk field
   ini, tidak ada yang perlu dipetakan — bukan gap yang perlu riset
   lanjutan, kecuali client eksplisit minta kolom baru untuk ini nanti.

## Keputusan Desain

### 1. `branchName` — WAJIB (bukan opsional seperti spec)
Sama pola Fase 90 (Purchase Payment/Sales Receipt) dan Fase 95 (Jurnal
Umum) — dikonfirmasi lewat screenshot UI Accurate asli client (tanda
merah *, image4 di `op-client-images/`). Perusahaan multi-cabang
ditolak Accurate kalau kirim transaksi tanpa branch eksplisit.

### 2. Granularitas Excel — Grouping N-Akun SEJAK AWAL (bukan dual-opsi seperti Jurnal Umum)
Template client (`CLIENT_other-payment-v1.2.xlsx`) punya kolom "Trans No"
TERPISAH dari "Acc No"/"Amount" per baris — pola SAMA PERSIS Jurnal
Umum Opsi B/Sales Receipt: 1 baris Excel = 1 elemen `detailAccount[]`,
baris dengan "Trans No" SAMA digabung jadi 1 payload (`bankNo`/`payee`/
`transDate`/`branchName`/header lain dari baris PERTAMA grup, sama pola
modul lain). **BEDA dari Jurnal Umum**: modul ini BARU (tidak ada
"Opsi A" versi lama yang perlu dijaga kompatibel) — jadi LANGSUNG
grouping-by-default, TIDAK perlu 2 format berdampingan seperti Jurnal
Umum (yang punya beban historis Fase 35 harus dijaga).

### 3. Validasi
Beda dari Jurnal Umum (debit=kredit, double-entry) — Other Payment
BUKAN transaksi double-entry manual (`bankNo` otomatis jadi sisi kredit
via API, `detailAccount[]` semua otomatis jadi debit) — **TIDAK ADA
validasi balance semacam itu di sini**. Validasi yang relevan: setiap
baris WAJIB `accountNo`+`amount`+`expenseName` terisi (field wajib
level API, § `requiredFieldsFor`).

## Field Mapping Excel (As-Implemented, § Fase 96)
> Cuplikan di bawah adalah RENCANA AWAL (sebelum eksekusi) — DIPERTAHANKAN
> untuk konteks, TAPI 2 hal berubah saat eksekusi nyata (lihat catatan
> "Koreksi saat eksekusi" di atas): (1) kolom "Expense Name" BARU
> ditambahkan (tidak ada di rencana awal ini), (2) `defaultColumnMap`
> final PERSIS ikut urutan template client (bukan urutan bebas di
> bawah). Untuk field mapping SEBENARNYA, baca kode langsung di
> `apps/api/src/lib/import-mapping/other-payment.mapping.ts` — TIDAK
> diduplikasi ulang di sini supaya tidak basi lagi kalau kode berubah.
```ts
// apps/api/src/lib/import-mapping/other-payment.mapping.ts (RENCANA AWAL — lihat kode asli untuk versi final)
export const otherPaymentMapping = {
  requiredFields: ["transDate", "transNo", "branchName", "bankNo", "payee", "lineAccountNo", "lineAmount", "lineExpenseName"] as const,
  fieldToAccuratePath: {
    transDate: "transDate",
    transNo: "number", // kunci grouping, § pola journalNumber/receiptNumber
    branchName: "branchName", // WAJIB, § Keputusan #1
    bankNo: "bankNo",
    payee: "payee",
    chequeNo: "chequeNo",
    description: "description",
    rate: "rate",
    lineAccountNo: "detailAccount[].accountNo",
    lineAmount: "detailAccount[].amount",
    lineExpenseName: "detailAccount[].expenseName", // "Paid to" di UI
    lineDepartmentName: "detailAccount[].departmentName",
    lineProjectNo: "detailAccount[].projectNo", // § Gap #1, belum diverifikasi
    lineMemo: "detailAccount[].memo",
    attribut1: "detailAccount[].dataClassification1Name", // ...sampai attribut10
    // § Gap #2 — ROOT level (BUKAN di detailAccount[]), belum diverifikasi:
    attributTambahan1: "charField1", // ...sampai attributTambahan10 -> charField10
    attributNumber1: "numericField1", // ...sampai attributNumber10 -> numericField10
    attributTanggal1: "dateField1",
    attributTanggal2: "dateField2",
  },
  defaultColumnMap: {
    "Trans Date": "transDate", "Trans No": "transNo", "Branch Name": "branchName",
    "Bank No": "bankNo", "Payee": "payee", "Cheque No": "chequeNo",
    "Description": "description", "Rate": "rate",
    "Acc No": "lineAccountNo", "Amount": "lineAmount",
    // § "Account Name" di template client SENGAJA TIDAK di-mapping ke field apa
    // pun — display-only (echo dari accountNo), sama pola "Nama Perkiraan" Jurnal Umum.
    "Memo": "lineMemo", "Department": "lineDepartmentName", "Project No": "lineProjectNo",
    // "Atribut Tambahan 1-10"/"Atribut Number 1-10"/"Atribut Tanggal 1-2"
    // di template client TIDAK literal ("1-10" adalah label ringkas
    // template, bukan 1 kolom) — EXPAND jadi 10/10/2 kolom actual saat
    // implementasi, ikuti pola numerik "Atribut Tambahan 1", "Atribut Tambahan 2", dst.
    "Kategori Keuangan 1": "attribut1", // ...sampai 10
  },
};
```
**"Expense Name" WAJIB diisi user** (bukan auto dari akun) — beda dari
"Nama Akun" yang murni display. Ini konsisten dengan spec: `expenseName`
"Nama beban yang ingin dicatat. Misalnya: Pembayaran listrik" — bebas
teks, BUKAN lookup ke master data.

## Worker Processing (As-Implemented, § Fase 96)
Mirror PERSIS pola Jurnal Voucher Opsi B / Sales Receipt Fase 49:
grouping by "Trans No" (`groupOtherPaymentRows`), 1 grup = 1 payload
`other-payment/save.do` (`processOtherPaymentGroup`, `workers/index.ts`).
TIDAK ada findExisting/append-lintas-batch (sama seperti Jurnal Umum —
tidak ada konsep vendor/customer yang perlu divalidasi konsistensinya).
TIDAK ada "Batal Import" di rilis awal (konsisten pola modul serupa).
Auto-create Kategori Keuangan (`ensureOtherPaymentDataClassifications`,
reuse `findOrCreateDataClassification`) dipanggil SEBELUM
`buildOtherPaymentPayload` — dibangun dari awal, bukan ditambah
belakangan (§ pelajaran Fase 98).

## Scope OAuth Baru
```ts
// apps/api/src/lib/accurate-scopes.ts (AS-IMPLEMENTED)
other_payment: ["other_payment_view", "other_payment_save", "glaccount_view", "data_classification_view", "data_classification_save"],
```

## Footprint Perubahan (Modul Baru — 12 File Existing + File Baru, § Fase 96 SELESAI)
File **existing** yang disentuh (juga `apps/api/src/app.ts` untuk
registrasi route — TIDAK terdaftar di rencana awal, ketahuan saat
eksekusi):
1. `apps/api/src/lib/accurate-scopes.ts` — entry `other_payment`
2. `apps/api/src/lib/import-mapping/template-guide.ts` — `otherPaymentTemplateGuide`
3. `apps/api/src/workers/index.ts` — dispatch case `"other_payment"`
4. `apps/api/src/routes/admin/plans.route.ts` — tambah `t.Literal("other_payment")`
5. `apps/web/lib/module-options.ts` — entry `MODULE_OPTIONS` (grup "Kas & Bank" — BARU, belum ada grup ini, § Keputusan Kecil)
6. `apps/web/lib/module-import-routes.ts` — route path `/other-payment/import`
7. `apps/web/lib/landing-content.ts` — marketing copy landing page
8. `apps/web/components/app-shell/sidebar.tsx` — nav customer
9. `apps/web/components/import-archive/import-batch-table.tsx` — riwayat import
10. `apps/web/app/admin/(protected)/import-batches/[batchId]/page.tsx` — detail view admin

File **BARU**:
- `apps/api/src/lib/import-mapping/other-payment.mapping.ts`
- `apps/api/src/lib/import-mapping/other-payment.mapping.test.ts`
- `apps/api/src/lib/accurate-other-payment.ts` (client `save.do`)
- `apps/api/src/routes/other-payment-import.route.ts` + test
- `apps/web/app/app/(protected)/other-payment/import/page.tsx`
- `apps/web/app/app/(protected)/other-payment/import/[batchId]/page.tsx`
- `apps/web/app/app/(protected)/other-payment/import/riwayat/page.tsx`
- `apps/web/components/other-payment/edit-row-dialog.tsx`

## Referensi
- Template client: `docs/referencehtml/CLIENT_other-payment-v1.2.xlsx`
  (+ 4 screenshot UI Accurate asli, `docs/referencehtml/op-client-images/`)
- Spec resmi: `docs/referencehtml/accurate-openapi.json` (versi 1.5806.4763)
- Precedent grouping N-akun: Fase 49/50 (Sales Receipt/Journal Voucher)
- Precedent `branchName` wajib: Fase 90
- Precedent `charField`/`numericField`/`dateField` header-level: Fase 64
  (`sales-invoice.mapping.ts`, email resmi Accurate Support)
- Precedent gap field tanpa spec (pola investigasi): `lessons-learned.md`
  2026-09-10 "PPh23 di Sales Receipt"
- Rencana eksekusi lengkap: `docs/phases/phase-96-modul-other-payment.md`
