# ADR-0030: Login/Register dengan Google (OAuth) — Surface App Saja

**Status:** Accepted
**Tanggal:** 2026-09-08

## Context
User minta customer bisa login/daftar pakai akun Google, bukan cuma
email/password. `apps/api/src/lib/auth.ts` (Better Auth) sudah
menyiapkan tempat untuk ini sejak awal (komentar eksplisit
`socialProviders: {} — aktifkan kalau project butuh Google/dst login`),
tapi sengaja belum diaktifkan karena belum diminta.

Dua keputusan teknis butuh ADR (bukan cuma catatan phase doc) karena
menyentuh alur auth produksi & langsung berhubungan dengan bug nyata
yang ditemukan saat eksekusi:
1. Bagaimana user baru dari Google tetap dapat role `customer` (§
   `architecture-subscription.md` § "Dua Jalur Registrasi" — SEMUA user
   baru harus dapat role ini, tanpa terkecuali).
2. Apakah `accountLinking` (akun password + akun Google dengan email
   sama) perlu dikonfigurasi khusus atau cukup default.

## Decision

### 1. Scope: surface `app` SAJA, bukan admin
Admin/staff SELALU provisioning manual oleh Super Admin (§
`architecture-subscription.md` § "Dua Jalur Registrasi", jalur "Admin-
Provisioned") — tidak pernah self-register. Tombol Google HANYA ada di
`/login` dan `/register` surface `app`, TIDAK ditambahkan ke
`admin.facport.com`.

### 2. Role assignment: `databaseHooks.user.create.after`, DIFILTER path OAuth
`apps/api/src/app.ts` sudah punya mekanisme assign role `customer` HANYA
untuk jalur `POST /api/auth/sign-up/email` (intercept HTTP-level,
karena `auth.api.signUpEmail()` yang dipanggil LANGSUNG dari
`admin/users.route.ts` untuk provisioning admin TIDAK PERNAH lewat
Elysia route ini — beda proses, path HTTP itu murni tidak dieksekusi).
Mekanisme ini TIDAK otomatis menutup jalur Google OAuth (callback Google
ditangani sepenuhnya di dalam `.mount(auth.handler)`, tidak lewat
intercept mana pun).

**Ditemukan (bug, diperbaiki sebelum tutup fase)**: versi awal
implementasi menambah `databaseHooks.user.create.after` yang assign
`customer` ke SEMUA user tanpa filter — hook ini TERNYATA fires untuk
SEMUA metode pembuatan user Better Auth, TERMASUK `auth.api.signUpEmail()`
yang dipanggil server-side untuk admin/staff provisioning (bukan cuma
"self-service" seperti dugaan awal). Akibatnya akun admin/staff BARU
ikut ditandai `customer` juga — merusak invariant `userCount` yang
baru diperbaiki Fase 59 (`GET /admin/stats` HANYA hitung role
`customer`). Test integrasi Fase 59 sendiri yang menangkap ini.

**Keputusan final**: hook di-filter `context?.path === "/callback/:id"`
(path generik Better Auth untuk SEMUA social-provider callback,
`params.id` = nama provider — dicek dari source `better-auth`
`api/routes/callback.mjs`) — path ini TIDAK PERNAH dipakai admin
provisioning di codebase ini (tidak ada "OAuth admin-provisioned"),
jadi filter ini aman menutup HANYA gap Google OAuth tanpa menyentuh
jalur email/password yang sudah benar. Logic assign role diekstrak ke
`apps/api/src/lib/assign-customer-role.ts` (fungsi murni, importable
langsung untuk test — tidak perlu simulasi OAuth flow sungguhan).

`app.ts`'s existing intercept untuk `/api/auth/sign-up/email` DIBIARKAN
APA ADANYA (tidak dihapus/dikonsolidasi) — `onConflictDoNothing()` di
kedua tempat membuat potensi tumpang-tindih aman, dan mengubah kode auth
produksi yang sudah teruji demi "kebersihan kode" (DRY) dinilai TIDAK
sepadan dengan risikonya untuk fase ini.

### 3. `accountLinking` — pakai default Better Auth, TIDAK di-override
Default: `enabled: true`, `requireLocalEmailVerified: true`. Artinya:
akun password dengan email X yang SUDAH terverifikasi → sign-in Google
dengan email X yang sama → OTOMATIS di-link ke user yang sama (bukan
akun duplikat). Akun password yang emailnya BELUM terverifikasi → TIDAK
di-link (mencegah attacker pre-register email korban lalu klaim lewat
Google). Ini konsisten dengan `requireEmailVerification: true` yang
sudah jadi kebijakan project — tidak ada alasan menurunkan proteksi
bawaan ini.

## Alternatif yang Dipertimbangkan
- **Assign role via `hooks` (request-level, bukan `databaseHooks`)** —
  ditolak, lebih rumit untuk dapat `user.id` yang baru dibuat dari
  response body dibanding `databaseHooks.user.create.after` yang
  langsung terima objek `user`.
- **Konsolidasi role-assignment jalur email ke `databaseHooks` juga
  (hapus intercept `app.ts`)** — ditolak untuk fase ini, resiko
  mengubah kode auth produksi yang sudah teruji tanpa manfaat
  fungsional (cuma soal DRY/kerapian), bisa jadi fase terpisah kalau
  memang diinginkan nanti.
- **`accountLinking.trustedProviders: ["google"]`** — ditolak, tidak
  perlu (bypass verifikasi lokal) karena default `requireLocalEmailVerified`
  sudah cukup aman untuk kasus pemakaian ini.

## Konsekuensi
- Fitur otomatis "mati" (tidak error) di environment yang belum isi
  `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (dev/CI existing, § `lib/env.ts`).
- Verifikasi end-to-end HARUS di staging/production, bukan dev lokal
  (`crossSubDomainCookies` nonaktif khusus `.localhost`, § known
  limitation yang sama dengan auto-login verifikasi email).
- Kalau nanti nambah social provider lain (GitHub, dst), filter
  `context.path === "/callback/:id"` OTOMATIS ikut berlaku (path generik
  semua provider) — tidak perlu ubah `databaseHooks` lagi.

---
> Aturan: file ADR TIDAK diedit setelah Accepted. Kalau keputusan berubah,
> buat ADR baru dan tulis "Supersedes ADR-0030" di file baru itu.
