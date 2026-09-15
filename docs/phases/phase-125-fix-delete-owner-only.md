# Fase 125 — Fix: Hapus Riwayat Import HANYA Pemilik Data Usaha (bukan Sekadar Subscription Sama)

**Status:** Done
**Mulai:** 2026-09-15
**Selesai:** 2026-09-15

## Tujuan
User minta audit arsitektur hierarki "akun utama" (owner) vs "akun
tambahan" (member/seat) terhadap 3 ekspektasi konkret. Audit (fork
subagent, read-only) menemukan **celah privilege escalation nyata** di
poin 2: endpoint DELETE `/*/import/:batchId` di SEMUA 12 modul import
cuma cek `batch.subscriptionId === subscription.id` — TIDAK cek siapa
pemilik Data Usaha SEBENARNYA. Akibatnya SIAPA PUN yang punya akses
(owner ATAU member seat manapun) bisa hapus batch import SIAPA SAJA di
Data Usaha yang sama, bukan cuma "tidak bisa hapus miliknya sendiri"
seperti dugaan awal user — gap-nya lebih serius dari yang diminta
diperbaiki.

## Hasil Audit (3 poin, sebelum fix)
1. **Beli produk & tambah akun lain HANYA akun utama** — ✅ SESUAI.
   Checkout (`subscriptions.route.ts:82`) dan invite seat
   (`team.route.ts`) sama-sama pakai `ownsDataUsaha(user.id, dataUsahaId)`.
2. **Akun tambahan tidak bisa delete hasil upload** — ❌ TIDAK SESUAI
   (gap lebih parah dari dugaan) — **DIPERBAIKI**.
3. **Akun utama lihat semua riwayat upload timnya** — ⚠️ TIDAK KONSISTEN
   (Riwayat per-modul sudah benar, Arsip gabungan belum) — **DIPERBAIKI**
   (lihat § "Update — Poin 3" di bawah).

## Verifikasi Tambahan (diminta user, dikonfirmasi TANPA perlu kode baru)
User minta pastikan menu Berlangganan/Tambah Anggota tidak muncul untuk
konteks akun tambahan, DAN klarifikasi bahwa role owner/member itu
**per-Data-Usaha** (bukan flag global 1 user) — member di Data Usaha A
bisa jadi akun utama di Data Usaha B miliknya sendiri. **Sudah benar
sejak awal, tidak perlu perubahan**:
- `sidebar.tsx` grup "Langganan" (isi: Koneksi Accurate, Tagihan,
  Berlangganan, Kelola Tim) sudah `ownerOnly: true` — disembunyikan
  total kalau `isDataUsahaOwner === false`.
- `isDataUsahaOwner` dihitung per KONTEKS AKTIF (`layout.tsx:84`,
  `activeDataUsaha.isOwner` dari `GET /me/data-usaha`), BUKAN flag
  global — `GET /me/data-usaha` (`me.route.ts:70-105`) union Data Usaha
  yang DIMILIKI (`isOwner:true`) + Data Usaha tempat user py seat aktif
  (`isOwner:false`), per-baris independen. Ganti "Data Usaha aktif" via
  sidebar otomatis menghitung ulang `isDataUsahaOwner` untuk konteks
  yang baru — persis skenario user (Budi member di B, tapi owner penuh
  di A miliknya sendiri).
- Tidak ada CTA "Tambah User"/"Berlangganan" lain di luar sidebar yang
  bocor tanpa gate (diverifikasi grep, tidak ada match di luar
  `sidebar.tsx` dan halaman invite/team/subscribe itu sendiri).

## Scope (Fix)
- [x] `apps/api/src/routes/{12 modul}-import.route.ts` — tambah cek
      `ownsDataUsaha(user.id, subscription.dataUsahaId)` di endpoint
      DELETE, SEBELUM audit log + delete actual. Kode 403
      `DELETE_OWNER_ONLY` kalau bukan pemilik.
- [x] `apps/api/src/routes/{12 modul}-import.route.test.ts` — test baru
      "403 DELETE_OWNER_ONLY kalau member" di semua 12 file. 2 modul
      (purchase-invoice, sales-invoice) SEBELUMNYA tidak punya test
      DELETE sama sekali (gap coverage lama, ditemukan saat fase ini)
      — ditambah describe block baru + test regresi "owner tetap bisa
      hapus".

## Keputusan Kecil Selama Eksekusi
- `ownsDataUsaha` (bukan fungsi baru) dipilih karena SUDAH jadi sumber
  kebenaran kepemilikan Data Usaha di 2 endpoint sensitif lain
  (checkout, invite) — reuse, bukan reimplementasi, menghindari 2
  definisi "pemilik" yang bisa divergen.
- Kode error `DELETE_OWNER_ONLY` (403) dipilih daripada 404 — batch-nya
  memang ADA dan member memang punya akses BACA ke Data Usaha itu
  (lewat `moduleAccess`), jadi 403 (otorisasi ditolak) lebih akurat
  daripada 404 (seolah-olah tidak ada).
- Test member butuh role `customer` di-assign eksplisit (bukan cuma
  seat aktif) — ditemukan saat test pertama gagal parse JSON (403 tanpa
  body dari `permission` macro, BEDA dari 403 `DELETE_OWNER_ONLY` yang
  py body) — `permission: "import.create"` dicek LEBIH DULU dari
  `moduleAccess`/ownership, member tanpa role `customer` tidak akan
  pernah sampai ke check yang baru ditambah ini.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — api+web, 0 error
- [x] Security review dijalankan — 0 temuan, verifikasi eksplisit:
      konsistensi `ownsDataUsaha` lintas endpoint, penempatan check
      SEBELUM audit log/delete di semua 12 file, tidak ada file
      terlewat, regresi owner tetap 200
- [x] Temuan Critical/High sudah diperbaiki — YA, ini fase itu sendiri
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau
      ditunda — poin 3 (arsip gabungan) dicatat sebagai Known Limitation
- [x] `docs/PROGRESS.md` diupdate

## Update — Poin 3 (2026-09-15, lanjutan sesi yang sama)
User minta lanjut poin 3 setelah poin 2 selesai. Fix:

- **Backend** (`apps/api/src/routes/me.route.ts`, `GET /me/import-batches`):
  drop filter `importBatches.userId === user.id`, ganti MURNI
  `subscriptions.dataUsahaId === query.dataUsahaId` — konsisten pola
  riwayat per-modul yang sudah benar sejak awal. Akses TETAP digerbang
  `hasAccessToDataUsaha` (owner ATAU member aktif) di awal handler,
  tidak berubah. Response tambah `uploadedByName` (JOIN eksplisit ke
  `user.name` saja, bukan select *) dan `uploadedByYou` per baris.
- **Test baru** (`me.route.test.ts`): 1 test simetris — owner lihat
  upload member, member lihat upload owner + member lain, `uploadedByYou`
  benar dari kedua sudut pandang. 1 test lama di-rename (judulnya
  sebelumnya menyiratkan filter per-user, padahal sebenarnya soal
  Data-Usaha-scoping — tetap valid, cuma nama diperjelas).
- **Frontend** (`import-batch-table.tsx` + 2 pemanggil — dashboard
  `page.tsx`, `import/arsip/page.tsx`): tambah kolom "Diupload oleh",
  DAN gating tombol Delete ke `isDataUsahaOwner` (murni kosmetik,
  backend `DELETE_OWNER_ONLY` dari fix poin 2 di atas tetap satu-satunya
  gerbang sesungguhnya) — supaya member yang sekarang lihat upload orang
  lain TIDAK disodori tombol Delete yang bakal 403 kalau diklik. Copy
  teks disesuaikan ("...dari semua fitur dan anggota tim" utk owner).
- Security review lanjutan: 0 temuan (verifikasi eksplisit: query tetap
  ter-scope `dataUsahaId`, SELECT eksplisit tidak bocorkan field
  sensitif, UI-gating tidak diperlakukan sebagai boundary keamanan).

## Update — 12 Halaman Riwayat Per-Modul (2026-09-15, lanjutan sesi yang sama)
User minta beresin juga 12 halaman Riwayat per-modul yang sebelumnya
dicatat sebagai Known Limitation (tombol Delete tidak ter-gating owner
di halaman itu, meski backend sudah benar). Fix:

- **Baru** `apps/web/lib/use-data-usaha-owner.tsx` — Context/hook
  `DataUsahaOwnerProvider`/`useIsDataUsahaOwner()`. BEDA dari
  `PermissionsProvider` (`use-permissions.tsx`) yang fetch sendiri via
  `useEffect` — di sini TIDAK ADA fetch ulang sama sekali, cuma
  expose ulang nilai `isDataUsahaOwner` yang SUDAH dihitung server-side
  di `layout.tsx` (§ Update Poin 3 di atas) lewat Context, supaya Client
  Component mana pun di bawah `AppShell` bisa baca tanpa prop-drilling
  atau `GET /me/data-usaha` berulang per halaman. Default context `true`
  (konsisten konvensi "assume owner kecuali eksplisit false" yang sudah
  dipakai `ImportBatchTable`).
- `apps/web/components/app-shell/app-shell.tsx` — dibungkus
  `<DataUsahaOwnerProvider isOwner={isDataUsahaOwner ?? true}>` (nested
  di dalam `<PermissionsProvider>`, mount sekali untuk semua halaman
  di bawah App Shell).
- Semua 12 `{modul}/import/riwayat/page.tsx` — tambah
  `const isOwner = useIsDataUsahaOwner();`, tombol Delete sekarang
  `{isOwner && !DELETE_BLOCKED_BATCH_STATUS.has(batch.status) && (...)}`
  (prefix `isOwner &&` ditambah ke kondisi render yang sudah ada,
  murni kosmetik — backend `DELETE_OWNER_ONLY` dari fix poin 2 TETAP
  satu-satunya gerbang sesungguhnya).
- **Verifikasi browser** (bukan cuma typecheck/lint): seed Data Usaha +
  subscription + 1 import batch untuk user owner baru, plus 1 member
  seat aktif untuk user kedua, langsung di dev DB (data QA, sudah
  dibersihkan lagi setelah verifikasi). Login sebagai owner →
  `/purchase-order/import/riwayat` tampilkan tombol Delete (ikon
  sampah) di kolom Aksi. Login sebagai member (Data Usaha sama) →
  halaman yang SAMA cuma tampilkan tombol Detail (ikon mata), tombol
  Delete hilang — DAN grup sidebar "Langganan" (Kelola Tim,
  Berlangganan, dst) ikut hilang seperti yang sudah dikonfirmasi § Fase
  125 poin 1, mengonfirmasi provider baru ini tidak merusak gating yang
  sudah ada.
- `bun run typecheck` (api+web) — 0 error. `bun run lint` (web) — 0
  error. Tidak ada file backend yang berubah di update ini (murni
  frontend), jadi tidak ada regresi test backend untuk dicek ulang.

## Known Limitations
- Fix DELETE (poin 2) HANYA endpoint DELETE (hapus riwayat lokal).
  Endpoint lain (edit-row/edit-bulk/retry/cancel) TETAP bisa dipakai
  member (didesain begitu — cuma DELETE yang dibatasi karena sifatnya
  destruktif/permanen & lintas-user dalam 1 Data Usaha).

## Ringkasan Hasil
Audit arsitektur akun utama/tambahan (fork subagent, read-only)
menemukan gap privilege escalation nyata di poin 2: member bisa hapus
batch import SIAPA SAJA di Data Usaha yang dia numpang. Diperbaiki di
12 modul import sekaligus dengan 1 baris check konsisten (`ownsDataUsaha`,
fungsi yang sudah dipakai endpoint sensitif lain) — 14 test baru.

Poin 3 (arsip gabungan tidak tampilkan upload anggota tim) JUGA
diperbaiki dalam sesi yang sama: drop filter per-user di
`GET /me/import-batches`, tambah info "diupload oleh", dan gating UI
tombol Delete supaya konsisten dengan fix poin 2. Poin 1 (beli
produk/tambah akun owner-only) dan menu Berlangganan/Tambah Anggota
(owner-only per konteks Data Usaha AKTIF, bukan flag global — member di
1 Data Usaha bisa jadi owner penuh di Data Usaha lain miliknya sendiri)
dikonfirmasi SUDAH BENAR tanpa perlu perubahan kode. Ketiga poin audit
user SELESAI ditindaklanjuti.

Follow-up terakhir: 12 halaman Riwayat per-modul (Known Limitation di
atas) juga dibereskan — Context baru `use-data-usaha-owner.tsx` supaya
tombol Delete konsisten ter-gating di SEMUA tempat (Arsip gabungan,
dashboard, dan 12 halaman per-modul), diverifikasi langsung di browser
(bukan cuma typecheck) dengan skenario owner vs member nyata.
