# ADR-0027: Role "Admin" (Terbatas) Terpisah dari "Super Admin" + Nonaktifkan User (Bukan Hapus Permanen)

**Status:** Accepted
**Tanggal:** 2026-09-05

## Context
Sampai sekarang cuma ada 1 role sisi-admin: `admin`, izin penuh, tanpa
gradasi. `docs/architecture/architecture-user-roles.md` (ditulis hari
ini, sebagai audit awal sebelum ADR ini) mencatat halaman "Pengguna"
(`/admin/users`) mencampur SEMUA akun (admin+customer) tanpa pemisahan,
dan tidak ada jalur UI untuk membuat akun admin/staff baru sama sekali.

User (pemilik Facport) minta pemisahan: karena aplikasi ini kecil, cukup
**2 role sisi-admin** — "Super Admin" (bisa tambah/nonaktifkan user) dan
"Admin" (semuanya SAMA kecuali TIDAK bisa tambah/nonaktifkan user). Saat
diskusi, ketemu juga bahwa kapabilitas "hapus/nonaktifkan user" itu
sendiri **belum pernah dibangun sama sekali** — user minta itu dibangun
sekalian di fase ini.

## Decision

### 1. Role baru: `staff` (nama DB), label UI **"Admin"**
- Role `admin` (nama DB TIDAK berubah — hindari migrasi/rename berisiko
  ke role yang sudah dipakai di mana-mana) sekarang dilabeli **"Super
  Admin"** di UI. Tetap dapat SEMUA permission seperti sebelumnya, TIDAK
  ADA perubahan behavior untuk role ini.
- Role baru `staff`, dilabeli **"Admin"** di UI, dapat SEMUA permission
  yang sama dengan `admin` KECUALI `users.manage`. Konsisten dengan
  pernyataan user: "bedanya cuma bisa tambah/kurangi user".
- Guard akses surface `admin.facport.com` (`apps/web/app/admin/(protected)/layout.tsx`)
  diperluas: `me.roles.includes("admin") || me.roles.includes("staff")`
  — sebelumnya cuma cek `"admin"`.

### 2. Permission split: `users.view` (baru) vs `users.manage` (sudah ada)
- `users.view` — lihat daftar user (`GET /admin/users`). Diberikan ke
  `admin` DAN `staff`.
- `users.manage` — tambah user/staff BARU, nonaktifkan/aktifkan user.
  HANYA `admin` (Super Admin). **Ini SATU-SATUNYA perbedaan** antara
  kedua role, sesuai keputusan user.

### 3. "Mengurangi user" = NONAKTIFKAN (reversibel), BUKAN hapus permanen
Alasan: tabel `subscriptions`/`orders`/`invoices`/`accurate_connections`
mereferensi `user.id` TANPA `onDelete: cascade` — hapus permanen akan
GAGAL (FK violation) kalau user itu punya riwayat transaksi apa pun, atau
kalau dipaksa cascade akan menghapus catatan finansial yang seharusnya
permanen (invoice, riwayat langganan). Nonaktifkan (`user.disabled =
true`) jauh lebih aman: reversibel, tidak menyentuh data historis sama
sekali.

**Mekanisme penegakan** (2 lapis, KEDUANYA wajib supaya benar-benar
efektif — nonaktifkan cuma di satu lapis TIDAK CUKUP):
1. **Sesi yang sudah ada di-cabut SEKETIKA** saat dinonaktifkan — hapus
   semua baris `session` milik user itu (`DELETE FROM session WHERE
   user_id = ...`). Tanpa ini, sesi lama TETAP jalan sampai expired
   natural (7 hari) walau `disabled = true`.
2. **Login BARU ditolak** — kolom `user.disabled` (baru, migration)
   dicek SEBELUM request diteruskan ke Better Auth. Diimplementasi
   sebagai route Elysia eksplisit `POST /api/auth/sign-in/email` yang
   didaftarkan SEBELUM `.mount(auth.handler)` (§ `app.ts`), BUKAN via
   hook internal Better Auth (`hooks`/`databaseHooks` DICEK LANGSUNG ke
   `.d.mts` versi 1.7.1 yang terpasang — TIDAK ADA di top-level options
   type versi ini, beda dari versi Better Auth yang lebih dikenal
   sebelumnya. Konsisten dengan pola "This is NOT the X you know" yang
   sudah ketemu di tanstack-table v9 sesi-sesi sebelumnya — JANGAN
   asumsi API lama, verifikasi dulu). Body `Request` di-`.clone()` dulu
   sebelum dibaca manual (supaya `auth.handler(request)` di bawahnya
   tetap dapat body ORIGINAL utuh — `Request` cuma bisa dibaca sekali).

### 4. Guard keamanan tambahan saat nonaktifkan
- **TIDAK BOLEH nonaktifkan diri sendiri** (`params.id === user.id` →
  400) — cegah Super Admin terkunci dari akunnya sendiri secara tidak
  sengaja.
- **TIDAK BOLEH nonaktifkan Super Admin TERAKHIR yang masih aktif** —
  cegah sistem kehilangan SEMUA akses Super Admin (tidak ada jalur
  recovery UI kalau itu terjadi).

### 5. UI: 1 form "Tambah Staff" terpisah, TANPA halaman "Kelola Role"
Karena cuma 2 role TETAP (bukan role custom bebas), halaman generik
"Kelola Role" (buat/edit role+permission) TIDAK dibangun — over-engineering
untuk kebutuhan sekarang. Cukup 1 form baru "Tambah Staff" (pilih role
Admin/Super Admin dari dropdown/radio) + tombol Nonaktifkan/Aktifkan di
baris tabel "Pengguna" yang sudah ada, keduanya di belakang permission
`users.manage`.

## Alternatif yang Dipertimbangkan
- **Hapus permanen (hard delete)** — ditolak, akan melanggar FK
  constraint kalau user punya riwayat transaksi, atau (kalau dipaksa
  cascade) menghapus catatan finansial yang harus permanen.
- **Role custom bebas (admin pilih permission satu-satu)** — ditolak
  user, kebutuhan riil cuma 2 role tetap untuk aplikasi sekecil ini;
  kapasitas role custom TETAP ada di skema RBAC (tidak dihapus), tinggal
  dipakai lagi kalau kebutuhan berubah nanti.
- **Adopsi plugin `admin` bawaan Better Auth** (comes with
  ban/unban/removeUser built-in) — ditolak: plugin itu punya konsep
  role/permission SENDIRI yang terpisah dari sistem RBAC custom project
  ini (`roles`/`permissions`/`role_permissions`/`user_roles`) — akan
  jadi DUA sistem otorisasi paralel yang membingungkan, kontradiksi
  dengan keputusan konsisten project ini sejauh ini (mis. Fase 26 pilih
  `usePermissions()` custom dibanding plugin `customSession` Better
  Auth, alasan yang sama).

## Konsekuensi
- Migration baru: kolom `user.disabled` (boolean, default false).
- `admin@facport.test` (satu-satunya Super Admin sekarang) TIDAK
  terpengaruh — tetap role `admin`, tetap semua permission.
- Endpoint baru: `POST /admin/staff` (bikin staff/admin baru),
  `PATCH /admin/users/:id/disable`, `PATCH /admin/users/:id/enable` —
  semua `permission: "users.manage"`.
- `GET /admin/users` permission turun dari `users.manage` ke `users.view`
  — SIAPA PUN yang sebelumnya bisa lihat (cuma `admin`) tetap bisa,
  ditambah role `staff` baru.
- Perlu `ADMIN_ORIGIN_PROD` (env baru, opsional) — link login di email
  welcome staff harus ke `admin.` bukan `app.` (beda dari email welcome
  customer yang sudah ada).

## Update 2026-09-05 — Security review (subagent) menemukan 1 Critical + 1 High, KEDUANYA diperbaiki sebelum fase ditutup

**CRITICAL — bypass login akun disabled via case-sensitivity email.**
Intercept di `app.ts` (§ Decision 3) membandingkan `body.email` APA
ADANYA, sedangkan Better Auth (`internal-adapter.mjs` versi terpasang)
SELALU simpan & lookup email dalam bentuk `.toLowerCase()`. Login dengan
email di-uppercase-kan (`"User@Example.com"` vs DB `"user@example.com"`)
membuat query intercept tidak match apa pun → guard TERLEWATI TOTAL →
akun `disabled` tetap bisa login. **Fix:** `body.email.trim().toLowerCase()`
sebelum query, SAMA PERSIS normalisasi Better Auth. Diverifikasi
end-to-end manual (curl, email uppercase terhadap akun `disabled` → 403
`ACCOUNT_DISABLED`, sebelum fix akan 200 lolos).

**HIGH — `permissionPlugin` (dipakai HAMPIR SEMUA route) tidak pernah
cek `user.disabled`.** Seluruh penegakan "disable" bergantung 100% pada
2 titik DI LUAR layer otorisasi (intercept login + hapus sesi saat
disable) — kalau `disabled` di-set lewat jalur lain (SQL manual, skrip
migrasi) TANPA ikut menghapus baris `session`, sesi lama tetap valid
SELAMANYA sampai expired natural (7 hari), tidak ada apa pun yang
menangkap. Bertentangan dengan prinsip "tiap layer aman independen"
(`architecture-security.md`). **Fix:** tambah `isDisabled()` check di
KEDUA macro (`auth`, `permission`) di `lib/permission.ts` — query
langsung ke kolom `user.disabled` (BUKAN `session.user.disabled`, field
itu tidak terdaftar di `additionalFields` Better Auth jadi tidak bisa
diandalkan ada di payload sesi). Diverifikasi end-to-end manual (disable
via SQL langsung TANPA hapus sesi → `GET /me` pakai sesi lama yang
sebelumnya valid → 403, sebelum fix akan tetap 200).

**MEDIUM — race condition (TOCTOU) di guard "jangan nonaktifkan Super
Admin aktif terakhir".** Baca-hitung-lalu-tulis tanpa transaksi/lock —
2 request bersamaan menyasar 2 admin beda bisa sama-sama lolos hitungan
sebelum salah satu commit. **Fix:** bungkus dalam `db.transaction()` +
`.for("update")` row lock pada baris admin aktif yang di-SELECT,
serialize transaksi konkuren.

**Catatan desain, ditemukan saat memperbaiki test untuk guard di atas**:
dengan fix HIGH di atas (`permissionPlugin` menolak caller `disabled`),
guard "CANNOT_DISABLE_LAST_SUPER_ADMIN" **TIDAK BISA LAGI dipicu lewat
endpoint oleh caller mana pun yang valid** — caller WAJIB admin AKTIF
untuk lolos `users.manage`, jadi begitu dia menonaktifkan admin lain,
dirinya sendiri TETAP terhitung admin aktif (sisa minimal 1). Guard ini
sekarang murni defense-in-depth untuk skenario DI LUAR endpoint (mis.
permission role diubah manual lewat DB nanti) — bukan bug, tapi
konsekuensi logis dari fix HIGH yang justru membuat sistem LEBIH aman.
Test disesuaikan: skenario asli (paksa caller "disabled tapi sesi masih
valid") sudah tidak bisa dikonstruksi lagi (persis celah yang barusan
ditutup) — diganti test jalur normal (2 admin aktif, nonaktifkan salah
satu, sisa tepat 1 admin aktif, transaksi/lock tidak merusak jalur sah).

**LOW (2)** — `params.id` divalidasi `format: "uuid"` (DICOBA lalu
DIBATALKAN — `user.id` dari Better Auth BUKAN format UUID, beda dari
`plans.id`/`orders.id` yang memang kolom `uuid` asli; dipakai
`minLength: 1` saja). Known Limitation didokumentasikan di bawah.

## Referensi
- Audit kondisi role sebelum keputusan ini → `docs/architecture/architecture-user-roles.md`
- RBAC umum → `docs/architecture/architecture-auth.md`
- Eksekusi → `docs/phases/phase-29-role-staff-dan-nonaktifkan-user.md`
