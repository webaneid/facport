# Fase 32 — Fondasi Test Frontend (Bun Test + React Testing Library)

**Status:** Done
**Mulai:** 2026-09-05
**Selesai:** 2026-09-05

## Tujuan
Gap #2 dari audit fondasi (§ Update PROGRESS.md sebelum Fase 31): `apps/web`
TIDAK punya test runner/library apa pun, walau
`docs/architecture/architecture-testing.md` sudah mensyaratkan component
test untuk komponen ber-logic. Fase ini pasang fondasinya (Bun test +
React Testing Library, KONSISTEN dengan `apps/api` yang sudah `bun:test`
— bukan Vitest/Jest, supaya cuma 1 test runner di seluruh monorepo), lalu
buktikan pola-nya jalan dengan test NYATA untuk 3 komponen auth yang baru
dibuat Fase 31 (paling kritis, paling baru, belum ada verifikasi
otomatis sama sekali).

## Scope
- [x] `apps/web/package.json` — devDependencies baru: `happy-dom`,
      `@happy-dom/global-registrator`, `@testing-library/react`,
      `@testing-library/dom`, `@testing-library/jest-dom`,
      `@testing-library/user-event`. Script `"test": "bun test"`.
- [x] `apps/web/bunfig.toml` (baru) — `[test].preload` 2 file BERURUTAN
      (§ Keputusan Kecil untuk alasan kenapa harus 2, bukan 1).
- [x] `apps/web/test/happydom.ts` (baru) — CUMA registrasi DOM
      (`GlobalRegistrator.register()`), TIDAK IMPORT package
      testing-library apa pun.
- [x] `apps/web/test/setup.ts` (baru) — matcher jest-dom
      (`expect.extend`) + `afterEach(cleanup)`, jalan SETELAH
      `happydom.ts`.
- [x] `apps/web/test/jest-dom.d.ts` (baru) — augmentasi tipe `bun:test`
      manual untuk matcher jest-dom yang dipakai (`toBeInTheDocument`,
      `toHaveAttribute`) — TIDAK reference `types/bun.d.ts` bawaan paket
      (path itu tidak ada di `exports` map package.json-nya, fragile).
- [x] `apps/web/test/smoke.test.tsx` (baru) — verifikasi fondasi jalan.
- [x] `package.json` (root) — `"test"` sekarang jalanin API DAN web.
- [x] Test komponen NYATA (3 file, 10 test): `components/auth/login-form.test.tsx`,
      `forgot-password-form.test.tsx`, `reset-password-form.test.tsx` —
      semua network call (`authClient`) DAN `next/navigation` di-mock
      pakai `mock.module()` Bun.

## Referensi
- Gap ditemukan saat audit fondasi (diminta user, sebelum Fase 31)
- Syarat yang belum terpenuhi → `docs/architecture/architecture-testing.md` § apps/web
- Komponen yang dites → Fase 31 (`components/auth/*.tsx`)

## Keputusan Kecil Selama Eksekusi — 2 Bug Non-Obvious Ditemukan & Diperbaiki

**Bug #1 — `GlobalRegistrator.register()` harus di-`await` DI FILE
TERPISAH dari import testing-library.** Awalnya 1 file preload berisi
SEMUA setup (registrasi DOM + import `@testing-library/react` buat
`cleanup` + matcher). Test terus gagal `"global document has to be
available"` MESKI `register()` sudah pakai `await`. Root cause: ES
module import DI-HOIST — `import { cleanup } from "@testing-library/react"`
di ATAS file (walau ditulis SEBELUM baris `await register()`) tetap
DIEVALUASI LEBIH DULU sebagai bagian resolusi modul, sebelum SATU baris
kode di file itu sendiri jalan. `@testing-library/dom`'s `screen`
singleton dihitung SEKALI saat modul itu dievaluasi (`const screen =
typeof document !== "undefined" ? ... : (stub yang selalu throw)`) —
BUKAN lazy getter. Jadi `@testing-library/dom` sempat "lahir rusak"
(document belum ada) SEBELUM registrasi DOM sempat jalan sama sekali.
**Fix**: pisah jadi 2 file preload, `bunfig.toml` `[test].preload`
array-nya BERURUTAN — `happydom.ts` (CUMA registrasi, 0 import
testing-library) WAJIB duluan, `setup.ts` (import testing-library +
matcher) belakangan.

**Bug #2 — `<input type="email">` MEMBLOKIR event `submit` TOTAL kalau
diisi string non-kosong yang gagal format email**, SEBELUM sempat
sampai ke react-hook-form/zod sama sekali (constraint validation bawaan
browser, happy-dom ikut mengimplementasikan). Test "email tidak valid"
awalnya pakai `user.type(emailInput, "bukan-email")` — signInEmail TIDAK
pernah terpanggil DAN pesan error zod TIDAK PERNAH muncul, padahal
logic komponennya benar. **Fix**: test validasi client-side untuk field
`type="email"` HARUS pakai field KOSONG (lolos constraint browser
karena tidak ada atribut `required`, baru ditolak Zod di JS), BUKAN
string yang "kelihatan salah" — dicatat di komentar tiap test yang
kena pola ini supaya tidak salah diagnosis lagi.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — 0 error (api+web,
      termasuk augmentasi tipe jest-dom kustom)
- [x] Security review — TIDAK relevan (murni tooling test, 0 kode
      production berubah kecuali `package.json`/`bunfig.toml`)
- [x] Temuan Critical/High — N/A
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Component test BARU untuk 3 komponen auth (Fase 31) — belum ada test
  untuk komponen LAIN yang sudah ada sebelumnya (puluhan halaman/dialog
  dari Fase 03-30). Fondasinya sudah siap dipakai, tinggal ditambah
  bertahap per komponen yang disentuh ke depan (§ prinsip
  `architecture-testing.md`: test untuk komponen BER-LOGIC, bukan
  retroaktif semua sekaligus).
- E2E (Playwright) SENGAJA belum disentuh fase ini — scope terpisah,
  lebih besar (browser otomatisasi sungguhan), user pilih fondasi +
  component test dulu saat ditanya.

## Ringkasan Hasil

`apps/web` sekarang punya fondasi test otomatis: Bun test (native,
KONSISTEN dengan `apps/api`, bukan Vitest/Jest terpisah) + React Testing
Library + happy-dom (DOM environment) + jest-dom (matcher). Dibuktikan
lewat 10 test NYATA untuk 3 komponen auth Fase 31 (LoginForm,
ForgotPasswordForm, ResetPasswordForm) — submit valid, validasi
client-side, error dari server, link navigasi — semua network call
(`authClient`) DAN hook Next.js (`next/navigation`) di-mock pakai
`mock.module()` bawaan Bun, TANPA library mocking tambahan.

Proses setup menemukan 2 bug non-obvious (bukan cuma "pasang lalu
jalan") — KEDUANYA didiagnosis sampai akar penyebab (bukan tebak-tebak
workaround) dan dicatat detail di § "Keputusan Kecil" atas supaya sesi
berikutnya tidak mengulang proses debug yang sama:
1. Urutan preload file penting — registrasi DOM WAJIB modul TERPISAH
   TANPA import testing-library, karena ES import hoisting bikin
   `@testing-library/dom`'s `screen` singleton "lahir rusak" kalau
   modul yang sama juga import testing-library.
2. `<input type="email">` browser constraint validation MEMBLOKIR
   submit total untuk value non-kosong yang salah format, SEBELUM
   sempat ke JS — test validasi client-side utk field ini WAJIB pakai
   field KOSONG, bukan string yang "kelihatan salah".

Typecheck 0 error (api+web), lint 0 error, test suite `apps/web`: 11
pass/0 fail (4 file). `bun run test` root SEKARANG jalanin API (198
test) + web (11 test) = 209 test total. CI (`ci.yml`) otomatis ikut
terverifikasi tanpa perubahan tambahan (lockfile sudah ter-update,
`bun install --frozen-lockfile` yang sudah ada di CI cukup).
