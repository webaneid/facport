# Fase 132 — Notifikasi Expiry: Teks Spesifik + Email + Banner

**Status:** Done
**Mulai:** 2026-09-17
**Selesai:** 2026-09-17

## Tujuan
Part 3 dari permintaan besar user (2026-09-17). Infrastruktur notifikasi
expiry SUDAH ADA sejak Fase 45 (lonceng in-app `NotificationBell`, job
`NOTIFY_EXPIRING_SOON`/`EXPIRE_SUBSCRIPTIONS`) — fase ini MELENGKAPI 3 gap
konkret yang ditemukan saat audit Part 2: (1) teks notifikasi generik,
tidak sebut nama fitur/Data Usaha; (2) tidak ada email sama sekali untuk
event ini; (3) tidak ada banner di dashboard/`/pilih-usaha`.

Email untuk 4 tipe expiry ini sekaligus menutup SEBAGIAN item pending
eksplisit dari Fase 45 (`docs/PROGRESS.md`, "Email notifikasi ... BELUM
dibangun ... WAJIB menyusul di fase terpisah") — 8 tipe LAIN
(checkout/pembayaran/dst) TETAP pending, di luar scope permintaan user
sekarang (spesifik soal expiry).

## Scope
- [x] `apps/api/src/workers/index.ts` — job `EXPIRE_SUBSCRIPTIONS` &
      `NOTIFY_EXPIRING_SOON`: body notifikasi sekarang sebut nama
      fitur (`moduleLabel`) + Data Usaha + tanggal exact
      (`formatNotificationDate`), plus enqueue `JOBS.SEND_EMAIL` (pola
      sama call-site existing `lib/auth.ts`/`me.route.ts`/`team.route.ts`).
- [x] `apps/api/src/routes/subscriptions.route.ts` (`GET /me/subscriptions`)
      — tambah `dataUsahaName` per baris (dipakai banner FE tanpa fetch
      terpisah).
- [x] `apps/web/components/subscribe/expiring-soon-alert.tsx` (BARU) —
      komponen shared, filter subscription aktif berakhir ≤7 hari, render
      `Alert` (`variant="warning"`).
- [x] `apps/web/app/app/(protected)/page.tsx` (dashboard) — pasang alert,
      reuse data `/me/subscriptions` yang SUDAH di-fetch (tidak ada fetch
      baru).
- [x] `apps/web/components/data-usaha/pilih-usaha-form.tsx` — tambah
      fetch `api.me.subscriptions.get()` (union SEMUA Data Usaha), pasang
      alert di layout desktop DAN mobile.
- [x] **Bonus (ditemukan saat review timezone, diingatkan user)** —
      `apps/api/src/lib/invoice-pdf.tsx` `formatTanggal()` SEBELUMNYA
      hardcode "Asia/Jakarta", tidak baca `company.timezone` — diperbaiki
      pakai `getCompanyTimezone()` (§ `invoices.route.ts`), konsisten
      ADR-0028. Tidak mengubah tampilan di dev (setting belum diisi,
      fallback sama "Asia/Jakarta"), tapi benar untuk company timezone
      lain di production nanti.

## Referensi
- Architecture doc: `docs/architecture/architecture-notifications.md`
- Plan lengkap (3 fase, 130-132): `/Users/webane/.claude/plans/polymorphic-dazzling-engelbart.md`

## Keputusan Kecil Selama Eksekusi
- `GET /me/subscriptions` (extend, bukan endpoint baru) dipilih untuk
  data banner — sudah return semua yang dibutuhkan (subscription+plan),
  cuma kurang `dataUsahaName`. Endpoint terpisah `/me/subscriptions/expiring-soon`
  DIBATALKAN — akan duplikasi logic scoping yang sudah benar di endpoint
  existing.
- Threshold banner (H-7) di-HARDCODE terpisah di frontend (`EXPIRING_SOON_DAYS`),
  BUKAN import dari `apps/api/lib/subscription-reminders.ts` (2 app
  terpisah, tidak bisa share module) — nilai dipilih SAMA dengan
  threshold TERJAUH job backend supaya "mulai muncul" konsisten dengan
  notifikasi bell/email pertama.
- `NOTIFY_EXPIRING_SOON` job: metadata (plan/Data Usaha/email) di-batch-fetch
  HANYA untuk kandidat yang lolos filter threshold (bukan semua subscription
  aktif) — hindari over-fetch untuk mayoritas baris yang tidak kena
  threshold hari ini.
- Ditemukan & diperbaiki SEKALIAN (di luar scope asli, tapi kecil &
  langsung relevan): `invoice-pdf.tsx` hardcode timezone (lihat § Scope
  "Bonus" di atas) — user eksplisit mengingatkan soal risiko timezone
  Indonesia di tengah eksekusi fase ini.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — api+web, 0 error
- [x] `bun run lint` — 0 error (1 `eslint-disable-next-line react-hooks/purity`
      terdokumentasi untuk `Date.now()` display-only di `expiring-soon-alert.tsx`)
- [x] `bun run test` (apps/api) — 1106 pass, 0 fail
- [x] Security review dijalankan — 0 temuan (email HTML di-escape lewat
      `escapeHtml(body)` sebelum masuk `html:`, `dataUsahaName` baru di
      `/me/subscriptions` tetap scoped ke union subscription user login)
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Verifikasi visual banner: data real dev environment TIDAK punya
  subscription yang expiring ≤7 hari (semua di 2027), jadi state "banner
  MUNCUL" tidak terverifikasi visual langsung — percobaan set sementara
  `endAt` 1 subscription via script DITOLAK permission classifier sesi
  ini ("Modify Shared Resources"), tidak dipaksakan. Yang terverifikasi:
  dashboard + `/pilih-usaha` tetap render NORMAL (tidak ada
  crash/error/banner palsu) dengan data real — state "tidak ada yang
  expiring" sudah benar. State "banner muncul" diverifikasi lewat code
  review (logic filter sederhana, pola sama komponen lain yang sudah
  terverifikasi).
- Email TIDAK terkirim sungguhan di dev (`RESEND_API_KEY` kosong, §
  `lib/email.ts` no-op+log) — konsisten sudah didokumentasikan sebagai
  perilaku dev yang benar, bukan bug.
- 8 dari 12 tipe notifikasi (checkout/pembayaran/dst) MASIH belum punya
  email — tetap pending, dicatat eksplisit sebagai scope yang sengaja
  tidak dikerjakan fase ini.

## Ringkasan Hasil
Notifikasi expiry (bell + email baru) sekarang sebut nama fitur+Data
Usaha+tanggal exact, bukan generik. Banner baru di dashboard +
`/pilih-usaha` (component shared `ExpiringSoonAlert`) menunjukkan fitur
mana di Data Usaha mana yang akan berakhir dalam 7 hari. Sekalian
diperbaiki 1 bug timezone pre-existing (invoice PDF hardcode Asia/Jakarta)
yang ditemukan saat review — tidak mengubah perilaku dev sekarang, benar
untuk timezone company lain di production nanti.
