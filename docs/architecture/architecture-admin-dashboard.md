# Architecture — Dashboard Admin (Statistik & Chart)

> Index dashboard admin (`/admin`, root `app/admin/(protected)/page.tsx`).
> BUKAN duplikasi App Shell pelanggan (§ `architecture-app-dashboard.md`
> untuk itu) — dokumen ini fokus KHUSUS ke endpoint `/admin/stats/*` dan
> formula di baliknya. Baca ini SEBELUM nambah/ubah card atau chart baru
> di dashboard admin, supaya tidak reinvent formula yang sudah ada.

## Kenapa Ada Fase Ini (Fase 59)
Sebelumnya dashboard admin cuma 4 stat card polos (salah satu ada bug:
"Pengguna" ikut menghitung akun admin/staff) + 1 card "Aktivitas Terakhir"
yang rancu (dihapus). User minta dashboard yang lebih informatif dengan
chart data aktual (pertumbuhan user, popularitas modul, efisiensi kerja).

## Endpoint `/admin/stats/*` (`apps/api/src/routes/admin/stats.route.ts`)
Semua endpoint permission `users.manage` (KONSISTEN dengan endpoint lama,
BUKAN scope permission baru — kalau butuh permission lebih granular untuk
dashboard vs manajemen user, itu perubahan terpisah, di luar fase ini).

| Endpoint | Isi | Dipakai untuk |
|---|---|---|
| `GET /admin/stats` | `userCount` (role customer SAJA), `planCount`, `activeSubscriptionCount`, `successfulRowCount` | 4 stat card atas |
| `GET /admin/stats/monthly` | 12 entri bulanan rolling: `newUserCount`, `cumulativeUserCount`, `newSubscribingUserCount` | Bar chart pengguna+langganan, Area chart kumulatif |
| `GET /admin/stats/module-popularity` | `[{moduleKey, count}]`, urut DESC, snapshot subscription `active` SEKARANG | Bar chart horizontal popularitas modul |
| `GET /admin/stats/efficiency` | `rowsThisMonth`, `rowsLastMonth`, `rowGrowthPercent`, `efficiencyPercent`, `totalEfficiencySeconds` | 3 card efisiensi |

## `userCount` — HANYA Role Customer
**Bug ditemukan 2026-09-08**: sebelumnya `count()` polos dari tabel `user`
tanpa filter role, ikut menghitung akun admin/staff. Fix: subquery JOIN
`userRoles`+`roles` WHERE `roles.name = 'customer'` (fungsi
`getCustomerIdsSubquery()`, JOIN langsung — BUKAN fetch role id dulu lalu
cek null, supaya kalau role "customer" belum ke-seed subquery otomatis 0
baris tanpa perlu guard manual). Pola SAMA dipakai `admin/users.route.ts`
(§ `architecture-subscription.md`) — kalau ada endpoint admin BARU yang
perlu "hitung/filter user asli" (bukan admin/staff), REUSE pola ini,
jangan `count()`/`select` polos dari tabel `user`.

## Formula Murni — `apps/api/src/lib/admin-stats.ts`
Semua perhitungan (growth %, efisiensi, agregasi bulanan/modul) DIEKSTRAK
ke fungsi murni tanpa DB (`aggregateMonthlyGrowth`, `aggregateModulePopularity`,
`computeGrowthPercent`, `computeEfficiency`) — **route handler cuma fetch
data mentah lalu panggil fungsi ini**. Alasan: angka dashboard admin
GLOBAL (bukan per-user), jadi TIDAK bisa diuji dengan asersi nilai eksak
kalau bergantung isi DB dev yang shared antar test/sesi — pisahkan formula
(diuji dengan data sintetis, `lib/admin-stats.test.ts`) dari query DB
(diuji dengan pola delta before/after, `routes/admin/stats.route.test.ts`).
**Kalau nambah chart/card baru yang butuh perhitungan baru, ikuti pola
yang sama** — jangan taruh logic matematis di dalam handler route
langsung.

### Rentang "12 Bulan" — Rolling, BUKAN Tahun Kalender
Dikonfirmasi user (AskUserQuestion, 2026-09-08): bulan ini + 11 bulan
sebelumnya (mis. dilihat September 2026 → Okt 2025 s.d. Sep 2026), BUKAN
Januari–Desember tahun berjalan. Bucket bulan pakai **UTC calendar month**
(`getUTCFullYear()`/`getUTCMonth()`), BUKAN timezone perusahaan — presisi
per-bulan tidak butuh akurasi per-hari, jadi kesalahan klasifikasi di
tanggal 1 dekat tengah malam (kalau timezone perusahaan beda jauh dari
UTC) DITERIMA sebagai keterbatasan wajar, BUKAN bug.

Agregasi 12 bulan dilakukan **di JS, bukan raw SQL/`GROUP BY` Postgres** —
fetch kolom minimal (`createdAt`, dst) untuk SEMUA baris dalam window,
lalu bucket per bulan di memory. Aman untuk volume data user/subscription
produk B2B ini (bukan big data) — kalau volume nanti jadi sangat besar,
pertimbangkan pindah ke agregasi SQL atau rollup table terpisah (dicatat
sebagai Known Limitation, § phase-59 doc).

### `rowGrowthPercent` (Poin 7.1) — Growth Month-over-Month
`computeGrowthPercent(current, previous)`: `(current-previous)/previous*100`,
kalau `previous === 0` → `100` jika `current > 0` else `0` (hindari
`Infinity`/`NaN`). **BUKAN** porsi dari total all-time — dikonfirmasi user
eksplisit lewat AskUserQuestion.

### `efficiencyPercent` (Poin 7.2) — Waktu Manual vs Waktu Aktual Facport
`(manualSecondsTotal - actualSecondsTotal) / manualSecondsTotal * 100`,
di-clamp 0–100 (`computeEfficiency()`). Dua komponen:
- **`manualSecondsTotal`**: `SUM(batch.totalRows) × setting
  MANUAL_INPUT_SECONDS_SETTING_KEY` (§ `lib/manual-input-estimate.ts`,
  setting yang sama dipakai `GET /me/stats`, Fase 40).
- **`actualSecondsTotal`**: `SUM(batch.completedAt − batch.createdAt)`,
  **KETERBATASAN PENTING**: ini durasi WALL-CLOCK BATCH (termasuk antrian
  job pg-boss), **BUKAN** pengukuran murni per-baris — `import_batch_rows`
  TIDAK menyimpan timestamp mulai per baris, jadi tidak mungkin dihitung
  lebih presisi tanpa migration baru. Kalau butuh presisi per-baris nanti,
  perlu tambah kolom `startedAt`/lacak durasi per API call ke Accurate —
  DI LUAR SCOPE Fase 59.
- **Batch dikecualikan**: `status NOT IN ('completed','completed_with_errors')`
  ATAU `completedAt IS NULL` — batch gagal-dini (§ Fase 56,
  `architecture-accurate-integration.md` § 5) durasinya ~0 detik dan akan
  MENDISTORSI efisiensi jadi keliatan sempurna padahal tidak ada baris
  yang diproses. **Kalau nambah status batch baru di masa depan, WAJIB
  cek ulang apakah perlu masuk daftar kecualian ini juga.**

### `totalEfficiencySeconds` (Poin 7.3) — ALL-TIME, Bukan Per-Bulan
`successfulRowCount` (ALL-TIME, SEMUA user) × setting detik/baris — pola
PERSIS `estimatedTimeSavedSeconds` di `GET /me/stats` (Fase 40), diperluas
admin-wide (bukan per-user). Sengaja ALL-TIME (bukan scoped ke bulan
berjalan) — poin 7.3 eksplisit minta "dari SELURUH row".

## Chart Library — Recharts (§ ADR-0004)
`recharts` (bukan wrapper `components/ui/chart.tsx` shadcn penuh — 3
komponen chart dedicated di `components/admin/dashboard/` langsung pakai
primitif Recharts, styling warna HARDCODE hex token project — BUKAN
`var(--color-primary-600)` di prop `fill`/`stroke` SVG, untuk hindari
risiko kompatibilitas browser lama). Semua chart component `"use client"`
(Recharts butuh browser), data di-fetch Server Component (`page.tsx`),
diteruskan sebagai props — pola sama `architecture-app-dashboard.md` §
"Server Component Fetch".

| Chart | Komponen | Sumber Data |
|---|---|---|
| Bar pengguna+langganan baru (12 bulan) | `user-subscription-bar-chart.tsx` | `/admin/stats/monthly` |
| Area kumulatif "EKG-style" | `user-growth-area-chart.tsx` | `/admin/stats/monthly` (`cumulativeUserCount`) |
| Bar horizontal popularitas modul | `module-popularity-bar-chart.tsx` | `/admin/stats/module-popularity`, label via `lib/module-options.ts` `moduleLabel()` |

## `StatCard` — Prop `tone` (Fase 59)
`components/ui/stat-card.tsx` sekarang terima `tone?: "primary" | "success"
| "warning"` (default `"primary"`, backward-compatible) — icon dipindah
dari inline kecil jadi badge lingkaran warna (`bg-{tone}-100/bg`, `text-
{tone}-700`), token SAMA dengan `Badge` (`components/ui/badge.tsx`),
BUKAN palet baru. Berlaku ke SEMUA pemakai `StatCard`, bukan cuma
dashboard admin.

## Referensi
- Formula & keputusan lengkap → `docs/phases/phase-59-redesign-dashboard-admin.md`
- Pola dashboard pelanggan (App Shell) → `architecture-app-dashboard.md`
- Setting "detik input manual per baris" → `docs/phases/phase-40-estimasi-efisiensi-waktu-kerja.md`
- Bug batch gagal-dini yang dikecualikan dari efisiensi → `docs/phases/phase-56-fix-error-message-batch-gagal-dini.md`
- Keputusan tool chart → `docs/decisions/adr-0004-ui-component-standards.md`
