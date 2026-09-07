# Fase 59 — Redesign Dashboard Admin (Statistik & Chart)

**Status:** Done
**Mulai:** 2026-09-08
**Selesai:** 2026-09-08

## Tujuan
Dashboard admin (`/admin`) sebelumnya cuma 4 stat card polos + 1 card
"Aktivitas Terakhir" yang rancu (dihapus, log dipikirkan terpisah nanti).
User minta dashboard yang lebih informatif/profesional dengan chart data
aktual (pertumbuhan user, popularitas modul, efisiensi kerja), sekaligus
perbaiki bug nyata: card "Pengguna" ikut menghitung akun admin/staff.

Rencana lengkap (termasuh 3 klarifikasi yang sudah dikonfirmasi user via
AskUserQuestion) ada di riwayat plan mode sesi ini — ringkasan di bawah.

## Scope
- [x] `apps/api/src/routes/admin/stats.route.ts` — fix `userCount`
  (customer-role only), tambah `GET /admin/stats/monthly`,
  `GET /admin/stats/module-popularity`, `GET /admin/stats/efficiency`
- [x] `apps/api/src/lib/admin-stats.ts` (baru) — formula murni diekstrak
  dari route handler, supaya bisa di-unit-test tanpa DB
- [x] `apps/api/src/lib/admin-stats.test.ts` (baru, 15 test)
- [x] `apps/api/src/routes/admin/stats.route.test.ts` (baru, 7 test)
- [x] `bun add recharts` (`apps/web`, v3.10.1)
- [x] `apps/web/components/ui/stat-card.tsx` — prop `tone` opsional
- [x] `apps/web/components/admin/dashboard/chart-utils.ts` (baru, `monthLabel`)
- [x] `apps/web/components/admin/dashboard/user-subscription-bar-chart.tsx` (baru)
- [x] `apps/web/components/admin/dashboard/user-growth-area-chart.tsx` (baru)
- [x] `apps/web/components/admin/dashboard/module-popularity-bar-chart.tsx` (baru)
- [x] `apps/web/app/admin/(protected)/page.tsx` — hapus card Aktivitas
  Terakhir, tambah 3 card efisiensi + 3 chart
- [x] `docs/architecture/architecture-admin-dashboard.md` (baru)
- [x] `docs/decisions/adr-0004-ui-component-standards.md` — baris Recharts
- [x] `CLAUDE.md` (root) § Peta Dokumen — baris dashboard admin

## Referensi
- Plan mode sesi ini (2026-09-08) — desain lengkap formula & keputusan
- `docs/architecture/architecture-app-dashboard.md` — pola dashboard
  customer yang dijadikan referensi struktur
- `docs/phases/phase-40-estimasi-efisiensi-waktu-kerja.md` — formula
  `estimatedTimeSavedSeconds` yang diperluas admin-wide di fase ini

## Keputusan Kecil Selama Eksekusi
- Formula matematis (growth %, efisiensi, agregasi bulanan/modul)
  diekstrak ke `lib/admin-stats.ts` (fungsi murni, tanpa DB) — angka
  dashboard admin GLOBAL, tidak bisa diuji nilai eksak kalau bergantung
  DB dev yang shared. Route test cuma verifikasi delta before/after +
  shape, bukan re-test formula (sudah lengkap di unit test).
- `getCustomerIdsSubquery()` pakai JOIN langsung `userRoles`+`roles`
  (bukan fetch role id dulu lalu guard null) — kalau role "customer"
  belum ke-seed, subquery otomatis 0 baris (valid utk `IN (subquery)`),
  hindari fallback UUID palsu yang sempat saya tulis lalu perbaiki
  sendiri (§ code review internal sebelum commit).
- Warna chart Recharts HARDCODE hex (bukan `var(--color-primary-600)`
  di prop `fill`/`stroke`) — hindari risiko kompatibilitas SVG
  presentation attribute + CSS custom property di browser lama.
- Verifikasi visual browser TIDAK dilakukan — ekstensi Chrome tidak
  tersambung ke akun yang sama di lingkungan ini (limitasi environment,
  sama seperti Fase 40). Dikompensasi: typecheck 0 error, build sukses,
  test suite lengkap (unit formula + integrasi route).
- Akun admin throwaway dibuat untuk uji coba login (gagal karena
  ekstensi tidak tersambung) — dibersihkan lagi dari DB dev setelah
  ketahuan verifikasi visual tidak bisa jalan, TIDAK ikut ke commit.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`, api+web)
- [x] Security review dijalankan (inline) — 4 endpoint baru semua GET
  tanpa input client (tidak ada body/query/params sama sekali, tidak ada
  yang perlu divalidasi), permission `users.manage` konsisten endpoint
  lama, tidak ada raw SQL string concatenation (semua drizzle query
  builder), tidak ada data sensitif yang bocor (cuma angka agregat)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — 0
- [x] Temuan Medium/Low dicatat — lihat Known Limitations
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- `efficiencyPercent`/`actualSecondsTotal` pakai durasi WALL-CLOCK batch
  (`completedAt-createdAt`, termasuk antrian job pg-boss), BUKAN
  pengukuran murni per-baris — `import_batch_rows` tidak simpan timestamp
  mulai per baris. Butuh migration baru (kolom durasi per baris/batch)
  kalau perlu presisi lebih tinggi, di luar scope fase ini.
- Agregasi bulanan (`/admin/stats/monthly`) & efisiensi (`/admin/stats/efficiency`)
  fetch SEMUA baris relevan lalu agregasi di JS (bukan SQL `GROUP BY`) —
  aman untuk volume data B2B saat ini, tapi kalau jumlah user/batch jadi
  SANGAT besar di masa depan, perlu pindah ke agregasi SQL atau rollup
  table terpisah (bukan masalah sekarang, dicatat untuk awareness).
- Bucket bulan pakai UTC calendar month (bukan timezone perusahaan) —
  potensi salah klasifikasi user/subscription yang dibuat sangat dekat
  tengah malam UTC ke bulan yang "salah" dari perspektif timezone lokal
  admin. Presisi per-bulan tidak butuh akurasi per-hari, diterima sebagai
  keterbatasan wajar.
- Verifikasi visual browser TIDAK dilakukan (ekstensi Chrome tidak
  tersambung di environment ini) — diverifikasi lewat typecheck (0 error,
  api+web), build `apps/web` sukses, test suite lengkap (15 unit test
  formula murni + 7 test integrasi route, delta-based karena DB dev
  shared). User disarankan cek tampilan asli di browser sendiri setelah
  deploy ke lokal/staging.
- `/admin/stats/*` semua permission `users.manage` — role `staff` (yang
  tidak punya `users.manage`, § ADR-0027) TIDAK bisa lihat dashboard
  admin sama sekali (dapat 403 di semua fetch, StatCard/chart tampil "-"
  /kosong). Ini gap PRE-EXISTING dari endpoint `/admin/stats` original
  (bukan regresi fase ini) — di luar scope untuk diperluas sekarang.

## Ringkasan Hasil
Dashboard admin (`/admin`) dirombak: card "Pengguna" sekarang HANYA
hitung role customer (bug lama ikut hitung admin/staff, ditemukan &
diperbaiki), card "Aktivitas Terakhir" yang rancu dihapus, ditambah 3
card efisiensi kerja (pertumbuhan baris bulan-ke-bulan, persentase
efisiensi waktu vs estimasi input manual, total waktu dihemat all-time)
dan 3 chart (Recharts): bar pengguna+langganan baru 12 bulan, area
"EKG-style" kenaikan total pengguna, bar horizontal popularitas
sub-modul. `StatCard` dapat prop `tone` (badge icon warna, berlaku ke
semua pemakai, bukan cuma dashboard admin).

Semua formula (growth %, efisiensi clamp 0-100, agregasi bulanan/modul)
diekstrak ke `lib/admin-stats.ts` (fungsi murni tanpa DB) — diuji lengkap
lewat 15 unit test sintetis, terpisah dari 7 test integrasi route
(pola delta before/after, aman terhadap DB dev shared). Dokumentasi baru
`architecture-admin-dashboard.md` + baris Recharts di ADR-0004 + sinkron
`CLAUDE.md` § Peta Dokumen.

Typecheck 0 error (api+web). Full suite `apps/api` 438 pass/0 fail (22
baru). Full suite `apps/web` 27 pass/0 fail (tidak ada test baru untuk 3
chart component — presentational, diverifikasi via typecheck+build).
Build `apps/web` sukses. Security review inline: 0 temuan.
