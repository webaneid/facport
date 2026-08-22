# Fase 02 — Modul Pembelian: Purchase Invoice (Faktur Pembelian)

**Status:** Done
**Mulai:** 2026-08-19
**Selesai:** 2026-08-19

## Tujuan
Implementasi end-to-end **pertama dan SATU-SATUNYA target aktif** dari alur
inti Facport: upload Excel → mapping kolom → import ke Accurate Online —
disempitkan HANYA untuk **Purchase Invoice (Faktur Pembelian)**, satu
sub-modul dari Modul Pembelian. Keputusan eksplisit dari user (2026-08-19):
kerjakan satu sub-modul ini sampai benar-benar solid dulu, semua sub-modul
Pembelian lain (Purchase Order, Received Item, Purchase Payment, Retur
Pembelian) DAN semua modul lain (Penjualan, Persediaan, Manufaktur, Kas &
Bank/Buku Besar) **di-pending** — jangan dikerjakan paralel atau
"sekalian" — sampai fase ini ditutup `Done` dan terbukti jalan.

Pola yang ditetapkan di fase ini (upload, mapping, job, progress tracking)
jadi **acuan** untuk sub-modul/modul berikutnya — tapi urutan modul mana
yang dikerjakan setelah ini **belum diputuskan**, ditentukan nanti setelah
fase ini stabil (lihat `docs/PROGRESS.md`).

Dikerjakan setelah Fase 00 (Fondasi Teknis) DAN Fase 01 (Fondasi Produk)
`Done` — fase ini bergantung pada `accurate_connections`, `import_batches`/
`import_batch_rows`, queue, DAN `requireModuleAccess("pembelian")` dari
model langganan.

## Scope

### 0. Verifikasi ke Dokumentasi Resmi (WAJIB PALING AWAL) — ✅ SELESAI
- [x] Endpoint, field wajib/opsional, tipe data, scope semua terverifikasi
      via OpenAPI spec resmi publik (`account.accurate.id/open-api/json.do`)
      + snapshot manual + halaman contoh response publik — lihat
      `docs/architecture/architecture-accurate-integration.md` § 3
      (Purchase Invoice) dan § "Sesi Data Usaha".
- [x] Dicatat di "Keputusan Kecil" di bawah.

### 0.5. Sesi Data Usaha — Prasyarat Endpoint Data (gap ketemu dari test OAuth nyata) — ✅ SELESAI
- [x] `lib/accurate.ts`: `listDatabases`, `openDatabase` (+ fix penting,
      lihat "Keputusan Kecil": `openDatabase` TIDAK ikut envelope generik)
- [x] `GET /accurate/status`, `GET /accurate/databases`, `POST /accurate/databases/select`
- [x] UI pilih Data Usaha di `app/app/accurate/page.tsx`
- [x] **Diuji NYATA**: koneksi test berhasil pilih Data Usaha "Retail Demo"
      (id 2780906), `accurateDbId` tersimpan di DB.

### 1. Template Excel & Import Mapping — ✅ SELESAI (diperluas)
- [x] `lib/import-mapping/purchase-invoice.mapping.ts` — diperluas dari 9
      ke 34 field (2026-08-19) berdasarkan template referensi user
      (`FACPORT_TEMPLATE_Purchase_Inv_v8.xlsx`, tool integrasi Accurate
      lain) — nama field Accurate TETAP dari spec resmi, cuma cakupan
      kolom yang mengikuti pola template itu.
- [x] `lib/excel.ts`: parse + generate template, endpoint download template
- [x] UI mapping pakai `Combobox` (bukan `<select>` polos — field sudah
      >10 opsi, sesuai aturan `apps/web/CLAUDE.md`)

### 2. Upload → Import Pipeline (Khusus Purchase Invoice) — ✅ SELESAI
- [x] Endpoint upload Excel Purchase Invoice — validasi tipe & ukuran file
      (§ `architecture-security.md` §8, `t.File()` — diverifikasi via test
      benar-benar cek magic bytes bukan cuma Content-Type)
- [x] Parsing Excel → `import_batches` (`module = "purchase_invoice"`,
      + kolom baru `columnMapping`) + `import_batch_rows` (status `pending`)
- [x] Endpoint confirm mapping (validasi requiredFields ke-mapping semua)
- [x] Job `IMPORT_TO_ACCURATE` — worker proses tiap row via `save.do`
      per-baris (BUKAN `bulk-save.do`), update status row
- [x] Rate limiter client (8 req/detik + 8 concurrent)
- [x] Halaman progress/hasil import batch (sukses/gagal per baris)
- [x] Retry batch (proses ulang row `failed`/`pending` saja)
- [x] Test dual-gate (`permission` + `moduleAccess` sekaligus, pertama
      kali dipakai gabungan di route nyata) — 401/403 terverifikasi lewat
      test otomatis.

### 3. Validasi End-to-End — ✅ SELESAI SEPENUHNYA
- [x] Test negative-path NYATA: `save.do` dengan vendorNo palsu → error
      Accurate asli mengalir bersih ("Pemasok VENDOR-TIDAK-ADA-999 tidak
      ditemukan atau sudah dihapus") tanpa perlu terjemahan tambahan.
- [x] Test POSITIVE-path PENUH lewat HTTP API sungguhan (bukan cuma
      panggil lib langsung): upload Excel kecil (vendor `VJKT-0001`,
      cabang `JAKARTA`, barang `9900012`, semua data ASLI dari Data Usaha
      "Retail Demo") → confirm mapping → job `IMPORT_TO_ACCURATE` jalan
      otomatis di worker → row `status: "success"` dengan
      `accurateTransactionId: "102350"` ASLI dari Accurate. Batch
      `status: "completed"`.
- [x] Test retry: batch yang tadinya gagal (sebelum fix format tanggal)
      di-retry ulang lewat endpoint `/retry`, hanya row `failed` yang
      diproses ulang, berhasil jadi `success` — fitur retry bekerja
      seperti dirancang.
- [x] 4 bug NYATA ketemu & diperbaiki selama proses ini (semua lewat test
      call sungguhan, bukan ditebak) — detail lengkap di
      `docs/lessons-learned.md`:
  1. `openDatabase()` salah parse response (`session`/`host` di top-level,
     bukan di `d`)
  2. `save.do` taruh record hasil di field `r`, bukan `d`
  3. `boss.send()` gagal karena `apps/api` tidak pernah `startQueue()`
     (worker start, tapi proses API sendiri tidak)
  4. Format tanggal Excel harus dinormalisasi ke `DD/MM/YYYY` sebelum
     dikirim ke Accurate

## Referensi
- Architecture doc: `docs/architecture/architecture-accurate-integration.md`
- ADR terkait: `docs/decisions/adr-0006-integrasi-accurate-api.md`,
  `docs/decisions/adr-0009-detail-oauth-accurate.md`
- Endpoint import WAJIB pasang `requirePermission()` DAN
  `requireModuleAccess("pembelian")` — lihat
  `docs/architecture/architecture-auth.md` §"Dua Lapis Gate"

## Keputusan Kecil Selama Eksekusi
(hal yang diputuskan di tengah jalan, nggak cukup besar buat ADR tapi tetap
perlu diingat kenapa dipilih begitu — termasuk hasil verifikasi § 0 di atas,
WAJIB diisi sebelum lanjut ke § 1)
- **Hasil verifikasi § 0** (2026-08-19): endpoint `POST /api/purchase-invoice/save.do`
  (single) dan `/bulk-save.do` (max 100/request, TAPI response schema tidak
  terverifikasi — keputusan: pakai `save.do` per-baris untuk MVP, lihat
  di bawah). Field wajib: `vendorNo` (header), `detailItem.itemNo` +
  `detailItem.unitPrice` (per baris item). Field opsional relevan:
  `transDate`, `number`, `description`, `detailItem.quantity`,
  `detailItem.warehouseName`, `taxable`/`inclusiveTax`. Detail lengkap →
  `architecture-accurate-integration.md` § 3.
- **`save.do` per-baris, bukan `bulk-save.do`**: Accurate tidak publish
  response schema untuk endpoint manapun (dikonfirmasi lewat OpenAPI spec
  resmi) — `bulk-save.do` butuh cara tahu item mana yang sukses/gagal
  dalam satu respons batch, tapi bentuknya tidak diketahui. `save.do`
  1 panggilan = 1 hasil jelas, cocok dengan alasan desain per-row
  (`import_batch_rows`) yang sudah ada.
- **Sesi Data Usaha (`accurateDbId`, `session`, `host`)**: `accurateDbId`
  disimpan permanen di `accurate_connections` (dipilih user 1x setelah
  connect). `session`+`host` dari `open-db.do` TIDAK disimpan ke DB —
  dibuka ulang tiap kali worker job `IMPORT_TO_ACCURATE` jalan (murah,
  lebih simpel daripada urus expiry cache lintas-request).
- **Rate limit**: 8 request/detik + 8 concurrent (angka resmi, ditemukan
  dari observasi pihak ketiga yang mengutip batas resmi Accurate — lihat
  § "Dokumentasi Resmi" di architecture doc untuk sumbernya).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — `apps/api` DAN `apps/web`
- [x] Security review dijalankan (subagent `security-auditor`, banyak file
      lintas modul)
- [x] Temuan Critical/High sudah diperbaiki — 0 Critical, 1 High
      (dependency `xlsx` CVE, diperbaiki: pindah ke build resmi terpatch)
- [x] Temuan Medium/Low — 2 Medium + 4 Low, **SEMUA diperbaiki sama sesi**
      (bukan ditunda), dicatat detail di `docs/lessons-learned.md`
- [x] `docs/PROGRESS.md` diupdate
- [x] Divalidasi end-to-end ke akun Accurate Online NYATA (§ 3 di atas) —
      termasuk retest setelah semua patch keamanan, konfirmasi tidak ada
      regresi

## Known Limitations
(hal yang sengaja belum ditangani di fase ini, biar jelas dan disengaja —
bukan kelupaan)
- **Sengaja di-pending, bukan kelupaan** (arahan eksplisit user): sub-modul
  Pembelian lain (Purchase Order, Received Item, Purchase Payment, Retur
  Pembelian), dan modul lain (Penjualan, Persediaan, Manufaktur, Kas &
  Bank/Buku Besar) TIDAK dikerjakan sama sekali di fase ini. Urutan
  berikutnya ditentukan setelah fase ini `Done` dan terbukti stabil.
- **1 baris Excel = 1 Faktur Pembelian dengan TEPAT 1 item** — faktur
  multi-item (banyak baris barang dalam 1 faktur) BELUM didukung. Kalau
  user butuh ini, perlu desain "grouping" (mis. baris dengan nomor faktur
  sama digabung jadi 1 transaksi banyak `detailItem`) — perubahan model
  data yang cukup besar, belum di-scope sekarang.
- **`bulk-save.do` belum dipakai** (§ "Keputusan Kecil") — `save.do`
  per-baris dipakai untuk MVP karena response schema `bulk-save.do` tidak
  terverifikasi. Untuk file sangat besar (ribuan baris), ini berarti
  ribuan HTTP request individual (dilambatkan rate limiter 8/detik) —
  bukan gagal, tapi lebih lambat daripada seharusnya kalau `bulk-save.do`
  dipakai. Optimisasi lanjut, bukan blocker.
- **Validasi field spesifik-Data-Usaha tidak di-precheck** — hal seperti
  "harus isi `branchName` kalau akun multi-cabang", "No Faktur harus diisi
  kalau auto-numbering mati", nama gudang harus valid, dst BERBEDA-BEDA
  per akun Accurate customer (tergantung setting mereka). Import kita
  TIDAK mem-validasi ini sebelum kirim — error-nya baru muncul per-baris
  dari Accurate sendiri (sudah bisa ditangani, pesan errornya jelas), tapi
  tidak ada pre-flight check di sisi Facport. Bisa jadi UX kurang optimal
  untuk akun dengan setup rumit, tapi tidak menghalangi fungsi dasar.
- **Field tanggal dinormalisasi (`transDate`/`taxDate`/`shipDate`), field
  LAIN yang mungkin butuh normalisasi serupa (mis. angka format Indonesia
  "1.000,50" vs "1000.50") BELUM ditangani** — kalau user upload Excel
  dengan format angka regional, kemungkinan gagal validasi Accurate.
  Belum ketemu kasus nyata untuk field ini di testing (item unit price/qty
  yang dites polos angka), jadi belum ada fix — dicatat sebagai risiko.
- **Ditemukan (bukan bug Fase 02, tapi observasi)**: user yang sign-up
  self-service TIDAK otomatis dapat role `customer` (`user_roles` kosong)
  — jadi permission `import.create` juga tidak otomatis ada. Test end-to-end
  fase ini pakai assignment role manual lewat DB. Ini kemungkinan gap di
  alur self-service Fase 01 (di luar scope Fase 02 untuk diperbaiki),
  perlu dicek terpisah — apakah memang harus admin-provisioned yang dapat
  role, atau ini kelupaan.

## Ringkasan Hasil (isi pas fase Done)
Fase ini membangun alur end-to-end PERTAMA yang benar-benar mengirim data
ke Accurate Online sungguhan: upload Excel Faktur Pembelian → cocokkan
kolom → job background → tersimpan sebagai transaksi asli di Accurate.
**Diverifikasi bukan cuma lewat unit test/mock — tapi lewat panggilan HTTP
sungguhan ke aplikasi yang jalan, ke akun Accurate Online sungguhan**
(Data Usaha sample "Retail Demo"), termasuk retest penuh setelah semua
patch keamanan. Faktur asli tercipta dengan `accurateTransactionId` valid.

**Yang dibangun:**
- Sesi Data Usaha (`db-list.do`/`open-db.do`) — gap yang ketemu di
  penutupan Fase 01, diselesaikan di awal fase ini
- Mapping Excel→Accurate diperluas dari 9 ke 34 field, mengikuti pola
  template referensi pihak ketiga yang sudah dipakai user
- Upload → cocokkan kolom (pakai `Combobox`, bukan `<select>` — field
  sudah >10 opsi) → confirm → job `IMPORT_TO_ACCURATE` → progress/hasil
  per baris → retry
- Rate limiter client (8 req/detik + 8 concurrent) khusus panggilan keluar
  ke Accurate

**4 bug NYATA ditemukan & diperbaiki lewat test call sungguhan** (bukan
ditebak dari dokumentasi — lihat `docs/lessons-learned.md` untuk detail
lengkap tiap satu):
1. `openDatabase()` salah baca lokasi `session`/`host` di response
2. `save.do` taruh record hasil di field `r`, bukan `d`
3. `apps/api` (proses HTTP) tidak pernah `startQueue()` — `boss.send()`
   dari route crash
4. Tanggal Excel harus dinormalisasi ke `DD/MM/YYYY` sebelum dikirim

**Security review**: 0 Critical, 1 High (dependency `xlsx` CVE — diperbaiki
pindah ke build resmi terpatch), 2 Medium + 4 Low (semua diperbaiki sama
sesi, termasuk 1 test regresi baru untuk ownership cross-subscription).

**Hasil samping berharga**: ditemukan `https://account.accurate.id/open-api/json.do`
— spec OpenAPI resmi Accurate yang PUBLIK (tidak login-gated) — mengubah
cara verifikasi modul berikutnya (Sales Invoice, Purchase Order, dst) dari
"minta snapshot manual user" jadi "curl spec-nya langsung". Detail →
`docs/architecture/architecture-accurate-integration.md` § "Dokumentasi
Resmi".

**Status modul berikutnya**: BELUM diputuskan (sesuai arahan eksplisit
user) — semua sub-modul Pembelian lain dan semua modul lain (Penjualan,
Persediaan, Manufaktur, Kas & Bank) masih di-pending, urutan berikutnya
ditentukan user setelah melihat hasil fase ini.
