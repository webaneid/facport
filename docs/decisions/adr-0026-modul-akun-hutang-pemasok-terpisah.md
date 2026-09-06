# ADR-0026: "Import Akun Hutang Pemasok" Jadi Sub-Modul Berbayar Terpisah

**Status:** Accepted
**Tanggal:** 2026-09-05
**Supersedes:** Bagian di ADR-0019 § Konsekuensi yang menetapkan
"Import Akun Hutang Pemasok" pakai `moduleAccess: "purchase_invoice"`
(dibundel gratis ke Purchase Invoice); dan keputusan Fase 04 § "Keputusan
Kecil Selama Eksekusi" ("Scope `vendor_view`/`vendor_save` ditaruh
permanen di modul `pembelian`... bukan modul 'pemasok' terpisah").

## Context
Sejak Fase 04, fitur "Import Akun Hutang Pemasok" (update Akun Hutang per
Pemasok di Accurate, § `architecture-accurate-integration.md` §
"Vendor (Data Master)") dibundel GRATIS ke sub-modul `purchase_invoice`:
siapa pun yang subscribe Purchase Invoice otomatis dapat fitur ini juga,
tanpa bayar terpisah. Alasan awal: "Akun Hutang Pemasok konsepnya melekat
ke alur pembelian" (Fase 04).

User (pemilik Facport) sekarang minta sidebar dashboard customer
menampilkan NAMA PAKET yang mereka subscribe sebagai label menu (bukan
nama fitur generik) — supaya customer langsung tahu link itu bagian
paket apa yang mereka beli. Ini membuka pertanyaan: kalau 1 sub-modul
(`purchase_invoice`) menaungi 2 link berbeda (Import Faktur Pembelian +
Import Akun Hutang Pemasok), sedangkan cuma ADA 1 paket yang bisa dibeli
untuk keduanya, apakah itu tetap dibiarkan bundel gratis, atau dipisah
jadi 2 SKU independen?

User memutuskan: **pisah jadi sub-modul sendiri, dijual terpisah** —
bukan cuma soal label, tapi perubahan model bisnis: "Import Akun Hutang
Pemasok" sekarang jadi produk yang bisa dibeli independen dari Purchase
Invoice, bukan bonus otomatis lagi.

## Decision
1. **Sub-modul baru: `vendor_payable_account`** (label UI "Akun Hutang
   Pemasok", grup katalog "Data Master" — beda dari 5 grup transaksi
   ADR-0019, konsisten dengan penyebutan awal di
   `architecture-accurate-integration.md`: *"modul BARU... di luar 5
   modul transaksi... ini modul DATA MASTER"*). Terdaftar sebagai
   sub-modul ke-6 yang bisa dijual, menyusul 5 sub-modul ADR-0019
   (`sales_invoice`, `purchase_invoice`, `sales_receipt`,
   `purchase_payment`, `journal_voucher`).
2. **`vendor-payable-account-import.route.ts`**: SEMUA 6 endpoint ganti
   `moduleAccess` dari `"purchase_invoice"` ke `"vendor_payable_account"`.
   Customer WAJIB subscribe sub-modul ini sendiri untuk akses fitur —
   subscribe Purchase Invoice saja TIDAK LAGI otomatis memberi akses.
3. **Scope OAuth Accurate** (`accurate-scopes.ts`): `vendor_view`/
   `vendor_save` DIPINDAH dari daftar scope `purchase_invoice` ke daftar
   scope `vendor_payable_account` sendiri. `item_save` TETAP di
   `purchase_invoice` (dipakai auto-create item saat import Faktur
   Pembelian, § Fase 05 — TIDAK terkait fitur vendor, tidak ikut pindah).
4. **Admin bisa jual sebagai plan sendiri** — `vendor_payable_account`
   ditambahkan ke union `modules` skema `POST/PUT /admin/plans` +
   katalog `MODULE_OPTIONS` (frontend, dipakai form admin & label
   `moduleLabel()` di invoice/landing/subscribe).
5. **Sidebar** (`components/app-shell/sidebar.tsx`): item nav "Import
   Akun Hutang Pemasok" ganti `moduleKey` dari `"purchase_invoice"` ke
   `"vendor_payable_account"` — filter tampil/sembunyi ikut subscription
   sub-modul ini sendiri, bukan ikut Purchase Invoice lagi.

## Konsekuensi
- **Reconnect OAuth wajib**: koneksi Accurate yang SUDAH terhubung
  sebelum perubahan ini deploy (dengan scope lama, `vendor_view`/
  `vendor_save` masih nempel di grant Purchase Invoice) TIDAK otomatis
  dapat pemisahan scope yang benar — user WAJIB "Hubungkan Ulang" supaya
  scope-nya sesuai sub-modul yang benar-benar dia subscribe sekarang.
  Pola sama seperti konsekuensi Fase 04 saat scope ini pertama ditambah.
- **Subscriber Purchase Invoice existing kehilangan akses gratis** ke
  Import Akun Hutang Pemasok begitu ini deploy — kalau masih butuh
  fiturnya, harus beli plan `vendor_payable_account` terpisah. Tidak ada
  migrasi/grandfathering data untuk subscription aktif yang sudah ada
  (keputusan sadar user, bukan lupa) — pada saat ADR ini ditulis, satu-
  satunya subscription aktif di database adalah akun test internal
  (`user@facport.com`), BUKAN pelanggan nyata, jadi dampak riil saat ini
  nihil. Kalau nanti ada pelanggan produksi sebelum ini dirilis, evaluasi
  ulang kebutuhan migrasi sebelum deploy ke production.
- **Harga**: admin PERLU membuat plan baru untuk `vendor_payable_account`
  di `/admin/plans` supaya fitur ini bisa dibeli sama sekali — sebelum
  ada plan aktif untuk sub-modul ini, TIDAK ADA customer yang bisa
  subscribe (fitur jadi tidak bisa diakses siapa pun sampai admin bikin
  plan-nya, ini disengaja, bukan bug).
- Menyelesaikan ambiguitas label sidebar: sekarang tiap sub-modul = tepat
  1 link menu, jadi label "nama paket per link" tidak lagi tabrakan
  (beda dari kalau tetap dibundel, di mana 2 link akan tertulis sama).

## Alternatif yang Dipertimbangkan
- **Tetap bundel gratis, cuma ganti label tampilan** (opsi yang sempat
  dibahas & hampir dieksekusi) — ditolak user setelah klarifikasi ulang;
  user eksplisit ingin fitur ini benar-benar jadi produk terpisah,
  bukan cuma soal teks.
- **Grandfather subscriber lama otomatis dapat akses gratis selamanya,
  pelanggan baru wajib bayar terpisah** — ditawarkan ke user, TIDAK
  dipilih. Tidak ada kebutuhan riil sekarang (0 pelanggan produksi),
  jadi kompleksitas migrasi bersyarat itu tidak sepadan.

## Referensi
- Asal mula fitur & alasan awal bundling → `docs/phases/phase-04-import-vendor.md`
- Katalog 5 sub-modul asli & model 1-plan-1-SKU → ADR-0019
- Detail teknis field Accurate (`vendorPayableAccountListNo`, dst) →
  `docs/architecture/architecture-vendor-payable-account.md`
- Eksekusi perubahan ini → `docs/phases/phase-28-modul-akun-hutang-pemasok-terpisah.md`
