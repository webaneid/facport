# Fase 44 — Audit & Perbaikan Timezone Menyeluruh

**Status:** Done
**Mulai:** 2026-09-06
**Selesai:** 2026-09-06

## Tujuan
User meminta audit menyeluruh: "cek semua penyimpanan, berlangganan,
maupun trial, semua harus sesuai dengan timezone kita... kalau salah ini,
fatal, berlangganan tidak benar terhitung-nya hanya karena timezone."
Setting `company.timezone` sudah ada sejak Fase 00/01 tapi belum pernah
diverifikasi benar-benar dipakai di kode.

## Scope
- [x] Audit semua timestamp/date handling: schema DB, job terjadwal
      (`EXPIRE_SUBSCRIPTIONS`/`PURGE_OLD_IMPORTS`/cron pg-boss), parser
      tanggal Excel→Accurate, kalkulasi `endAt` self-service/trial,
      display formatting, input tanggal-saja (`<input type="date">`).
- [x] Fix `todayAccurateDate()` (backend) — pakai `company.timezone`,
      bukan local server time.
- [x] Fix konversi `endAt` admin manual (create + edit) — pakai
      `endOfDayInTimezone`, bukan UTC-midnight-parse langsung.
- [x] Fix "Tanggal Transfer" bukti bayar manual — pakai `middayInTimezone`.
- [x] Wire `company.timezone` yang SEBENARNYA (dari admin settings) ke
      SEMUA 16 titik `formatDate()` — sebelumnya hardcode "Asia/Jakarta"
      literal, setting jadi decorative.
- [x] `CompanyTimezoneProvider` (Context) dipasang di root layout,
      melingkupi 3 surface (landing/admin/app) termasuk halaman publik.

## Referensi
- ADR: `docs/decisions/adr-0028-timezone-aware-date-handling.md`
  (rasional lengkap, alternatif dipertimbangkan, konsekuensi)
- Architecture doc: `docs/architecture/architecture-settings.md` §
  "Aturan Timezone" (update — tambah kasus input tanggal-saja),
  `docs/architecture/architecture-subscription.md` (update — catatan
  `endAt` di § "Dua Jalur Registrasi")

## Keputusan Kecil Selama Eksekusi
- TIDAK install `date-fns-tz` (disebut sebagai CONTOH di
  architecture-settings.md tapi ternyata tidak pernah benar-benar
  diinstall) — native `Intl.DateTimeFormat` cukup, hindari dependency
  baru untuk ~70 baris logic (`apps/web/lib/timezone.ts`).
- `todayAccurateDate()` diubah jadi `async` + terima parameter opsional
  `now: Date` (default `new Date()`) — supaya testable tanpa fake-timer
  library, pola umum "current time sebagai parameter".
- `formatDate()` (`apps/web/lib/utils.ts`) — parameter `timeZone` WAJIB
  (bukan default diam-diam) — sengaja, supaya lupa pass timezone jadi
  type error compile-time, bukan bug silent yang baru ketahuan lewat
  laporan user.
- `ImportBatchTable` (dipakai dari Server Component DAN Client Component)
  terima `timezone` sebagai PROP, bukan `useCompanyTimezone()` — hook
  tidak bisa dipanggil dari Server Component pemanggilnya
  (`app/(protected)/page.tsx`).
- 2 fungsi konversi terpisah di `lib/timezone.ts`: `endOfDayInTimezone`
  (untuk field yang menentukan aktif/expired — butuh presisi kapan
  sesuatu BERHENTI berlaku) vs `middayInTimezone` (untuk tanggal
  sekadar catatan — cukup "aman dari pergeseran kalender", tidak perlu
  presisi akhir-hari).
- Test representative: unit test PENUH untuk fungsi murni
  (`lib/timezone.test.ts`, `lib/accurate-vendor.test.ts` untuk
  `todayAccurateDate`) — TIDAK menulis test komponen untuk
  `admin/users/page.tsx` (project ini tidak test halaman individual,
  cuma pure logic dan auth forms).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`, api+web) — 0 error
- [x] Security review dijalankan (inline) — perubahan murni perbaikan
      logic tanggal/timezone, tidak menyentuh auth/permission/validasi
      input baru selain format tanggal itu sendiri. 0 temuan.
- [x] Temuan Critical/High sudah diperbaiki — 2 bug FATAL (endAt admin,
      todayAccurateDate) sudah diperbaiki + test.
- [x] Temuan Medium/Low dicatat — 1 (transferDate, dampak rendah) sudah
      ikut diperbaiki sekalian (bukan ditunda).
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- `company.timezone` belum pernah disimpan sebagai row DB di environment
  manapun sampai admin benar-benar buka `/admin/settings` dan klik
  Simpan minimal 1x — SEMUA kode sudah punya fallback default
  `"Asia/Jakarta"` di titik ini (backend `getCompanyTimezone()`, frontend
  `DEFAULT_COMPANY_TIMEZONE` di root layout), jadi tidak crash, cuma
  belum "aktif" secara eksplisit sampai admin submit form minimal 1x.
- Cron `EXPIRE_SUBSCRIPTIONS`/`PURGE_OLD_IMPORTS`/`REFRESH_ACCURATE_TOKEN`
  (pg-boss `boss.schedule(...)`) jalan di jam UTC (01:00/03:00/02:00
  UTC = 08:00/10:00/09:00 WIB) — TIDAK bug (perbandingan `endAt < now()`
  timezone-safe, jam eksekusi cron cuma soal KAPAN dicek, bukan BENAR/
  SALAHNYA hasil), tapi kalau nanti mau jam eksekusi yang lebih intuitif
  buat tim Indonesia (mis. dini hari WIB, bukan pagi WIB), tinggal
  tambah `{tz: "Asia/Jakarta"}` di opsi `schedule()` — sengaja TIDAK
  diubah sekarang (di luar scope "counting salah", cuma soal jadwal).

## Ringkasan Hasil
Audit menyeluruh menemukan 2 bug FATAL yang cocok persis dengan
kekhawatiran user:
1. **`endAt` subscription admin-manual** (create + edit) — date-picker
   diparse sebagai UTC midnight, bikin subscription berhenti aktif ~7
   jam (Asia/Jakarta) LEBIH AWAL dari yang admin maksud. Fix:
   `endOfDayInTimezone()`.
2. **`todayAccurateDate()`** — pakai local server time (bukan timezone
   perusahaan) untuk `transDate` auto-create vendor/customer di
   Accurate — di production (container tanpa `TZ`, default UTC), salah
   1 HARI selama jendela 00:00-06:59 WIB tiap hari. Fix: baca
   `company.timezone` + `Intl.DateTimeFormat`.

Ditemukan juga: setting `company.timezone` (ada sejak awal) TIDAK PERNAH
benar-benar dipakai untuk display (`formatDate` hardcode "Asia/Jakarta"
literal) — sekarang di-wire penuh lewat `CompanyTimezoneProvider` (root
layout) ke SEMUA 16 titik format tanggal.

Diverifikasi SUDAH BENAR (tidak diubah): kalkulasi `endAt` self-service/
trial (aritmetika milidetik, timezone-safe), job `EXPIRE_SUBSCRIPTIONS`/
`PURGE_OLD_IMPORTS` (perbandingan instant absolut), parser tanggal
Excel→Accurate (`toAccurateDate()`, sudah pakai UTC getters konsisten),
semua kolom timestamp DB (semua `timestamptz`).

Typecheck 0 error (api+web). Test suite: `apps/api` 288 pass/0 fail (3
baru — `accurate-vendor.test.ts`, membuktikan `todayAccurateDate` genuinely
baca setting timezone lewat 2 timezone berbeda pada instant yang sama),
`apps/web` 15 pass/0 fail (4 baru — `lib/timezone.test.ts`, termasuk
verifikasi round-trip akhir-hari yang menangkap bug rounding milidetik
`Intl.DateTimeFormat` sebelum sempat shipped). Lint 0 error. Security
review inline: 0 temuan.
