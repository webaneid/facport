# Fase 47 — Landing Page Redesign (Nyontek Desain Referensi)

**Status:** Done
**Mulai:** 2026-09-06
**Selesai:** 2026-09-06

## Tujuan
Landing page (`apps/web/app/landing/`) masih MVP polos, belum pernah
didesain. User minta dibangun ulang menyontek desain referensi
(screenshot): hero, banner CTA hijau, grid kartu fitur (1 kartu = 1
sub-modul Facport, dinamis dari paket admin), funfact (jumlah customer,
baris berhasil diimpor, efisiensi waktu — data sungguhan), section
harga/CTA penutup.

Rencana lengkap ada di plan file Plan Mode sesi ini — diringkas ke sini.

## Scope
- [x] `apps/api/src/routes/public/stats.route.ts` (baru) — `GET /public/stats`
      (customerCount, successfulRowCount, estimatedTimeSavedSeconds)
- [x] Register route di `app.ts`
- [x] `apps/web/lib/landing-content.ts` (baru) — icon+tagline per modul
- [x] `apps/web/app/landing/funfact-bar.tsx` (baru)
- [x] `apps/web/app/landing/module-features.tsx` (baru, replace `catalog-cart.tsx`)
- [x] Token warna landing (`--color-landing-*`) di `globals.css`
- [x] Rewrite `apps/web/app/landing/page.tsx` (hero, banner, funfact, fitur, harga/CTA penutup)
- [x] Hapus `catalog-cart.tsx` lama (digantikan `module-features.tsx`)

## Referensi
- Plan mode file (riset, arsitektur lengkap): `/Users/webane/.claude/plans/sorted-inventing-volcano.md`
- Screenshot referensi desain: dilampirkan user di chat (bukan file di repo)

## Keputusan Kecil Selama Eksekusi
- CTA "Kontak Kami"/"Konsultasi Gratis"/"Coba Dulu"/"Coba Gratis" — semua
  diarahkan ke funnel existing (`${APP_URL}/register` atau scroll-anchor
  ke Fitur), TIDAK bikin form kontak/nomor WA baru (di luar scope).
- Section harga penutup — TIDAK duplikasi 1 angka harga spesifik
  (Facport jual per-sub-modul, sudah tampil di grid Fitur) — diganti CTA
  generik.
- `customerCount` funfact HANYA role "customer" (bukan admin/staff internal).
- Ilustrasi pakai URL yang di-hosting user sendiri (facinstitute.id),
  BUKAN file lokal di repo — `<img>` biasa, bukan `next/image`.
- Warna hijau landing TERPISAH dari `--color-primary-*` (biru, dipakai
  admin/app) — token baru `--color-landing-*`, identitas marketing site
  vs identitas produk sengaja dibedakan.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck` — apps/api & apps/web, 0 error)
- [x] Security review dijalankan (`GET /public/stats` — lolos, agregat only, tanpa PII, rate-limited)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — tidak ada temuan
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda — tidak ada
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Verifikasi visual browser (screenshot vs referensi) TIDAK bisa dijalankan
  sesi ini — Claude in Chrome extension gagal connect (mismatch akun OAuth).
  Dev server (`bun run dev:web`, port 6209) sudah jalan & siap dicek manual
  oleh user di browser (`http://localhost:6209`).
- Test coverage baru cuma untuk endpoint backend (`public/stats.route.test.ts`,
  3 test: 200 tanpa login, customerCount scoped role customer, successfulRowCount
  scoped status=success) — komponen frontend baru (`funfact-bar.tsx`,
  `module-features.tsx`) tidak punya unit test terpisah (murni presentational
  + logic yang sudah diverifikasi di `catalog-cart.tsx` lama sebelum diganti).
- Email/notifikasi untuk event checkout/trial (Fase 45 pending item) BELUM
  dikerjakan — RESEND_API_KEY belum dikonfigurasi, di luar scope Fase 47.

## Ringkasan Hasil
Landing page (`apps/web/app/landing/`) dibangun ulang total menyontek desain
referensi user: hero (headline + ilustrasi hosted `facinstitute.id`), banner
CTA hijau, funfact bar (3 angka SUNGGUHAN dari `GET /public/stats` — endpoint
publik baru, rate-limited, agregat only), grid fitur (1 kartu = 1 sub-modul
Facport, dinamis dari `GET /plans` yang sudah publik, cart-select-redirect
logic disalin dari `catalog-cart.tsx` lama), section harga/CTA penutup
(copy generik, bukan duplikasi 1 harga spesifik yang menyesatkan). Token
warna baru `--color-landing-*` (hijau) dipisah dari `--color-primary-*`
(biru, admin/app) supaya identitas marketing site tidak bentrok dengan
identitas produk. `catalog-cart.tsx` lama dihapus, digantikan
`module-features.tsx`.

Full test suite `apps/api`: 355 pass, 0 fail (naik dari 352 sebelum fase
ini, 3 test baru untuk `public/stats.route.ts`). Typecheck & lint web nol
error.
