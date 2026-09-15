# ADR-0033: Ekspansi Facport Jadi Super-App Multi-Produk (Facport + Konverter + AutoProduksi)

**Status:** Accepted
**Tanggal:** 2026-09-14
**Extends:** ADR-0019 (gating per sub-modul & katalog plan) — TIDAK
mengganti/superseding, menambah 1 dimensi ortogonal baru di atasnya.

## Context

Client FAC Institute punya 3 produk terpisah: **Facport** (Excel→Accurate
Online, 7 sub-modul live), **Konverter** (aplikasi lama, PHP, untuk pengguna
Accurate Desktop — convert Excel→XML 100% client-side, tidak ada API call ke
Accurate sama sekali, ~16 tipe transaksi), dan **AutoProduksi** (belum ada
kode — modul manufaktur/formula BOM: resep produk jadi dari bahan baku,
input jumlah produksi otomatis memotong stok bahan baku sesuai formula).

Arahan bisnis eksplisit: gabung ketiganya jadi **1 aplikasi bernama Facport**,
**1 pintu pendaftaran**, **1 jalur transaksi/billing**. Bukan 3 aplikasi
terpisah dengan 3 akun/billing masing-masing.

**Kerangka berpikir yang dipakai (klarifikasi eksplisit dari user, analogi
toko)**: satu **Brand** ("Facport", tetap, tidak ada rebranding/sub-brand),
menjual beberapa **Produk** (analog toko jual kaos/ban mobil/jasa web di
bawah 1 nama toko), tiap Produk punya beberapa **Varian** (analog kaos punya
varian polo/oblong). Dipetakan: Brand=Facport, Produk={Facport, Konverter,
AutoProduksi}, Varian=sub-modul/tipe-transaksi di dalam 1 Produk (utk Produk
"Facport" ini persis sub-modul yang sudah ada — Sales Invoice, Purchase
Invoice, dst).

ADR-0019 sudah menetapkan model "1 `plans` row = 1 SKU per sub-modul, flat,
tanpa hierarki di atas modul" — dan itu TETAP benar untuk hubungan
plan↔modul. Yang belum ada sama sekali adalah dimensi **Produk** DI ATAS
modul. Riset menyeluruh (3 subagent Explore + 1 Plan agent, grounded ke kode
nyata) sebelum ADR ini ditulis menemukan:

- Fondasi Data Usaha/subscription Facport sudah lentur untuk produk baru:
  `data_usaha.accurateConnectionId` dan `subscriptions.accurateConnectionId`
  SUDAH nullable (Data Usaha tanpa koneksi Accurate sudah state valid hari
  ini, dipakai alur trial). Gate `subscriptionGatePlugin.moduleAccess()`
  cuma cek string-membership ke `plan.modules`, TIDAK PERNAH query
  `accurate_connections` — modul Konverter bisa pakai gate yang PERSIS SAMA
  tanpa ubah 1 baris kode di situ.
- 7 module-key existing (`sales_invoice`, dst) sudah di-duplikasi manual di
  ≥4 tempat (`apps/web/lib/module-options.ts`, `apps/api/src/lib/accurate-scopes.ts`,
  TypeBox union di `admin/plans.route.ts`, `moduleAccess` string per route +
  switch di `workers/index.ts`) — TIDAK ADA shared enum lintas apps/api↔web.
  Menambah puluhan varian Konverter tanpa membereskan ini dulu akan
  memperparah masalah secara signifikan.
- Pipeline `import_batches`/job `IMPORT_TO_ACCURATE` HARD-CODED asumsi
  "berakhir di API call Accurate" di 2 titik gating dalam worker
  (`getConnectionForBatch`, `openAccurateSession`) — Konverter (100%
  client-side, tidak ada job server sama sekali) TIDAK COCOK model ini.
  AutoProduksi (bisa lewat job baru, skip 2 gating itu) lebih cocok.
- Branding (logo/nama perusahaan) 100% global/singular untuk seluruh
  instance — ini JUSTRU SESUAI arahan bisnis (1 brand, bukan 3), BUKAN
  blocker. Yang dibutuhkan cuma label/kategori Produk yang jelas di UI
  (katalog, sidebar, invoice), bukan infrastruktur multi-tema.

## Decision

1. **Tambah kolom `productLine` di tabel `plans`** (varchar20, NOT NULL,
   DEFAULT `'facport'`) — dimensi Produk, ORTOGONAL terhadap `modules`
   (varian/sub-modul) dan `kind` (mekanisme billing: module vs seat_addon).
   BUKAN tabel `products` terpisah (tidak ada kebutuhan CRUD dinamis — cuma
   3 Produk tetap, sama alasan ADR-0019 menolak nested array 2-lapis untuk
   modul). BUKAN namespace di module-key (`"konverter.faktur_penjualan"`) —
   akan merusak exact-match string yang sudah dipakai
   `MODULE_ACCURATE_SCOPES`/`moduleAccess()`, dan menyembunyikan Produk jadi
   implisit padahal harus eksplisit & queryable.

   Nama field kode tetap `productLine` (istilah umum di data model), TAPI
   di semua dokumentasi/ADR/prosa SELALU disebut **"Produk"** — konsisten
   bahasa bisnis user, hindari kesan "3 sub-brand terpisah".

2. **Katalog modul jadi 3-tingkat: Produk → Kategori → Varian.** Field
   `MODULE_OPTIONS.group` (sekarang cuma presentasional di form admin
   plans) dipromosikan jadi tingkat "Kategori" resmi dalam struktur baru,
   dipakai SEMUA Produk (bukan cuma Facport). Kategori TETAP presentasional
   saja — TIDAK PERNAH dipakai gating, sama seperti `group` hari ini.

   Source of truth baru: `apps/api/src/lib/module-catalog.ts` (leaf file
   murni, TIDAK boleh import `db.ts`/`env.ts` — akan di-bundle Next.js).
   `apps/web/lib/module-options.ts` jadi re-export dari file ini (pola sama
   `apps/web/lib/api-client.ts` yang sudah relative-import lintas
   apps/api↔web, bedanya ini BUKAN type-only karena web butuh nilai
   runtime-nya juga).

   Konverter dan AutoProduksi SENGAJA belum diisi varian/kategori apa pun
   di `module-catalog.ts` fase ini — nama varian ditentukan pas fase build
   masing-masing, bukan ditebak sekarang.

3. **Bereskan duplikasi module-key SEKARANG**, sebelum jumlahnya bertambah:
   - `accurate-scopes.ts` (`MODULE_ACCURATE_SCOPES`): data tetap terpisah
     (cuma untuk Produk Facport/Accurate), tambah test guard —
     `Object.keys(MODULE_ACCURATE_SCOPES)` harus subset dari
     `MODULE_CATALOG` yang `productLine==="facport"`.
   - `plans.route.ts` TypeBox literal union: **TIDAK digenerate otomatis**
     dari `module-catalog.ts` — ada temuan terdokumentasi 2026-09-04 bahwa
     generate union via `.map()` dari const array merusak inferensi Eden
     Treaty (field `modules` salah ke-infer jadi `File | File[]`). Tetap
     ditulis manual, tambah test guard drift-check terhadap
     `module-catalog.ts` supaya ketinggalan sinkron ketahuan di test, bukan
     di production.
   - `moduleAccess:"<key>"` per route + `switch` di `workers/index.ts`:
     BUKAN duplikasi yang dihapus (memang logic per-modul yang legitimate
     beda-beda) — cukup import key dari `module-catalog.ts`, bukan string
     literal lepas, supaya typo jadi compile error.

4. **Checkout/invoice TIDAK berubah struktural** — cart/checkout sudah
   menerima N `planId` bebas jadi 1 invoice (N `invoiceItems`). **Mencampur
   SKU Facport+Konverter+AutoProduksi dalam 1 keranjang/invoice SENGAJA
   DIIZINKAN**, konsisten "1 brand, 1 checkout". Tambah 1 kolom
   denormalisasi `invoiceItems.productLine` (varchar20, NOT NULL, DEFAULT
   `'facport'`) — snapshot saat invoice dibuat, pola SAMA seperti
   `moduleKey`/`label`/`price` yang sudah snapshot (invoice = dokumen
   legal, bukan join-live). `subscriptions` TIDAK perlu kolom `productLine`
   sendiri (record operasional live — cukup join `plans.productLine` saat
   dibutuhkan).

5. **Riwayat Konverter TIDAK memaksa masuk `import_batches`.** Tabel itu
   merepresentasikan pipeline async TERVERIFIKASI SERVER (job → Accurate
   confirm) — "sukses" Konverter cuma berarti "browser bilang file
   ke-download", level kepercayaan berbeda. Desain (dikunci di sini, TABEL
   BELUM dibuat fase ini): tabel `conversion_logs` terpisah (`userId`,
   `dataUsahaId`, `subscriptionId`, `moduleKey`, `fileName`, `rowCount` —
   semua self-reported client, bukan server-verified), dibuat pas fase
   build Konverter nanti. Gating Konverter TIDAK butuh perubahan apa pun
   (§ Context, `moduleAccess()` sudah cocok apa adanya).

6. **Sidebar**: tambah field opsional `NavGroup.productLine?: string`
   (pola sama seperti `ownerOnly?` yang sudah additive). Logic render
   (cluster per Produk dengan sub-header) SENGAJA ditunda — belum ada item
   nav Konverter/AutoProduksi nyata untuk divalidasi terhadapnya.

## Alternatif yang Dipertimbangkan

- **Tabel `products` terpisah (bukan kolom string)** — ditolak: tidak ada
  kebutuhan CRUD dinamis (business menyebut persis 3 Produk tetap, admin
  tidak bikin Produk baru sesering bikin Plan), tabel+FK+migration-ordering
  tidak sepadan untuk closed-set 3 nilai. Revisit kalau nanti Produk jadi
  katalog yang di-manage admin secara dinamis (belum ada indikasi ke arah
  itu).
- **Namespace di module-key** (`"konverter.faktur_penjualan"`) — ditolak:
  merusak exact-match string yang dipakai `MODULE_ACCURATE_SCOPES`/
  `moduleAccess()`, dan bikin Produk implisit/perlu-parse padahal harus
  eksplisit.
- **Reuse `import_batches` untuk riwayat Konverter** — ditolak: skema
  SECARA TEKNIS legal (kolom generik), tapi semantik pipeline
  async-server-verified tidak cocok mekanik client-side-murni Konverter;
  maksa gabung ke `GET /me/import-batches` (yang sekarang zero filter
  modul) bakal nyampur data dengan reliability guarantee beda diam-diam ke
  pengguna Facport existing.
- **Workspace `packages/*` baru untuk katalog bersama** — ditolak untuk
  saat ini: root `package.json` workspaces cuma `["apps/*"]`, precedent
  relative-import lintas app SUDAH ada (`api-client.ts`), tambah tier
  workspace baru untuk ~30 baris data statis adalah ceremony berlebihan.

## Konsekuensi

- Daftar plan di `/admin/plans` akan tumbuh melewati ~30 baris begitu
  Konverter (berpotensi ~16 varian) dan AutoProduksi (beberapa varian) mulai
  jual SKU nyata, masing-masing berpotensi multi-tier (bulanan/tahunan) —
  UI admin (filter/search per Produk) BELUM disiapkan fase ini, jadi utang
  UX yang diketahui, bukan kelupaan.
- Istilah "Modul" di `docs/glossary.md` overload 3 arti (kategori top-level
  Accurate lama, sub-modul-SKU ADR-0019, dan tingkat "Kategori" baru fase
  ini) — didisambiguasi eksplisit di glossary, bukan dibiarkan ambigu.
- **Open question, sengaja belum dijawab**: 34 user lama Konverter (akun
  JSON file, PHP) — bagaimana identitasnya masuk ke `user` Better Auth
  Facport (signup baru, migrasi manual, jembatan CSV)? Keputusan ini
  menunggu fase migrasi Konverter yang sesungguhnya.
- Tidak ada perubahan behavior apa pun yang terlihat customer di fase ini —
  2 kolom baru DEFAULT identik untuk semua baris existing, `productLine`
  belum muncul di UI manapun.

## Referensi
- Fondasi flat-SKU-per-modul yang di-extend, bukan diganti: ADR-0019
- Koneksi Accurate per sub-modul (reusable): ADR-0020
- Payment/cart checkout: ADR-0022
- Detail riset & rekomendasi lengkap → `docs/phases/phase-117-peta-struktur-multi-produk.md`
- Bentuk katalog & referensi hidup (diupdate tiap fase Konverter/AutoProduksi
  nambah varian nyata) → `docs/architecture/architecture-product-lines.md`
