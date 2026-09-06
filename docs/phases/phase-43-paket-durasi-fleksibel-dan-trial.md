# Fase 43 — Paket: Durasi Fleksibel (Hari/Bulan/Tahun) + Sistem Trial

**Status:** Done
**Mulai:** 2026-09-06
**Selesai:** 2026-09-06

## Tujuan
2 penambahan ke sistem paket/langganan atas permintaan user:
1. Admin sekarang wajib ketik durasi paket dalam hari mentah (mis. "360"
   untuk 1 tahun) — merepotkan. Ganti jadi input "Jumlah" + pilih unit
   (Hari/Bulan/Tahun), dikonversi ke `durationDays` cuma saat submit.
2. Semua paket (semua modul) perlu jalur coba-gratis (trial) — dibatasi
   BUKAN jumlah hari (bisa "dimanfaatkan waktu" tanpa batas nyata) TAPI
   jumlah baris Excel yang berhasil diimport, diatur 1x secara GLOBAL di
   admin settings (bukan per-plan) supaya admin tidak input angka yang
   sama berkali-kali per paket.

Rencana lengkap (riset, keputusan, breakdown 4 batch) ada di plan file
Plan Mode sesi ini — diringkas ke sini poin pentingnya.

## Scope

### Batch A — Fondasi: Migration + Setting Trial + Duration Picker
- [x] Migration kolom `subscriptions.isTrial` (boolean, default false)
- [x] `apps/api/src/lib/trial.ts` — konstanta `TRIAL_MAX_ROWS_SETTING_KEY`,
      `TRIAL_DURATION_DAYS_SETTING_KEY`
- [x] `settings.route.ts` — validasi PUT untuk 2 key baru
- [x] Admin settings page — kartu "Pengaturan Trial"
- [x] `apps/web/lib/duration.ts` — konversi unit Hari/Bulan/Tahun
- [x] Admin plans page — input Jumlah + unit, convert saat submit

### Batch B — Backend Trial: Endpoint + Guard Checkout
- [x] `createTrialSubscription()` di `lib/trial.ts`
- [x] `POST /subscriptions/trial` (guard `TRIAL_ALREADY_USED`,
      `MODULE_ALREADY_SUBSCRIBED`)
- [x] `POST /subscriptions/checkout` — exclude `isTrial` dari
      `activeModules` guard
- [x] `GET /me/subscriptions` — tambah `everTrialedModules`

### Batch C — Frontend Trial: Halaman /subscribe
- [x] Tombol "Coba Gratis" per card plan
- [x] Badge "Sudah Berlangganan" vs "Sedang Trial" vs "Trial Sudah Dipakai"

### Batch D — Enforcement: Batas Baris di 6 Modul
- [x] `checkTrialRowBudget()` di `lib/trial.ts`
- [x] Wiring di 12 titik (`:batchId/confirm` + `:batchId/retry` × 6 modul)
- [x] Frontend: tampilkan error `TRIAL_ROW_LIMIT_EXCEEDED` dengan jelas

## Referensi
- Architecture doc: `docs/architecture/architecture-subscription.md`
  § "Durasi Fleksibel — Hari/Bulan/Tahun (Fase 43)" + "Trial (Batas
  Baris) (Fase 43)"
- Plan mode file (riset detail & file existing yang direuse):
  `/Users/webane/.claude/plans/sorted-inventing-volcano.md`

## Keputusan Kecil Selama Eksekusi
- Konversi unit: 1 Bulan = 30 hari, 1 Tahun = 360 hari (12×30, BUKAN
  365) — konsisten kebiasaan manual user selama ini, dan bulat (1 Tahun
  = 12 Bulan persis).
- Baris batch > sisa kuota trial → tolak SELURUH batch di confirm/retry
  (bukan proses sebagian).
- Trial TIDAK memblokir pembelian paket ASLI modul yang sama — guard
  checkout skip subscription `isTrial=true`.
- Trial dibuat langsung aktif tanpa invoice/order/pembayaran sama
  sekali (mirror `createManualSubscriptions`).
- Outer card `/subscribe` diganti dari `<button>` jadi `<div role="button"
  tabIndex>` — tombol "Coba Gratis" di dalamnya butuh `<button>` sendiri
  (stopPropagation dari toggle cart), dan `<button>` tidak boleh
  bersarang di dalam `<button>` lain (invalid HTML).
- Test wiring `checkTrialRowBudget` di confirm/retry cuma ditulis PENUH
  untuk 1 modul representative (Purchase Invoice) — 5 modul lain
  diverifikasi manual (pola identik, di-generate via script Python yang
  sama supaya konsisten byte-per-byte), bukan re-tulis 5× test yang
  sama persis.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`, api+web) — 0 error
- [x] Security review dijalankan (inline, sesuai rencana yang disetujui
      user — endpoint baru + 12 titik existing yang disisipi guard,
      bukan pola baru)
- [x] Temuan Critical/High sudah diperbaiki — 0 temuan Critical/High
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau
      ditunda — 1 temuan Low (TOCTOU batas baris trial tanpa row-lock,
      § lessons-learned.md 2026-09-06, DITERIMA sebagai known limitation)
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- `checkTrialRowBudget()` di 12 titik confirm/retry TIDAK row-lock —
  2 batch dikonfirmasi BERSAMAAN oleh subscription trial yang sama
  secara teori bisa lolos cek kuota independen lalu gabungan melebihi
  `trial.maxRows` (TOCTOU). Keterbatasan PRE-EXISTING (confirm/retry
  memang belum row-lock terhadap double-submit sebelum Fase 43 juga),
  risiko RENDAH (kerugian bisnis kecil, bukan celah keamanan/data
  breach) — didokumentasikan, tidak ditutup sekarang (§
  lessons-learned.md 2026-09-06).
- Verifikasi visual browser TIDAK dilakukan (ekstensi Chrome tidak
  disambungkan sesi ini) — diverifikasi lewat typecheck penuh (api+web),
  test suite penuh (284 pass), dan test representative baru untuk
  wiring trial.

## Ringkasan Hasil
Paket sekarang punya input durasi fleksibel (Jumlah + unit Hari/Bulan/
Tahun, dikonversi ke `durationDays` cuma di form admin — API tidak
berubah). Semua 6 sub-modul punya jalur trial self-service (tombol
"Coba Gratis" di `/subscribe`), dibatasi jumlah baris berhasil-import
(bukan hari) via setting global `trial.maxRows` + backstop kadaluarsa
`trial.durationDays`, 1x seumur hidup per modul per user, TIDAK
memblokir upgrade ke paket asli. Batas baris ditegakkan di 12 titik
(`confirm`+`retry` × 6 modul) lewat 1 helper bersama
`checkTrialRowBudget()` — pola shared-helper dipilih spesifik supaya
tidak terulang bug class "lupa update N tempat saat modul baru
ditambah" (§ audit 6 modul sebelumnya).

Typecheck 0 error (api+web). Test suite `apps/api` **284 pass / 0
fail** (13 baru: 4 unit test `checkTrialRowBudget` di `lib/trial.test.ts`,
6 test endpoint `POST /subscriptions/trial` + guard checkout di
`subscriptions.route.test.ts`, 3 test wiring confirm/retry representative
di `purchase-invoice-import.route.test.ts`). Lint 0 error. Security
review inline: 0 temuan Critical/High, 1 temuan Low (TOCTOU, diterima
sebagai known limitation, § di atas).

## Addendum 2026-09-06 — Koreksi: Trial Per-Paket (Bukan Otomatis Semua)
User koreksi setelah fase ditutup: desain awal di atas membuat SEMUA
paket otomatis punya jalur trial begitu fitur dirilis — tidak ada
kontrol admin. Ini salah asumsi (§ `docs/lessons-learned.md` 2026-09-06)
— admin harus bisa menentukan PER PAKET mana yang boleh ditrial, sama
seperti admin menentukan `isActive` per paket.

**Perubahan:**
- Migration baru: `plans.trialEligible` (boolean, default `false`).
- `POST`/`PUT /admin/plans` — body terima `trialEligible` opsional.
- Admin plans page — toggle checkbox "Bisa Dicoba Gratis (Trial)" di
  form buat/edit paket (default OFF), kolom "Trial" (Aktif/Nonaktif) di
  tabel daftar paket.
- `POST /subscriptions/trial` — guard baru `TRIAL_NOT_AVAILABLE_FOR_PLAN`
  kalau `plan.trialEligible` false, dicek SEBELUM guard
  `TRIAL_ALREADY_USED`/`MODULE_ALREADY_SUBSCRIBED`.
- `/subscribe` page — tombol "Coba Gratis" cuma tampil kalau
  `plan.trialEligible` true (selain guard existing: belum aktif, belum
  pernah ditrial).
- Test: 1 test baru (`TRIAL_NOT_AVAILABLE_FOR_PLAN`) + 4 test lama
  di-update supaya insert plan dengan `trialEligible: true` (trial yang
  DIHARAPKAN sukses).
- 3 plan REAL existing (terhubung `user@facport.com`) TIDAK diubah —
  tetap `trialEligible: false` (default), konsisten "admin yang
  memutuskan", bukan diam-diam diaktifkan retroaktif.

**Verifikasi ulang:** Typecheck 0 error (api+web), lint 0 error, test
suite `apps/api` **285 pass / 0 fail** (1 baru). Architecture doc
(`architecture-subscription.md` § "Trial (Batas Baris)") diupdate.
