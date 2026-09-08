# Fase 62 — Login/Register dengan Google (OAuth)

**Status:** Done
**Mulai:** 2026-09-08
**Selesai:** 2026-09-08

## Tujuan
User minta customer bisa login/daftar pakai akun Google (surface `app`
saja, admin tetap provisioning manual). Better Auth sudah menyiapkan
tempatnya sejak awal (`lib/auth.ts` komentar `socialProviders: {}`).

## Scope
- [x] `apps/api/src/lib/env.ts` — `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` opsional
- [x] `apps/api/src/lib/assign-customer-role.ts` (baru)
- [x] `apps/api/src/lib/auth.ts` — `socialProviders.google` kondisional + `databaseHooks.user.create.after` (difilter `context.path`, § bug di bawah)
- [x] `apps/api/src/lib/assign-customer-role.test.ts` (baru, 2 test)
- [x] `apps/web/components/auth/google-signin-button.tsx` (baru)
- [x] `apps/web/components/auth/login-form.tsx` + `register-form.tsx` — tambah tombol
- [x] `apps/web/components/auth/login-form.test.tsx` — extend (1 test baru)
- [x] `docs/decisions/adr-0030-google-oauth-login.md` (baru)
- [x] `docs/architecture/architecture-auth.md` — update
- [x] `apps/api/.env.example` — tambah var baru

## Referensi
- Plan mode sesi ini (2026-09-08) — riset lengkap Better Auth 1.7.1 (`databaseHooks.user.create.after`, `accountLinking` default)
- `docs/architecture/architecture-subscription.md` § "Dua Jalur Registrasi"

## Bug Ditemukan & Diperbaiki SEBELUM Tutup Fase
Versi awal `databaseHooks.user.create.after` assign role "customer" ke
SEMUA user baru TANPA FILTER — dugaan awal hook ini cuma fires untuk
jalur self-service, TERNYATA juga fires untuk `auth.api.signUpEmail()`
yang dipanggil server-side dari `admin/users.route.ts`/`admin/staff.route.ts`
(admin provisioning). Akibat: akun admin/staff baru ikut ditandai
"customer", merusak invariant `userCount` Fase 59. Ditangkap OTOMATIS
oleh test integrasi Fase 59 sendiri (`admin/stats.route.test.ts`) —
BUKAN ditemukan manual. Fix: filter `context?.path === "/callback/:id"`
(path generik SEMUA social-provider callback Better Auth, tidak pernah
dipakai admin provisioning) — detail lengkap § ADR-0030.

## Keputusan Kecil Selama Eksekusi
- `app.ts`'s intercept HTTP `/api/auth/sign-up/email` (assign role jalur
  email) DIBIARKAN APA ADANYA, TIDAK dikonsolidasi ke `databaseHooks` —
  redundan tapi aman (`onConflictDoNothing`), resiko ubah kode auth
  produksi teruji tidak sepadan manfaat "kerapian kode" (§ ADR-0030).
- `accountLinking` TIDAK dikonfigurasi eksplisit — default Better Auth
  sudah aman (`requireLocalEmailVerified: true`).
- Logo Google pakai inline SVG statis (bukan tambah icon library baru).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`, api+web)
- [x] Security review dijalankan (inline) — `GOOGLE_CLIENT_SECRET` tidak
  pernah ke-client (server-only env var), `accountLinking` tetap default
  aman, tidak ada input baru dari client yang perlu divalidasi (tombol
  cuma trigger redirect OAuth standar)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — 1
  ditemukan (role assignment salah sasaran, di atas) & diperbaiki
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Verifikasi end-to-end OAuth WAJIB di staging/production (bukan dev
  lokal) — `crossSubDomainCookies` nonaktif khusus `.localhost`, sama
  limitasi yang sudah didokumentasikan untuk auto-login link-verifikasi
  email (§ `register-form.tsx`).
- Fitur baru AKTIF hanya setelah user mengisi `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` di server (setup eksternal Google Cloud Console).

## Ringkasan Hasil
Customer sekarang bisa login/daftar pakai akun Google di `/login` dan
`/register` (surface `app` saja) — tombol "Lanjutkan dengan Google" di
atas form email, aktif otomatis setelah `GOOGLE_CLIENT_ID`/
`GOOGLE_CLIENT_SECRET` diisi di server. Role "customer" ke-assign
otomatis via `databaseHooks.user.create.after` (difilter path OAuth
saja, TIDAK menyentuh jalur email/password yang sudah benar). Akun
password+Google dengan email sama otomatis ke-link (default Better
Auth, hanya kalau email password sudah terverifikasi).

Bug serius ditemukan & diperbaiki SEBELUM tutup fase (assign role
salah sasaran ke akun admin/staff) — ditangkap test Fase 59 sendiri,
bukti nyata manfaat test suite yang sudah dibangun fase-fase
sebelumnya. Setup eksternal (Google Cloud Console) diberikan ke user
secara terpisah, fitur BELUM bisa diverifikasi end-to-end sampai itu
selesai.

Typecheck 0 error (api+web). Full suite `apps/api` 442 pass/0 fail (2
baru). Full suite `apps/web` 28 pass/0 fail (1 baru). Build sukses.
Security review inline: 0 temuan tersisa (1 ditemukan & diperbaiki
sebelum lapor). Verifikasi end-to-end WAJIB manual di staging/production
setelah kredensial Google siap (dev `.localhost` tidak bisa, § Known
Limitations).
