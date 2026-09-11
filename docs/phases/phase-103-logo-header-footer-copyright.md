# Fase 103 — Logo Perusahaan di Header + Footer Copyright

**Status:** Done
**Mulai:** 2026-09-11
**Selesai:** 2026-09-11

## Tujuan
Client minta 2 penambahan UI di dashboard (admin & customer):
1. Logo perusahaan permanen di tengah header (Topbar), bisa diklik ke
   URL tertentu (diatur di Admin Settings), buka tab baru.
2. Footer di area putih (panel konten) berisi copyright dengan rentang
   tahun otomatis, nama perusahaan, nama aplikasi, dan versi aplikasi.

## Scope
- [x] `apps/api/src/routes/settings.route.ts` — tambah `company.logoLinkUrl`/
      `company.copyrightStartYear` ke `PUBLIC_SETTINGS_KEYS`, tambah
      validasi di `PUT /settings`.
- [x] `.github/workflows/deploy.yml` — inject `APP_VERSION` build-arg
      ke image `apps/web`.
- [x] `apps/web/Dockerfile` — terima `ARG APP_VERSION`, set `ENV`.
- [x] `apps/web/lib/get-public-settings.ts` — tambah field baru ke type.
- [x] `apps/web/components/app-shell/topbar.tsx` — slot logo di tengah
      header (absolute-centered), clickable kalau ada link.
- [x] `apps/web/components/app-shell/footer.tsx` (BARU) — komponen footer.
- [x] `apps/web/components/app-shell/app-shell.tsx` — teruskan props baru.
- [x] `apps/web/app/admin/(protected)/layout.tsx` &
      `apps/web/app/app/(protected)/layout.tsx` — wiring settings + `APP_VERSION`.
- [x] `apps/web/app/admin/(protected)/settings/page.tsx` — 2 field form baru.
- [x] Test: `settings.route.test.ts` (validasi baru), `footer.test.tsx` (baru).
- [x] Update `docs/architecture/architecture-settings.md`,
      `architecture-app-dashboard.md`/`architecture-admin-dashboard.md`.
- [x] Typecheck + test + lint + security review.
- [x] Verifikasi manual browser (pakai dev server yang SUDAH JALAN).
- [x] Update `docs/PROGRESS.md`.

## Referensi
- Rencana lengkap: `/Users/webane/.claude/plans/sorted-inventing-volcano.md`
  (disetujui user via Plan Mode, 2026-09-11)
- `docs/architecture/architecture-settings.md` § "Field Wajib di Fase 01"
  (`company.logo` sudah ada sejak Fase 12, ADR-0017)
- `docs/phases/phase-12-logo-favicon-branding.md` — riwayat kenapa
  `company.logo` berhenti dipakai di sidebar (2026-09-07, diganti favicon)

## Keputusan Kecil Selama Eksekusi
- **Reuse `company.logo` yang SUDAH ADA** (bukan bikin field/tabel/upload
  baru) — field ini sejak Fase 12 punya infra upload lengkap (MinIO
  bucket publik, endpoint `POST /admin/branding/logo`) tapi TIDAK
  PERNAH dirender di mana pun sejak sidebar pindah ke favicon
  (2026-09-07) — logo lebar ini justru pas untuk strip horizontal
  header, bukan kotak kecil sidebar. Dikonfirmasi ke user via Plan Mode
  sebelum eksekusi (user awalnya kira perlu tabel baru).
- Versi aplikasi dibaca dari `process.env.APP_VERSION` (plain, BUKAN
  `NEXT_PUBLIC_*`) di Server Component layout, diteruskan sebagai prop
  — hindari baked ke client bundle, konsisten pola settings lain yang
  sudah di-fetch server-side lalu diteruskan sebagai props.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review dijalankan (skill `security-review`)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — nol temuan
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda — tidak ada
- [x] `docs/PROGRESS.md` diupdate
- [x] Verifikasi manual browser (admin + app surface)

## Known Limitations
- **Perubahan `company.logoLinkUrl`/`company.copyrightStartYear` (dan
  field publik lain: `company.logo`, `company.name`, `company.favicon`,
  `company.timezone`) butuh sampai 5 menit untuk muncul di header/footer
  setelah disimpan admin** — `getPublicSettings()` (§
  `apps/web/lib/get-public-settings.ts`) pakai `next: { revalidate: 300 }`
  sejak Fase 12, BUKAN regresi baru dari fase ini. Diverifikasi via
  `curl /settings/public` (value tersimpan benar di DB seketika) vs.
  render browser (baru reflect setelah cache Next.js expire). Cukup wajar
  untuk data branding yang jarang berubah — TIDAK diperbaiki di fase ini,
  dicatat sebagai batasan yang sudah ada dari desain lama.
- Belum ada test end-to-end (Playwright/dst) untuk klik logo → tab baru —
  diverifikasi manual via browser (§ Ringkasan Hasil), dicover unit test
  cuma untuk logic murni (`footer.test.tsx`, validasi backend).

## Ringkasan Hasil
Fitur selesai & terverifikasi via browser (login admin & customer test
user di dev server yang sudah jalan, tidak start instance baru):
- **Logo header**: `company.logo` (field lama Fase 12, sejak 2026-09-07
  tidak dipakai di mana pun) sekarang dirender di tengah Topbar
  (absolute-centered), muncul konsisten di surface admin DAN app
  (customer) — komponen `Topbar`/`AppShell` dipakai bersama. Klik logo
  (saat `company.logoLinkUrl` terisi) membuka URL di tab baru
  (`target="_blank" rel="noopener noreferrer"`), diverifikasi membuka
  `https://facinstitute.id` tanpa me-redirect tab dashboard asli.
- **Footer copyright**: render `© Copyright {tahun mulai} - {tahun
  sekarang} {nama perusahaan} - Facport versi: {versi}` di bawah `<main>`
  (area putih), fallback rapi kalau field kosong (tahun sekarang saja,
  nama "Facport", versi "dev"). Diverifikasi tersimpan benar di DB
  (`curl /settings/public` balikin `company.copyrightStartYear: 2025`)
  dan render "© Copyright 2025 - 2026 ..." setelah cache Next.js expire.
- **Versi aplikasi**: `APP_VERSION` (plain env var, bukan
  `NEXT_PUBLIC_*`) diinject CI (`deploy.yml`/`deploy-staging.yml`) via
  Docker build-arg, dibaca server-side di kedua layout `(protected)`.
  Dev lokal (tanpa Docker) fallback ke `"dev"` — dikonfirmasi di browser.
- **Admin Settings UI**: 2 field baru ("Tahun Mulai Copyright", "URL
  Tujuan Logo") tampil & tersimpan dengan benar, termasuk validasi
  client-side (pesan error jelas) dan server-side (400 dengan kode
  spesifik).
- Typecheck (api+web) 0 error, lint 0 error, test suite: 654+ test API
  (termasuk 15 test baru `settings.route.test.ts`), 57+ test web
  (termasuk 7 test baru `footer.test.tsx`) — semua pass.
- Security review: nol temuan (validasi scheme URL, guard
  `BRANDING_ONLY_KEYS` tidak salah blokir, allowlist publik sengaja &
  eksplisit — lihat laporan lengkap di riwayat sesi).
- **BELUM di-release** sesuai kesepakatan standing rule (2026-09-11) —
  commit + push ke `develop` saja, release menunggu permintaan eksplisit
  user.
