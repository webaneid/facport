# Architecture — Modul Akun Hutang Pemasok (Vendor Data Master)

> Dipisah dari `architecture-accurate-integration.md` (2026-09-05, saat
> audit kematangan dokumentasi per-modul) — file itu SEKARANG isinya
> cuma infra bersama (OAuth, skema bulk-import generik, rate limit,
> error handling Accurate) yang dipakai SEMUA modul, bukan detail
> modul spesifik. Baca `architecture-accurate-integration.md` dulu
> untuk konteks OAuth/sesi Data Usaha sebelum baca file ini.
>
> Status eksekusi: **✅ Live sejak Fase 04**
> (`docs/phases/phase-04-import-vendor.md`). Model bisnis fitur ini
> BERUBAH Fase 28: awalnya dibundel gratis ke sub-modul Purchase
> Invoice, sekarang jadi sub-modul BERBAYAR sendiri
> (`vendor_payable_account`) — § `docs/decisions/adr-0026-modul-akun-hutang-pemasok-terpisah.md`.

> Istilah: API/endpoint Accurate pakai nama Inggris "Vendor"
> (`/api/vendor/*`, `vendorNo`, dst — tag resmi `open-api/json.do`
> untuk `/api/vendor` juga literal berlabel **"Pemasok"**). Teks di
> bawah pakai "Pemasok" untuk naratif, "Vendor" untuk nama literal
> endpoint/field.

## Latar Belakang & Kategori Modul

Client user (pemilik Facport) minta kolom "Akun Hutang" di import
Faktur Pembelian. Setelah dicek langsung ke `open-api/json.do` resmi,
field itu **tidak ada** di `purchase-invoice/save.do` (35 field, tidak
satupun terkait akun) karena Akun Hutang memang properti Pemasok, bukan
properti transaksi. Field yang dicari **ADA** di `vendor/save.do`:
`vendorPayableAccountListNo` ("Kode Akun Hutang"). Kebutuhan client
sebenarnya adalah **import/update Data Master Pemasok** — modul
kategori **DATA MASTER** (§ `module-options.ts` grup "Data Master"),
BEDA dari 5 sub-modul TRANSAKSI (`architecture-subscription.md`/ADR-0019:
Sales Invoice, Purchase Invoice, Sales Receipt, Purchase Payment,
Jurnal Umum).

## Endpoint Accurate

`/api/vendor/*`, host dinamis dari sesi Data Usaha (sama pola dengan
Purchase Invoice, § `architecture-accurate-integration.md` § "Sesi Data
Usaha"):

| Endpoint | Method | Scope |
|---|---|---|
| `/bulk-save.do` | POST | `vendor_save` |
| `/save.do` | POST | `vendor_save` |
| `/list.do` | GET | `vendor_view` |
| `/detail.do` | GET | `vendor_view` |
| `/delete.do` | DELETE | `vendor_delete` |

**Field wajib (`required: true`)** di schema resmi `save.do`: `name`,
`transDate`.

## Field `vendorPayableAccountListNo` — Terverifikasi Langsung ke Support Accurate

**✅ TERVERIFIKASI 2026-08-19 — konfirmasi langsung dari tim Support
Accurate ke client user** (bukan asumsi): client menghubungi Support
Accurate perihal kebutuhan Akun Hutang ini, tim Support membenarkan
`vendorPayableAccountListNo` adalah parameter yang tepat, sekaligus
mengirim bukti test call nyata (screenshot Postman + UI Accurate,
tersimpan di `docs/referencehtml/vendorPayableAccountListNo.png` dan
`-2.png`):
```json
POST https://zeus.accurate.id/accurate/api/vendor/save.do
{
  "id": 100,
  "name": "FastHauzz",
  "transDate": "06/08/2026",
  "vendorPayableAccountListNo": 210101
}
```
→ `200 OK`, field "Akun Utang" di UI vendor tersebut (tab Pembelian →
Akun Pembelian) benar berubah jadi `[210101] Utang Usaha IDR`.

Temuan dari test call ini:
- **`id` (internal numeric ID Accurate) WAJIB untuk update vendor
  existing** — `optLock` di response naik (versi record), menandakan
  UPDATE ke vendor yang SUDAH ADA (id: 100), bukan CREATE baru. Alur
  Facport butuh `vendor/list.do` dulu (cari `id` berdasarkan `vendorNo`
  yang di-input user di Excel) → baru `save.do` pakai `id` itu untuk
  update.
- **`vendorPayableAccountListNo` dikirim sebagai ANGKA TUNGGAL**
  (`210101`), BUKAN array (`[210101]`) seperti tertulis di schema resmi
  (`type: array`) — tapi tetap sukses (API cukup toleran, auto-wrap
  jadi array di belakang layar). Ikuti pola yang TERBUKTI jalan ini.
- **⚠️ Field ini OPSIONAL, bukan "akun hutang utama" tiap vendor** — dari
  catatan resmi UI Accurate (tab Vendor → Pembelian → Akun Pembelian):
  *"[Opsional] Diisikan JIKA anda ingin MEMBEDAKAN jurnal akun utang/uang
  muka pemasok ini dengan DEFAULT akun utang/uang muka yang ada pada
  Mata Uang..."* — ada **akun hutang default di level pengaturan Mata
  Uang** (Settings perusahaan), field vendor ini cuma OVERRIDE kalau
  vendor tertentu butuh beda dari default. Vendor yang pakai akun
  default boleh mengosongkan field ini.

**Field lain yang relevan** (dari 38 field total `save.do`): `vendorNo`
(String, nomor identitas vendor), `vendorDownPaymentAccountListNo`
(String, "Kode Akun Uang Muka"), `categoryName`, `currencyCode`,
`termName` (syarat bayar default), `email`, `mobilePhone`, alamat
penagihan (`billStreet`/`billCity`/`billProvince`/`billCountry`/
`billZipCode`), data pajak (`npwpNo`/`pkpNo`/`wpNumber`/`wpName`).

**Scope yang benar-benar dipakai** (MVP, tetap berlaku): cuma 2 kolom
wajib — `vendorNo` (cari vendor existing) + `vendorPayableAccountListNo`
(Akun Hutang) — TIDAK semua 38 field sekaligus, field lain menyusul
kalau memang dibutuhkan.

## `detailOpenBalance` (Saldo Awal Utang) — BUKAN Bagian Fitur Ini

**⚠️ Jangan tertukar** dengan `vendorPayableAccountListNo` — field
array TERPISAH di `save.do` yang sama, deskripsi resmi
`detailOpenBalance[].asOf`: *"Tanggal transaksi saldo awal utang/piutang
perusahaan"*. Ini BUKAN akun (COA), tapi **nilai saldo hutang** (Rupiah)
yang sudah ada sebelum pemasok itu mulai dipakai di Accurate — input
sekali per pemasok, TIDAK otomatis terhubung ke transaksi Faktur
Pembelian ke depannya (Accurate menghitung saldo BERJALAN sendiri dari
saldo awal ini + akumulasi Faktur Pembelian − Purchase Payment). Field
utama: `amount` (nilai saldo), `asOf` (tanggal), `currencyCode`.

**✅ TERVERIFIKASI 2026-08-20 — cocok 1:1 dengan UI Accurate.** Tab
Vendor → "Utang Awal" punya dialog tambah entry dengan kolom **Tanggal,
Jumlah, Mata Uang, Syarat Pembayaran, Nomor#, Keterangan** (TANPA field
item) — persis field `detailOpenBalance[].{asOf, amount, currencyCode,
paymentTermName, number, description}`. Dicek via API langsung ke
vendor real ("PT. Angin Ribut", Data Usaha "Tes"):
```json
detailOpenBalance: [
  { "id": 50, "amount": 100000000, "asOf": "01/07/2026",
    "number": "PI.2026.07.00001", ... }
]
```
Field `number` di sini HANYA label/kategori referensi (dropdown "Faktur
Pembelian" di UI, TANPA ikon pencarian) — bukan link ke transaksi
Faktur Pembelian sungguhan, murni catatan bebas. Entry baru yang
ditambah lewat dialog "+" di UI Accurate TIDAK langsung tersimpan ke
server — baru ter-commit (dapat Nomor# otomatis) setelah tombol
"Simpan" di level form Vendor keseluruhan diklik. **`detailOpenBalance`
TIDAK dipakai/diimplementasi fitur ini** — dicatat di sini murni supaya
tidak tertukar kalau baca schema `save.do` mentah. Detail eksperimen
lengkap → `docs/phases/phase-04-import-vendor.md` § "Eksperimen Manual
2026-08-20".

## Model Bisnis: Sub-Modul Berbayar Terpisah (§ ADR-0026)

Sejak Fase 28, modul ini **BUKAN LAGI** dibundel gratis ke Purchase
Invoice:
- Sub-modul: `vendor_payable_account` (§ katalog `MODULE_OPTIONS`, grup
  "Data Master").
- Scope OAuth: `vendor_view`/`vendor_save` di
  `MODULE_ACCURATE_SCOPES.vendor_payable_account` (`accurate-scopes.ts`)
  — TERPISAH dari scope `purchase_invoice` (yang cuma
  `purchase_invoice_view`/`purchase_invoice_save`/`item_save`).
- Endpoint gating: SEMUA endpoint `vendor-payable-account-import.route.ts`
  pakai `moduleAccess: "vendor_payable_account"` — subscribe Purchase
  Invoice saja TIDAK LAGI cukup untuk akses fitur ini.
- Konsekuensi: koneksi Accurate yang connect SEBELUM Fase 28 deploy
  perlu "Hubungkan Ulang" untuk dapat scope yang sudah dipisah.

## Referensi
- Infra OAuth/sesi Data Usaha/rate-limit/error-handling bersama →
  `docs/architecture/architecture-accurate-integration.md`
- Keputusan sub-modul berbayar terpisah → `docs/decisions/adr-0026-modul-akun-hutang-pemasok-terpisah.md`
- Eksekusi awal (Fase 04) → `docs/phases/phase-04-import-vendor.md`
- Kode: `apps/api/src/routes/vendor-payable-account-import.route.ts`,
  `apps/api/src/lib/accurate-vendor.ts`,
  `apps/api/src/lib/import-mapping/vendor-payable-account.mapping.ts`
