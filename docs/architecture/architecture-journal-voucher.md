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

### 1. Granularitas Excel — ⚠️ SUPERSEDED § Fase 97 (2026-09-10): Opsi A DIPENSIUNKAN

> **Seluruh section ini (sampai "Worker Processing") mendeskripsikan
> desain DUA FORMAT yang SUDAH TIDAK BERLAKU sejak Fase 97.** Dipertahankan
> apa adanya untuk konteks historis (kenapa nama kolom "Nominal
> Debit"/"Nominal Kredit" terasa "dipakai ulang"), BUKAN referensi
> desain aktif — baca § "Fase 97" di bawah untuk desain SEKARANG.

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
~~`customerNo`/`vendorNo`/`employeeNo`+`subsidiaryType` (sub-ledger
tracking per baris), `dataClassification1Name`..`10Name` (kategori
keuangan custom), `departmentName`, `projectNo`, `primeAmount`/`rate`
(mata uang asing)~~ — **DIIMPLEMENTASIKAN Fase 95** (§ di bawah), bukti
kebutuhan nyata ditemukan (client minta isian mendekati kompetitor).

`currencyCode` — **TETAP DIKECUALIKAN, PERMANEN** (bukan "belum
sempat", tapi TIDAK ADA TEMPATNYA sama sekali) — dikonfirmasi Fase 95
via test call nyata ke `journal-voucher/save.do`: field ini TIDAK ADA
di endpoint ini SAMA SEKALI (root maupun per-baris, dicek 2 versi
OpenAPI + semua 5 endpoint journal-voucher). Mata uang adalah properti
TETAP akun COA (`glaccount/save.do` § `currencyCode` wajib saat bikin
akun) — Accurate otomatis tahu mata uang dari `accountNo` yang dipilih,
dibuktikan test call nyata: kirim akun SGD tanpa currency apa pun →
balik error "Kurs tidak valid" (minta `rate`), isi `rate` → sukses,
response `glAccount.currency.code` echo balik "SGD" sesuai akunnya.
"JV Currency Code" di template kompetitor kemungkinan cuma informasi
visual (simbol Rp/$ di UI), bukan field yang benar-benar dikirim.

## Field Mapping Excel (As-Implemented — Opsi A + Opsi B, § Fase 95)

```ts
// apps/api/src/lib/import-mapping/journal-voucher.mapping.ts (ringkas — lihat file asli untuk daftar lengkap)
export const journalVoucherMapping = {
  requiredFields: ["transDate", "debitAccountNo", "debitAmount", "creditAccountNo", "creditAmount"] as const, // Opsi A, TIDAK BERUBAH
  // § Fase 95 — branchName BARU WAJIB, lineDebitAmount+lineCreditAmount
  // GANTI TOTAL dari lineAmount+lineAmountType.
  requiredFieldsTall: ["transDate", "journalNumber", "branchName", "lineAccountNo", "lineDebitAmount", "lineCreditAmount"] as const,
  fieldToAccuratePath: {
    transDate: "transDate",
    debitAccountNo: "detailJournalVoucher[0].accountNo", // Opsi A, TIDAK BERUBAH
    debitAmount: "detailJournalVoucher[0].amount",
    creditAccountNo: "detailJournalVoucher[1].accountNo",
    creditAmount: "detailJournalVoucher[1].amount",
    description: "description",
    journalNumber: "number", // Opsi B — kunci grouping
    lineAccountNo: "detailJournalVoucher[].accountNo",
    // § Fase 95 — GANTI TOTAL "JV Amount"+"JV Amount Type" (nilai+tipe
    // manual) jadi 2 kolom terpisah, tipe DITENTUKAN dari sisi mana
    // yang terisi (§ `debitCreditOf()`), bukan diketik eksplisit lagi.
    lineDebitAmount: "detailJournalVoucher[].amount",
    lineCreditAmount: "detailJournalVoucher[].amount",
    branchName: "branchName", // root/header, WAJIB (screenshot UI client tanda merah *)
    lineRate: "detailJournalVoucher[].rate",
    linePrimeAmount: "detailJournalVoucher[].primeAmount", // opsional, auto-hitung Accurate kalau kosong
    lineDepartmentName: "detailJournalVoucher[].departmentName",
    lineProjectNo: "detailJournalVoucher[].projectNo",
    lineMemo: "detailJournalVoucher[].memo",
    lineSubsidiaryType: "detailJournalVoucher[].subsidiaryType", // CUSTOMER | EMPLOYEE | VENDOR
    lineCustomerNo: "detailJournalVoucher[].customerNo",
    lineEmployeeNo: "detailJournalVoucher[].employeeNo",
    lineVendorNo: "detailJournalVoucher[].vendorNo",
    attribut1: "detailJournalVoucher[].dataClassification1Name", // ...sampai attribut10
  },
  defaultColumnMap: {
    "Tanggal": "transDate", "Akun Debit": "debitAccountNo", "Nominal Debit": "debitAmount",
    "Akun Kredit": "creditAccountNo", "Nominal Kredit": "creditAmount", "Keterangan": "description", // Opsi A
    "Transaction Number": "journalNumber", "Branch": "branchName",
    "JV No": "lineAccountNo", "Akun Perkiraan": "lineAccountNo", // alias, § Fase 95
    "Debit": "lineDebitAmount", "Credit": "lineCreditAmount", // § Fase 95, GANTI "JV Amount"/"JV Amount Type"
    "Kurs": "lineRate", "No Department": "lineDepartmentName", "No Project": "lineProjectNo", "Memo": "lineMemo",
    "Kategori Keuangan 1": "attribut1", "Classification 1": "attribut1", // ...sampai 10, alias kompetitor
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
Accurate. § Fase 95 — validasi BARU per baris: `debitCreditOf()` cek
TEPAT SATU dari `lineDebitAmount`/`lineCreditAmount` terisi (dua-duanya
kosong ATAU dua-duanya terisi = error) — endpoint edit-baris
(single+bulk) TIDAK BISA pakai `requiredFieldsFor("tall")` apa adanya
untuk kedua field ini (beda dari field required lain yang "wajib
berisi", ini "wajib salah satu"), difilter keluar dari loop generik,
dicek terpisah via `debitCreditRowError()` (diekspor dari file mapping
yang sama, dipanggil route).

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

## ⚠️ 3 Bug/Gap Ditemukan & Diperbaiki (Audit 2026-09-10)
Audit menyeluruh (arsitektur vs kode) menemukan 3 masalah, SEMUA sudah
diperbaiki di sesi yang sama:

1. **BUG (High) — `journalNumber` tidak pernah dikirim sebagai
   `number`**: `buildJournalVoucherPayloadTall` membangun
   `detailJournalVoucher`/`transDate`/`description` tapi TIDAK PERNAH
   menulis `payload.number` dari `journalNumber` — padahal komentar
   mapping sendiri (§ di atas) SUDAH bilang field ini harus jadi
   Accurate `number`, dan 2 modul saudara (Purchase Payment
   `paymentNumber`, Sales Receipt `receiptNumber`) sudah benar
   melakukan ini sejak Fase 50. Akibatnya nomor transaksi dari Excel
   dibuang diam-diam, Accurate auto-number sendiri. **Fix**: tambah
   `if (journalNumber !== undefined && journalNumber !== "") payload.number = String(journalNumber);`
   di akhir `buildJournalVoucherPayloadTall`, + 2 test baru
   (`journal-voucher.mapping.test.ts`) yang assert `payload.number`
   terisi untuk Opsi B dan `undefined` untuk grup singleton tanpa
   `journalNumber`.
2. **GAP (High) — Frontend tidak bisa mapping manual ke Opsi B sama
   sekali**: `ACCURATE_FIELDS` di
   `apps/web/app/app/(protected)/journal-voucher/import/page.tsx` cuma
   berisi 6 field Opsi A — 4 field Opsi B (`journalNumber`,
   `lineAccountNo`, `lineAmount`, `lineAmountType`) tidak ada di
   dropdown mapping, padahal backend sudah dukung penuh dan
   mewajibkannya (`requiredFieldsTall`). Kalau auto-suggest server
   gagal (header Excel beda sedikit dari `defaultColumnMap`), user
   Opsi B TIDAK PUNYA cara mapping lewat web app — cuma bisa lewat API
   langsung. **Fix**: tambah 4 field Opsi B ke `ACCURATE_FIELDS`, label
   diberi awalan "Opsi A —"/"Opsi B —" (Combobox tidak dukung
   group/section), plus perjelas teks deskripsi halaman soal 2 format.
3. **GAP (Medium) — Dialog edit per-baris tidak tall-aware**:
   `EditRowDialog` (tombol pensil, edit 1 baris) hardcode
   `REQUIRED_INTERNAL_FIELDS` Opsi A saja — beda dari `EditableGrid`
   (grid bulk-edit di halaman yang sama) yang sejak Fase 51 sudah
   deteksi format dinamis via `isTallFormat()`. Untuk batch Opsi B,
   dialog ini tidak menandai field mana yang wajib (tidak ada asterisk/
   hint) — validasi server tetap benar (jadi tidak rusak fungsional
   total), tapi UX kosong untuk user yang pakai dialog bukan grid.
   **Fix**: pindahkan `isTallFormat()`/`REQUIRED_INTERNAL_FIELDS_TALL`
   (sebelumnya terduplikasi di `[batchId]/page.tsx`) jadi SATU sumber
   di `edit-row-dialog.tsx`, dialog sekarang deteksi format sendiri
   sama seperti grid, plus `FIELD_HINTS` untuk 4 field Opsi B.

**Dikonfirmasi TIDAK ADA gap** (audit sama): field mapping backend vs
dokumentasi (sudah sesuai persis), validasi balance debit=kredit
(desain sesuai dokumentasi — exact float equality tanpa epsilon
diflag Low/perlu klarifikasi, bukan bug terverifikasi), jalur pajak/PPh
(modul ini TIDAK PUNYA field pajak sama sekali di spec resmi
`journal-voucher/save.do` — bug PPh23 Sales Receipt § `lessons-learned.md`
2026-09-10 TIDAK relevan di sini), pola auto-SUM×rate ala bug Fase 90
(JV belum implementasi `primeAmount`/`rate` currency asing sama
sekali — catatan untuk implementer masa depan kalau field itu
ditambahkan nanti).

## Fase 95 (2026-09-10) — Ekspansi Field Opsi B + Redesain Debit/Kredit
Client minta isian import Jurnal Umum Facport mendekati format yang
biasa dipakai kompetitor. Riset 2 sumber independen:
1. Template kompetitor `docs/referencehtml/FACPORT_JV_v3.xlsx` (20
   kolom resmi + sheet "Penjelasan Kolom") dan `FACPORT_JV_v4.1.xlsx`
   (data ekspor riil klien pegadaian, 31 kolom — 11 di antaranya
   spesifik bisnis pegadaian klien itu TANPA padanan API generik apa
   pun, § "Di-skip" di bawah).
2. Template dari client sendiri (`docs/referencehtml/CLIENT_template-jurnal-umum.xlsx`)
   berisi baris "Yang diinginkan" + **3 screenshot UI Accurate ASLI**
   (bukan cuma teks) yang membuktikan konkret: field "Kurs" (dengan
   input Rp DAN $ sekaligus untuk akun asing), "Departemen"/"Proyek"/
   "Memo" (tab "Info Lainnya"), dan "Branch" bertanda **wajib** (merah
   *) di form utama.

Kedua sumber dicocokkan ke spec resmi `journal-voucher/save.do`
(`docs/referencehtml/accurate-openapi.json`, di-update ke versi
1.5806.4763 saat riset — dicek TIDAK ADA perubahan field JV antara
versi lama 1.5756.4692 dan baru, jadi bukan gap versi spec basi).

**Field diimplementasikan** ("yang maksimal" dari kedua sumber, sesuai
instruksi user): `branchName` (root, WAJIB), `lineRate`, `linePrimeAmount`,
`lineDepartmentName`, `lineProjectNo`, `lineMemo`, `lineSubsidiaryType`+
`lineCustomerNo`/`lineEmployeeNo`/`lineVendorNo`, `attribut1`-`attribut10`
(`dataClassification1-10Name`, semua 10 dibuka — kompetitor cuma expose
3, konsisten precedent Sales Invoice Fase 61).

**Breaking change Opsi B (disengaja, instruksi eksplisit user
"Ganti total")**: kolom "JV Amount"+"JV Amount Type" (1 kolom nilai +
1 kolom tipe DEBIT/CREDIT diketik manual) **DIHAPUS TOTAL**, diganti
2 kolom terpisah **"Debit"/"Credit"** — user isi HANYA SATU per baris,
tipe ditentukan otomatis dari kolom mana yang terisi (mirror radio
button Debit/Kredit di screenshot UI Accurate asli, bukan lagi teks
bebas). Diterima sebagai breaking change karena project ini belum
punya customer produksi nyata yang pakai Opsi B (§ modul ini baru live
sejak Fase 35/50, cek data produksi nyata sebelum breaking change
serupa di modul LAIN yang sudah lama dipakai).

**`currencyCode` TETAP TIDAK diimplementasi** — riset mendalam
(diminta user, bukan asumsi sepihak): dicek exhaustif ke SEMUA 5
endpoint journal-voucher (save/bulk-save/delete/detail/list) di 2
versi spec, NOL hasil. Dikonfirmasi via test call NYATA (script debug
sekali-pakai `apps/api/src/scripts/debug-journal-voucher-currency.ts`,
company demo "Retail Demo"): kirim jurnal debit akun IDR + kredit akun
SGD TANPA currency apa pun → Accurate balas "Kurs tidak valid. Cek
nilai kurs!" (otomatis tahu akun itu SGD dari settingnya sendiri,
BUKAN dari input kita) → isi `rate` → sukses, response
`detailJournalVoucher[].glAccount.currency.code` echo balik "IDR"/"SGD"
sesuai akun masing-masing. Kesimpulan: mata uang di Jurnal Umum adalah
properti TETAP akun COA (`glaccount/save.do` § `currencyCode` wajib
saat bikin akun), BUKAN input transaksi — "JV Currency Code" di
template kompetitor kemungkinan cuma simbol tampilan (Rp/$ di UI),
bukan field yang benar-benar dikirim.

Detail lengkap (payload test call, response mentah, tabel keputusan
per kolom) → `docs/phases/phase-95-ekspansi-field-jurnal-umum-opsi-b.md`.

## Fase 97 (2026-09-10) — Opsi A Dipensiunkan Total, Desain Aktif Sekarang
**Semua section di atas soal "Opsi A DAN Opsi B" sudah SUPERSEDED.**
Modul ini SEKARANG SATU FORMAT SAJA.

**Trigger**: client kirim template final `CLIENT_template-jurnal-umum-v2.xlsx`
(26 kolom persis, lihat `docs/referencehtml/`) dan minta "isinya ini
saja" (hapus kolom double). Upload pakai template ini GAGAL dengan
error "lineDebitAmount dan lineCreditAmount wajib" — root cause: kolom
"Nominal Debit"/"Nominal Kredit" di template TABRAKAN NAMA dengan field
Opsi A (`debitAmount`/`creditAmount`) yang masih ada di
`defaultColumnMap` saat itu. Auto-suggestion salah mapping ke field
Opsi A, field Opsi B yang sebenarnya dibutuhkan
(`lineAccountNo`/`lineDebitAmount`/`lineCreditAmount`) tidak termapping
sama sekali → `MISSING_REQUIRED_FIELDS`.

**Keputusan**: user konfirmasi eksplisit (AskUserQuestion: "Ya,
pensiunkan Opsi A") untuk menghapus Opsi A TOTAL (bukan invent nama
kolom baru untuk Opsi B supaya tidak tabrakan) — alasan: client 3
template berturut-turut (v3, v4.1, final) SELALU pakai Opsi B (grouping
N-akun), TIDAK PERNAH pakai format lebar 2-akun sederhana, dan modul
ini belum punya customer produksi nyata sama sekali (§
[[feedback_dev_stage_no_real_customers]]).

**Desain SEKARANG (satu-satunya)**:
- `journalVoucherMapping.requiredFields`: `["transDate", "journalNumber",
  "branchName", "lineAccountNo", "lineDebitAmount", "lineCreditAmount"]`
  — TIDAK ADA LAGI varian "wide"/"tall", TIDAK ADA LAGI `formatOf()`/
  `requiredFieldsFor()`.
- `defaultColumnMap` PERSIS 26 kolom template client, SATU nama kolom
  per konsep (semua alias ganda lama — "Tanggal"+"Trans Date", "JV
  No"+"Akun Perkiraan", dst — DIHAPUS).
- "Nominal Debit"/"Nominal Kredit" (dulu milik Opsi A) SEKARANG jadi
  nama kolom KANONIK untuk `lineDebitAmount`/`lineCreditAmount` — bebas
  dipakai ulang karena Opsi A sudah tidak ada lagi, TANPA tabrakan.
- `buildJournalVoucherPayloadTall` di-rename jadi `buildJournalVoucherPayload`
  (satu-satunya builder, terima array baris, grouping via "Transaction
  Number" — lihat `journal-voucher.mapping.ts` untuk implementasi
  lengkap, TIDAK diulang di sini supaya tidak basi lagi kalau kode
  berubah).
- Worker (`workers/index.ts`) dispatch `journal_voucher` SEKARANG
  UNCONDITIONAL ke `processJournalVoucherGroup` — tidak ada lagi cabang
  `processImportRow()` generik untuk modul ini.
- Validasi XOR debit/kredit per baris (`debitCreditOf()`/
  `debitCreditRowError()`) TIDAK BERUBAH dari Fase 95 — cuma dipanggil
  dari SATU jalur sekarang (tidak ada lagi cabang Opsi A yang harus
  dihindari endpoint edit-baris).
- Bug laten: client-side `validateRequired()` di `edit-row-dialog.tsx`
  (frontend) sebelumnya TIDAK XOR-aware untuk
  `lineDebitAmount`/`lineCreditAmount` — diperbaiki BERSAMAAN refactor
  ini (ditemukan saat rewrite, belum pernah jadi symptom user karena
  campur-aduk Opsi A/B menutupinya).

**Known limitation**: Opsi A dihapus PERMANEN (bukan deprecated/hidden)
— kalau suatu saat dibutuhkan lagi format lebar 2-akun sederhana, harus
dibangun ulang dari nol.

Detail lengkap → `docs/phases/phase-97-pensiun-opsi-a-jurnal-umum.md`.

## Fase 98 (2026-09-10) — Fix Gap: Auto-Create Kategori Keuangan (Data Classification)
**Masalah dilaporkan client**: upload Jurnal Umum gagal dengan error
Accurate "Kategori Keuangan 1 tidak ditemukan atau sudah dihapus".

**Root cause**: field `attribut1`-`attribut10` (`dataClassification1-10Name`,
ditambahkan Fase 95) **BUKAN teks bebas** — sama seperti field identik
di Sales Invoice/Purchase Invoice (§ `architecture-sales-invoice.md`
Fase 68/75), nilainya WAJIB sudah ada sebagai master data "Kategori
Keuangan" di pembukuan Accurate, kalau belum ada DITOLAK. Journal
Voucher ditambahkan Fase 95 dengan MENIRU NAMA field dari Sales Invoice
tapi **TANPA mirror mekanisme auto-create**-nya — gap class yang SAMA
dengan Fase 78 (field/fungsi ditambahkan, pendukungnya lupa diikutkan),
cuma beda modul.

**Fix** (mirror PERSIS Fase 68/75, `findOrCreateDataClassification` di
`accurate-data-classification.ts` TIDAK diubah sama sekali — fungsi itu
generik, sudah battle-tested):
1. `journal-voucher.mapping.ts` — fungsi baru `extractDataClassificationValues`
   (extract `{index, name}` dari SETIAP baris dalam grup, BUKAN cuma
   baris pertama — beda dari `branchName`/`description` yang levelnya
   per-jurnal, Kategori Keuangan levelnya per-baris/akun).
2. `workers/index.ts` — fungsi baru `ensureJournalVoucherDataClassifications`
   (mirror `ensureDataClassifications`/`ensurePurchaseInvoiceDataClassifications`,
   dedupe per `index::name`), dipanggil di `processJournalVoucherGroup`
   SEBELUM `buildJournalVoucherPayload`/`saveJournalVoucher`.
3. `accurate-scopes.ts` — scope `journal_voucher` ditambah
   `data_classification_view`/`data_classification_save`.

**Known limitation/aksi wajib**: koneksi Accurate yang CONNECT SEBELUM
fix ini WAJIB "Hubungkan Ulang" (disconnect+reconnect) supaya scope
baru aktif — sama seperti Fase 68/75, tanpa reconnect panggilan
`findOrCreateDataClassification` akan gagal 403 (scope belum ada di
token lama).

Detail lengkap → `docs/phases/phase-98-fix-autocreate-kategori-keuangan-jurnal-umum.md`.

## Referensi
- Infra OAuth/sesi Data Usaha/rate-limit/error-handling bersama →
  `docs/architecture/architecture-accurate-integration.md`
- Pola grouping yang di-reuse (Bill No) → `docs/architecture/architecture-purchase-invoice.md` § Fase 06, ADR-0011
- Bayangan sebagian (precondition "harus sudah ada", tanpa auto-create) → `docs/architecture/architecture-purchase-payment.md`
- Katalog sub-modul → ADR-0019
