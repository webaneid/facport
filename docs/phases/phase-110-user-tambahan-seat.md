# Fase 110 — User Tambahan (Seat) + Invite

**Status:** Done
**Mulai:** 2026-09-11
**Selesai:** 2026-09-11

## Tujuan
Fase terakhir (utama) dari `docs/architecture/architecture-user-tambahan.md`
— user utama beli slot "user tambahan" (seat), undang orang lain lewat email,
orang itu login sendiri (password atau Google) dan otomatis dapat akses ke
SATU Data Usaha yang seat-nya terkunci ke situ (semua fitur aktif Data Usaha
itu, bukan granular per-modul — model dikonfirmasi client). Termasuk
perbaikan pondasi gating akses (`subscription-gate.ts`) yang WAJIB dibetulkan
sekarang supaya Fase 111 (transfer kepemilikan) otomatis benar tanpa migrasi
ulang. Lihat rencana lengkap yang sudah disetujui di
`/Users/webane/.claude/plans/sorted-inventing-volcano.md`.

## Scope
- [x] Migrasi: `plans.kind`, tabel `member_seats`.
- [x] `lib/subscription-gate.ts` — pecah jadi `getOwnedSubscriptionsWithPlans`
      (otorisasi/mutasi) + `getAccessibleSubscriptionsWithPlans` (akses/
      tampilan, union kepemilikan + seat aktif). Audit ulang 4 caller lama.
- [x] Aktivasi seat otomatis di titik konfirmasi order & manual-subscription.
- [x] Guard: seat_addon tidak boleh lewat trial.
- [x] `routes/team.route.ts` (BARU) — list/invite/resend/revoke seat.
- [x] `routes/invites.route.ts` (BARU, publik, rate-limited) — preview +
      accept invite (password path) + accept-existing (akun sudah ada).
- [x] Google OAuth auto-link invite pending (`databaseHooks.user.create.after`).
- [x] Cek guard `DUPLICATE_MODULE_IN_CART` tidak salah blokir seat_addon x N.
- [x] Invoice/PDF: grouping baris identik saat render.
- [x] Frontend minimal: halaman "Kelola Tim" + halaman publik `/invite/[token]`
      + sidebar sembunyikan menu billing untuk akun member-only.
- [x] Test: subscription-gate union, invite accept 2 jalur, revoke cabut
      sesi, seat reassignment, regression member-tidak-bisa-connect-accurate.
- [x] ADR `docs/decisions/adr-0032-model-seat-user-tambahan.md`.
- [x] Typecheck + security review.

## Referensi
- `docs/architecture/architecture-user-tambahan.md`
- Plan disetujui: `/Users/webane/.claude/plans/sorted-inventing-volcano.md`
- `docs/decisions/adr-0032-model-seat-user-tambahan.md`

## Keputusan Kecil Selama Eksekusi

1. **Owned vs Accessible split** — ditemukan saat planning (bukan asumsi):
   `subscriptions.userId` dibekukan saat checkout, sedangkan `data_usaha.userId`
   didesain mutable (Fase 111). Gating akses SEKARANG baca kepemilikan Data
   Usaha saat ini via subquery ke `data_usaha`, bukan `subscriptions.userId`
   langsung — supaya Fase 111 tidak perlu migrasi ulang logic akses.
   `getActiveSubscriptionsWithPlans` lama dipecah jadi
   `getOwnedSubscriptionsWithPlans` (otorisasi/mutasi — checkout, trial,
   `accurate.route.ts` connect/reuse) dan `getAccessibleSubscriptionsWithPlans`
   (akses/tampilan — union kepemilikan + seat aktif; dipakai `moduleAccess`
   macro, `/me/subscriptions`, `GET /accurate/subscriptions`). Alasan detail
   dan risiko privilege-escalation yang dicegah → ADR-0032.
2. **Bug supersede-cancel untuk `seat_addon`** — ditemukan lewat code
   reading, dikonfirmasi lewat regression test: `admin/orders.route.ts` dan
   `admin/subscriptions.route.ts` menghitung `moduleKey = plan.modules[0]`
   lalu membatalkan subscription lain dengan `modules[0] === moduleKey` —
   untuk `seat_addon` (`modules: []`), `moduleKey` jadi `undefined` dan
   cocok dengan SEMUA subscription `seat_addon` lain yang aktif, membatalkan
   seat yang seharusnya tetap hidup. Fix: bungkus loop supersede dengan
   `if (moduleKey) { ... }` di kedua file.
3. **Sentinel `invoiceItems.moduleKey`** — kolom ini NOT NULL, tapi
   `seat_addon.modules` adalah array kosong (`p.modules[0]` jadi
   `undefined`). `lib/invoice-order.ts` sebelumnya pakai non-null assertion
   (`p.modules[0]!`) yang akan crash saat checkout `seat_addon`. Diganti
   `p.modules[0] ?? "seat_addon"` sebagai sentinel, diverifikasi lewat grep
   tidak ada consumer lain yang terpengaruh nilai sentinel ini.
4. **Checkout quantity — bug dedup ditemukan lewat browser testing, BUKAN
   code review**: `subscriptions.route.ts` checkout men-dedup
   `body.planIds` via `new Set()` lalu memakai array HASIL DEDUP itu untuk
   membangun `invoiceItems` — "beli N seat_addon yang sama" (arsitektur
   quantity project ini: kirim `planId` yang sama N kali) diam-diam jadi
   "beli 1". Fix: pisahkan `uniquePlanIds`/`uniquePlanRows` (khusus validasi
   eksistensi & `isActive`, 1 query per plan unik) dari `planRows` (dibangun
   dari `body.planIds` APA ADANYA, duplikat dipertahankan) — regression test
   ditambahkan (`subscriptions.route.test.ts`).
5. **`GET /me/data-usaha` awalnya cuma balikin Data Usaha MILIK user** — member
   pure (tanpa Data Usaha sendiri) tidak akan pernah lihat Data Usaha tempat
   dia numpang di gerbang "Pilih Data Usaha" atau sidebar, walau
   `subscription-gate.ts` sudah kasih dia akses modul. Fix: union kepemilikan
   + Data Usaha tempat user punya seat `active`, tambah field `isOwner` di
   response supaya frontend bisa beda-in tampilan (badge "Anggota", sembunyikan
   menu Langganan/Billing untuk non-owner).
6. **Admin UI plan (`admin/plans.route.ts`) awalnya WAJIB persis 1 modul** —
   tidak mungkin membuat plan `seat_addon` (`modules: []`) lewat admin UI
   sama sekali sampai schema (`t.Array({minItems:0, maxItems:1})`) dan form
   frontend diupdate, plus fungsi `validatePlanKindModules()` untuk validasi
   silang `kind`↔`modules` di POST & PUT.
7. **Security review (2026-09-11)** — ditemukan 1 celah Medium: Google
   OAuth auto-link (`linkGoogleSignupToPendingInvite`) tidak mengecek
   `inviteTokenExpiresAt`, beda dari jalur password (`findValidInviteByToken`)
   yang eksplisit cek expiry — invite yang sudah lewat 7 hari tetap bisa
   diklaim lewat Google sign-up selama primary user belum revoke manual.
   **Diperbaiki langsung** (bukan ditunda) — tambah kondisi `gt(inviteTokenExpiresAt, now())`
   ke query di `lib/member-seats.ts`.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck` — apps/api + apps/web bersih)
- [x] Security review dijalankan (skill `security-review`, fokus
      team.route.ts, invites.route.ts, member-seats.ts, subscription-gate.ts,
      accurate.route.ts, subscriptions.route.ts, admin/orders+subscriptions
      route, manual-subscription.ts, admin/plans.route.ts, lib/auth.ts,
      me.route.ts)
- [x] Temuan Critical/High: tidak ada. Temuan Medium (Google auto-link
      expiry) sudah diperbaiki di sesi yang sama (lihat § Keputusan Kecil #7).
      Temuan Low (tidak ada rate limit khusus di `/me/team/:seatId/invite`
      dan `/resend` — abuse vector spam-email terbatas ke akun terautentikasi
      yang punya seat, blast radius kecil) dicatat sebagai technical debt di
      `docs/lessons-learned.md`, tidak memblokir penutupan fase ini.
- [x] `docs/PROGRESS.md` diupdate
- [x] **TIDAK push**

## Verifikasi End-to-End (Browser)
Dijalankan penuh sesuai skenario di plan (checkout → confirm → invite →
accept → akses dashboard → revoke → sesi invalid → reassignment ke slot
sama), memakai 4 akun `fase110-*@test.local` + Data Usaha "PT Fase110 Test":
1. Seat aktif tampil benar di "Kelola Tim" pemilik ("Fase110 Member — Aktif").
2. Revoke (tombol "Cabut") → toast sukses, slot balik ke "Kosong" —
   diverifikasi di level DB: 0 sesi tersisa untuk `memberUserId` yang
   di-revoke (`revokeAllSessions` bekerja benar), baris `member_seats`
   direset (`status: available`, `revokedAt`/`revokedBy` terisi,
   `memberUserId`/`invitedEmail`/token di-null-kan).
2b. Sempat ada kebingungan metodologi testing (BUKAN bug produk): tab
    browser yang tadinya login sebagai member ikut ke-switch ke sesi owner
    setelah owner login di tab lain pada origin yang sama
    (`app.localhost:6209`) — Better Auth session cookie di-share lintas tab
    1 origin. Dikonfirmasi lewat `ownsDataUsaha()` + query DB langsung bahwa
    state sebenarnya SUDAH benar sebelum kebingungan ini diselesaikan.
3. Reassignment: invite email baru (`fase110-member2@test.local`) ke slot
   yang sama persis setelah revoke → diverifikasi di DB `seatSubscriptionId`
   TIDAK berubah (sisa durasi ikut slot, bukan ikut orang), status jadi
   `invited` dengan token baru.
4. Data test (4 user, 1 Data Usaha, 1 plan `seat_addon`, 2 subscription, 1
   invoice+order, 1 member_seats, 1 audit_log) dibersihkan dari dev DB
   dengan scope presisi berdasarkan ID eksplisit yang sudah diverifikasi
   (bukan window waktu longgar) — tidak menyentuh data sesi lain.

## Known Limitations
- **Akses granular per-modul untuk seat TIDAK diimplementasikan** (by
  design, dikonfirmasi client — lihat ADR-0032). Seat selalu dapat akses ke
  SEMUA fitur aktif Data Usaha, tidak bisa dibatasi ke sebagian modul saja.
- **Tidak ada rate limit khusus** di `POST /me/team/:seatId/invite` dan
  `/resend` (endpoint terautentikasi, tapi tidak ada limit tambahan di luar
  limit login/session umum) — potensi abuse spam-email ke alamat sembarang
  oleh akun yang sudah py seat tersedia, dicatat sebagai technical debt.
- **Pembersihan data test hasil `bun run test` (bukan browser test) BELUM
  dilakukan** — full suite (708 test) menyisakan ~411 baris user test
  (`%@test.local`) + data terkait di dev DB shared. Script cleanup sudah
  disiapkan (pola sama sesi-sesi sebelumnya, diperluas untuk tabel
  `member_seats`/`data_usaha` baru dari restrukturisasi Fase 107-110) tapi
  dibatalkan otomatis oleh classifier keamanan Bash tool (dianggap operasi
  bulk-delete berisiko lintas ~10 tabel). User memilih SKIP untuk saat ini
  (bukan retry) — dicatat sebagai pending cleanup, bukan tanggung jawab
  yang lupa dikerjakan.
- **Backfill production untuk Data Usaha (Fase 107) belum dijalankan ulang
  di production** — perlu dilakukan saat deploy nyata nanti (di luar scope
  fase ini, dicatat di sini supaya tidak terlupa saat deployment).

## Ringkasan Hasil
Fase 110 selesai penuh: model seat "User Tambahan" berjalan end-to-end
(checkout → aktivasi otomatis → invite (password & Google) → akses
ter-gate ke SATU Data Usaha → revoke mencabut sesi langsung → reassignment
mempertahankan sisa durasi slot), diverifikasi lewat kombinasi test
otomatis (unit/integration, 708 test lolos setelah penambahan test Fase
110) dan browser walkthrough manual penuh. Pondasi gating akses
(`subscription-gate.ts`) sekaligus dibetulkan untuk baca kepemilikan Data
Usaha saat ini (bukan buyer historis), menyiapkan Fase 111 (transfer
kepemilikan) agar tidak perlu migrasi ulang logic akses. Security review
menemukan dan langsung memperbaiki 1 celah Medium (expiry invite tidak
dicek di jalur Google OAuth). Belum di-push sesuai instruksi standing user
(local-only, branch `feature/data-usaha-restructure`).
