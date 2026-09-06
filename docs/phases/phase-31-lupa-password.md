# Fase 31 — Fitur Lupa Password (Reset Mandiri)

**Status:** Done
**Mulai:** 2026-09-05
**Selesai:** 2026-09-05

## Tujuan
Ditemukan saat audit fondasi (diminta user): **tidak ada jalur pemulihan
password mandiri sama sekali** — user (customer maupun admin/staff) yang
lupa password sebelumnya HARUS minta bantuan admin manual. User pilih
ini sebagai prioritas #1 untuk dibereskan sebelum lanjut fitur baru.

## Scope
- [x] `apps/api/src/lib/auth.ts` — tambah `emailAndPassword.sendResetPassword`
      (endpoint `/request-password-reset`/`/reset-password/:token`/
      `/reset-password` SUDAH BAWAAN Better Auth — core, bukan plugin,
      sudah otomatis ter-mount lewat `.mount(auth.handler)` di `app.ts`
      — TINGGAL kasih callback ini supaya beneran kirim email).
- [x] `apps/web/proxy.ts` — tambah `/forgot-password`/`/reset-password`
      ke daftar halaman yang TIDAK digate sesi (persis alasan
      `/login`/`/register` — user yang lupa password by definition
      tidak punya sesi aktif).
- [x] `apps/web/components/auth/forgot-password-form.tsx` (baru) — form
      email, pesan sukses GENERIK (tidak bocor status "email
      terdaftar/tidak", sama seperti response server Better Auth).
- [x] `apps/web/components/auth/reset-password-form.tsx` (baru) — baca
      `token` dari query string, password baru + konfirmasi (min 8
      karakter, `.refine()` cocok — pola sama `profile-settings.tsx`).
- [x] `apps/web/components/auth/login-form.tsx` — tambah link "Lupa
      password?".
- [x] 4 halaman baru (2 surface × 2 halaman): `admin/forgot-password`,
      `admin/reset-password`, `app/forgot-password`, `app/reset-password`
      — masing-masing render komponen shared, gaya visual mengikuti
      halaman login existing di surface masing-masing.
- [x] Test: `app.test.ts` (2 test baru) — end-to-end lewat `app` penuh:
      request-reset → ambil token ASLI dari tabel `verification` →
      reset-password → login password lama ditolak, password baru
      berhasil. Plus test "generik, tidak bocor info" untuk email yang
      tidak terdaftar.

## Referensi
- Endpoint Better Auth (built-in, diverifikasi ke source `password.mjs`
  versi terpasang 1.7.1 — bukan asumsi dari training data, API ini
  ADA & stabil, beda dari `hooks`/`databaseHooks` yang TIDAK ada di
  versi ini, § lessons-learned.md)
- Pola email job queue → `docs/architecture/architecture-notifications.md`
  (kalau ada) / `lib/auth.ts` `sendVerificationEmail` (pola yang di-mirror)

## Keputusan Kecil Selama Eksekusi
- **Tidak perlu endpoint backend custom sama sekali** — Better Auth
  SUDAH punya endpoint lengkap (request-reset, callback redirect,
  reset) sebagai bagian CORE (bukan plugin terpisah yang perlu
  diaktifkan). Kerjaan sesungguhnya cuma: (1) kasih `sendResetPassword`
  callback (tanpa ini Better Auth balas "RESET_PASSWORD_DISABLED"),
  (2) bikin halaman FRONTEND buat 2 langkah alurnya (yang belum ada).
- **Rate limit test file** (`app.test.ts`) sempat gagal 429 — SEMUA
  request test di file itu berbagi 1 bucket rate-limit "unknown" (IP
  default kalau `x-real-ip` tidak diisi, § `getClientIp()`
  `lib/rate-limit.ts`). Fix: kasih `x-real-ip` unik ke test baru ini
  (`signUp`/`signIn` diperluas terima `extraHeaders` opsional,
  backward-compatible — pemanggil lain tidak berubah perilakunya).
  Bukan workaround yang melemahkan test, ini justru meniru realita
  (client beda IP tidak saling makan kuota rate-limit).
- Server-side `minPasswordLength` SUDAH ditegakkan Better Auth sendiri
  (`resetPassword` handler, `password.mjs:153`) — validasi 8-karakter
  di frontend (`zod`) itu UX, bukan satu-satunya lapis, konsisten
  dengan prinsip project (backend tetap penjaga utama).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — 0 error (api+web)
- [x] Security review dijalankan (inline) — endpoint BAWAAN Better Auth
      (bukan endpoint custom yang saya tulis dari nol), sudah punya
      mitigasi timing-attack/enumeration & origin-check BUILT-IN
      (diverifikasi baca source). Perubahan sisi kita murni: 1 callback
      kirim email + halaman frontend baru (tidak ada logic
      keamanan baru yang saya tulis sendiri). 0 temuan.
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan — 0)
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau
      ditunda (tidak ada temuan)
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Tidak ada rate limit KHUSUS untuk `/request-password-reset` di luar
  limit umum `/api/auth` yang sudah ada (10 req/60s per IP) — dianggap
  cukup untuk sekarang, sama seperti endpoint auth lain.
- Verifikasi visual browser TIDAK dilakukan (Chrome extension tidak
  tersambung) — TAPI end-to-end SUDAH diverifikasi manual via curl
  lewat proxy dev (sign-up → request-reset → ambil token asli dari DB →
  reset → login password baru berhasil, password lama ditolak) sebelum
  fase ditutup.

## Ringkasan Hasil

User sekarang (customer maupun admin/staff) bisa reset password mandiri
lewat link "Lupa password?" di halaman login — kirim email berisi link,
klik link, atur password baru, langsung bisa login. Ternyata Better
Auth (versi 1.7.1 terpasang) SUDAH punya endpoint lengkap untuk ini
sebagai bagian CORE (bukan plugin) — gap-nya BUKAN "backend belum
dibangun", tapi (1) callback `sendResetPassword` belum diisi (jadi
Better Auth aktif menolak dengan "RESET_PASSWORD_DISABLED"), dan (2)
belum ada halaman frontend sama sekali untuk 2 langkah alurnya.

Typecheck 0 error (api+web), lint 0 error, test suite 198 pass/0 fail
(naik dari 196, 2 test baru — end-to-end pakai token asli dari tabel
`verification`, bukan mock). Diverifikasi manual end-to-end via curl
lewat proxy dev (bukan cuma test otomatis) sebelum fase ditutup — alur
penuh sign-up → lupa password → reset → login password baru berhasil,
password lama ditolak, semuanya benar. Data test dibersihkan lagi, sisa
`admin@facport.test` + `user@facport.com`.
