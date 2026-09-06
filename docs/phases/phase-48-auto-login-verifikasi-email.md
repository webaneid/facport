# Fase 48 — Auto-Login Setelah Verifikasi Email + Bawa Pilihan Paket

**Status:** Done
**Mulai:** 2026-09-06
**Selesai:** 2026-09-06

## Tujuan
User pilih sub-modul di landing (§ Fase 47 `module-features.tsx`) → belum
punya akun → daftar. Sebelumnya, setelah klik link verifikasi email, user
harus login MANUAL lagi, dan pilihan paket dari landing hilang di tengah
jalan (tidak pernah dibawa lewat proses daftar sama sekali). User minta:
begitu klik link verifikasi, langsung login DAN mendarat di halaman
berlangganan dengan paket sudah ke-centang, tinggal klik checkout.

## Scope
- [x] `apps/api/src/lib/auth.ts` — `emailVerification.autoSignInAfterVerification: true`
- [x] `apps/web/lib/safe-redirect.ts` (baru) — extract `getSafeRedirect()` dari `login-form.tsx`, dipakai bersama
- [x] `apps/web/components/auth/register-form.tsx` — baca `?redirect=`, kirim `callbackURL` absolute ke `signUp.email()`
- [x] `apps/web/components/auth/login-form.tsx` — pakai `getSafeRedirect()` dari lib bersama (tidak ada perubahan behavior)
- [x] `apps/web/app/app/login/page.tsx` — teruskan `redirect` ke link "Daftar"
- [x] `apps/web/app/app/register/page.tsx` — teruskan `redirect` ke link "Login"

## Referensi
- Landasan: `docs/phases/phase-47-landing-page-redesign.md` (`module-features.tsx` sudah kirim `/login?redirect=/subscribe?plans=...`)
- `apps/web/app/app/(protected)/subscribe/page.tsx` (pre-select dari `?plans=` sudah ada sejak Fase 17, tidak diubah)

## Keputusan Kecil Selama Eksekusi
- **Bukan `databaseHooks`** untuk hal ini — `autoSignInAfterVerification` adalah
  opsi resmi Better Auth khusus endpoint `verify-email`, bukan hook custom.
- `callbackURL` WAJIB dibangun `window.location.origin` + path (bukan
  hardcode `NEXT_PUBLIC_APP_URL`) — otomatis benar baik di dev
  (`app.localhost:6209`) maupun prod (`app.facport.com`), karena
  `register-form.tsx` SELALU dirender di surface app.
- Validasi `getSafeRedirect()` (extract ke `lib/safe-redirect.ts`) tetap
  jadi garis pertahanan utama open-redirect — link "Daftar"/"Login" saling
  meneruskan `redirect` APA ADANYA (tidak divalidasi ulang di situ), aman
  karena kedua form client yang benar-benar konsumsi nilainya SELALU lewat
  `getSafeRedirect()` sebelum dipakai.

## Known Limitations
- **Dev lokal (`.localhost`) tidak bisa diverifikasi end-to-end penuh** —
  cookie hasil auto-login di-set oleh `apps/api` (link diklik langsung dari
  email, bukan lewat proxy `apps/web`), sementara `crossSubDomainCookies`
  sengaja nonaktif khusus `.localhost` (Chrome tolak diam-diam
  `Domain=.localhost`, § lessons-learned 2026-08-19/27). Efeknya: di dev,
  redirect ke `app.localhost:6209/subscribe` akan kelihatan seperti balik
  ke `/login` lagi walau proses verifikasi & auto-login di sisi API sendiri
  SUKSES (dibuktikan test regresi `app.test.ts`, cek `set-cookie` header
  langsung, bukan lewat browser). **Production tidak kena batasan ini**
  (`COOKIE_DOMAIN=.facport.com`) — WAJIB diverifikasi manual di
  staging/production sebelum dianggap benar-benar smooth end-to-end.
- Email verifikasi sendiri masih lewat Resend, dan `RESEND_API_KEY` belum
  dikonfigurasi di dev (§ Fase 45 pending item) — jadi uji manual di dev
  tetap butuh baca token dari job queue/DB, bukan klik link email asli.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck` — apps/api & apps/web)
- [x] Security review dijalankan — inline, lihat ringkasan di bawah
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — tidak ada temuan
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda — tidak ada (limitation dev-only sudah dicatat di sini + komentar kode)
- [x] `docs/PROGRESS.md` diupdate

## Ringkasan Hasil
`autoSignInAfterVerification: true` diaktifkan di Better Auth. `RegisterForm`
sekarang membawa `redirect` (dari landing, lewat `/login?redirect=...` →
link "Daftar") sebagai `callbackURL` absolute ke `signUp.email()`. Better
Auth menyimpan `callbackURL` itu ke dalam link verifikasi email, dan
begitu user klik link tsb: verifikasi email → auto-login (cookie sesi
langsung ke-set) → redirect browser LANGSUNG ke `callbackURL`
(`/subscribe?plans=...`) — mendarat dengan paket sudah ke-preselect
(mekanisme pre-select di `subscribe/page.tsx` sudah ada sejak Fase 17,
tidak perlu diubah), tinggal klik checkout.

Test suite `apps/api`: 357 pass, 0 fail (naik dari 355, 2 test baru:
role-customer-otomatis dari Fase sebelumnya masih dihitung + 1 test baru
verify-email auto-login end-to-end). Typecheck & lint web 0 error.
