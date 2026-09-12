# Fase 107 — Migrasi Skema Data Usaha + Scoping Backend

**Status:** Done
**Mulai:** 2026-09-11
**Selesai:** 2026-09-11

## Tujuan
Fase kedua dari `docs/architecture/architecture-user-tambahan.md` (§ Fase
B0) — bagian PALING BERISIKO dari seluruh rencana (migrasi skema +
backfill data yang sudah ada). Dikerjakan di branch lokal
`feature/data-usaha-restructure`, **TIDAK di-push**. Tabel `data_usaha`
baru + kolom `subscriptions.dataUsahaId`, plus backfill supaya
subscription/koneksi Accurate yang SUDAH ADA tidak kehilangan akses.

**Digabung dengan Fase B1 (Backend Scoping)** — lihat § "Keputusan Kecil"
soal alasan penggabungan.

## Scope
- [x] `apps/api/src/db/schema/data-usaha.schema.ts` (BARU) — tabel
      `data_usaha`.
- [x] `apps/api/src/db/schema/subscription.schema.ts` — kolom
      `dataUsahaId` (NULLABLE dulu, strategi 2-tahap).
- [x] `apps/api/src/db/schema/payment.schema.ts` — kolom
      `orders.dataUsahaId` (nullable PERMANEN, lihat § Keputusan Kecil).
- [x] `apps/api/src/db/schema/index.ts` — export file baru.
- [x] Generate + apply migration Drizzle (0019 nullable, 0021 orders).
- [x] Skrip backfill (`scripts/backfill-data-usaha.ts`) — 1 `data_usaha`
      per `accurate_connections` unik per user (nama dari
      `accurateDbAlias`), + 1 "Data Usaha Utama" default untuk user yang
      punya subscription TANPA koneksi Accurate sama sekali.
  - [x] Jalankan backfill di dev DB, verifikasi manual.
- [x] Migration KEDUA (0020) — kunci `dataUsahaId` jadi NOT NULL setelah
      backfill terverifikasi 100% (tidak ada baris NULL tersisa).
- [ ] ~~Test: `data-usaha-backfill.test.ts`~~ — DIBATALKAN, lihat §
      "Keputusan Kecil".
- [x] Typecheck + security review.

### Scope TAMBAHAN (ditarik maju dari Fase B1, lihat § Keputusan Kecil)
- [x] `subscriptions.route.ts` (`checkout`, `trial`) — body wajib
      `dataUsahaId`, semua guard modul-aktif di-scope per Data Usaha.
- [x] `admin/users.route.ts`, `admin/invoices.route.ts`,
      `admin/subscriptions.route.ts`, `admin/orders.route.ts` — resolve
      `dataUsahaId` (default/explicit) sebelum insert subscription/order.
- [x] `lib/trial.ts`, `lib/manual-subscription.ts`, `lib/invoice-order.ts`
      — signature tambah `dataUsahaId` wajib.
- [x] `lib/data-usaha.ts` (BARU) — `getOrCreateDefaultDataUsaha`,
      `ownsDataUsaha`.
- [x] `lib/test-fixtures.ts` (BARU) — `createTestDataUsaha`, dipakai di
      19 test file yang kena breaking change skema.
- [x] `me.route.ts` — `GET /me/data-usaha/default` (BARU, jembatan
      sementara, lihat § Keputusan Kecil).
- [x] `apps/web` `subscribe/page.tsx` — checkout/trial kirim
      `dataUsahaId` (hasil endpoint jembatan di atas).

## Referensi
- `docs/architecture/architecture-user-tambahan.md` § Fase B0/B1, §
  "Migrasi data lama".

## Keputusan Kecil Selama Eksekusi
- **Fase B0+B1 digabung jadi 1 fase/commit.** Alasan: begitu
  `subscriptions.dataUsahaId` dikunci NOT NULL (langkah WAJIB di B0
  sendiri), SELURUH kode yang insert `subscriptions` (4 file aplikasi +
  19 test file) langsung gagal compile. Membiarkan build merah sampai
  fase B1 "resmi" dimulai melanggar instruksi "selalu cek eror" — jadi
  wiring backend (checkout/trial/admin routes) ditarik maju dan
  dikerjakan dalam sesi yang sama, didokumentasikan di sini sebagai scope
  tambahan (bukan diam-diam).
- **`data-usaha-backfill.test.ts` DIBATALKAN** (bukan lupa/ditunda).
  Fungsi `backfillDataUsaha()` cuma bermakna pada state "subscription
  dengan `dataUsahaId` NULL" — state itu TIDAK BISA lagi direproduksi di
  test setelah migrasi 0020 mengunci kolom jadi NOT NULL (constraint DB
  menolak insert apa pun, ORM atau raw SQL, yang coba taruh NULL di sana).
  Menulis test untuk fungsi ini sekarang akan jadi vacuous (tidak pernah
  ketemu baris yang perlu di-backfill) — tidak ada nilai verifikasi
  nyata. Verifikasi SUDAH dilakukan manual saat eksekusi: dry-run
  (`{dataUsahaCreatedFromConnections: 59, dataUsahaCreatedAsDefault: 687,
  subscriptionsUpdated: 0}`) lalu run sungguhan
  (`subscriptionsUpdated: 758`), dikonfirmasi via query SQL langsung: 0
  baris `dataUsahaId` NULL tersisa, 0 `data_usaha` duplikat per
  `accurateConnectionId`, 746 total baris `data_usaha`. Skrip backfill
  TETAP disimpan di `scripts/` (dokumentasi historis + referensi kalau
  pola serupa dibutuhkan migrasi lain), tapi tidak akan dijalankan lagi
  terhadap DB ini.
- **`orders.dataUsahaId` nullable PERMANEN** (beda dari
  `subscriptions.dataUsahaId` yang 2-tahap ke NOT NULL) — order adalah
  record transaksi historis, memaksa backfill+NOT NULL dianggap risiko
  yang tidak perlu. Kode yang butuh `dataUsahaId` dari order (confirm
  flow) pakai fallback `lockedOrder.dataUsahaId ??
  getOrCreateDefaultDataUsaha(...)` di read-time.
- **`GET /me/data-usaha/default` (BARU, di `me.route.ts`) adalah
  JEMBATAN SEMENTARA**, bukan bagian permanen arsitektur. Frontend
  `/subscribe` butuh SATU `dataUsahaId` untuk dikirim ke
  checkout/trial SEKARANG (kolom DB sudah NOT NULL), tapi UI picker
  "Pilih Data Usaha" baru ada di Fase 109. Endpoint ini reuse
  `getOrCreateDefaultDataUsaha` — aman karena SEMUA user (existing via
  backfill, maupun baru) saat ini cuma punya 1 Data Usaha implisit.
  **WAJIB dihapus/diganti** begitu Fase 109 (picker UI) selesai —
  dicatat juga di Known Limitations.
- Test `admin/orders.route.test.ts` (skenario supersede trial) — baris
  trial lama WAJIB dibuat dengan `dataUsahaId` hasil
  `getOrCreateDefaultDataUsaha(customerId)` yang SAMA dengan yang akan
  di-resolve endpoint confirm (karena order test tidak set
  `dataUsahaId` eksplisit) — kalau tidak, query supersede-trial
  (di-scope per Data Usaha sejak fase ini) tidak akan menemukan baris
  trial lama tersebut.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`apps/api` + `apps/web`)
- [x] Security review dijalankan (lihat § Ringkasan Hasil)
- [x] **Verifikasi WAJIB**: 0 subscription dengan `dataUsahaId` NULL
      setelah backfill; 0 `data_usaha` duplikat untuk `accurateConnectionId`
      yang sama. — terverifikasi saat backfill (lihat Keputusan Kecil).
- [x] `docs/PROGRESS.md` diupdate
- [x] **TIDAK push**

## Known Limitations
- `GET /me/data-usaha/default` (jembatan frontend) harus dihapus/diganti
  begitu Fase 109 (picker UI "Pilih Data Usaha") selesai — saat ini
  SEMUA checkout/trial dari `/subscribe` diam-diam pakai Data Usaha
  default user, TIDAK ada pilihan (benar untuk kondisi sekarang — user
  cuma punya 1 Data Usaha implisit — tapi akan jadi bug begitu user bisa
  punya >1 Data Usaha).
- `admin/subscriptions.route.ts` (`POST /admin/subscriptions`) dan
  `admin/orders.route.ts` (`POST /:id/confirm`) masih resolve
  `dataUsahaId` via default-fallback kalau tidak dikirim eksplisit —
  belum ada UI admin untuk pilih Data Usaha spesifik (menyusul Fase
  109/110, sudah dicatat sebagai komentar `§ Fase 108` di kode).
- `orders.dataUsahaId` TETAP nullable selamanya (keputusan sadar, bukan
  technical debt) — order historis tanpa `dataUsahaId` akan selalu
  fallback ke `getOrCreateDefaultDataUsaha` di read-time.

## Ringkasan Hasil
- Tabel `data_usaha` baru (`userId`, `name`,
  `accurateConnectionId` nullable unique) — representasi "workspace
  perusahaan" terpisah dari `accurate_connections` (OAuth), mengikuti
  model Accurate Online sendiri.
- `subscriptions.dataUsahaId` NOT NULL (migrasi 2-tahap: nullable →
  backfill → NOT NULL), `orders.dataUsahaId` nullable permanen.
- Backfill dijalankan & diverifikasi: 746 `data_usaha` dibuat (59 dari
  koneksi Accurate existing, 687 default), 758 subscription di-update,
  0 baris NULL tersisa, 0 duplikat.
- Checkout, trial, dan SEMUA jalur admin yang bikin subscription/order
  baru sekarang Data-Usaha-aware — termasuk pelonggaran invariant lama
  "1 modul aktif = 1 subscription per user" menjadi "per Data Usaha"
  (prasyarat multi-instance modul, Fase 109+).
- `bun run typecheck`: 0 error (api + web).
- `bun run test`: 666 pass/0 fail (api), 57 pass/0 fail (web) — 19 file
  test diperbaiki (breaking change `dataUsahaId` NOT NULL +
  checkout/trial body wajib), pakai helper baru `createTestDataUsaha`.
- Security review (skill `security-review`, fokus endpoint
  checkout/trial + jalur admin yang resolve `dataUsahaId`): 1 temuan
  (authorization) — `POST /admin/subscriptions` menerima `dataUsahaId`
  dari body admin TANPA validasi itu benar milik `body.userId` target,
  berisiko admin (sengaja/keliru) menempelkan subscription user A ke
  Data Usaha milik user B. **Diperbaiki** — ditambah
  `ownsDataUsaha(body.userId, body.dataUsahaId)` sebelum dipakai,
  konsisten pola guard checkout/trial. Endpoint checkout/trial customer
  sendiri sudah benar sejak ditulis (ownership check di baris pertama
  handler, sebelum efek samping apa pun). `GET /me/data-usaha/default`
  aman — `dataUsahaId` selalu derive dari `user.id` sesi, tidak ada
  parameter yang bisa di-inject dari luar.
- DB dev (shared) dibersihkan setelah test run — 357 baris test (user +
  turunannya, scoped tepat ke window timestamp run ini) dihapus, tidak
  menyentuh cluster test run sesi lain yang kebetulan jalan bersamaan.
