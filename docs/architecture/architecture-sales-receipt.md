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

## Referensi
- Infra OAuth/sesi Data Usaha/rate-limit/error-handling bersama →
  `docs/architecture/architecture-accurate-integration.md`
- Bayangan cermin PERSIS (semua keputusan desain berasal dari sini) →
  `docs/architecture/architecture-purchase-payment.md`, Fase 33
- Faktur yang diterima pembayarannya → `docs/architecture/architecture-sales-invoice.md`
- Katalog sub-modul → ADR-0019
