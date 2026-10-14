# Fase 194 — Fix: link verifikasi email mendarat di domain API (404)

**Status:** Done
**Mulai:** 2026-10-14
**Selesai:** 2026-10-14

## Tujuan
Pelanggan yang mengklik link verifikasi email berakhir di `https://api.facinstitute.id/` (HTTP 404) alih-alih aplikasi. Akunnya sebenarnya SUDAH terverifikasi — hanya halaman tujuannya yang salah.

## Akar masalah (dibuktikan dari kode Better Auth 1.7.1)
- `emailVerification.sendOnSignIn: true` (2026-10-07): login akun belum terverifikasi mengirim link verifikasi baru.
- `login-form.tsx` memanggil `signIn.email(values)` TANPA `callbackURL`; Better Auth (`sign-in.mjs:343`) memakai `"/"` (relatif).
- Setelah verifikasi berhasil, API mengalihkan ke `/` — relatif terhadap domain API (`api.*`) → 404.
- Jalur daftar (`register-form`) dan kirim ulang (`handleResendVerification`) sudah mengirim `callbackURL` absolut; hanya jalur login-otomatis yang bocor. Pemicu nyata: gangguan 502 13–14 Oktober membuat link pertama gagal dibuka, pelanggan lalu login → link kedua berujung 404.

## Scope
- [x] `lib/auth-verification-url.ts` `normalizeVerificationUrl(url, appOrigin)`: callback kosong/relatif → origin aplikasi; absolut tidak diubah; relatif berbahaya (`//host`, backslash, bukan diawali `/`) → halaman utama aplikasi. + tes unit (7).
- [x] `lib/auth.ts` `sendVerificationEmail` memakainya (`env.APP_ORIGIN_PROD`, dev `http://app.localhost:6209`). Satu titik → semua jalur ikut aman.
- [x] Tes integrasi `auth-verification-email.test.ts` (3): login tanpa callback → link absolut; daftar dengan callback tetap dihormati; klik link → akun terverifikasi + redirect ke aplikasi. Terbukti MERAH tanpa perbaikan.

## Di luar scope
Mengubah `login-form` agar mengirim callbackURL (berisiko: `signIn` dengan `callbackURL` membuat klien Better Auth ikut mengalihkan setelah login sukses — alur login sendiri tidak disentuh).

## Keamanan
Tidak ada open redirect: relatif non-aman dibuang; absolut hanya yang sudah lolos pengecekan origin tepercaya Better Auth saat link dibuat. Token tidak diubah/di-log.

## Checklist
- [x] Typecheck nol · [x] API 2.377 lulus, data uji dibersihkan · [x] Security review inline: 0 temuan · [x] Dokumen

## Known Limitations
- Link yang SUDAH terkirim sebelum perbaikan tetap berisi `callbackURL=/` (tetap mendarat di 404, tetapi akun sudah terverifikasi — pelanggan cukup login di aplikasi). Pelanggan yang belum klik: login ulang akan mengirim link baru yang benar.
- Setelah verifikasi dari jalur login, tujuan adalah halaman utama aplikasi (bukan halaman spesifik).
