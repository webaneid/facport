# Fase 29 — Role "Admin" (Terbatas) vs "Super Admin" + Nonaktifkan User

**Status:** Done
**Mulai:** 2026-09-05
**Selesai:** 2026-09-05

## Tujuan
User minta pemisahan role sisi-admin (customer vs "user untuk admin").
Setelah audit (`docs/architecture/architecture-user-roles.md`) & 3
putaran klarifikasi, disepakati: 2 role tetap (Super Admin = penuh, Admin
= sama tapi TIDAK bisa tambah/nonaktifkan user), plus bangun kapabilitas
nonaktifkan user (belum ada sama sekali sebelumnya) — TANPA hapus
permanen (§ ADR-0027, alasan lengkap di sana).

## Scope
- [x] Migration: `user.disabled` (boolean, default false).
- [x] `apps/api/src/db/seed.ts` — role baru `staff` (semua
      `ADMIN_PERMISSION_KEYS` kecuali `users.manage`), permission baru
      `users.view` (ditambahkan ke `ADMIN_PERMISSION_KEYS`, diberikan ke
      `admin` & `staff` keduanya).
- [x] `apps/api/src/routes/admin/users.route.ts`:
  - `GET /` — permission `users.manage` → `users.view`, tambah field
    `disabled` di response.
  - `PATCH /:id/disable` — `permission: "users.manage"`, guard: tolak
    nonaktifkan diri sendiri, tolak nonaktifkan Super Admin TERAKHIR
    yang aktif. Set `disabled=true` + hapus SEMUA sesi user itu + audit log.
  - `PATCH /:id/enable` — `permission: "users.manage"`. Set
    `disabled=false` + audit log.
- [x] `apps/api/src/routes/admin/staff.route.ts` (baru) —
      `POST /admin/staff` (`permission: "users.manage"`): bikin akun
      baru + assign role `admin`/`staff` (dipilih di body), pola
      tempPassword+email sama seperti `POST /admin/users` tapi welcome
      email arahkan ke ORIGIN ADMIN (`ADMIN_ORIGIN_PROD`, env baru),
      bukan origin app.
- [x] `apps/api/src/app.ts` — route eksplisit `POST /api/auth/sign-in/email`
      SEBELUM `.mount(auth.handler)`, cek `user.disabled` dulu (§ ADR-0027
      § Decision 3 untuk detail teknis kenapa TIDAK pakai hook internal
      Better Auth).
- [x] `apps/api/.env.example`/`.env` — tambah `ADMIN_ORIGIN_PROD`
      (opsional, fallback `http://admin.localhost:6209` dev).
- [x] `apps/web/app/admin/(protected)/layout.tsx` — guard akses surface
      admin: terima role `admin` ATAU `staff`.
- [x] `apps/web/app/admin/(protected)/users/page.tsx`:
  - Kolom "Roles" tampilkan label human ("Super Admin"/"Admin"/
    "Pelanggan"), bukan nama DB mentah. Badge "Nonaktif" kalau `disabled`.
  - Tombol Nonaktifkan/Aktifkan per baris, dibungkus
    `<Can permission="users.manage">`.
  - Form baru "Tambah Staff" (terpisah dari "Tambah User" existing yang
    tetap khusus customer) — pilih role Admin/Super Admin, dibungkus
    `<Can permission="users.manage">` (sama seperti trigger "Tambah User"
    yang SEBELUMNYA belum di-guard — celah lama, ikut diperbaiki sini).
- [x] `apps/web/components/app-shell/sidebar.tsx` — nav item "Pengguna"
      diturunkan dari `users.manage` ke `users.view` (celah ditemukan
      sendiri saat review: halaman butuh `users.view` tapi nav masih
      cek `users.manage`, staff jadi tidak lihat menu walau bisa akses
      halamannya).
- [x] Test: `admin/users.route.test.ts` (7 test baru: permission split,
      guard self-disable, guard last-super-admin — SCOPED ke role admin
      + try/finally, TIDAK menyentuh akun lain di DB bersama, disable
      menghapus sesi), `admin/staff.route.test.ts` (baru, 4 test),
      `app.test.ts` (2 test: sign-in ditolak 403 untuk user `disabled`,
      sign-in normal tetap 200 untuk user aktif).

## Referensi
- ADR: `docs/decisions/adr-0027-role-staff-dan-nonaktifkan-user.md`
- Audit awal: `docs/architecture/architecture-user-roles.md`

## Keputusan Kecil Selama Eksekusi
- `params.id` (`admin/users.route.ts` disable/enable) TIDAK divalidasi
  `format: "uuid"` — sempat dicoba (saran security review), TAPI
  dibatalkan: `user.id` (Better Auth) BUKAN format UUID (beda dari
  `plans.id`/`orders.id`), validasi itu justru menolak SEMUA request sah
  (422). Dipakai `t.String({ minLength: 1 })` saja.
- Guard "CANNOT_DISABLE_LAST_SUPER_ADMIN" jadi murni defense-in-depth
  yang TIDAK BISA dipicu lewat endpoint publik lagi SETELAH fix High
  (§ ADR-0027 Update 2026-09-05) — konsekuensi logis yang diterima
  (bukan bug), test disesuaikan ke jalur normal.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — 0 error (api+web)
- [x] Security review — subagent `security-auditor` (auth-flow sensitif,
      bukan inline). Temuan: 1 Critical, 1 High, 1 Medium, 2 Low.
- [x] Temuan Critical/High sudah diperbaiki — KEDUANYA fixed +
      diverifikasi ULANG end-to-end manual (curl), bukan cuma baca kode
      (detail lengkap § ADR-0027 Update 2026-09-05).
- [x] Temuan Medium (TOCTOU race) diperbaiki (transaction + row lock).
      Temuan Low: 1 diperbaiki lalu dibatalkan setelah verifikasi
      empiris salah asumsi (lihat Keputusan Kecil), 1 lagi (dokumentasi
      known-limitation) jadi tidak relevan karena akar masalahnya
      (High) sudah diperbaiki langsung, bukan sekadar dicatat.
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Tidak ada halaman "Kelola Role" generik (role custom via UI) — sengaja
  ditunda, cuma 2 role tetap dibutuhkan sekarang (§ ADR-0027).
- Guard "Super Admin aktif terakhir" (`admin/users.route.ts`) sekarang
  murni defense-in-depth — tidak bisa dipicu lewat endpoint oleh caller
  valid mana pun (konsekuensi fix High, § ADR-0027), cuma relevan kalau
  permission `users.manage` di masa depan dipasang ke role lain lewat
  jalur DI LUAR endpoint resmi.
- Verifikasi visual browser TIDAK dilakukan (Chrome extension tidak
  tersambung, konsisten sepanjang sesi ini).

## Ringkasan Hasil

Role sisi-admin sekarang 2: `admin` (DB, label UI "Super Admin", tidak
berubah) dan `staff` (DB baru, label UI "Admin") — SATU-SATUNYA beda:
`staff` tidak punya `users.manage` (tidak bisa tambah/nonaktifkan user),
semua permission lain identik (§ ADR-0027). Kapabilitas BARU
"nonaktifkan user" dibangun sebagai NONAKTIFKAN reversibel (bukan hapus
permanen — tabel finansial reference `user.id` tanpa cascade delete),
ditegakkan 2 lapis: hapus semua sesi aktif saat dinonaktifkan + tolak
login baru untuk akun `disabled` (intercept manual `POST
/api/auth/sign-in/email` di `app.ts`, karena Better Auth 1.7.1 yang
terpasang tidak punya `hooks`/`databaseHooks` di top-level options-nya —
diverifikasi langsung ke `.d.mts`, bukan asumsi). Endpoint baru:
`PATCH /admin/users/:id/disable`, `PATCH /admin/users/:id/enable`,
`POST /admin/staff` (provisioning akun admin/staff, terpisah dari
`POST /admin/users` yang tetap khusus customer). UI: label role human-
readable, badge "Nonaktif", tombol nonaktifkan/aktifkan, form "Tambah
Staff" — semua di-guard `<Can permission="users.manage">` (UI hint,
backend independen jadi penjaga).

Security review (subagent, auth-flow sensitif) menemukan 1 Critical + 1
High + 1 Medium + 2 Low — SEMUA Critical/High/Medium diperbaiki
langsung dan DIVERIFIKASI ULANG end-to-end manual (bukan cuma baca
kode): (1) Critical — intercept login rentan bypass via email
huruf-besar-kecil (Better Auth normalisasi lowercase, intercept tidak);
fix + verifikasi curl. (2) High — layer `permissionPlugin` tidak pernah
cek `user.disabled` sama sekali, jadi kalau di-disable lewat jalur lain
(bukan endpoint resmi) sesi lama tetap valid selamanya; fix + verifikasi
curl (disable via SQL langsung tanpa hapus sesi → request berikutnya
403). (3) Medium — race condition TOCTOU di guard "Super Admin aktif
terakhir"; fix pakai `db.transaction()` + row lock. Detail lengkap tiap
temuan & fix → `docs/decisions/adr-0027-role-staff-dan-nonaktifkan-user.md`
§ Update 2026-09-05.

Typecheck 0 error (api+web), lint 0 error, test suite 186 pass/0 fail
(naik dari 173 — 13 test baru: 7 di `admin/users.route.test.ts`, 4 di
`admin/staff.route.test.ts` baru, 2 di `app.test.ts`). Data test yang
regrow dari test run dibersihkan lagi, sisa `admin@facport.test` +
`user@facport.com`. Verifikasi visual browser tidak dilakukan (Chrome
extension tidak tersambung).

## Update 2026-09-05 — Menu "Tim Internal" terpisah (jawab langsung "pisahin customer dan user untuk admin")
Setelah fase ditutup, user cek halaman `/admin/users` dan minta
penegasan: bukan soal istilah/opsi role, tapi **butuh MENU KHUSUS**
untuk tambah/nonaktifkan staff — terpisah dari halaman "Pengguna" yang
sebelumnya masih campur customer+admin+staff dalam 1 tabel. Ini
menyelesaikan tuntas permintaan ASLI dari awal ("saya mau pisahin
antara customer dan user untuk admin") yang sebelumnya cuma diselesaikan
di level ROLE (§ ADR-0027), belum di level TAMPILAN.

**Perubahan (murni aditif, reuse endpoint yang sudah ada, TIDAK ada ADR
baru — bukan keputusan arsitektur baru, cuma melengkapi ADR-0027):**
- `GET /admin/users` — SEKARANG difilter server-side, cuma balikin role
  `customer` (subquery ke `user_roles`, fallback aman kalau role
  customer somehow belum ke-seed: balikin kosong, bukan bocor semua).
- `GET /admin/staff` (baru, `admin/staff.route.ts`) — list akun role
  `admin`+`staff` sekaligus (union), permission `users.view` (Admin
  terbatas boleh lihat rekan timnya, tidak boleh tambah/nonaktifkan).
- Halaman baru `apps/web/app/admin/(protected)/staff/page.tsx` — "Tim
  Internal": tabel akun admin/staff + role label + status + tombol
  Nonaktifkan/Aktifkan (reuse `PATCH /admin/users/:id/disable|enable`,
  endpoint generik, tidak spesifik customer). `AddStaffDialog` DIPINDAH
  ke sini dari `admin/users/page.tsx` (dulu nyampur di halaman Pengguna).
- `admin/users/page.tsx` — kolom "Role" dihapus (sekarang SELALU
  "Pelanggan", tidak ada nilai informasi lagi setelah filter), diganti
  kolom "Status" (Aktif/Nonaktif). Deskripsi halaman diperjelas: khusus
  pelanggan, akun tim internal ada di menu lain.
- Sidebar: item nav baru "Tim Internal" (`/staff`, ikon `UserCog`,
  permission `users.view`) di grup Manajemen, tepat di bawah "Pengguna".
- `ROLE_LABELS`/`roleLabel()` dipindah ke `apps/web/lib/role-labels.ts`
  (shared, dipakai kedua halaman — sebelumnya cuma di `users/page.tsx`).

Test baru: `GET /admin/users` hasil TIDAK termasuk akun admin/staff (§
`admin/users.route.test.ts`), `GET /admin/staff` hasil TIDAK termasuk
customer + permission split `users.view`/`users.manage` (§
`admin/staff.route.test.ts`, 3 test baru). Typecheck 0 error, lint 0
error, test suite 190 pass/0 fail (naik dari 186). Data test dibersihkan
lagi. Verifikasi visual browser tidak dilakukan (Chrome extension tetap
tidak tersambung).
