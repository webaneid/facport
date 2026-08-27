# Progress Tracker

> Index ringkas semua fase. Detail tiap fase ada di `docs/phases/phase-XX-*.md`.
> Update tabel ini tiap kali status fase berubah (lihat `docs/SOP.md`).
> **Fase 00 = fondasi** (settings, komponen reusable, i18n — lihat
> `docs/architecture/architecture-components.md`), dibuat otomatis oleh skill
> `project-init` dan WAJIB jalan sebelum Fase 01 fitur.

| Fase | Nama                     | Status      | Architecture Doc                                   | Phase Doc                              |
|------|---------------------------|-------------|-------------------------------------------------------|-------------------------------------------|
| 00   | Fondasi Teknis (settings, komponen, auth+RBAC, queue) | Done | `docs/architecture/architecture-components.md` | `docs/phases/phase-00-fondasi.md` |
| 01   | Fondasi Produk (routing 3-surface, langganan/plans, koneksi OAuth Accurate) | Done | `docs/architecture/architecture-domain-routing.md`, `docs/architecture/architecture-subscription.md`, `docs/architecture/architecture-accurate-integration.md` | `docs/phases/phase-01-fondasi-produk.md` |
| 02   | Modul Pembelian — **Purchase Invoice (Faktur Pembelian) saja** | Done | `docs/architecture/architecture-accurate-integration.md` | `docs/phases/phase-02-modul-pembelian-purchase-invoice.md` |
| 03   | Dashboard Pelanggan (App Shell + halaman utama) | Done | `docs/architecture/architecture-app-dashboard.md` | `docs/phases/phase-03-dashboard-pelanggan.md` |
| 04   | Import Data Pemasok (update Akun Hutang) | Done | `docs/architecture/architecture-accurate-integration.md` § "Vendor (Data Master)" | `docs/phases/phase-04-import-vendor.md` |
| 05   | Purchase Invoice — Auto-create Vendor & Item | Done | `docs/architecture/architecture-accurate-integration.md` § "Vendor (Data Master)", § 3 | `docs/phases/phase-05-purchase-invoice-auto-create.md` |
| 06   | Purchase Invoice — Multi-Item per Faktur | Done | `docs/architecture/architecture-accurate-integration.md` § "Purchase Invoice — Multi-Item per Faktur", ADR-0011 | `docs/phases/phase-06-purchase-invoice-multi-item.md` |
| 07   | Tampilkan Nomor Faktur di Detail Hasil Import | Done | (frontend-only, lihat phase doc) | `docs/phases/phase-07-riwayat-cari-nomor-faktur.md` |
| 08   | Purchase Invoice — Update Faktur Existing (Retry Cerdas) | Done | `docs/architecture/architecture-accurate-integration.md` § "Purchase Invoice — Update Faktur Existing / Retry Cerdas (Fase 08)", ADR-0012 | `docs/phases/phase-08-purchase-invoice-update-existing.md` |
| 09   | Batal Import (Hapus/Susutkan Faktur di Accurate) | In Progress | `docs/architecture/architecture-accurate-integration.md` § "Purchase Invoice — Batal Import / Hapus Faktur (Fase 09)", ADR-0013 | `docs/phases/phase-09-batal-import.md` |

**Status legend:** `Not Started` → `Planned` → `In Progress` → `Done`

## Modul/Sub-modul Lain — Sengaja Di-pending
Arahan eksplisit user (2026-08-19): **cuma Fase 02 (Purchase Invoice) yang
aktif dikerjakan** setelah Fase 00-01 selesai. Semua ini di-pending sampai
Fase 02 benar-benar solid & tervalidasi ke akun Accurate nyata — urutan &
nomor fase berikutnya BELUM diputuskan, sengaja tidak di-pre-assign supaya
tidak menyiratkan komitmen urutan yang belum benar ada:
- Modul Pembelian — sub-modul lain: Purchase Order, Received Item, Purchase
  Payment, Retur Pembelian
- Modul Penjualan — semua sub-modul (Pesanan Penjualan, Delivery Order,
  Sales Invoice, Sales Receipt, Retur Penjualan)
- Modul Persediaan (Inventory) — semua sub-modul
- Modul Manufaktur — semua sub-modul
- Modul Kas & Bank + Buku Besar — semua sub-modul

**"Batal Import" (hapus dari Accurate) — DITUNDA SENGAJA, feedback client
2026-08-27.** Ide: tombol di halaman Riwayat Import Terakhir yang
menghapus SEMUA transaksi 1 batch langsung DARI ACCURATE (bukan cuma
riwayat lokal Facport). Disepakati eksplisit dengan user (2026-08-27):
dikerjakan PALING TERAKHIR dari 3 feedback client, setelah Fase 06 & 07
solid — ini operasi DESTRUCTIVE terhadap data akuntansi ASLI client di
sistem pihak ketiga, blast radius jauh lebih besar dari 2 fase di atas.
Kalau nanti di-scope jadi fase resmi, WAJIB architecture doc + ADR
tersendiri (belum dibuat sekarang, sengaja) yang minimal jawab: (1)
transaksi yang sudah "dipakai" downstream di Accurate (mis. sudah
dibayar/direferensikan transaksi lain) — kemungkinan besar ditolak API
`delete.do` Accurate sendiri, perlu dipetakan skenario error-nya dulu,
bukan diasumsikan selalu sukses; (2) UX konfirmasi (destructive action,
minimal 1 langkah konfirmasi eksplisit, bukan 1 klik langsung hapus); (3)
audit trail — siapa yang klik batal, kapan, transaksi apa saja yang
kehapus, disimpan permanen terlepas dari hasil hapusnya sendiri.

**Fase 04 (Import Data Pemasok — update Akun Hutang) Done 2026-08-20** —
modul BARU (data master, di luar 5 modul transaksi yang di-listing di §
"Modul/Sub-modul Lain — Sengaja Di-pending" di bawah), dipicu permintaan
client soal kolom "Akun Hutang" di Faktur Pembelian. Lewat riset panjang +
verifikasi empiris berulang (test call nyata ke Accurate, termasuk 3x
re-authorize OAuth buat nambah scope), field yang tepat dikonfirmasi:
`vendorPayableAccountListNo` (bukan saldo/`detailOpenBalance`) — dan
dibuktikan BENERAN dipakai Accurate saat posting Faktur Pembelian
berikutnya (bukan kosmetik). Endpoint + UI baru
`/vendor/payable-account/import/*`, pola identik Purchase Invoice. Detail
lengkap → `docs/phases/phase-04-import-vendor.md` § Ringkasan Hasil.
**Known limitation penting**: koneksi Accurate existing perlu
re-authorize manual untuk dapat scope baru ini.

**Fase 05 (Purchase Invoice — Auto-create Vendor & Item) Done 2026-08-20** —
perluasan modul Purchase Invoice (Fase 02): kalau Pemasok/Barang di Excel
belum ada di Accurate, otomatis dibuatkan (field opsional: kategori,
telepon, WhatsApp, email, alamat, negara, Akun Hutang untuk Pemasok baru),
baru Fakturnya dibuat. Diverifikasi PENUH lewat browser sungguhan sampai
sukses (vendor+item+faktur tercipta dalam 1 alur, semua field terkonfirmasi
tersimpan benar). Detail lengkap → `docs/phases/phase-05-purchase-invoice-auto-create.md`
§ Ringkasan Hasil. **Known limitation sama seperti Fase 04**: koneksi
Accurate existing perlu re-authorize manual untuk scope `item_save` baru.

## Fase Aktif Saat Ini
Fase 00, Fase 01, DAN Fase 02 (Modul Pembelian — Purchase Invoice) semuanya
**Done** (2026-08-19). Fase 02 tervalidasi end-to-end SUNGGUHAN — faktur
asli tercipta di Accurate Online (Data Usaha "Retail Demo") lewat panggilan
HTTP nyata (bukan mock), termasuk setelah security review (0 Critical, 1
High + 2 Medium + 4 Low, semua diperbaiki). Detail lengkap →
`docs/phases/phase-02-modul-pembelian-purchase-invoice.md` § Ringkasan
Hasil.

**Fase 03 (Dashboard Pelanggan) Done 2026-08-19** — App Shell (sidebar+topbar,
route group `(protected)`) + dashboard home profesional (Card Langganan,
Koneksi Accurate, Import Terakhir), pakai data ASLI dari Fase 01/02.
Diverifikasi lewat browser sungguhan (Playwright): login, navigasi, logout,
3 breakpoint responsive tanpa overflow. Fondasi UI ini dipakai ulang modul
berikutnya — BUKAN modul import baru (urutan modul/sub-modul setelah
Purchase Invoice masih BELUM diputuskan, lihat § "Modul/Sub-modul Lain —
Sengaja Di-pending" di atas). Detail → `docs/phases/phase-03-dashboard-pelanggan.md`
§ Ringkasan Hasil.

**Update 2026-08-19**: user memberi snapshot lokal dokumentasi resmi
Accurate (`docs/referencehtml/`, gitignored) — lihat
`docs/architecture/architecture-accurate-integration.md` § "Dokumentasi
Resmi" & § 3. Status 2 gap sebelumnya:
- ✅ **Scope Accurate untuk Purchase Invoice — TERVERIFIKASI**. Pola
  `{resource}_{aksi}` yang sudah ditebak di `accurate-scopes.ts` benar
  (`purchase_invoice_view`/`save`/`delete`). Field request `save.do`/
  `bulk-save.do` juga sudah didokumentasikan lengkap.
- ✅ **`ACCURATE_CLIENT_ID`/`SECRET` — SELESAI, DAN SUDAH DIUJI END-TO-END
  SUNGGUHAN 2026-08-19.** Aplikasi "facport" didaftarkan di Accurate,
  kredensial masuk `apps/api/.env`. Alur penuh dites pakai browser user
  asli: authorize URL → login Accurate → consent screen → callback →
  **token exchange BERHASIL, access+refresh token asli tersimpan
  terenkripsi di `accurate_connections`**. Satu bug ketemu & diperbaiki
  dalam prosesnya (redirect tujuan salah karena `??` vs `||` pada env
  string kosong) — detail → `docs/lessons-learned.md` entri
  "`env.APP_ORIGIN_PROD ?? fallback` gagal fallback...".
  **Gap baru ketemu dari test ini**: kolom `accurateDbId` di
  `accurate_connections` masih NULL — alur callback saat ini cuma simpan
  token, belum ada langkah pilih & simpan Data Usaha (`db-list.do` →
  `open-db.do`, § "Sesi Data Usaha" di `architecture-accurate-integration.md`).
  Ini WAJIB diselesaikan sebagai bagian awal Fase 02 (bukan reopen Fase 01
  — langkah ini baru relevan begitu ada endpoint data yang benar-benar
  dipakai, yaitu Purchase Invoice di Fase 02), sebelum bisa panggil
  endpoint `/api/purchase-invoice/*` mana pun.

**Update 2026-08-19 (sore)**: client user minta kolom "Akun Hutang" di
import Faktur Pembelian. Dicek langsung ke `open-api/json.do` (live, bukan
snapshot) — field itu TIDAK ADA di `purchase-invoice/save.do` (bukan
properti transaksi), tapi ADA di `vendor/save.do`
(`vendorPayableAccountListNo`). Kebutuhan sebenarnya = modul baru **Import
Data Vendor** (data master, bukan transaksi) — didraf sebagai **Fase 04**,
status `Planned`, **BELUM dieksekusi** karena user masih konfirmasi detail
kebutuhan ke client dulu. Detail lengkap → `docs/phases/phase-04-import-vendor.md`
dan `docs/architecture/architecture-accurate-integration.md` §
"Vendor (Data Master)".

**Terobosan besar 2026-08-19**: ditemukan `https://account.accurate.id/open-api/json.do`
— spec OpenAPI RESMI Accurate yang **publik, tidak login-gated**, bisa
diakses langsung oleh Claude kapan saja (via GitHub repo
`aol-integration/accurate-schema-mcp`). Ini artinya verifikasi scope/field
untuk modul-modul lain (Sales Invoice, Purchase Order, dst) di fase-fase
berikutnya TIDAK PERLU lagi minta snapshot manual dari user — tinggal
`curl`/fetch endpoint itu. Sudah dipakai untuk memperbaiki
`accurate-scopes.ts` (semua 222 scope resmi dicek, 4 entry yang tadinya
salah tebak sudah dikoreksi: `item_receipt_*`→`receive_item_*`,
`payment_*`→`other_payment_*`, `receipt_*`→`other_deposit_*`,
`journal_*`→`journal_voucher_*`) dan menemukan rate limit resmi (8
req/detik, 8 concurrent) + pola error Accurate (`{"s": false}` di HTTP 200,
bukan cuma HTTP error code). Detail lengkap →
`architecture-accurate-integration.md` § "Dokumentasi Resmi", § 4, § 5, § 6.
- ✅ **Gap baru ketemu, SEKARANG SEPENUHNYA TERSELESAIKAN**: alur OAuth
  ternyata butuh langkah TAMBAHAN di luar access_token — "Sesi Data Usaha"
  (`open-db.do` → host API dinamis + `X-Session-ID`, wajib dikirim di tiap
  panggilan endpoint data). Semua parameter DAN contoh response
  (`db-list.do`, `open-db.do`) sudah terverifikasi via kombinasi
  `api-docs.do` (parameter) + https://accurate.id/api-integration/api-example/
  (contoh response nyata, sumber publik). Detail lengkap →
  `architecture-accurate-integration.md` § "Sesi Data Usaha (Company
  Database)".

## Update 2026-08-28 — 3 Feedback Client Pasca-Presentasi
Presentasi 2026-08-27 (domain sementara `ane.web.id`) menghasilkan 3
masukan client, diprioritaskan bareng user:
1. **Fase 07** — tampilkan nomor faktur di tabel "Detail per Baris"
   halaman hasil import (`Planned`). **Klarifikasi 2026-08-28**: draf awal
   sempat disangka minta pencarian lintas-batch — SALAH, ternyata cukup
   nampilin nomor faktur (data sudah ada di response API,
   `rows[].rawData`) di halaman detail batch yang sudah ada. Scope jauh
   lebih kecil dari draf awal, frontend-only.
2. **Fase 06** — Faktur Pembelian multi-item, **PRIORITAS EKSEKUSI DULUAN**
   (`Planned`) — akar penyebab error nyata di demo ("Sudah ada data lain
   dengan No Form..."), lihat ADR-0011.
3. **"Batal Import" (hapus dari Accurate)** — DITUNDA sengaja, dikerjakan
   paling akhir karena destructive terhadap data akuntansi asli client.
   Rasional lengkap → § "Modul/Sub-modul Lain — Sengaja Di-pending" di atas.

Urutan eksekusi: Fase 06 dulu (dampak terbesar, benerin bug demo), baru
Fase 07, baru "Batal Import" (kalau/setelah di-scope resmi jadi fase).

**Fase 06 — sisi kode selesai 2026-08-28** (status TETAP `In Progress`,
BUKAN `Done` — menunggu verifikasi Accurate nyata setelah deploy, sesuai
standar project Fase 02/05). Baris Excel Bill No sama dikelompokkan jadi 1
faktur multi-item — akar penyebab error demo 2026-08-27 diperbaiki di
level desain. 9 unit test baru lolos, full suite 48/48, typecheck 0 error,
security review 0 temuan. Detail lengkap →
`docs/phases/phase-06-purchase-invoice-multi-item.md` § Ringkasan Hasil.

**Fase 06 Done 2026-08-28** — diverifikasi PENUH lewat HTTP API sungguhan
ke Data Usaha Accurate nyata: 2 baris Excel Bill No sama → 1 faktur
(`accurateTransactionId` sama di kedua baris). Gap infra tambahan ketemu
& diperbaiki: service `worker` (pg-boss) tidak pernah ada di
`docker-compose.prod.yml`/`.staging.yml` sejak awal project — job import
tidak pernah diproses sama sekali di server manapun sampai sekarang.
Detail lengkap → `docs/phases/phase-06-purchase-invoice-multi-item.md`
§ Ringkasan Hasil, `docs/lessons-learned.md` entri 2026-08-28.

## Update 2026-08-28 — Fase 08: Retry Cerdas (Update Faktur Existing)
Ditemukan pasca-verifikasi Fase 06: batch `8b622538` (akun
`user1@fasport.com`, diproses SEBELUM Fase 06 ada) punya baris `success`
+ baris `failed` lain dengan Bill No sama, ditolak Accurate sebagai
duplikat — retry biasa TIDAK memperbaiki (tetap coba CREATE, tetap
ditolak, dikonfirmasi via retry nyata). User eksplisit menolak perbaikan
manual ke data production ("tidak boleh kita yg bereskan, harus melalui
mesin yg kita bangun") dan meminta fitur baru dipicu dari tombol **Retry
existing** (bukan tombol baru).

Riset+test call NYATA ke faktur Accurate `#150` (Data Usaha "PT Frozen
Food") MENGKONFIRMASI `purchase-invoice/save.do` mendukung mode
UPDATE/append (kirim `id` faktur + `detailItem[]` berisi item lama via
`id` + item baru tanpa `id`) — mengoreksi klaim ADR-0011 yang bilang ini
tidak didukung. Detail lengkap → ADR-0012,
`docs/phases/phase-08-purchase-invoice-update-existing.md`.

**Fase 08 Done 2026-08-28** — diverifikasi PENUH: retry batch `8b622538`
(akun `user1@fasport.com`) via tombol Retry sungguhan → 6/6 baris
`success`, 0 gagal. Dikonfirmasi ULANG langsung ke Accurate (`detail.do`
fresh, bukan cuma status DB lokal): faktur #200 dan #250 masing-masing
`detailItem` NAIK dari 1 jadi 2. 1 bug ditemukan & diperbaiki SAAT
verifikasi (field `vendor.no` seharusnya `vendor.vendorNo` — dikonfirmasi
dari raw JSON nyata, bukan asumsi). Gap operasional besar juga ketemu di
proses ini: CI auto-deploy TIDAK PERNAH benar-benar jalan sejak awal
(secret SSH server tidak pernah diisi) — detail lengkap →
`docs/lessons-learned.md` entri 2026-08-28 "CI auto-deploy tidak pernah
jalan...".
