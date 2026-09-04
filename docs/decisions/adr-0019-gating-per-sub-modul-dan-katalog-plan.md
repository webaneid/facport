# ADR-0019: Gating Akses Per Sub-Modul & Plan Jadi Katalog Per-SKU

**Status:** Accepted
**Tanggal:** 2026-09-04
**Supersedes:** Bagian granularitas modul di ADR-0008, dan status "tanpa
harga" di ADR-0015 (kolom `plans.price` — lihat § Decision poin 3)

## Context
Sampai Fase 13, gating akses modul (`requireModuleAccess`, §
`architecture-subscription.md`) beroperasi di level **grup TOP-LEVEL**
(`"pembelian"`, `"penjualan"`, dst — 5 grup per `docs/glossary.md`).
`plans.modules` menyimpan array grup ini, dan 1 user cuma dianggap punya
1 subscription AKTIF (`getActiveSubscription` ambil 1 baris terbaru saja).

Client sekarang jual per **SUB-MODUL** (Sales Invoice, Purchase Invoice,
Sales Receipt, Purchase Payment, Journal Voucher — masing-masing fitur
transaksi konkret, bukan grup): "1 modul = 1 harga = 1 user" (arahan user
2026-09-04). Customer BOLEH beli 1, 2, atau lebih sub-modul sekaligus
dalam 1 transaksi (cart, § ADR-0021 payment), dan tiap sub-modul yang
dibeli independen — tanggal expired sendiri, koneksi Accurate sendiri
(§ ADR-0020).

Granularitas grup lama (`penjualan`/`pembelian`) sudah tidak cukup:
customer yang cuma mau Sales Invoice tidak seharusnya otomatis "berhak"
Sales Receipt juga (keduanya sama-sama grup `penjualan`), padahal
harganya beda dan mungkin cuma salah satu yang dibayar.

Terpisah tapi berkaitan: ADR-0015 (2026-08-xx) menghapus wajib-isi
`plans.price` karena saat itu Facport "sementara tanpa harga" (supporting
app). Sekarang Facport benar-benar jual per-modul dengan harga nyata —
premis ADR-0015 sudah tidak berlaku, harga WAJIB ada lagi.

## Decision
1. **Unit gating = sub-modul, bukan grup.** Key yang dipakai
   `plans.modules`/`moduleAccess`/`accurate-scopes.ts` sekarang:
   `sales_invoice`, `purchase_invoice`, `sales_receipt`,
   `purchase_payment`, `journal_voucher` (5 kunci, sesuai 5 sub-modul yang
   dijual client) — bukan lagi `penjualan`/`pembelian`/dst.
2. **1 `plans` row = 1 SKU per SATU sub-modul** (`modules` array-nya
   secara konvensi cuma 1 elemen sekarang, kolom TETAP `jsonb string[]`
   di skema — tidak breaking-change tipe data, cuma konvensi isinya).
   Admin BOLEH bikin beberapa SKU untuk sub-modul yang sama (mis.
   "Sales Invoice — Bulanan" vs "Sales Invoice — Tahunan", beda harga/
   durasi), TAPI TIDAK bikin 1 plan berisi >1 sub-modul lagi. Bundling
   lintas-modul (customer beli SI+PI sekaligus) terjadi di level
   **cart/checkout** (pilih beberapa `planId`), bukan didefinisikan admin
   sebagai 1 SKU gabungan — menghindari admin harus pre-buat 2^5 kombinasi
   bundel untuk semua kemungkinan pilihan customer.
3. **1 user BOLEH punya banyak subscription AKTIF bersamaan** (1 per
   sub-modul yang dibeli, tanggal expired independen per subscription).
   `getActiveSubscription(userId)` (ambil 1 baris terbaru) diganti
   `getActiveSubscriptions(userId)` (ambil SEMUA baris `status:"active"
   && endAt > now`) — gating jadi "apakah UNION modules dari semua
   subscription aktif user mengandung moduleKey ini", bukan cuma
   subscription terbaru.
4. **`plans.price` wajib diisi lagi** (kembali `notNull`) — supersede
   ADR-0015 poin ini spesifik (poin lain ADR-0015 soal alasan HISTORIS
   kenapa sempat di-null-kan tetap valid sebagai catatan, tidak dihapus).
   Form admin `/admin/plans` dapat field harga balik.
5. **Migration data**: 2 sub-modul yang SUDAH live (Purchase Invoice,
   Sales Invoice) — subscription/plan existing yang masih pakai key
   `"pembelian"`/`"penjualan"` di-backfill terarah ke
   `"purchase_invoice"`/`"sales_invoice"`. TIDAK ada data existing untuk
   3 sub-modul lain (belum pernah dijual).

## Alternatif yang Dipertimbangkan
- **Tetap grup top-level, tambah sub-flag di dalamnya** — ditolak: makin
  rumit (2 lapis array), tidak menyelesaikan masalah inti "customer cuma
  mau bayar 1 sub-modul, bukan seluruh grup."
- **1 plan boleh berisi banyak sub-modul (bundel bebas, model lama
  dipertahankan)** — ditolak: memaksa admin pre-definisikan kombinasi
  bundel untuk tiap permutasi yang mungkin diminta customer; model
  "1 plan = 1 SKU + bundling di cart" lebih fleksibel tanpa kerja admin
  bertambah.
- **`plans.price` tetap nullable, invoice pakai harga custom per
  transaksi (bukan dari plan)** — ditolak: kehilangan single-source-of-truth
  harga, rawan invoice dengan harga tidak konsisten antar customer tanpa
  alasan bisnis.

## Konsekuensi
- Route yang punya `moduleAccess: "pembelian"`/`"penjualan"` (Purchase
  Invoice, Sales Invoice, Import Akun Hutang Pemasok) WAJIB diganti ke
  sub-modul terkait — lihat `docs/phases/phase-14-fondasi-langganan.md`.
- `apps/web/app/admin/(protected)/plans/page.tsx` — checkbox multi-modul
  jadi pilih SATU sub-modul (radio/select) + field harga.
- Sidebar nav (§ ADR-0018, baru Fase 13) tetap valid POLA-nya
  (`NavItem.moduleKey`), cuma NILAI `moduleKey` yang perlu disesuaikan ke
  sub-modul baru, dan filter-nya perlu baca UNION dari semua subscription
  aktif (bukan 1 subscription tunggal).
- Endpoint publik `GET /plans` (dipakai landing page) sekarang menampilkan
  daftar SKU per-sub-modul (5+ baris kalau semua sub-modul sudah ada
  SKU-nya), bukan segelintir "paket bundel" seperti sebelumnya — halaman
  landing perlu disesuaikan tampilannya (§ Fase 17).

## Referensi
- Konteks lengkap & alur bisnis → `docs/phases/phase-14-fondasi-langganan.md`
- Koneksi Accurate per sub-modul (reusable) → ADR-0020
- Payment gateway & cart checkout → ADR-0021
- Model dasar langganan (masih berlaku prinsip umumnya) → ADR-0008
- Riwayat kenapa `price` sempat nullable → ADR-0015
