# Fase 42 — QRIS: Baca Payload EMV Otomatis dari Foto Barcode

**Status:** Done
**Mulai:** 2026-09-06
**Selesai:** 2026-09-06

## Tujuan
Lanjutan langsung dari bug fix whitespace payload EMV (§ `docs/lessons-learned.md`
2026-09-06) — user tunjuk akar masalah SEBENARNYA: alur lama MEWAJIBKAN
admin scan/decode barcode QRIS mereka sendiri pakai alat eksternal, lalu
copy-paste teksnya manual ke form. Ini bukan cuma rawan whitespace —
seluruh langkah manual itu TIDAK PERLU ADA: foto QRIS yang diupload
SUDAH berisi persis payload EMV yang dicari. User minta sistem BACA
LANGSUNG dari barcode-nya secara otomatis.

## Scope
- [x] `apps/api/package.json` — tambah dependency `jsqr` (decoder QR
      pure-JS, tanpa native binding, terima raw pixel data).
- [x] `apps/api/src/lib/qris-decode.ts` (baru) — `decodeQrisEmvPayload(buffer)`:
      `sharp().ensureAlpha().raw()` (dependency existing, Fase 12) untuk
      dapat raw RGBA pixel data dari gambar apa pun yang diupload, lalu
      `jsQR` baca QR code-nya. Hasil divalidasi lewat
      `isValidQrisPayload()` (`qris-emv.ts`, sudah ada) sebelum
      dianggap payload QRIS yang benar — return `null` (bukan throw)
      kalau gagal di TIAP langkah (bukan gambar valid / tidak ada QR
      code / QR code valid tapi isinya bukan format QRIS).
- [x] `apps/api/src/lib/qris-decode.test.ts` (baru, 5 test) — round-trip
      NYATA pakai `qrcode` package (generate QR sungguhan berisi
      payload EMV, decode balik, cocok persis); QR berisi URL biasa →
      null; gambar bukan QR → null; buffer bukan gambar sama sekali →
      null (bukan throw); payload ber-whitespace DI DALAM QR tetap
      di-trim (defense-in-depth, konsisten fix sebelumnya).
- [x] `apps/api/src/routes/admin/branding.route.ts` — endpoint
      `POST /admin/branding/qris-image` sekarang JUGA decode gambar
      yang diupload, return `{ url, emvPayload }` (bukan cuma `{ url }`).
- [x] `apps/web/app/admin/(protected)/settings/page.tsx` —
      `handleQrisImageChange` auto-isi `emvPayload` + AKTIFKAN
      `isDynamic: true` OTOMATIS kalau decode berhasil (toast sukses);
      kalau gagal, tetap upload gambarnya (fallback isian manual TETAP
      ada, toast peringatan menjelaskan kenapa). Update copy CardDescription
      + label field EMV supaya sesuai perilaku baru.

## Bug tersendiri ditemukan & di-fix SEBELUM lanjut ke fitur ini
`bun add jsqr` sempat dijalankan dari `apps/api` (bukan root workspace)
— ini bikin `elysia` ter-resolve jadi 2 SALINAN FISIK berbeda di
`node_modules/.bun` (hash package berbeda), bikin `apps/web/lib/api-client.ts`
(Eden Treaty, import type `App` dari `apps/api/src/index.ts`) gagal
typecheck (`Type ... does not satisfy constraint 'Elysia<...>'` —
TypeScript anggap 2 salinan fisik yang sama versinya sebagai tipe
BERBEDA). Fix: `rm -rf node_modules && bun install` dari ROOT
(bukan cuma revert lockfile) — workspace bun HARUS di-install dari
root supaya semua package saling berbagi 1 salinan dependency yang
sama, TIDAK dari subfolder masing-masing.

## Referensi
- Bug pemicu (whitespace manual copy-paste): `docs/lessons-learned.md`
  2026-09-06 § "QRIS dinamis gagal simpan"
- QRIS dinamis (kenapa perlu payload EMV sama sekali):
  `docs/architecture/architecture-payment.md` § "QRIS Dinamis"

## Keputusan Kecil Selama Eksekusi
- Decode logic DIPISAH ke `lib/qris-decode.ts` (bukan inline di route)
  — konsisten pola `qris-emv.ts` (logic murni dites langsung via unit
  test, bukan lewat round-trip HTTP+MinIO yang belum ada precedent-nya
  di test suite project ini).
- `isDynamic` diaktifkan OTOMATIS begitu decode berhasil (bukan cuma
  isi field-nya, biarkan admin centang manual) — sesuai tujuan
  eksplisit user: "generating barcode itu yg akan menjadi dinamis".
  Admin tetap BISA uncheck manual kalau memang tidak mau dinamis.
- Kalau decode gagal, TIDAK memblokir upload — gambar tetap tersimpan
  sebagai QRIS statis biasa (perilaku lama), cuma tidak auto-isi EMV.
  Fallback isian manual TETAP ada (tidak dihapus), untuk kasus foto
  buram atau barcode yang memang bukan format QRIS standar.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`, api+web) — 0 error
- [x] Lint nol error (`bun run lint`) — 0 error
- [x] Test suite penuh `apps/api` — **271 pass / 0 fail** (5 baru, naik
      dari 266), termasuk verifikasi ROUND-TRIP NYATA (generate QR
      sungguhan, bukan mock)
- [x] Security review inline: dependency baru (`jsqr`) pure-JS tanpa
      native binding/network call, decode function dibungkus try/catch
      (terverifikasi via test: buffer sampah → `null`, bukan crash),
      hasil decode TETAP divalidasi lewat `isValidQrisPayload` yang
      sama seperti input manual (tidak ada jalur bypass validasi baru).
      0 temuan.
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Verifikasi visual browser TIDAK dilakukan (ekstensi Chrome tidak
  tersambung) — diverifikasi lewat unit test round-trip QR sungguhan +
  typecheck.
- Kalau foto QRIS blur/resolusi rendah/pantulan cahaya (kondisi umum
  foto barcode fisik pakai HP), `jsQR` bisa gagal membaca — fallback
  isian manual TETAP tersedia untuk kasus ini, sesuai desain (best-effort,
  bukan garansi).

## Ringkasan Hasil
Admin sekarang CUKUP upload 1 foto QRIS statis — payload EMV di
dalamnya dibaca OTOMATIS, `isDynamic` diaktifkan otomatis kalau
berhasil, TANPA perlu cari alat scan/decode eksternal & copy-paste
manual sama sekali (akar masalah yang memicu 2 bug sebelumnya di hari
yang sama). Fallback manual tetap ada untuk kasus foto tidak terbaca.

Ditemukan & diperbaiki juga: bug dependency-duplication (`elysia`
ter-install 2 salinan fisik) akibat `bun add` dijalankan dari subfolder
alih-alih root workspace — pelajaran untuk sesi berikutnya: SELALU
install dependency baru dari root repo di monorepo bun workspace ini.

Typecheck 0 error (api+web), lint 0 error, test suite 271 pass/0 fail
(5 baru — round-trip QR sungguhan, bukan mock). Security review inline:
0 temuan.
