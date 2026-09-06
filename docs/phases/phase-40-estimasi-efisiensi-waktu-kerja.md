# Fase 40 — Estimasi Efisiensi Waktu Kerja (Dashboard Customer)

**Status:** Done
**Mulai:** 2026-09-06
**Selesai:** 2026-09-06

## Tujuan
User minta fitur baru untuk bikin customer "benar-benar sadar" Facport
menghemat waktu kerja dibanding input manual di Accurate Online:
1. Setting baru di `/admin/settings` — estimasi rata-rata detik yang
   dibutuhkan staf untuk input 1 baris data manual di Accurate (admin
   kalibrasi sendiri, default **30 detik**).
2. Card baru di dashboard customer (`app.`): total baris berhasil
   diimport (milik user itu sendiri, lintas SEMUA modul).
3. Card kedua, background warna primary + teks putih: "Anda telah
   efisiensi waktu kerja sebanyak: {total detik dari #1 × setting #1,
   diformat Jam/Menit/Detik}".

## Scope
- [x] `apps/api/src/lib/manual-input-estimate.ts` (baru) — konstanta
      `MANUAL_INPUT_SECONDS_SETTING_KEY` (`"data.manualInputSecondsPerRow"`),
      `DEFAULT_MANUAL_INPUT_SECONDS_PER_ROW` (30), batas 1–3600 detik.
- [x] `apps/api/src/routes/settings.route.ts` — validasi server untuk
      key baru (integer, 1–3600), pola sama persis
      `IMPORT_RETENTION_SETTING_KEY`.
- [x] `apps/web/app/admin/(protected)/settings/page.tsx` — card baru
      "Estimasi Waktu Input Manual per Baris", field "Detik per Baris",
      validasi client sama batasnya, default tampil 30 kalau belum
      pernah diisi.
- [x] `apps/api/src/routes/me.route.ts` — endpoint baru `GET /me/stats`:
      `successfulRowCount` (COUNT `import_batch_rows.status = 'success'`
      JOIN `import_batches` WHERE `userId` = user ini, GABUNGAN semua
      modul — baris `cancelled`/`failed`/batch user lain TIDAK ikut) +
      `estimatedTimeSavedSeconds` (dikalikan DI SERVER, bukan di
      frontend — 1 sumber kebenaran logic).
- [x] `apps/web/lib/utils.ts` — `formatWorkTimeSaved(totalSeconds)`,
      cascade Jam→Menit→Detik, unit bernilai 0 disembunyikan kecuali
      semua 0 (tampil "0 Detik").
- [x] `apps/web/app/app/(protected)/page.tsx` — 2 card baru (grid 2
      kolom) tepat setelah banner invoice belum dibayar, SEBELUM grid
      Langganan/Koneksi Accurate: card 1 polos ("Baris Berhasil
      Diimport"), card 2 `bg-primary-600 text-white` (token yang sama
      dipakai `Button` default variant, § `components/ui/button.tsx`).
- [x] `apps/api/src/routes/me.route.test.ts` (baru, 2 test) — 401 tanpa
      login; hitung benar lintas 2 modul, EXCLUDE failed/cancelled/user
      lain (test ini yang KETEMU bug path routing di bawah).
- [x] `apps/api/src/routes/settings.route.test.ts` — 2 test baru untuk
      validasi `data.manualInputSecondsPerRow`.

## Bug ditemukan & di-fix SEBELUM tutup fase
Path endpoint baru salah tulis: `.get("/stats", ...)` alih-alih
`.get("/me/stats", ...)` — `meRoute` (`new Elysia()`, TANPA `{ prefix }`
seperti route lain) daftarkan path LENGKAP per endpoint (lihat `/me`
yang sudah ada), bukan relatif. Test yang baru ditulis LANGSUNG
menangkap ini (404 alih-alih 401/200) sebelum sempat lolos ke
production — bukti nyata kenapa endpoint baru tetap dites walau
`me.route.ts` sebelumnya tidak punya test sama sekali.

## Keputusan Kecil Selama Eksekusi
- Perhitungan `estimatedTimeSavedSeconds` dilakukan di BACKEND (bukan
  frontend fetch settings + hitung sendiri) — 1 sumber kebenaran,
  frontend cuma format tampilan (`formatWorkTimeSaved`).
- Baris `cancelled` (Batal Import, Fase 09) TIDAK dihitung sebagai
  "berhasil" — konsisten dengan definisi yang sama dipakai
  `admin/stats.route.ts` (Update 2026-09-06 sebelumnya, hari yang sama).
- Setting baru pakai skema key-value generik yang sudah ada
  (`settings` table, group `"data"`) — TIDAK butuh migration/kolom baru.
- Copy admin: "Estimasi Waktu Input Manual per Baris" / field "Detik
  per Baris" — deskripsi menjelaskan KENAPA angka ini penting (dipakai
  buat klaim ke customer), supaya admin termotivasi mengisi angka yang
  akurat, bukan asal.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`, api+web) — 0 error
- [x] Lint nol error (`bun run lint`) — 0 error (termasuk fix
      `react/no-unescaped-entities` untuk tanda kutip di description)
- [x] Test suite penuh `apps/api` — **262 pass / 0 fail** (4 baru, naik
      dari 258)
- [x] Security review inline: endpoint baru read-only (GET), tidak ada
      input user yang divalidasi kurang (`PUT /settings` reuse pola
      validasi retensi yang sudah ada), tidak ada data sensitif yang
      bocor (cuma angka agregat milik user sendiri, scoped by
      `userId`). 0 temuan.
- [x] Temuan Critical/High — tidak ada
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Verifikasi visual browser TIDAK dilakukan (ekstensi Chrome tidak
  tersambung) — diverifikasi lewat test suite otomatis + typecheck.
- Angka "detik per baris" adalah ESTIMASI admin (subjektif), bukan hasil
  pengukuran nyata per pelanggan — didokumentasikan jelas di deskripsi
  setting supaya admin sadar ini perlu dikalibrasi wajar, bukan
  angka sembarang.
- Setting `data.manualInputSecondsPerRow` yang sempat ditulis test
  (`45`) SUDAH dibersihkan manual dari database dev supaya tidak
  mengganggu default 30 di tampilan admin nyata — test lain di file
  yang sama (`company.bankAccounts` dkk) punya potensi pola serupa
  (tidak cleanup row settings sesudah tes), tapi itu di luar scope fase
  ini untuk diperbaiki.

## Ringkasan Hasil
Customer sekarang lihat 2 card baru di dashboard (`app.`): total baris
sukses diimport (miliknya sendiri, lintas semua modul yang dia
subscribe) dan estimasi waktu kerja yang dihemat dibanding input manual
— dihitung dari setting admin yang bisa dikalibrasi (`/admin/settings`,
default 30 detik/baris). Perhitungan 100% di server, format tampilan
("X Jam Y Menit Z Detik") di util frontend terpisah.

Typecheck 0 error (api+web), lint 0 error, test suite 262 pass/0 fail
(4 baru). 1 bug ditemukan & diperbaiki sebelum tutup fase (path routing
salah) — ditangkap justru oleh test yang baru ditulis untuk fitur ini,
bukan lolos ke user. Security review inline: 0 temuan.
