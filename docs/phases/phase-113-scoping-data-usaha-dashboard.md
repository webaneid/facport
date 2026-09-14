# Fase 113 — Scoping Data Usaha di Dashboard, Arsip Import, & Koneksi Accurate

**Status:** Done
**Mulai:** 2026-09-14
**Selesai:** 2026-09-14

## Tujuan
User melapor: setelah restrukturisasi multi-Data-Usaha (Fase 106-111),
dashboard pelanggan (`/app`) masih menampilkan info "umum" — koneksi
Accurate dan langganan tidak spesifik ke Data Usaha yang sedang aktif
dipilih di gerbang `/app/pilih-usaha`. Audit membuktikan ini bug nyata, dan
lebih luas dari dugaan awal: Dashboard, Arsip Import, dan Koneksi Accurate
semuanya dibuat SEBELUM restrukturisasi Fase 106+ dan tidak pernah
di-retrofit ke pola scoping Data Usaha yang sudah ada (dipakai benar di
`(protected)/layout.tsx`, `/app/team`, `/app/subscribe` sejak Fase 109-111).

## Scope
- [x] Backend `GET /me/subscriptions` — tambah query param `dataUsahaId`
      opsional, filter hasil kalau diisi.
- [x] Backend `GET /accurate/subscriptions` — tambah query param
      `dataUsahaId` opsional, filter hasil kalau diisi.
- [x] Backend `GET /accurate/connections` — tambah query param
      `dataUsahaId` WAJIB, filter via join ke `subscriptions` + guard akses
      eksplisit `hasAccessToDataUsaha` (ditambah pasca security review).
- [x] Backend `GET /me/stats` — tambah query param `dataUsahaId` WAJIB,
      filter via join `importBatches` → `subscriptions` + guard akses
      eksplisit `hasAccessToDataUsaha`.
- [x] Backend `GET /me/import-batches` — tambah query param `dataUsahaId`
      WAJIB, filter via join yang sama (batches DAN total count) + guard
      akses eksplisit `hasAccessToDataUsaha`.
- [x] Frontend `app/app/(protected)/page.tsx` (Dashboard) — baca cookie
      Data Usaha aktif, teruskan ke 4 fetch call.
- [x] Frontend `app/app/(protected)/accurate/page.tsx` — pecah jadi Server
      Component (baca cookie) + Client Component
      `components/accurate/accurate-connections-form.tsx`.
- [x] Frontend `app/app/(protected)/import/arsip/page.tsx` — pecah jadi
      Server Component (baca cookie) + Client Component
      `components/import-archive/import-archive-view.tsx`.
- [x] Update `docs/architecture/architecture-user-tambahan.md` § Fase B2.
- [x] Typecheck 0 error.
- [x] Security review (subagent `security-auditor`, fokus IDOR pada filter
      baru) — 1 Medium + 1 Low ditemukan, keduanya DIPERBAIKI langsung.
- [x] Test baru: user 2 Data Usaha, tiap endpoint cuma balikin data yang
      diminta + test skenario mantan pemilik/seat di-revoke (dari temuan
      security review).

## Referensi
- Architecture doc: `docs/architecture/architecture-user-tambahan.md` § Fase B2
- Plan lengkap (riset & rasional): `/Users/webane/.claude/plans/polymorphic-dazzling-engelbart.md`

## Keputusan Kecil Selama Eksekusi
- `dataUsahaId` OPSIONAL di `/me/subscriptions` & `/accurate/subscriptions`
  (ada pemanggil existing — `layout.tsx`, `subscribe-form.tsx` — yang
  butuh union tanpa filter, JANGAN diubah). WAJIB di `/me/stats`,
  `/me/import-batches`, `/accurate/connections` karena cuma 1 pemanggil
  masing-masing dan semuanya sedang diperbaiki di fase ini — wajib lebih
  aman daripada default diam-diam tampil semua kalau lupa dikirim.
- **KEPUTUSAN AWAL DIKOREKSI security review**: rencana awal fase ini
  bilang "tidak perlu `ownsDataUsaha` tambahan di endpoint yang di-JOIN,
  base query sudah `userId`-scoped jadi filter `dataUsahaId` cuma
  mempersempit". Ini TERBUKTI SALAH untuk 3 endpoint (`/me/stats`,
  `/me/import-batches`, `/accurate/connections`) karena kolom `userId`
  yang dipakai (`importBatches.userId`, `accurateConnections.userId`)
  DIBEKUKAN ke pelaku asli — TIDAK ikut berubah saat kepemilikan Data
  Usaha ditransfer (`lib/ownership-transfer.ts`) atau seat di-revoke.
  Mantan pemilik/member yang sudah kehilangan akses tapi masih ingat
  `dataUsahaId` bisa panggil endpoint API langsung (bypass gate
  `layout.tsx`) dan tetap dapat datanya. **Fix**: helper baru
  `hasAccessToDataUsaha(userId, dataUsahaId)` (`lib/data-usaha.ts`) — cek
  pemilik SEKARANG ATAU member seat AKTIF SEKARANG — dipanggil di awal
  ketiga handler, 404 `DATA_USAHA_NOT_FOUND` kalau gagal. `/me/subscriptions`
  & `/accurate/subscriptions` TIDAK butuh fix ini — keduanya filter
  SETELAH `getAccessibleSubscriptionsWithPlans()` yang sudah baca akses
  SAAT INI (bukan kolom beku), jadi memang aman dari awal.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review dijalankan (skill `security-review` atau subagent `security-auditor`)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — 0 Critical/High
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda — TIDAK ditunda, keduanya langsung diperbaiki
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- **Billing/Tagihan** (`/app/billing`) SENGAJA tidak di-scope per Data Usaha
  di fase ini (invoice tetap filter `userId` saja) — `orders.dataUsahaId`
  sebenarnya ada di skema kalau suatu saat mau discope juga, tapi ini
  keputusan produk terpisah (invoice = riwayat pembayaran akun vs data
  operasional per company), bukan bug yang sama kelasnya, dan tidak diminta
  user. Diflag untuk keputusan terpisah nanti.
- Validasi cross-Data-Usaha di `POST /accurate/reuse` (apakah subscription
  target & connection yang di-reuse harus Data-Usaha-sama) TIDAK dibahas
  fase ini — itu soal otorisasi mutasi, bukan scoping tampilan (scope fase
  ini murni READ endpoints).
- `hasAccessToDataUsaha` BELUM dipasang di endpoint lama manapun di luar
  scope fase ini (mis. tidak diaudit ulang apakah ada endpoint lama lain
  yang punya pola serupa "filter userId doang, kolomnya beku"). Kalau
  nanti ketemu pola sama di endpoint lain, reuse helper ini.

## Ringkasan Hasil
Root cause: Dashboard (`/app`), Arsip Import (`/app/import/arsip`), dan
Koneksi Accurate (`/app/accurate`) dibuat sebelum restrukturisasi
multi-Data-Usaha (Fase 106-111) dan tidak pernah di-retrofit — beda dari
`/app/team`/`/app/subscribe` yang dibangun setelah pola scoping ada. Semua
endpoint backend terkait (`GET /me/subscriptions`, `GET /accurate/subscriptions`,
`GET /accurate/connections`, `GET /me/stats`, `GET /me/import-batches`)
sekarang menerima `dataUsahaId` (opsional untuk 2 endpoint yang punya
pemanggil existing yang butuh union, wajib untuk 3 lainnya) dan
benar-benar memfilter hasilnya. Frontend: Dashboard (sudah Server
Component) langsung baca cookie; Koneksi Accurate & Arsip Import (dulu
Client Component penuh) dipecah jadi Server Component tipis + Client
Component, pola persis `team/page.tsx`.

Security review subagent menemukan 1 Medium (3 endpoint baru rentan
terhadap mantan pemilik/member yang kehilangan akses tapi masih ingat
`dataUsahaId`, karena kolom `userId` yang dipakai dibekukan — TIDAK
divalidasi ulang terhadap akses SAAT INI) dan 1 Low (query string dashboard
tidak di-`encodeURIComponent`) — keduanya diperbaiki langsung di fase ini
(bukan ditunda), termasuk helper baru `hasAccessToDataUsaha` +
test regresi khusus skenario ownership-transfer & seat-revoked.

Typecheck 0 error (apps/api & apps/web), lint 0 error, test suite 753
pass/0 fail (21 baru — termasuk test unit `hasAccessToDataUsaha` dan test
regresi skenario keamanan). Satu test pre-existing (`POST /accurate/connect
> 503 ACCURATE_NOT_CONFIGURED`) gagal kalau file test itu dijalankan
sendirian (`bun test <file>`) karena `.env` lokal environment ini sekarang
punya `ACCURATE_CLIENT_ID` terisi — TIDAK terkait perubahan fase ini
(dikonfirmasi via `git stash` sebelum eksekusi dimulai), dan tidak gagal
sama sekali lewat `bun run test` (script resmi project).

**Verifikasi visual browser belum dilakukan** sesi ini — direkomendasikan
cek manual: login, buat/pakai 2 Data Usaha berbeda dengan
subscription/koneksi/riwayat import berbeda, pindah lewat `/pilih-usaha`,
konfirmasi dashboard/arsip/koneksi cuma tampilkan data Data Usaha aktif
setiap kali pindah.
