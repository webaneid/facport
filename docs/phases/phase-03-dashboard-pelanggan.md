# Fase 03 — Dashboard Pelanggan (App Shell + Halaman Utama)

**Status:** Done
**Mulai:** 2026-08-19
**Selesai:** 2026-08-19

## Tujuan
Halaman `/app` (dashboard pelanggan, surface `app.facport.com`) masih
placeholder sejak Fase 00 ("Dashboard pelanggan sungguhan menyusul"). Setelah
Fase 02 (import Purchase Invoice) terbukti jalan end-to-end, user minta
dashboard pelanggan yang **profesional, modern, dan super responsive** —
sekaligus jadi **fondasi App Shell** (sidebar + layout) yang dipakai ulang
begitu modul berikutnya (Sales Invoice, Purchase Order, dst) ditambahkan.
Didokumentasikan rapi (SOP penuh) karena fiturnya eksplisit diharapkan
terus bertambah — supaya evaluasi & onboarding modul baru mudah.

Scope: surface **`app` (pelanggan) SAJA** — TIDAK menyentuh `admin` atau
`landing`. Keputusan desain: light mode dulu (token dark-mode-ready,
toggle menyusul), palet indigo/blue profesional.

## Scope
- [x] M0 — Fondasi desain: Tailwind `@theme` token, font Inter, `sonner`+`@tanstack/react-table` terinstall
- [x] M1 — Komponen UI baru: Card, Badge, DropdownMenu, Avatar, Skeleton, Table
- [x] M2 — App Shell: route group `(protected)`, layout+sidebar+topbar, retrofit halaman lama
- [x] M3 — Endpoint baru `GET /purchase-invoice/import` (list riwayat)
- [x] M4 — Konten dashboard home (Card Langganan, Koneksi Accurate, Import Terakhir)
- [x] M5 — Responsive & verifikasi browser (Playwright, 3 breakpoint) — 1 bug
      nyata ketemu & diperbaiki (overflow mobile, § Keputusan Kecil)
- [x] M6 — Dokumentasi arsitektur App Shell + tutup fase

## Referensi
- Architecture doc: `docs/architecture/architecture-app-dashboard.md` (baru)
- ADR terkait: `docs/decisions/adr-0004-ui-component-standards.md`
- Pola role-check layout yang dicontoh: `apps/web/app/admin/(protected)/layout.tsx`

## Keputusan Kecil Selama Eksekusi
(hal yang diputuskan di tengah jalan, nggak cukup besar buat ADR tapi tetap
perlu diingat kenapa dipilih begitu)
- Dark mode DITUNDA (keputusan eksplisit user) — token warna disiapkan
  pakai CSS variable semantik supaya gampang ditambah nanti, tapi toggle
  gelap TIDAK dikerjakan fase ini.
- Palet indigo/blue (keputusan eksplisit user) — dipilih karena netral &
  umum dipakai produk SaaS B2B finance/accounting.
- Mobile nav drawer pakai ulang pola `dialog.tsx` yang sudah ada (bukan
  komponen Sheet baru dari nol) — hemat scope, konsisten dengan komponen
  yang sudah terverifikasi jalan.
- `buttonVariants(variant, className)` diekspor terpisah dari `<Button>`
  (pola shadcn) — dipakai di `<Link>` (navigasi Dashboard→Import,
  Dashboard→Accurate) yang butuh TAMPILAN tombol tapi bukan elemen
  `<button>` sungguhan. Alternatifnya (`@radix-ui/react-slot` + `asChild`)
  ditolak — dependency tambahan untuk kebutuhan yang bisa diselesaikan
  dengan cara lebih sederhana.
- Server Component (`page.tsx` dashboard) forward cookie manual via raw
  `fetch()` (BUKAN Eden `api` client) — Eden `credentials:"include"` cuma
  efektif di browser, tidak ada artinya di server (pola sama
  `admin/(protected)/layout.tsx`, ditulis eksplisit di
  `architecture-app-dashboard.md` supaya tidak ketemu ulang tiap fase).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — apps/api DAN apps/web
- [x] Security review dijalankan (skill `security-review` — sentuhan
      backend kecil, tidak perlu subagent) — 0 temuan
- [x] Temuan Critical/High sudah diperbaiki (tidak ada temuan)
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda
      (tidak ada yang ditunda — 1 bug responsive ketemu & langsung diperbaiki
      sama sesi, dicatat sebagai lessons-learned biasa)
- [x] `docs/PROGRESS.md` diupdate
- [x] Diverifikasi lewat browser sungguhan (Playwright) — login, render
      data asli, navigasi drawer mobile, logout, 3 breakpoint tanpa overflow

## Known Limitations
(hal yang sengaja belum ditangani di fase ini, biar jelas dan disengaja —
bukan kelupaan)
- Dark mode belum ada toggle (token siap, implementasi menyusul)
- Admin dashboard (`/admin`) TIDAK disentuh fase ini — masih placeholder,
  jadi kandidat fase terpisah kalau dibutuhkan nanti
- Belum ada foto profil user (Avatar cuma inisial dari nama/email)

## Ringkasan Hasil (isi pas fase Done)
Dashboard pelanggan pindah dari placeholder ke UI profesional yang jadi
**fondasi App Shell** dipakai ulang modul-modul berikutnya.

**Yang dibangun:**
- Token desain (indigo/primary, neutral, semantic success/warning/destructive)
  + font Inter — struktur dark-mode-ready (token, bukan implementasi)
- 6 komponen UI baru: Card, Badge, DropdownMenu, Avatar, Skeleton, Table
  (`buttonVariants` helper juga ditambah ke Button yang sudah ada)
- App Shell: sidebar (desktop fixed, mobile drawer via Radix Dialog primitif),
  topbar (user menu + logout), route group `(protected)` (pola sama admin)
- Endpoint baru `GET /purchase-invoice/import` (list riwayat, dual-gate,
  ownership-scoped, test regresi ownership + urutan + limit)
- Dashboard home: Card Langganan (status+modul+masa berlaku), Card Koneksi
  Accurate (status+CTA), Card Import Terakhir (tabel 5 batch terbaru +
  link detail)
- Halaman lama (`accurate/`, `purchase-invoice/import/**`) di-retrofit
  pakai Card/Badge/Table baru, konsisten visual dengan dashboard

**1 bug nyata ditemukan & diperbaiki** lewat verifikasi Playwright (bukan
ditebak): overflow horizontal di mobile — flex item butuh `min-w-0`
eksplisit, `overflow-x-auto` di tabel SAJA tidak cukup kalau parent
flex-nya tidak dikasih `min-w-0` juga. Detail lengkap →
`docs/lessons-learned.md`.

**Diverifikasi end-to-end lewat browser sungguhan** (Playwright, bukan
cuma server-render): login → dashboard tampil data ASLI (subscription
"Paket Pembelian" aktif, koneksi Accurate terhubung, 4 riwayat import
nyata dari Fase 02) → navigasi via drawer mobile → logout. 3 breakpoint
(desktop/tablet/mobile) tanpa overflow horizontal.

**Security review**: 0 temuan (endpoint baru read-only, ownership-scoped,
dual-gate sudah pola established, tidak ada `dangerouslySetInnerHTML`/secret
hardcode di frontend baru).

**Status modul/fase berikutnya**: BELUM diputuskan — dashboard ini fondasi
UI, bukan modul import baru. Urutan modul Accurate berikutnya (Sales
Invoice, dst) masih menunggu keputusan user (§ `docs/PROGRESS.md`).
