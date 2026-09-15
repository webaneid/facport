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
   (gap lebih parah dari dugaan) — **DIPERBAIKI fase ini**.
3. **Akun utama lihat semua riwayat upload timnya** — ⚠️ TIDAK KONSISTEN.
   Riwayat per-modul (`GET /{modul}/import`) sudah benar (scoped
   `subscriptionId`, otomatis mencakup semua uploader). Arsip gabungan
   (`GET /me/import-batches`, dipakai dashboard + `/import/arsip`)
   di-scope `userId` (siapa yang login), BUKAN semua orang di Data
   Usaha — owner tidak lihat upload member di situ. **BELUM diperbaiki
   fase ini** (di luar scope permintaan eksplisit user — user minta
   lanjut poin 2 dulu) — dicatat di Known Limitations.

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

## Known Limitations
- **Poin 3 dari audit BELUM diperbaiki** (`GET /me/import-batches`,
  dipakai dashboard + `/import/arsip`, di-scope `userId` bukan semua
  orang di Data Usaha) — user secara eksplisit minta prioritaskan poin
  2 dulu di pesan ini. Perlu fase terpisah: ganti filter jadi union
  owner+semua member Data Usaha itu, mirror pola `subscriptionId` yang
  sudah benar di endpoint per-modul (`GET /{modul}/import`).
- Fix ini HANYA endpoint DELETE (hapus riwayat lokal). Tidak ada
  endpoint lain (edit-row/edit-bulk/retry) yang perlu ownership
  serupa — endpoint-endpoint itu memang didesain bisa dipakai siapa pun
  yang punya akses modul (member termasuk), cuma DELETE yang perlu
  dibatasi ke pemilik karena sifatnya destruktif/permanen & lintas-user
  dalam 1 Data Usaha.

## Ringkasan Hasil
Audit arsitektur akun utama/tambahan (fork subagent, read-only)
menemukan gap privilege escalation nyata: member bisa hapus batch
import SIAPA SAJA di Data Usaha yang dia numpang, bukan cuma tidak bisa
hapus miliknya sendiri. Diperbaiki di 12 modul import sekaligus dengan
1 baris check konsisten (`ownsDataUsaha`, fungsi yang sudah dipakai
endpoint sensitif lain) — 14 test baru (12 test fix + 2 test regresi
untuk modul yang sebelumnya tidak punya test DELETE). Poin 1 (beli
produk/tambah akun owner-only) dan verifikasi menu Berlangganan/Tambah
Anggota (owner-only per konteks Data Usaha AKTIF, bukan flag global)
dikonfirmasi SUDAH BENAR tanpa perlu perubahan kode. Poin 3 (arsip
gabungan tidak tampilkan upload member) dicatat sebagai known
limitation, fase terpisah kalau user mau diperbaiki juga.
