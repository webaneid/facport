# ADR-0028: Timezone-Aware Date Handling (Company Timezone Provider + Konversi Input)

**Status:** Accepted
**Tanggal:** 2026-09-06

## Context
User meminta audit menyeluruh: "cek semua penyimpanan, berlangganan, maupun
trial, semua harus sesuai dengan timezone kita... kalau salah ini, fatal,
berlangganan tidak benar terhitung-nya hanya karena timezone." Audit
menemukan setting `company.timezone` (ada sejak Fase 00/01,
`docs/architecture/architecture-settings.md`) **belum pernah benar-benar
dipakai** di kode manapun — murni tersimpan di DB tanpa efek nyata — dan
menemukan 2 KELAS bug nyata:

1. **Tanggal-only input diinterpretasikan sebagai UTC midnight, bukan
   akhir/tengah hari di timezone perusahaan.** `<input type="date">`
   (format "YYYY-MM-DD") dikirim lewat `new Date(str).toISOString()` —
   JS mem-parse string tanggal-saja ISO 8601 sebagai UTC MIDNIGHT.
   Ditemukan di 3 tempat:
   - Admin assign paket manual (`POST /admin/subscriptions` body
     `endAt`) — admin pilih "31 Desember" bermaksud "berlaku SAMPAI akhir
     hari itu", tapi tersimpan sebagai "31 Des 00:00 UTC" = "31 Des 07:00
     WIB" — subscription expired ~17 jam LEBIH AWAL dari yang admin
     maksud, PERSIS bug yang dikhawatirkan user.
   - Edit `endAt` subscription aktif (`PATCH /admin/subscriptions/:id`)
     — bug yang sama.
   - "Tanggal Transfer" bukti bayar manual (`order-pay-flow.tsx`) —
     dampak lebih kecil (sekadar catatan verifikasi admin, bukan
     perhitungan aktif/expired), tapi pola bug sama.
2. **`todayAccurateDate()` (`apps/api/src/lib/accurate-vendor.ts`) pakai
   getter LOCAL SERVER TIME** (`now.getDate()`/`getMonth()`/`getFullYear()`),
   bukan UTC dan bukan timezone perusahaan. Dipakai sebagai `transDate`
   saat auto-create Vendor/Customer baru di Accurate — di production
   (container tanpa `TZ` eksplisit, default OS timezone container adalah
   UTC), jendela 00:00–06:59 WIB (=17:00–23:59 UTC hari sebelumnya)
   bikin tanggal REGISTRASI vendor/customer baru tercatat SALAH 1 HARI
   di pembukuan Accurate customer, SETIAP HARI, tanpa terkecuali, selama
   jendela itu.

Sebaliknya, audit JUGA memverifikasi banyak tempat yang SUDAH BENAR
(tidak perlu diubah): `endAt` self-service/trial dihitung dari
`now.getTime() + N*86400000` (aritmetika milidetik murni, timezone-safe);
job `EXPIRE_SUBSCRIPTIONS`/`PURGE_OLD_IMPORTS` bandingkan instant absolut
(`endAt < now()`, timezone-safe); parser tanggal Excel→Accurate
(`toAccurateDate()` di tiap `import-mapping/*.ts`) SUDAH pakai
`Date.UTC`/`getUTCDate()` dkk secara konsisten; semua kolom timestamp di
skema database SUDAH `timestamptz`.

## Decision
1. **Backend** — `apps/api/src/lib/company-timezone.ts` (baru):
   `getCompanyTimezone()`, baca `settings.company.timezone`, fallback
   `DEFAULT_COMPANY_TIMEZONE = "Asia/Jakarta"`. `todayAccurateDate()`
   diubah jadi `async`, pakai `Intl.DateTimeFormat({timeZone})` dengan
   timezone dari helper ini (bukan lagi local getters).
2. **Frontend** — `apps/web/lib/timezone.ts` (baru): fungsi murni
   `endOfDayInTimezone(dateStr, tz)` (akhir hari 23:59:59.999, dipakai
   untuk `endAt` subscription/trial — "berlaku SAMPAI tanggal X") dan
   `middayInTimezone(dateStr, tz)` (tengah hari 12:00, dipakai untuk
   tanggal yang sekadar catatan seperti "Tanggal Transfer" — aman dari
   pergeseran tanggal kalender di timezone manapun). Algoritma umum
   (bukan cuma Asia/Jakarta), pakai `Intl.DateTimeFormat` native — TIDAK
   nambah dependency baru (`date-fns-tz` yang disebut di
   `architecture-settings.md` sebagai CONTOH ternyata tidak pernah
   benar-benar diinstall/dipakai).
3. **`CompanyTimezoneProvider`** (`apps/web/components/company-timezone-provider.tsx`,
   Context + `useCompanyTimezone()` hook) dipasang di ROOT layout
   (`app/layout.tsx`, Server Component, fetch `GET /settings/public`
   sekali) — melingkupi KETIGA surface (landing/admin/app) supaya
   halaman publik (`landing/pay/[orderId]`) juga dapat nilai yang sama
   dengan halaman yang sudah login. `company.timezone` ditambah ke
   allowlist `PUBLIC_SETTINGS_KEYS` (§ `settings.route.ts`) — nilainya
   bukan rahasia (nama zona IANA).
4. **`formatDate()`** (`apps/web/lib/utils.ts`) WAJIB dipanggil dengan
   parameter `timeZone` eksplisit (tidak ada default diam-diam) — SEMUA
   16 titik pemakaian diupdate pakai `useCompanyTimezone()` (Client
   Component) atau fetch langsung `getPublicSettings()` (Server
   Component: `app/(protected)/page.tsx`, `admin/(protected)/page.tsx`,
   dan `ImportBatchTable` yang menerima `timezone` sebagai PROP karena
   dipakai dari Server Component pemanggil).
5. Titik input tanggal-saja (`admin/users/page.tsx` assign+edit `endAt`,
   `order-pay-flow.tsx` transferDate) WAJIB pakai
   `endOfDayInTimezone`/`middayInTimezone`, TIDAK PERNAH `new
   Date(dateOnlyString).toISOString()` langsung lagi.

## Alternatif yang Dipertimbangkan
- **Install `date-fns-tz`** (disebut sebagai contoh di
  `architecture-settings.md`) — ditolak: native `Intl.DateTimeFormat`
  sudah cukup untuk kebutuhan ini (format tampil + konversi zoned-time↔UTC),
  tidak perlu dependency tambahan untuk ~70 baris logic.
- **Simpan `endAt` sebagai UTC midnight (perilaku lama), kompensasi di
  level DISPLAY saja** — ditolak: masalahnya ada di WAKTU SEBENARNYA
  subscription berhenti aktif (dipakai job `EXPIRE_SUBSCRIPTIONS`
  membandingkan instant, bukan cuma tampilan), jadi HARUS diperbaiki di
  titik PENYIMPANAN (saat admin submit), bukan titik tampil.
- **`todayAccurateDate()` pakai `Date.UTC`/getter UTC (konsisten dengan
  `toAccurateDate()` di import-mapping)** — ditolak: itu akan BENAR untuk
  kalender UTC, tapi SALAH untuk kalender perusahaan (Asia/Jakarta) di
  jendela 00:00–06:59 WIB — kasus penggunaannya BEDA (fungsi ini butuh
  tanggal HARI INI menurut perusahaan, bukan menurut UTC atau menurut
  file Excel yang sudah py eksplisit tanggalnya sendiri).

## Konsekuensi
- Setting `company.timezone` di `/admin/settings` SEKARANG benar-benar
  fungsional — mengubahnya mengubah SEMUA tampilan tanggal + semua
  interpretasi input tanggal-saja di seluruh aplikasi, bukan lagi
  decorative.
- `todayAccurateDate()` jadi `async` — 5 call site (`accurate-vendor.ts`
  ×3, `accurate-customer.ts` ×2) di-`await`, +1 query settings ringan
  per panggilan (cuma dipanggil saat auto-create vendor/customer BARU,
  bukan per-baris Excel, jadi frekuensinya rendah).
- `formatDate()` TIDAK BOLEH lagi dipanggil dengan 1 argumen — TypeScript
  akan menolak compile kalau ada pemanggilan baru yang lupa pass
  timezone (defense-in-depth, dibanding default diam-diam yang bisa
  bikin bug ini terulang tanpa ketahuan).
- Komponen yang dipakai dari Server Component (`ImportBatchTable`) WAJIB
  terima `timezone` sebagai prop eksplisit — pola ini perlu diikuti kalau
  ada komponen baru serupa nanti (server+client shared component yang
  butuh format tanggal).

## Referensi
- Detail lengkap temuan & fix → `docs/phases/phase-44-audit-timezone.md`
- Setting `company.timezone` (asal-usul) → `docs/architecture/architecture-settings.md`
- Bug spesifik & pencegahan → `docs/lessons-learned.md` 2026-09-06
