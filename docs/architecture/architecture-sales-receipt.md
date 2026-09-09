# Architecture — Modul Sales Receipt (Penerimaan Penjualan)

> **Status: ✅ DIEKSEKUSI (Fase 34, Done 2026-09-05)** — semua
> endpoint/field di bawah diverifikasi langsung dari
> `docs/referencehtml/accurate-openapi.json`, OpenAPI spec resmi
> Accurate, bukan tebakan, SEBELUM implementasi ditulis. Baca
> `docs/architecture/architecture-accurate-integration.md` dulu untuk
> konteks OAuth/sesi Data Usaha, dan
> `docs/architecture/architecture-purchase-payment.md` (Fase 33) untuk
> konteks penuh — modul ini adalah BAYANGAN CERMIN PERSIS Purchase
> Payment (customer↔vendor, Faktur Penjualan↔Faktur Pembelian),
> keputusan desain & alasannya TIDAK diulang detail di sini kalau sudah
> dijelaskan lengkap di file itu. Detail eksekusi →
> `docs/phases/phase-34-modul-sales-receipt.md`.
>
> **§ Fase 49 (2026-09-06) — REVISI:** grouping multi-faktur DITAMBAHKAN
> setelah audit data kompetitor (lihat "Grouping Multi-Faktur" di bawah)
> — modul ini SEKARANG DIVERGEN dari Purchase Payment (yang MASIH belum
> punya grouping, ditunda ke fase lain). Detail eksekusi →
> `docs/phases/phase-49-grouping-sales-receipt-dan-invoice.md`.

## Temuan Riset: Mirror PERSIS Purchase Payment (Beda dari Sales Invoice)

Dicek langsung ke schema `sales-receipt/save.do` — struktur field-nya
**IDENTIK 100%** dengan `purchase-payment/save.do` (Fase 33), cuma
`vendorNo` diganti `customerNo`. Ini BUKAN mirror Sales Invoice (yang
notabene sendiri mirror Purchase Invoice) — sama seperti Purchase
Payment BUKAN mirror Purchase Invoice:

| | Sales Invoice (bikin tagihan) | Sales Receipt (terima pembayaran) |
|---|---|---|
| Apa yang dibuat | Transaksi BARU di Accurate | APLIKASI PENERIMAAN ke transaksi yang SUDAH ADA |
| Field acuan | `detailItem[].itemNo` (barang) | `detailInvoice[].invoiceNo` (nomor Faktur Penjualan EXISTING) |
| Precondition | Customer harus ada (auto-create kalau belum) | **Faktur Penjualan harus SUDAH ADA di Accurate** (Facport TIDAK cek/buat ini) |
| 1 transaksi = | 1 faktur, N barang | 1 penerimaan, **BISA bayar N faktur sekaligus** (§ Fase 49, DIDUKUNG — awalnya di luar scope MVP, lihat revisi di bawah) |

Konsekuensi: modul ini REUSE seluruh keputusan desain Purchase Payment
(Fase 33) apa adanya, cuma tukar peran vendor→customer dan Purchase
Invoice→Sales Invoice. Tidak ada keputusan baru yang perlu dikonfirmasi
ulang — kecuali dinyatakan eksplisit di bawah.

## Endpoint Accurate

`/api/sales-receipt/*`, host dinamis dari sesi Data Usaha (sama seperti
semua modul lain):

| Endpoint | Method | Scope |
|---|---|---|
| `/bulk-save.do` | POST | `sales_receipt_save` |
| `/save.do` | POST | `sales_receipt_save` |
| `/list.do` | GET | `sales_receipt_view` |
| `/detail.do` | GET | `sales_receipt_view` |
| `/delete.do` | DELETE | (tidak ada scope delete terpisah di spec — konsisten dengan Purchase Payment, tidak relevan MVP ini karena tidak ada fitur "Batal Import", § di bawah) |

Scope `sales_receipt_view`/`sales_receipt_save` SUDAH disiapkan di
`apps/api/src/lib/accurate-scopes.ts` sejak Fase 14 (belum pernah
dipakai) — **TIDAK butuh `glaccount_view` tambahan** seperti Purchase
Payment (itu ditambah untuk validasi/auto-suggest `bankNo`, fitur yang
juga TIDAK dibangun di Fase 33 — konsisten, tidak ditambah di sini
juga).

## Struktur Field `save.do`

**Wajib (top-level)**: `bankNo`, `chequeAmount`, `customerNo`,
`detailInvoice`, `transDate` — PERSIS Purchase Payment, cuma `vendorNo`
→ `customerNo`.

| Field | Tipe | Keterangan |
|---|---|---|
| `customerNo` | String | Nomor identitas customer — WAJIB SUDAH ADA di Accurate (Facport TIDAK auto-create, sama seperti Purchase Payment — customer ini seharusnya SUDAH ada dari transaksi Sales Invoice sebelumnya) |
| `bankNo` | String | Nomor akun COA bank/kas yang dipakai terima pembayaran (bukan nama bank literal) |
| `chequeAmount` | Number | Total nilai penerimaan (maks 999 miliar, 6 desimal) |
| `transDate` | Date | Tanggal transaksi penerimaan |
| `detailInvoice[]` | Array | **WAJIB minimal 1 elemen** — daftar Faktur Penjualan yang dibayar |
| `detailInvoice[].invoiceNo` | String | Nomor Faktur Penjualan yang dibayar (WAJIB SUDAH ADA di Accurate) |
| `detailInvoice[].paymentAmount` | Number | Nilai yang diterima untuk faktur itu (bisa partial, tidak harus lunas) |

Field opsional lain (diverifikasi ke spec, sama persis Purchase
Payment): `chequeNo`, `chequeDate`, `description`, `number`, `currencyCode`,
`branchName`/`branchId`, `paymentMethod`, `rate`, `useCredit`,
`passValidateInvoiceDate`, `typeAutoNumber`. `detailInvoice[]` juga
punya sub-field opsional (`departmentName`, `paidPph`, `pphNumber`,
`detailDiscount[]`) — TIDAK relevan untuk MVP, sama seperti Purchase
Payment.

## Keputusan Desain (Reuse Purchase Payment, Fase 33)

Semua 3 keputusan yang dulu perlu dikonfirmasi user untuk Purchase
Payment SUDAH berlaku sama untuk modul ini (bukan keputusan baru):

1. **~~Granularitas Excel: 1 baris = 1 penerimaan = 1 faktur~~ — DIREVISI
   § Fase 49**, lihat "Grouping Multi-Faktur" di bawah.
2. **Precondition "faktur harus sudah ada"** — Accurate PASTI menolak
   (`s:false`) kalau `invoiceNo` tidak ditemukan. Error message jelas
   ke user, tidak ada auto-fix, sama seperti Purchase Payment.
3. **Customer harus sudah ada — TOLAK (jangan auto-create)** — sama
   alasannya: kalau customer belum ada, fakturnya juga belum ada (SI
   mewajibkan customer ada), jadi kegagalan `invoiceNo` akan lebih dulu
   ketahuan sebagai akar masalah.
4. **Pelunasan penuh MAUPUN sebagian, keduanya didukung via 1 kolom
   "Jumlah Bayar"** — `paymentAmount` tidak divalidasi Accurate
   terhadap sisa piutang faktur (pola sama seperti `chequeAmount`
   Purchase Payment), jadi TIDAK perlu 2 kolom Excel terpisah.

## Grouping Multi-Faktur (§ Fase 49, Revisi)

Audit terhadap file Excel ASLI kompetitor
(`docs/referencehtml/FACPORT_Sales Receipt_v5.xlsx`, 556 baris)
menemukan **SEMUA 137 struk penerimaan (100%) itu multi-faktur** — BUKAN
edge case, itu POLA UTAMA (contoh nyata: 1 struk `No. Sales Receipt`
sama bayar 2 faktur berbeda sekaligus, Rp 18,8jt + Rp 1jt). Keputusan
awal "1 baris = 1 penerimaan" gagal total untuk pola data ini.

**Desain baru**: field opsional BARU `receiptNumber` (→ Accurate
`number`, field opsional yang sudah ada di `sales-receipt/save.do`
sejak awal, cuma belum pernah dipakai) jadi kunci grouping — baris
dengan nilai kolom ini SAMA digabung jadi 1 payload `save.do`, dengan
`detailInvoice[]` berisi 1 elemen PER BARIS (masing-masing
`invoiceNo`+`paymentAmount` sendiri) dan `chequeAmount` (total) = SUM
semua `paymentAmount` dalam grup. Baris TANPA nilai di kolom ini
(kolom tidak di-mapping, atau kosong) tetap "1 baris = 1 penerimaan"
seperti sebelumnya — **zero regression** untuk mapping yang sudah ada.

Implementasi: `groupSalesReceiptRows`, `receiptNumberColumnOf`,
`validateGroupCustomerConsistencyForReceipt` (`sales-receipt.mapping.ts`),
`processSalesReceiptGroup` (`workers/index.ts`) — **SENGAJA LEBIH
SEDERHANA** dari pola Sales Invoice/Purchase Invoice: TIDAK ada
`findExisting`/append-ke-penerimaan-lama-lintas-batch, karena "Batal
Import"/retry-cerdas TETAP tidak didukung modul ini (alasan di bawah
masih berlaku) — tiap grup SELALU lewat jalur CREATE.

## Field Mapping Excel (As-Implemented, § Fase 49)

```ts
// apps/api/src/lib/import-mapping/sales-receipt.mapping.ts
export const salesReceiptMapping = {
  requiredFields: ["customerNo", "bankNo", "chequeAmount", "transDate", "invoiceNo"] as const,
  fieldToAccuratePath: {
    customerNo: "customerNo",
    bankNo: "bankNo",
    chequeAmount: "chequeAmount",
    transDate: "transDate",
    invoiceNo: "detailInvoice[].invoiceNo",
    receiptNumber: "number", // § Fase 49 — kunci grouping (OPSIONAL)
  },
  defaultColumnMap: {
    "No Pelanggan": "customerNo",
    "Nomor Customer": "customerNo",
    "Customer No": "customerNo",
    "Akun Bank/Kas": "bankNo",
    "Kode Akun Bank": "bankNo",
    "Jumlah Bayar": "chequeAmount",  // → detailInvoice[i].paymentAmount PER BARIS, chequeAmount TOTAL = SUM
    "Tanggal": "transDate",
    "No Faktur": "invoiceNo",       // → detailInvoice[i].invoiceNo (Faktur PENJUALAN)
    "Nomor Faktur": "invoiceNo",
    "No. Sales Receipt": "receiptNumber", // § Fase 49 — PERSIS nama kolom template kompetitor
    "Nomor Penerimaan": "receiptNumber",
    "No Penerimaan": "receiptNumber",
  },
};
```
Header kolom Excel dipilih konsisten dengan `sales-invoice.mapping.ts`
("Customer No" sudah dipakai di sana) supaya user yang sudah familiar
dengan template Sales Invoice tidak bingung dengan istilah baru.

## Worker Processing (As-Implemented, § Fase 49)

Diproses PER GRUP (§ "Grouping Multi-Faktur" di atas), BUKAN per-baris
generic lagi — beda dari rencana awal Fase 34 (yang cuma pakai
`processImportRow()` polos seperti `purchase_payment`). Lihat
`processSalesReceiptGroup` di `workers/index.ts` — SEDERHANA (tanpa
`findExisting`/append-lintas-batch, beda dari Sales Invoice/Purchase
Invoice) karena TIDAK ada endpoint "Batal Import" (`CANCEL_IMPORT` job
tetap hardcode 2 cabang `purchase_invoice`/`sales_invoice` saja) —
alasan sama seperti Purchase Payment: 2 penerimaan dengan nominal sama
ke faktur yang sama adalah 2 transaksi SAH berbeda, bukan duplikat yang
perlu dideteksi/dibatalkan otomatis. Keputusan ini TIDAK berubah oleh
Fase 49 — cuma grouping DALAM 1 batch yang ditambah.

> **Update 2026-09-10 (Fase 84)** — Audit menemukan dropdown mapping
> kolom manual (`import/page.tsx`) TIDAK PERNAH dapat opsi
> `receiptNumber` ("No. Sales Receipt") sejak field ini ditambahkan
> Fase 49 — field itu cuma bisa ke-mapping OTOMATIS kalau nama kolom
> Excel persis cocok salah satu dari 3 nama di `defaultColumnMap`,
> TIDAK BISA di-mapping manual kalau client pakai nama kolom lain
> (fitur grouping jadi unreachable). Backend TIDAK bermasalah (`VALID_FIELDS`
> di route sudah otomatis include field ini sejak awal) — murni gap UI
> yang tidak pernah ke-backfill. Fix: opsi ditambahkan ke dropdown.
> Detail → `docs/phases/phase-84-fix-dropdown-receipt-number-sales-receipt.md`.

## Ekspansi Field Opsional — Fase 85 (✅ DIEKSEKUSI, 2026-09-10)

> **Status: ✅ DONE** — SEMUA 18 field di bawah SUDAH diimplementasikan
> di `salesReceiptMapping.fieldToAccuratePath` (`sales-receipt.mapping.ts`).
> Nama field internal final untuk "Cheque Amount" eksplisit:
> **`receiptTotalAmount`**. Detail eksekusi lengkap →
> `docs/phases/phase-85-ekspansi-field-sales-receipt.md`.

### Sumber & Metodologi Riset
Client kirim file Excel referensi mereka sendiri (template hasil
download dari Facport + 1 sheet tambahan **"NOTE"** berisi wishlist 28
kolom). Dicek silang dengan **3 sumber independen**:
1. **Spec resmi Accurate** (`accurate-openapi.json` §
   `/api/sales-receipt/save.do`) — sumber kebenaran field API yang
   BENERAN ada.
2. **Template kompetitor** (`FACPORT_Sales Receipt_v5.xlsx`, dipakai
   nyata di lapangan) — sheet "Import CR" (557 baris) + sheet
   "Penjelasan Kolom" (deskripsi Indonesia tiap kolom). Header sheet
   "Import CR" ini **SAMA PERSIS** (nama & urutan) dengan sheet NOTE
   client — client jelas mencontoh template kompetitor ini utuh, bukan
   nulis wishlist dari nol.
3. **7 screenshot UI Accurate ASLI** dikirim client (form "Penerimaan
   Penjualan" sungguhan, bukan dokumentasi/tebakan) — dipakai untuk
   verifikasi FINAL sebelum eksekusi, dan berhasil KETEMU 1 koreksi
   penting: enum `paymentMethod` yang direncanakan dari sumber #2
   TERNYATA kurang 3 nilai (`CREDIT_CARD`/`DEBIT_CARD`/`E_WALLET`) —
   dikoreksi balik ke sumber #1 (spec resmi) yang memang lengkap 11
   nilai, dikonfirmasi cocok persis dengan dropdown di screenshot.
   Screenshot ini juga MENGKONFIRMASI PASTI (bukan cuma "tidak
   ketemu") kenapa 4 field lain di-skip — lihat kolom "Catatan" di
   tabel bawah.

Metodologi 3-sumber ini (spec resmi + template kompetitor + screenshot
UI asli) lebih ketat dari fase-fase sebelumnya (Fase 49/61/64/73 cuma
2 sumber) — TIDAK menebak field dari 1 sumber saja, dan TERBUKTI
berguna: kalau cuma pakai sumber #2 saja, enum `paymentMethod` yang
dikirim ke Accurate akan SALAH/tidak lengkap.

### Tabel Keputusan — 28 Kolom NOTE Client

| Kolom NOTE Client | Keputusan | Field API (level) | Catatan |
|---|---|---|---|
| Date, No. Sales Receipt, Customer No., No. Bank Account, Invoice No, Payment | ✅ Sudah ada | `transDate`, `number`, `customerNo`, `bankNo`, `detailInvoice[].invoiceNo`, `detailInvoice[].paymentAmount` | Tidak berubah |
| Description | 🆕 Implementasi | `description` (root) | String bebas |
| Branch | 🆕 Implementasi | `branchName` (root) | String, nama cabang |
| Currency Code | 🆕 Implementasi | `currencyCode` (root) | String, kode mata uang |
| kurs | 🆕 Implementasi | `rate` (root) | Number, nilai tukar |
| **Cheque Amount** | 🆕 Implementasi (khusus, lihat § desain di bawah) | `chequeAmount` (root) | Field ini SUDAH ADA sebagai internal `chequeAmount`, TAPI SAAT INI dipakai untuk arti BEDA (per-baris, auto-SUM ke root) — DIPERLUKAN penyesuaian desain, bukan sekadar tambah kolom baru |
| Cheque No | 🆕 Implementasi | `chequeNo` (root) | String, opsional (spec resmi TIDAK tandai wajib — kompetitor tandai "Wajib" tapi data sample mereka sendiri KOSONG untuk transaksi non-cek, kontradiksi internal template mereka, jadi diikuti SPEC RESMI) |
| Cheque Date | 🆕 Implementasi | `chequeDate` (root) | Date, opsional (sama alasan Cheque No) |
| Payment Method | 🆕 Implementasi | `paymentMethod` (root) | String ENUM TETAP (lihat § di bawah), opsional |
| Pass Validate Inv Date | 🆕 Implementasi | `passValidateInvoiceDate` (root) | Boolean, konvensi "Y"/kosong (lihat § di bawah) |
| Use credit | 🆕 Implementasi | `useCredit` (root) | Boolean, konvensi "Y"/kosong |
| Department | 🆕 Implementasi | `detailInvoice[].departmentName` | String, per baris/faktur |
| Paid PPH | 🆕 Implementasi | `detailInvoice[].paidPph` | Boolean, konvensi "Y"/kosong |
| PPh No | 🆕 Implementasi | `detailInvoice[].pphNumber` | String, nomor bukti potong PPh23 |
| Discount | 🆕 Implementasi | `detailInvoice[].detailDiscount[].amount` | Number — level BARU, nested di dalam `detailInvoice[]` |
| Discount Acc | 🆕 Implementasi | `detailInvoice[].detailDiscount[].accountNo` | String |
| Discount Note | 🆕 Implementasi | `detailInvoice[].detailDiscount[].discountNotes` | String |
| Diskon - Dept | 🆕 Implementasi | `detailInvoice[].detailDiscount[].departmentName` | String |
| Diskon - Project No | 🆕 Implementasi | `detailInvoice[].detailDiscount[].projectNo` | String |
| **Existing Credit** | ❌ SKIP (CONFIRMED, § screenshot UI) | — | Terkonfirmasi lewat screenshot UI Accurate ASLI dari client: ini **"Sisa Kredit"** — nilai TAMPILAN read-only (saldo kredit customer, dihitung Accurate dari data akun customer), BUKAN field input. Memang tidak ada yang perlu di-set, bukan cuma "tidak ketemu". |
| **Return Overpay** | ❌ SKIP (CONFIRMED nyata tapi tidak ada di API) | — | Screenshot UI client TUNJUKKAN field ini NYATA ADA — checkbox **"Retur Kredit"**, BISA DI-TOGGLE user (BUKAN read-only/tampilan agregat — beda dari "Existing Credit"). TAPI dicek EXHAUSTIF ke SEMUA 17 property root `sales-receipt/save.do`, TIDAK ADA kandidat nama field sama sekali (beda dari kasus charField/projectNo dulu yang punya pola field lain untuk dijadikan hipotesis kuat) — fitur UI-only Accurate yang tidak diekspos ke API publik (dikonfirmasi juga via second opinion 2026-09-10). |
| **Tax Amount** | ❌ SKIP (CONFIRMED, 4 sumber) | — | Screenshot UI client TUNJUKKAN nilai ini muncul sebagai **hasil KOMPUTASI OTOMATIS** ("Jasa Kebersihan: Rp 40.000", dihitung Accurate dari `paidPph`+kategori jasa di faktur asli) — BUKAN field yang diisi user/API. DIPERKUAT (2026-09-10) oleh dokumentasi resmi `/api/tax/*` (`docs/referencehtml/pph-api.html`, dikirim client): enum `pph23Type` di situ PUNYA nilai `JASA_LAIN_KEBERSIHAN` — cocok PERSIS dengan label di screenshot, membuktikan nilai ini berasal dari klasifikasi Master Data Pajak yang sudah di-set di faktur asli, bukan input Sales Receipt. |
| **Tax ID** | ✅ DIIMPLEMENTASI — VALIDASI-ONLY (Fase 86, § di bawah) | — (TIDAK ada path payload, cuma lookup) | ID record di endpoint TERPISAH `/api/tax/list.do` (master data Pajak), BUKAN atribut transaksi `sales-receipt/save.do` — TAPI keputusan awal "skip" DIREVISI: dicocokkan (bukan dikirim) ke Master Data Pajak Accurate SEBELUM import, gagal kalau tidak ditemukan. Lihat § "Fase 86 — Validasi Tax ID". |

**18 field baru dikonfirmasi** (spec resmi + template kompetitor + screenshot UI Accurate asli dari client — 3 sumber independen),
**4 field TETAP di-skip** — TAPI sekarang dengan alasan PASTI/terkonfirmasi
(bukan lagi "tidak ketemu dokumentasinya"), lihat kolom Catatan di atas.

### Keputusan Desain

**1. "Cheque Amount" — root total EKSPLISIT vs auto-SUM (✅ FINAL)**
Desain SEBELUMNYA (`buildSalesReceiptPayload`, Fase 49): root
`chequeAmount` dihitung OTOMATIS = SUM semua `detailInvoice[].paymentAmount`
dalam 1 grup — user TIDAK pernah isi ini langsung. Tapi kompetitor
treat "Cheque Amount" sebagai kolom **INPUT MANUAL WAJIB** ("Nilai
Konfirmasi Pembayaran") — SEPARATE dari total per-invoice.

**Keputusan final**: kolom Excel BARU "Cheque Amount" (opsional),
mapping ke field internal baru **`receiptTotalAmount`** (bukan reuse
nama `chequeAmount` yang sudah dipakai untuk `paymentAmount` per baris —
hindari bentrok makna). Kalau kolom ini diisi user, dipakai APA ADANYA
sebagai root `chequeAmount` (override); kalau kosong, TETAP fallback ke
auto-SUM (perilaku Fase 49, zero regression) — diimplementasikan PERSIS
begini di `buildSalesReceiptPayload`.

**2. Konvensi Boolean "Y"/kosong**
`passValidateInvoiceDate`, `useCredit`, `paidPph` pakai konvensi
kompetitor "isikan Y jika ..., kosongkan jika tidak" — BEDA dari
konvensi "TRUE"/"FALSE" yang dipakai Sales Invoice/Purchase Invoice.
Rencana: reuse pola `TRUE_TEXT_VALUES`/`toAccurateBoolean` yang SUDAH
ada di modul lain (`sales-invoice.mapping.ts`) — set itu SUDAH terima
`"y"`/`"ya"`/`"yes"`/`"true"`/`"1"` case-insensitive, jadi "Y" dari
template kompetitor OTOMATIS kompatibel TANPA logic tambahan.

**3. `paymentMethod` — ENUM tetap, bukan teks bebas**
⚠️ **KOREKSI (2026-09-10)** — daftar awal dari "Penjelasan Kolom"
kompetitor (8 nilai) TERNYATA **KURANG LENGKAP**. Dicek ulang LANGSUNG
ke `enum` di spec resmi (`accurate-openapi.json`), DIKONFIRMASI SILANG
dengan screenshot dropdown "Metode Bayar" UI Accurate asli dari client
— nilai valid yang BENAR ada **11**, dengan padanan Indonesia (label UI)
persis seperti ini:

| Label UI (Indonesia) | Enum API |
|---|---|
| Tunai | `CASH_OTHER` |
| Cek/Giro | `BANK_CHEQUE` |
| Transfer Bank | `BANK_TRANSFER` |
| EDC | `EDC` |
| Kartu Debit | `DEBIT_CARD` |
| Kartu Kredit | `CREDIT_CARD` |
| QRIS | `QRIS` |
| Payment Link | `PAYMENT_LINK` |
| Virtual Account | `VIRTUAL_ACCOUNT` |
| Dompet Digital | `E_WALLET` |
| Non Tunai Lainnya | `OTHERS` |

`CREDIT_CARD`, `DEBIT_CARD`, `E_WALLET` SEMPAT TERLEWAT di riset awal
(sumber kompetitor tidak lengkap) — untung ketahuan sebelum eksekusi,
kalau tidak user yang pilih "Kartu Kredit" akan gagal validasi karena
dicocokkan ke daftar yang salah. Rencana: validasi nilai kolom Excel
terhadap 11 enum ini SEBELUM kirim ke Accurate (pesan error jelas kalau
user isi nilai di luar daftar, sebut daftar yang valid), BUKAN kirim
mentah-mentah apa pun yang diketik user. Kolom Excel boleh terima label
Indonesia (kiri) ATAU enum API (kanan) — diterjemahkan otomatis,
konsisten pola "pilihan ramah user" di modul lain (mis. Payment Method
Purchase Payment, kalau ada).

**4. `detailDiscount[]` — array BARU, nested di DALAM `detailInvoice[]`**
BEDA dari `detailExpense[]` (Sales Invoice/Purchase Invoice, sibling
dari `detailItem[]`) — di sini `detailDiscount[]` nested SATU LEVEL LEBIH
DALAM, di dalam tiap elemen `detailInvoice[]`. 1 baris Excel (1 elemen
`detailInvoice`) BISA punya PALING BANYAK 1 entri `detailDiscount`
(bukan array Excel-level terpisah) — dianggap punya data diskon kalau
minimal "Discount" (amount) DAN "Discount Acc" (accountNo) terisi,
mirror pola `buildDetailExpenseFromRow` (accountNo+amount sebagai
syarat minimal).

**5. Penempatan kolom Excel — ⚠️ DIKOREKSI (2026-09-10), BUKAN "paling
akhir" seperti draf awal**
Rencana awal: semua 18 kolom baru ditaruh PALING AKHIR template
(setelah "Jumlah Bayar"), konsisten pola semua fase sebelumnya (Fase
70-81, "selalu tambah di ujung, jangan selipkan di tengah").

**Keputusan final berbeda** — instruksi eksplisit user setelah eksekusi
awal: *"susunan excel harus sama dengan yg dibuat client, karena itu
permintaannya"*. Sales Receipt PENGECUALIAN sengaja dari konvensi
"tambah di akhir": karena tujuan Fase 85 memang MENYAMAKAN template
dengan file yang SUDAH familiar bagi client (sheet NOTE mereka, disalin
dari template kompetitor `FACPORT_Sales Receipt_v5.xlsx`), urutan kolom
justru HARUS ikut urutan asli mereka, kolom lama ikut disisipkan ulang
di posisi yang sesuai (bukan tetap di depan lalu field baru ditambah di
ekor). Urutan final (`defaultColumnMap`, `salesReceiptTemplateGuide`,
dropdown `ACCURATE_FIELDS` — ketiganya disamakan urutannya):

Tanggal → No. Sales Receipt → Akun Bank/Kas → No Pelanggan →
Description → Branch → Currency Code → kurs → Cheque Amount → Cheque No
→ Cheque Date → Payment Method → Pass Validate Inv Date → Use credit →
No Faktur → Jumlah Bayar → Department → Paid PPH → PPh No → Discount →
Discount Acc → Discount Note → Diskon - Dept → Diskon - Project No.

(4 field skip — Existing Credit, Return Overpay, Tax Amount, Tax ID —
posisinya di file asli client dilewati begitu saja, TIDAK bikin celah/
kolom kosong, konsisten § "4 Field yang Di-Skip" di atas.)

Ini keputusan KHUSUS Sales Receipt, BUKAN perubahan konvensi global —
modul lain (Fase 70-84 dst) TETAP pakai pola "tambah kolom baru di
akhir", kecuali ada permintaan client serupa di masa depan.

**6. Nama kolom Excel — ikuti istilah PERSIS kompetitor**
Konsisten pola Fase 50 (Purchase Payment: "label kolom diikutkan
istilah kompetitor, client sudah familiar") — `defaultColumnMap` pakai
nama kolom PERSIS seperti template kompetitor ("Description", "Branch",
"Currency Code", "kurs", "Cheque No", "Cheque Date", "Payment Method",
"Pass Validate Inv Date", "Use credit", "Department", "Paid PPH", "PPh
No", "Discount", "Discount Acc", "Discount Note", "Diskon - Dept",
"Diskon - Project No") sebagai SATU-SATUNYA nama (belum ada sinonim
Indonesia lama untuk field yang benar-benar baru, beda dari kasus
rename field existing).

**7. Presisi Desimal — WAJIB dukung 6 digit di belakang koma (catatan
eksplisit client)**
Client eksplisit minta: **"yang berkaitan sama angka, tolong diset bisa
membaca 6 angka belakang koma"**. Dicek ke spec resmi — ini MEMANG
batasan/kapasitas resmi Accurate untuk field bertipe Number di endpoint
ini, BUKAN permintaan di luar API: `chequeAmount` (root & versi
eksplisit baru), `detailInvoice[].paymentAmount`, dan
`detailInvoice[].detailDiscount[].amount` SEMUA didokumentasikan spec
dengan contoh PERSIS `95275.123456` — *"Nilai maksimum: 999 miliar
dengan 6 digit desimal"*. `rate` (kurs) juga bertipe Number, secara
alami butuh presisi desimal tinggi (nilai tukar mata uang) walau
deskripsi spec-nya tidak menyebut angka 6 secara eksplisit — DIPERLAKUKAN
SAMA (izinkan hingga 6 desimal) demi konsistensi.

**Implikasi implementasi** (untuk semua field Number di atas):
- **JANGAN** `Math.round()`/pembulatan implisit di mana pun sepanjang
  jalur baca Excel → payload Accurate — nilai desimal dari Excel harus
  sampai ke Accurate APA ADANYA (sampai 6 digit).
- **JANGAN** parsing yang memaksa integer (`parseInt`, atau regex yang
  menolak titik desimal) — WAJIB pakai parsing yang mempertahankan
  desimal (`Number()`/`parseFloat()`, konsisten pola `Number(rowValues.chequeAmount ?? 0)`
  yang sudah dipakai `buildSalesReceiptPayload` sekarang — TIDAK perlu
  diubah untuk bagian ini, cuma DIKONFIRMASI sudah benar).
- Kolom di template & `template-guide.ts` yang bertipe Number
  (`chequeAmount` baru, `rate`, `Discount`) deskripsinya WAJIB sebut
  eksplisit "boleh sampai 6 angka di belakang koma" — supaya user tidak
  salah kira harus angka bulat (pola instruksi Excel lain di project
  ini selalu bilang "Angka polos, TANPA titik/koma pemisah RIBUAN" —
  itu soal PEMISAH ribuan, BUKAN larangan desimal, dua hal beda yang
  gampang disalahpahami kalau tidak dijelaskan eksplisit).
- Test baru (nanti pas eksekusi) WAJIB ada kasus nilai desimal presisi
  tinggi (mis. `1000000.123456`) untuk SETIAP field Number baru,
  pastikan tidak ada pembulatan/pemotongan di sepanjang jalur.

### Sudah Diputuskan (Riwayat Singkat)
- ~~Nama field internal final untuk "Cheque Amount"~~ — **`receiptTotalAmount`**,
  lihat Keputusan Desain #1.
- ~~Apakah 4 field yang di-skip perlu ditindaklanjuti~~ — **SUDAH
  MATANG (2026-09-10)**, dikonfirmasi via 7 screenshot UI Accurate asli
  + dokumentasi resmi `/api/tax` dari client: Existing Credit & Tax
  Amount TERBUKTI nilai read-only/komputasi otomatis (memang tidak ada
  yang perlu di-set). **Return Overpay** ("Retur Kredit") TERBUKTI NYATA
  ada di UI tapi TIDAK ADA di API manapun (dicek exhaustif) —
  DIDOKUMENTASIKAN LENGKAP (lihat Tabel Keputusan) untuk ditanyakan ke
  Accurate CS langsung kalau diperlukan nanti, TIDAK diimplementasikan
  dengan tebakan. **Tax ID** — keputusan "skip" AWAL DIREVISI (2026-09-10,
  instruksi eksplisit user "jangan ikuti kompetitor, kita punya data
  cukup untuk memanggil tax berfungsi dengan benar") jadi DIIMPLEMENTASI
  sebagai validasi-only ke Master Data Pajak Accurate — lihat § "Fase 86
  — Validasi Tax ID" di bawah.

## Fase 86 — Validasi "Tax ID" (✅ DIEKSEKUSI, 2026-09-10)

### Latar Belakang
Fase 85 awalnya men-SKIP "Tax ID" (dianggap ID record master data pajak
Accurate, tidak relevan). User eksplisit minta ditinjau ulang — sempat
dieksplorasi sebagai "kombinasi 2 API" (pola sama `findOrCreateVendor`/
`findOrCreateItem`), lalu sempat DIJEDA karena local dev tidak punya
subscription Sales Receipt untuk test nyata. Alih-alih workaround
(ditolak eksplisit user, "jangan bikin baru"), disiapkan environment
test PROPER: plan+subscription Sales Receipt baru dibuat di dev DB,
di-connect user ke company Accurate demo ("Retail Demo") secara manual
lewat OAuth — bukan data customer produksi (project masih tahap
building, belum ada customer nyata).

**Temuan penting SEBELUM eksekusi** (audit ulang data ASLI kompetitor,
556 baris `FACPORT_Sales Receipt_v5.xlsx`): kolom "Tax ID" (juga
Existing Credit/Return Overpay/Tax Amount) **0% pernah diisi** di
seluruh data nyata. Deskripsi resmi kompetitor untuk "Tax ID": *"No
Pajak. Keterangan: lihat di **Data Master Pajak pada Fitur Facport**"*
— SATU-SATUNYA kolom yang mereferensikan "Fitur Facport" (bukan
"Accurate Online" seperti kolom lain), mengindikasikan field ini
awalnya dimaksudkan untuk fitur internal produk lama bernama sama
("Facport"), BUKAN field Accurate API.

**Keputusan final (instruksi eksplisit user)**: *"JANGAN IKUTI
KOMPETITOR .. ini aplikasi kita.. kita punya data cukup untuk memanggil
tax berfungsi dengan benar.."* — TIDAK mengikuti asumsi/pola kompetitor
begitu saja, bangun validasi Tax ID sendiri berdasarkan API Accurate
`/api/tax/*` yang SUDAH dikonfirmasi bisa dipanggil (scope `tax_view`,
lihat `accurate-scopes.ts`).

### Test Call Nyata (2026-09-10, company "Retail Demo")
`GET /api/tax/list.do` — **200 OK**, scope `tax_view` terbukti berfungsi.
Struktur record ASLI (bukan asumsi dari dokumentasi):
```json
{
  "id": 1800,
  "taxCode": "Pajak Penghasilan Ps.23",
  "description": "Jasa Kebersihan",
  "pph23Type": "JASA_LAIN_KEBERSIHAN",
  "taxType": "PPH23",
  "rate": 2
}
```
**Temuan kritis**: `taxCode` **TIDAK UNIK** — "Pajak Penghasilan Ps.23"
dipakai banyak `description` berbeda (Jasa Kebersihan, Jasa Software
Komputer, Jasa Teknik, dst — SEMUA record PPh23 share taxCode yang
sama). Hanya `id` (Long, internal) dan `description` yang unik per
record. `taxCode` UNIK cuma untuk pajak non-PPh23 (mis. "PPN").

### Desain
**Field baru**: `taxId` (Excel kolom "Tax ID", opsional, per baris
faktur — posisi PERSIS antara "PPh No" dan "Discount", sama seperti
urutan asli client).

**VALIDASI-ONLY, TIDAK PERNAH masuk payload** — `sales-receipt/save.do`
TIDAK punya field untuk ini (dikonfirmasi exhaustif Fase 85), jadi
BEDA dari `findOrCreateVendor`/`findOrCreateItem`/`findOrCreateDataClassification`
(yang auto-create DAN hasilnya dikirim ke payload utama): Tax ID cuma
DICOCOKKAN ke Master Data Pajak Accurate SEBELUM payload dibangun —
kalau tidak ditemukan, SELURUH grup GAGAL dengan pesan jelas (bukan
warning diam-diam atau auto-create). Alasan TIDAK auto-create: Master
Data Pajak adalah konfigurasi akuntansi sensitif (tarif pajak resmi),
beda dari vendor/item/kategori yang aman dibuat otomatis.

**Pencarian fleksibel** (`accurate-tax.ts` § `findTaxByIdentifier`):
angka → cocok ke `id`; teks → cocok ke `taxCode` ATAU `description`
(case-insensitive). **Disarankan pakai `description`** (unik) di
template guide — `taxCode` ambigu untuk PPh23 (lihat temuan di atas),
kalau user isi kode yang dipakai banyak record, `.find()` balikin match
PERTAMA di urutan list (BISA salah jenis pajak TANPA notifikasi) — ini
Known Limitation yang didokumentasikan, bukan bug tersembunyi.

**File baru**: `apps/api/src/lib/accurate-tax.ts` — `findTaxByIdentifier`,
fetch `/api/tax/list.do` (pageSize 200, company biasanya jauh di bawah
itu).

**File diubah**:
- `sales-receipt.mapping.ts` — `taxId` ditambah ke `fieldToAccuratePath`
  (path placeholder "(validasi-only)", BUKAN path Accurate asli — SATU-SATUNYA
  field begini di modul ini) & `defaultColumnMap`. Fungsi baru
  `extractTaxIdsFromRows` (dedupe, dipakai worker).
- `workers/index.ts` — fungsi baru `validateTaxIdsForReceipt` dipanggil
  di `processSalesReceiptGroup` SEBELUM `buildSalesReceiptPayload`,
  throw `Error` jelas kalau ada Tax ID tidak ditemukan.
- `template-guide.ts`, dropdown `import/page.tsx` — opsi/deskripsi baru,
  posisi sesuai urutan client.

### Known Limitations
- `taxCode` ambigu untuk PPh23 (lihat § Desain) — mitigasi: guide
  sarankan pakai `description`, bukan validasi tambahan (biar simpel,
  konsisten filosofi project "biarkan Accurate/data asli yang jadi
  sumber kebenaran").
- Belum ada UI khusus untuk melihat daftar Master Data Pajak yang valid
  di Facport sendiri (user harus buka Accurate langsung untuk tahu
  nama pastinya) — di luar scope fase ini, bisa jadi fitur "referensi
  master data" terpisah kalau dibutuhkan.

## Belum Diputuskan (Di Luar Scope Fase Ini)
- Apakah ekspansi ini JUGA perlu di-mirror ke Purchase Payment (modul
  bayangan cermin PERSIS modul ini) — belum diminta eksplisit untuk
  Purchase Payment, tapi pola sebelumnya (Fase 75 PI mirror SI)
  menunjukkan client cenderung minta simetri lintas modul serupa. TIDAK
  dikerjakan di Fase 85/86 (scope KHUSUS Sales Receipt) — bisa jadi fase
  terpisah nanti kalau diminta.

## Referensi
- Infra OAuth/sesi Data Usaha/rate-limit/error-handling bersama →
  `docs/architecture/architecture-accurate-integration.md`
- Bayangan cermin PERSIS (semua keputusan desain berasal dari sini) →
  `docs/architecture/architecture-purchase-payment.md`, Fase 33
- Faktur yang diterima pembayarannya → `docs/architecture/architecture-sales-invoice.md`
- Katalog sub-modul → ADR-0019
- Rencana ekspansi field opsional (Fase 85, belum dieksekusi) →
  `docs/phases/phase-85-ekspansi-field-sales-receipt.md`
