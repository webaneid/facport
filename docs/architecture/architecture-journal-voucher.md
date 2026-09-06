# Architecture — Modul Jurnal Umum (Journal Voucher)

> **Status: ✅ DIEKSEKUSI (Fase 35, Done 2026-09-05)** — semua
> endpoint/field di bawah diverifikasi langsung dari
> `docs/referencehtml/accurate-openapi.json`, OpenAPI spec resmi
> Accurate, bukan tebakan, SEBELUM implementasi ditulis. Baca
> `docs/architecture/architecture-accurate-integration.md` dulu untuk
> konteks OAuth/sesi Data Usaha sebelum baca file ini. Detail eksekusi
> → `docs/phases/phase-35-modul-jurnal-umum.md`.
>
> **✅ Keputusan granularitas Excel DIKONFIRMASI user 2026-09-05: Opsi A
> (format lebar, 1 baris = 1 jurnal lengkap)** — § "Keputusan yang Perlu
> Dikonfirmasi" #1 di bawah SUDAH diputuskan, bukan lagi opsi terbuka.
> Konsekuensi: modul ini JADI SESEDERHANA Purchase Payment/Sales
> Receipt — 1 baris Excel = 1 payload, per-baris (BUKAN per-grup),
> TIDAK butuh infra grouping ala Bill No sama sekali.
>
> **§ Fase 50 (2026-09-06) — REVISI: Opsi B DITAMBAH, Opsi A TETAP
> JALAN.** Audit data ASLI kompetitor (`docs/referencehtml/FACPORT_BUKU_BESAR.xlsx`)
> menemukan mayoritas transaksi (1 sheet sampel, 84%) punya 3-6
> baris/transaksi (N-akun) — PERSIS kondisi yang disebut dokumen ini
> sendiri sebagai syarat "dipertimbangkan lagi" (§ Keputusan #1 di
> bawah). Opsi A **TIDAK DIHAPUS** — modul sudah live sejak Fase 35,
> mengganti total berisiko rusak retry batch lama customer lain yang
> mungkin sudah pakai format lebar (dikonfirmasi user, bukan asumsi).
> Dua format hidup berdampingan, dideteksi otomatis dari kolom yang
> di-mapping (`formatOf()`, § `journal-voucher.mapping.ts`). Detail
> eksekusi → `docs/phases/phase-50-grouping-purchase-payment-dan-journal-voucher.md`.

## ⚠️ Temuan Riset Paling Penting: BEDA TOTAL dari Semua Modul Sebelumnya

Modul ke-5 (terakhir) dari katalog ADR-0019. Berbeda dari 4 modul lain
yang SEMUA berputar di sekitar vendor/customer + faktur, Jurnal Umum
TIDAK PUNYA vendor/customer sama sekali di level wajib — ini transaksi
akuntansi MURNI: sekumpulan baris debit/kredit ke akun COA (Chart of
Accounts), tanpa faktur/tagihan yang direferensikan.

| | Purchase/Sales Invoice | Purchase Payment/Sales Receipt | **Jurnal Umum** |
|---|---|---|---|
| Field acuan | `detailItem[].itemNo` (barang) | `detailInvoice[].invoiceNo` (faktur existing) | `detailJournalVoucher[].accountNo` (akun COA) |
| Vendor/Customer | WAJIB (di header) | WAJIB (di header) | **OPSIONAL, per-BARIS** (`vendorNo`/`customerNo`/`employeeNo` sub-ledger tracking, § "Field yang SENGAJA Dikecualikan") |
| 1 transaksi = | 1 faktur, N barang | 1 pembayaran, 1 faktur (MVP) | 1 jurnal, **N baris debit/kredit — WAJIB seimbang** (total debit = total kredit) |
| Precondition | Vendor harus ada (auto-create) | Vendor+faktur harus ada (tolak) | **Akun COA (`accountNo`) harus ada** — Facport TIDAK cek/buat ini, sama filosofinya dengan "faktur harus ada" di Purchase Payment |

Implikasi: pola "1 baris Excel = 1 transaksi" (Purchase Payment/Sales
Receipt) TIDAK cocok di sini — 1 jurnal butuh MINIMAL 2 baris (1 debit +
1 kredit, supaya seimbang). Butuh keputusan desain granularitas Excel
yang BARU (§ "Keputusan yang Perlu Dikonfirmasi" di bawah) — beda dari
Purchase Payment/Sales Receipt yang keduanya REUSE keputusan yang sama
tanpa perlu tanya ulang.

## Endpoint Accurate

`/api/journal-voucher/*`, host dinamis dari sesi Data Usaha:

| Endpoint | Method | Scope |
|---|---|---|
| `/bulk-save.do` | POST | `journal_voucher_save` |
| `/save.do` | POST | `journal_voucher_save` |
| `/list.do` | GET | `journal_voucher_view` |
| `/detail.do` | GET | `journal_voucher_view` |
| `/delete.do` | DELETE | (tidak ada scope delete terpisah di spec, konsisten pola modul lain) |

Scope `journal_voucher_view`/`journal_voucher_save` + `glaccount_view`
SUDAH disiapkan di `apps/api/src/lib/accurate-scopes.ts` sejak Fase 14
(belum pernah dipakai). Katalog modul admin (`module-options.ts` key
`journal_voucher` grup "Buku Besar", `plans.route.ts`
`t.Literal("journal_voucher")`) JUGA sudah ada sejak ADR-0019 — TIDAK
ada perubahan katalog/scope yang perlu dikerjakan fase ini.

## Struktur Field `save.do`

**Wajib (top-level)**: `detailJournalVoucher`, `transDate`.

| Field | Tipe | Keterangan |
|---|---|---|
| `transDate` | Date | Tanggal transaksi jurnal |
| `detailJournalVoucher[]` | Array | **Selalu tepat 2 elemen** (Opsi A yang dipilih user — 1 baris debit + 1 baris kredit per jurnal, § "Keputusan yang Perlu Dikonfirmasi" #1) |
| `detailJournalVoucher[].accountNo` | String | Nomor akun COA — WAJIB SUDAH ADA di Accurate (Facport TIDAK auto-create, sama filosofi Purchase Payment) |
| `detailJournalVoucher[].amount` | Number | Nilai baris (maks 999 miliar, 6 desimal) |
| `detailJournalVoucher[].amountType` | Enum | `"DEBIT"` atau `"CREDIT"` — WAJIB salah satu |

Field header opsional (diverifikasi ke spec): `branchId`/`branchName`,
`description`, `number` (kosongkan utk auto-number), `typeAutoNumber`.

Field opsional PER-BARIS (diverifikasi ke spec, § "Field yang SENGAJA
Dikecualikan" di bawah untuk alasan tidak dipakai MVP): `customerNo`,
`vendorNo`, `employeeNo` + `subsidiaryType` (enum `CUSTOMER`/`VENDOR`/
`EMPLOYEE` — sub-ledger tracking, dipakai kalau jurnal ini menyentuh
piutang/hutang/karyawan tertentu), `departmentName`, `projectNo`,
`memo`, `primeAmount`+`rate` (mata uang asing), `dataClassification1Name`
s/d `dataClassification10Name` (10 slot kategori keuangan custom).

## ⚠️ Validasi Krusial yang TIDAK Ada di Modul Lain: Balance Check

Jurnal Umum adalah pembukuan double-entry — **total `amount` bertipe
DEBIT WAJIB SAMA PERSIS dengan total `amount` bertipe CREDIT** dalam 1
transaksi (aturan akuntansi dasar, bukan aturan Accurate semata, tapi
Accurate PASTI menolak `s:false` kalau tidak seimbang). Berbeda dari
modul lain yang validasinya semua di sisi Accurate, di sini Facport
SEBAIKNYA validasi balance SENDIRI sebelum kirim ke Accurate — alasan:
1. Baris yang di-grup jadi 1 jurnal (§ keputusan grouping di bawah) API
   Accurate call-nya baru terjadi SETELAH semua baris grup terkumpul —
   kalau salah 1 baris grup error input (misal nominal salah ketik),
   percuma buang 1 API call (rate limit terbatas, §
   architecture-accurate-integration.md § 4) kalau bisa dideteksi lokal
   dulu.
2. Pesan error jadi lebih jelas & actionable ("Jurnal X tidak seimbang:
   total debit Rp 500.000, total kredit Rp 450.000, selisih Rp 50.000")
   dibanding pesan generik dari Accurate.

## Keputusan yang Perlu Dikonfirmasi Sebelum Eksekusi

### 1. Granularitas Excel — ✅ DIPUTUSKAN: Opsi A DAN Opsi B (§ Fase 50)

Karena minimal butuh 2 baris (debit+kredit) per jurnal, ada 2 opsi yang
dipertimbangkan:

- **Opsi A — 1 baris Excel = 1 jurnal LENGKAP** (kolom lebar: Akun
  Debit + Nominal Debit + Akun Kredit + Nominal Kredit dalam 1 baris)
  — **DIPILIH user 2026-09-05, TETAP JALAN**. Paling sederhana secara
  teknis: TIDAK butuh grouping, TIDAK butuh validasi konsistensi grup,
  TIDAK butuh mekanisme cross-batch seperti Fase 08 PI. Trade-off yang
  diterima sadar: HANYA mendukung jurnal 2-akun (1 debit, 1 kredit).
- **Opsi B — format panjang, grouping by "Transaction Number"** —
  **DITAMBAH § Fase 50 (2026-09-06)**, setelah audit data ASLI
  kompetitor (`FACPORT_BUKU_BESAR.xlsx`) menemukan mayoritas transaksi
  (1 sheet sampel, 84%) butuh N-akun (3-6 baris/transaksi) — PERSIS
  kondisi "bukti kebutuhan nyata jurnal N-akun" yang disebut versi
  dokumen SEBELUMNYA sebagai syarat pertimbangan ulang. Label kolom
  ikut istilah kompetitor (client sudah familiar): "Transaction
  Number" (kunci grouping), "JV No" (KODE AKUN per baris — penamaan
  kompetitor agak menyesatkan, "JV No" kedengaran seperti nomor jurnal
  tapi isinya akun COA), "JV Amount", "JV Amount Type" (DEBIT/CREDIT,
  boleh singkatan D/K).

**Konsekuensi teknis**: Opsi A diproses PER-BARIS (TIDAK BERUBAH,
payload `detailJournalVoucher` SELALU array 2 elemen tetap). Opsi B
diproses PER-GRUP (`groupJournalVoucherRows`, mirror pola Sales
Receipt/Purchase Payment Fase 49/50) — `detailJournalVoucher` array
BEBAS panjang (N elemen = N baris dalam grup), validasi balance
digeneralisasi jadi **SUM semua baris DEBIT === SUM semua baris CREDIT
dalam 1 grup** (bukan lagi cuma bandingkan 2 angka). Format yang
dipakai DIDETEKSI OTOMATIS dari kolom yang di-mapping user
(`formatOf()`) — user TIDAK perlu pilih format secara eksplisit di UI,
cukup mapping kolom yang relevan.

### 2. Precondition "akun COA harus sudah ada" — sama seperti faktur di Purchase Payment
Accurate PASTI menolak (`s:false`) kalau `accountNo` tidak ditemukan.
TIDAK ada auto-create COA (beda dari vendor/item yang bisa auto-create
di Purchase Invoice) — error message jelas: "Akun {accountNo} tidak
ditemukan di Accurate — pastikan kode akun ini sudah ada di COA."

### 3. Field yang SENGAJA Dikecualikan dari MVP
`customerNo`/`vendorNo`/`employeeNo`+`subsidiaryType` (sub-ledger
tracking per baris), `dataClassification1Name`..`10Name` (kategori
keuangan custom), `departmentName`, `projectNo`, `primeAmount`/`rate`
(mata uang asing) — SEMUA opsional di spec, tidak krusial untuk jurnal
sederhana (kasus paling umum: pindah buku antar-akun, koreksi,
penyesuaian). Bisa ditambah nanti kalau ada bukti kebutuhan nyata,
konsisten filosofi "jangan over-design di muka" yang sudah dipakai
modul lain.

## Field Mapping Excel (As-Implemented — Opsi A + Opsi B, § Fase 50)

```ts
// apps/api/src/lib/import-mapping/journal-voucher.mapping.ts
export const journalVoucherMapping = {
  requiredFields: ["transDate", "debitAccountNo", "debitAmount", "creditAccountNo", "creditAmount"] as const, // Opsi A
  requiredFieldsTall: ["transDate", "journalNumber", "lineAccountNo", "lineAmount", "lineAmountType"] as const, // Opsi B
  fieldToAccuratePath: {
    transDate: "transDate",
    debitAccountNo: "detailJournalVoucher[0].accountNo", // Opsi A
    debitAmount: "detailJournalVoucher[0].amount",
    creditAccountNo: "detailJournalVoucher[1].accountNo",
    creditAmount: "detailJournalVoucher[1].amount",
    description: "description",
    journalNumber: "number", // Opsi B — kunci grouping
    lineAccountNo: "detailJournalVoucher[].accountNo",
    lineAmount: "detailJournalVoucher[].amount",
    lineAmountType: "detailJournalVoucher[].amountType",
  },
  defaultColumnMap: {
    "Tanggal": "transDate", "Akun Debit": "debitAccountNo", "Nominal Debit": "debitAmount",
    "Akun Kredit": "creditAccountNo", "Nominal Kredit": "creditAmount", "Keterangan": "description", // Opsi A
    "Transaction Number": "journalNumber", "JV No": "lineAccountNo",
    "JV Amount": "lineAmount", "JV Amount Type": "lineAmountType",
    "Trans Date": "transDate", "Trans Description": "description", // Opsi B, label kompetitor
  },
};
```
`formatOf(columnMapping)` mendeteksi format dari field yang di-mapping
user ("tall" menang kalau field Opsi B ada yang termapping). Validasi
double-entry: Opsi A tetap `debitAmount === creditAmount` (2 angka,
TIDAK BERUBAH); Opsi B digeneralisasi jadi SUM semua baris DEBIT ===
SUM semua baris CREDIT dalam 1 grup (`buildJournalVoucherPayloadTall()`).
Kedua validasi MELEMPAR error (bukan return payload) SEBELUM panggil
Accurate.

## Worker Processing (As-Implemented, § Fase 50)

Opsi A TETAP lewat `processImportRow()` generik per-baris (TIDAK
BERUBAH):
```ts
case "journal_voucher":
  return saveJournalVoucher(ctx, buildJournalVoucherPayload(rawRow, columnMapping));
```
Opsi B diproses PER GRUP (`groupJournalVoucherRows` by "Transaction
Number", `processJournalVoucherGroup` di `workers/index.ts`) — dispatch
loop cek `batch.module === "journal_voucher" && formatOf(columnMapping) === "tall"`
SEBELUM jatuh ke jalur generic per-baris (yang tetap menangani Opsi A).
SEDERHANA seperti Sales Receipt/Purchase Payment — TIDAK ada
findExisting/append-lintas-batch (JV memang tidak punya konsep
vendor/customer buat divalidasi konsistensinya). TIDAK ada fitur
"Batal Import" untuk modul ini, KEDUA format (`CANCEL_IMPORT` job tetap
hardcode 2 cabang lama saja) — TIDAK berubah oleh Fase 50.

## Referensi
- Infra OAuth/sesi Data Usaha/rate-limit/error-handling bersama →
  `docs/architecture/architecture-accurate-integration.md`
- Pola grouping yang di-reuse (Bill No) → `docs/architecture/architecture-purchase-invoice.md` § Fase 06, ADR-0011
- Bayangan sebagian (precondition "harus sudah ada", tanpa auto-create) → `docs/architecture/architecture-purchase-payment.md`
- Katalog sub-modul → ADR-0019
