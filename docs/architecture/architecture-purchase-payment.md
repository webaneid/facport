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
`branchName`, `paymentMethod`, `rate` (kurs, kalau mata uang asing).
`detailInvoice[]` juga punya sub-field opsional (`departmentName`,
`detailDiscount[]` untuk diskon per-faktur) — TIDAK relevan untuk MVP,
lihat spec langsung kalau dibutuhkan nanti.

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

## Referensi
- Infra OAuth/sesi Data Usaha/rate-limit/error-handling bersama →
  `docs/architecture/architecture-accurate-integration.md`
- Modul yang di-bayar tagihannya → `docs/architecture/architecture-purchase-invoice.md`
- Akun Hutang per vendor (`vendorPayableAccountListNo`, konsep terkait
  tapi BUKAN field yang dipakai di sini) → `docs/architecture/architecture-vendor-payable-account.md`
- Katalog sub-modul → ADR-0019
