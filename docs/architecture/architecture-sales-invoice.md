# Architecture — Modul Sales Invoice (Faktur Penjualan)

> Dipisah dari `architecture-accurate-integration.md` (2026-09-05, saat
> audit kematangan dokumentasi per-modul). File itu SEKARANG isinya
> cuma infra bersama (OAuth, skema bulk-import generik, rate limit,
> error handling Accurate) — baca dulu untuk konteks OAuth/sesi Data
> Usaha sebelum baca file ini.
>
> Status: **✅ Live sejak Fase 13.**

> Client minta 5 sub-modul aktif (2026-09-04): Sales Invoice (SI),
> Purchase Invoice (PI, § `architecture-purchase-invoice.md`), Sales
> Receipt/"Customer Receipt" (CR), Purchase Payment (PP), Journal
> Voucher/"Jurnal Umum" (JU). Fase 13 ini Sales Invoice SAJA — PP/CR/JU
> BELUM DIKERJAKAN (status per 2026-09-05, § `docs/PROGRESS.md`). Semua
> endpoint/scope di bawah diverifikasi langsung dari
> `docs/referencehtml/accurate-openapi.json` (OpenAPI spec resmi
> Accurate, bukan tebakan).

## Prinsip: SI Adalah Bayangan Cermin PI

`vendorNo`↔`customerNo`, Vendor↔Customer, semua pola generik yang sudah
diputuskan untuk PI (grouping multi-item per ADR-0011, retry cerdas per
ADR-0012, batal import per ADR-0013/ADR-0014) **diterapkan APA ADANYA
ke resource baru ini**, bukan didesain ulang. Dibangun LANGSUNG lengkap
(bukan bertahap seperti histori PI Fase 02→05→06→08→09) — keputusan
eksplisit user 2026-09-04, karena pola-nya sudah terbukti matang di PI.

## Endpoint Accurate

`/api/sales-invoice/*`, host dinamis dari sesi Data Usaha:

| Endpoint | Method | Scope |
|---|---|---|
| `/save.do` | POST | `sales_invoice_save` |
| `/detail.do` | GET | `sales_invoice_view` |
| `/list.do` | GET | `sales_invoice_view` |
| `/delete.do` | DELETE | `sales_invoice_delete` |

Scope `sales_invoice_view`/`sales_invoice_save` sudah ada di
`apps/api/src/lib/accurate-scopes.ts` sejak awal project — belum
pernah dipakai endpoint/service sampai Fase 13.

**Field wajib** `save.do`: `detailItem[].itemNo`, `detailItem[].unitPrice`
(persis PI). `customerNo` SECARA TEKNIS opsional di schema Accurate
(beda dari PI yang `vendorNo` juga opsional secara schema tapi WAJIB
secara bisnis) — tetap diperlakukan WAJIB di `requiredFields` mapping
kita, konsisten dengan PI.

## Customer (Data Master, Setara Vendor di PI)

`apps/api/src/lib/accurate-customer.ts`, mirror 1:1 `accurate-vendor.ts`:
- `findCustomerByNo` — `customer/list.do` + `filter.no.val`, sama pola
  `findVendorByNo`.
- `findOrCreateCustomer` — auto-create kalau `customerNo` di Excel
  belum ada, field opsional `customerName` (wajib diisi kalau memang
  mau buat baru), kategori/telepon/WA/email/alamat/negara — SEMUA
  create-only (tidak update customer existing), KECUALI:
- **`customerReceivableAccountListNo`** ("Akun Piutang") — setara
  `vendorPayableAccountListNo` di PI (§ `architecture-vendor-payable-account.md`):
  BOLEH update customer yang SUDAH ADA juga, bukan cuma saat create.
  Field asli Accurate dikonfirmasi ada di `customer/save.do` schema
  (`customerReceivableAccountListNo`, tipe String) — simetris persis
  dengan vendor, TIDAK perlu modul "Import Data Pelanggan" terpisah
  (beda dari PI yang punya Vendor sebagai modul mandiri berbayar sejak
  Fase 28 — di sini cukup jadi field opsional di Sales Invoice
  langsung karena tidak ada permintaan client spesifik soal itu, gampang
  ditambah modul terpisah nanti kalau ternyata dibutuhkan).

## Multi-Item, Retry Cerdas, Batal Import

Reuse fungsi generik `workers/index.ts` yang sudah ada untuk PI
(polanya, bukan fungsinya langsung), diterapkan lewat fungsi SI sendiri
(`groupSalesInvoiceRows`, `processSalesInvoiceGroup`,
`appendToExistingSalesInvoice`, `findExistingAccurateSalesInvoiceId`) —
kolom pengelompokan AWALNYA cuma **"PO Number"** (`poNumber`, field
resmi Accurate di `sales-invoice/save.do` — referensi nomor PO dari
customer, peran sama seperti Bill No vendor di PI).

**§ Fase 49 — DIREVISI, kolom pengelompokan DIGENERALISASI.** Audit
terhadap file Excel ASLI kompetitor (`docs/referencehtml/format_sales_inv_v7.xlsx`,
833 baris) menemukan **"PO Number" SELALU KOSONG** di praktik nyata,
padahal **52% faktur (77/149) itu multi-item** (sampai 58 baris/faktur)
— grouping by PO Number gagal TOTAL untuk pola data ini (tiap baris
kebaca faktur sendiri-sendiri, TANPA error, diam-diam salah). Kolom
"Trans No" (field `number` — nomor transaksi Accurate, SUDAH ada di
`defaultColumnMap` sejak awal) justru SELALU terisi & konsisten per
faktur di data yang sama, jadi jadi kunci grouping **UTAMA** sekarang
(PO Number tetap didukung sebagai fallback, TIDAK ada regresi untuk
siapa pun yang sudah mapping PO Number tanpa Trans No). Tipe
`SalesInvoiceGroup` generik (`groupKey`/`groupColumn`, bukan `poNumber`
literal) — lihat `groupSalesInvoiceRows` di `sales-invoice.mapping.ts`
untuk prioritas per-baris lengkap.

## Kolom Excel & UI

Pola 1:1 PI: `sales-invoice.mapping.ts` (`fieldToAccuratePath`,
`defaultColumnMap`, `customerAutoCreateMapping`), halaman
`app/app/(protected)/sales-invoice/import/*`, komponen
`components/sales-invoice/*`. Detail field lengkap → baca kode langsung
(bukan didokumentasikan ulang di sini, sesuai pola PI yang sudah
settle — dokumen ini cukup jadi peta konsep + rujukan ADR, bukan
duplikat kode).

## Nav & Dashboard Difilter oleh Langganan

§ ADR-0018, mulai fase ini — menu "Import Faktur Penjualan" di sidebar
customer HANYA muncul kalau plan langganan customer itu mencakup modul
`sales_invoice`. Pola ini BAKU untuk semua modul baru berikutnya (PP,
CR, JU), bukan kasus khusus SI.

## Referensi
- Infra OAuth/sesi Data Usaha/rate-limit/error-handling bersama →
  `docs/architecture/architecture-accurate-integration.md`
- Pola yang di-mirror → `docs/architecture/architecture-purchase-invoice.md`
- Eksekusi lengkap → `docs/phases/phase-13-sales-invoice.md`
- Kode: `apps/api/src/routes/sales-invoice-import.route.ts`,
  `apps/api/src/lib/accurate-sales-invoice.ts`,
  `apps/api/src/lib/accurate-customer.ts`,
  `apps/api/src/lib/import-mapping/sales-invoice.mapping.ts`
