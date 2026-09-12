# Fase 109 — Gerbang "Pilih Data Usaha" + Frontend Multi-Data-Usaha

**Status:** Done
**Mulai:** 2026-09-11
**Selesai:** 2026-09-11

## Tujuan
Fase ketiga dari `docs/architecture/architecture-user-tambahan.md` (§ Fase
B2) — bagian frontend dari restrukturisasi Data Usaha. Backend (Fase 107/108)
sudah Data-Usaha-aware (checkout/trial/admin wajib `dataUsahaId`), tapi
belum ada UI untuk user benar-benar PILIH/BUAT Data Usaha — sebelumnya
`/subscribe` diam-diam pakai default via `GET /me/data-usaha/default`
(jembatan sementara, Fase 107). Fase ini membangun gerbang sungguhan:
Login → pilih/buat Data Usaha → masuk dashboard (scoped ke Data Usaha itu)
→ bisa ganti kapan saja lewat sidebar, mirip alur Accurate Online sendiri
(§ screenshot referensi user).

**Insight kunci yang menyederhanakan scope**: riset Fase 106 awalnya
mengira `modulePlanNames`/`activeModuleMap` (struktur `Record<moduleKey,
X>`) HARUS direstrukturisasi jadi array karena "1 modul bisa >1
subscription". Ternyata TIDAK — pelonggaran invariant di Fase 108 adalah
"per Data Usaha" (bukan global), jadi begitu dashboard di-SCOPE ke SATU
Data Usaha aktif, "1 modul = 1 subscription" kembali benar DALAM konteks
itu. Jadi Fase ini cukup filter data yang sudah ada (tidak perlu ubah
struktur Record jadi array) — TERBUKTI benar saat eksekusi, tidak ada
restrukturisasi Record yang dibutuhkan sama sekali.

## Scope
- [x] `apps/api/src/routes/me.route.ts` — ganti `GET /me/data-usaha/default`
      (jembatan sementara) jadi `GET /me/data-usaha` (list) + `POST
      /me/data-usaha` (buat baru).
- [x] `apps/web/lib/active-data-usaha-cookie.ts` (BARU) + `active-data-usaha.ts`
      (BARU) — konstanta nama cookie DIPISAH dari helper Server Component
      (`next/headers`), lihat § Keputusan Kecil (bug ditemukan saat testing).
- [x] `apps/web/app/app/pilih-usaha/page.tsx` (BARU) — halaman gerbang, DI
      LUAR grup `(protected)` (cegah redirect loop, pola sama
      `/login`/`/register`). List Data Usaha existing + form buat baru.
- [x] `apps/web/components/data-usaha/pilih-usaha-form.tsx` (BARU) — Client
      Component: list card + form create (react-hook-form + zod, pola
      sama `profile-settings.tsx`), set cookie via `document.cookie`
      langsung (bukan Server Action, konsisten konvensi project).
- [x] `apps/web/app/app/(protected)/layout.tsx` — redirect ke
      `/pilih-usaha` kalau cookie kosong/tidak valid (self-heal, validasi
      terhadap daftar Data Usaha MILIK user, bukan cuma "ada cookie");
      scope `subscriptionModules`/`modulePlanNames` ke Data Usaha AKTIF saja.
- [x] `apps/web/components/app-shell/sidebar.tsx` +
      `components/app-shell/app-shell.tsx` — switcher "Ganti Data
      Usaha" di rail bawah (sebelum tombol Ciutkan), surface "app" saja
      (desktop + mobile drawer).
- [x] `apps/web/app/app/(protected)/subscribe/page.tsx` — dipecah jadi
      Server Component tipis (baca cookie) + Client Component
      `components/subscribe/subscribe-form.tsx` (terima `dataUsahaId`
      sebagai prop, bukan lagi fetch endpoint jembatan).
- [x] Typecheck + security review.

## Referensi
- `docs/architecture/architecture-user-tambahan.md` § Fase B2.
- `docs/phases/phase-107-migrasi-data-usaha.md` § Known Limitations
  (endpoint jembatan yang digantikan di fase ini).

## Keputusan Kecil Selama Eksekusi
- **`ACTIVE_DATA_USAHA_COOKIE` DIPISAH ke file sendiri
  (`active-data-usaha-cookie.ts`)**, terpisah dari
  `getActiveDataUsahaIdCookie()` (`active-data-usaha.ts`, import
  `next/headers`). Ditemukan via browser test SUNGGUHAN (bukan cuma
  `tsc`): Next.js menolak build kalau Client Component
  (`pilih-usaha-form.tsx`) import APA PUN dari modul yang — walau
  transitif — meng-import API server-only, bahkan kalau simbol yang
  dipakai cuma konstanta string. `bun run typecheck` TIDAK menangkap ini
  (murni type-level, bukan runtime bundler constraint) — pelajaran:
  perubahan yang menyentuh batas Server/Client Component WAJIB diverifikasi
  di browser sungguhan, bukan cuma typecheck.
- **Cookie `active_data_usaha_id` non-httpOnly, diset LANGSUNG dari
  client** (`document.cookie = ...`), BUKAN via Server Action. Alasan:
  konsisten konvensi project (form pakai react-hook-form +
  `lib/api-client.ts`, § apps/web/CLAUDE.md) — memperkenalkan Server
  Action cuma untuk 1 fitur ini akan jadi pola asing di codebase. Aman
  non-httpOnly karena cookie ini PREFERENSI TAMPILAN MURNI (lihat komentar
  `lib/active-data-usaha.ts`) — setiap endpoint yang benar-benar mengubah
  data (checkout/trial/admin) tetap validasi ownership sendiri
  (`ownsDataUsaha`, Fase 107) terlepas dari isi cookie.
- **`GET /admin/subscriptions` & endpoint admin lain TIDAK diubah** di
  fase ini (masih pakai `getOrCreateDefaultDataUsaha` fallback, § Fase
  107/108) — UI admin untuk pilih Data Usaha spesifik per customer
  menyusul Fase 110 (belum ada kebutuhan mendesak, admin jarang
  provision multi-Data-Usaha untuk 1 customer di tahap ini).
- Diverifikasi manual di browser (bukan cuma test otomatis): register →
  auto-redirect ke `/pilih-usaha` (list kosong, form create langsung
  tampil) → buat "PT Maju Sejahtera" → masuk dashboard, sidebar tampilkan
  nama Data Usaha aktif → klik switcher → balik ke gerbang, list
  sekarang tampilkan 1 card existing + tombol buat baru → buat "PT
  Sejahtera Bersama" → checkout modul Purchase Invoice → invoice
  dibuat, dikonfirmasi via query DB langsung `order.dataUsahaId` cocok
  PERSIS dengan Data Usaha yang sedang aktif (bukan yang pertama dibuat).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`apps/api` + `apps/web`)
- [x] Security review dijalankan — 0 temuan (lihat § Ringkasan Hasil)
- [x] Temuan Critical/High sudah diperbaiki (tidak ada temuan)
- [x] `docs/PROGRESS.md` diupdate
- [x] **TIDAK push**

## Known Limitations
- Sidebar TIDAK menampilkan "Modul" sebagai level nesting terpisah
  (Data Usaha → Modul → Fitur) — tetap struktur grup "Import Data" flat
  seperti sebelumnya, per klarifikasi sebelumnya bahwa "Modul" masih
  murni konsep frontend (belum ada tabel DB), aman diformalkan nanti
  kalau benar-benar dibutuhkan (bukan gap, keputusan sadar scope-cut).
- Belum ada UI untuk RENAME/HAPUS Data Usaha, atau melihat daftar
  subscription per Data Usaha di luar yang sedang aktif — user cuma
  bisa lihat modul aktif Data Usaha yang SEDANG dipilih. Menyusul kalau
  dibutuhkan (belum diminta eksplisit).
- `admin/subscriptions.route.ts`, `admin/orders.route.ts` (confirm) masih
  fallback ke Data Usaha default kalau admin tidak eksplisit kirim
  `dataUsahaId` — UI admin picker menyusul Fase 110 kalau relevan.
- Test otomatis (`me.route.test.ts`) cover `GET`/`POST /me/data-usaha`
  di level API — TIDAK ada test end-to-end browser otomatis untuk
  gerbang/switcher (diverifikasi manual sekali saat eksekusi, lihat §
  Keputusan Kecil). Pertimbangkan Playwright/browser test kalau alur ini
  sering berubah ke depannya.

## Ringkasan Hasil
- Gerbang `/pilih-usaha` (di luar grup `(protected)`) — list Data Usaha
  + form buat baru, form create otomatis tampil kalau list kosong.
- Dashboard (`(protected)/layout.tsx`) sekarang WAJIB ada Data Usaha
  aktif valid (divalidasi terhadap daftar milik user, bukan cuma
  keberadaan cookie) — self-heal ke gerbang kalau tidak.
- Sidebar app surface: switcher "Ganti Data Usaha" di rail bawah
  (desktop + mobile), menampilkan nama Data Usaha aktif.
- `/subscribe` displit jadi Server Component (baca cookie) + Client
  Component (terima `dataUsahaId` sebagai prop) — endpoint jembatan
  `GET /me/data-usaha/default` (Fase 107) SUDAH DIHAPUS, tidak dipakai lagi.
- Checkout/trial dari `/subscribe` sekarang benar-benar terikat Data
  Usaha yang user PILIH SENDIRI, bukan default diam-diam — diverifikasi
  end-to-end di browser + query DB langsung (§ Keputusan Kecil).
- `bun run typecheck`: 0 error (api + web).
- `bun run test`: 671 pass/0 fail (api, +5 test baru `/me/data-usaha`),
  57 pass/0 fail (web).
- Security review: 0 temuan — ownership check `GET/POST /me/data-usaha`
  di-scope `userId` session, cookie non-httpOnly dikonfirmasi bukan
  batas keamanan (semua write path re-validasi via `ownsDataUsaha`),
  auth check `/pilih-usaha` sama ketat dengan layout.tsx, tidak ada
  `dangerouslySetInnerHTML` di file baru manapun.
- 1 bug ditemukan & diperbaiki SEBELUM commit (via browser test, bukan
  typecheck) — lihat § Keputusan Kecil soal pemisahan
  `active-data-usaha-cookie.ts`.

---

## Addendum (2026-09-12) — Redesain Visual Gerbang + Rename Data Usaha

Diminta user langsung (bukan bagian rencana Fase 106-111 awal), dikerjakan
"pelan2" (iteratif, bukan lewat `phase-workflow` formal) karena murni
pekerjaan UI di atas fitur yang sudah Done — dicatat di sini karena
mengubah halaman `/pilih-usaha` secara signifikan.

**Redesain visual** (referensi: layout Data Usaha Accurate Online, diminta
eksplisit meniru strukturnya dengan karakter menu Facport sendiri):
- `apps/web/components/data-usaha/pilih-usaha-header.tsx` (BARU) — header
  custom pengganti `AuthLayout`: kiri mark kecil (favicon+"FACPORT", ganti
  baris "Bahasa|IP" ala Accurate yang tidak relevan), tengah logo brand
  utama (posisi absolute, benar-benar center), kanan avatar+dropdown akun
  (pola sama `Topbar`).
- `apps/web/components/data-usaha/banner-slider.tsx` (BARU) — panel promo
  kiri, collapsible (localStorage, pola sama collapse sidebar app-shell),
  slider rasio 4:5 ("kayak ukuran Instagram post", eksplisit diminta user),
  autoplay 6 detik + panah + dots. Konten 3 slide MASIH hardcode (promosi
  Facport sendiri) — belum ada sistem admin kelola banner, di luar scope
  langkah pertama ini.
- `apps/web/components/data-usaha/pilih-usaha-form.tsx` — REWRITE total:
  grid kartu Data Usaha (3 kolom saat banner tampil, 5-6 kolom saat
  diciutkan — dua breakpoint ini SALING TERKAIT via 1 state `bannerCollapsed`
  yang di-lift ke komponen ini, bukan state lokal `BannerSlider`), kotak
  pencarian client-side, tombol "+" buka dialog buat baru (ganti form
  inline lama). **Mobile (< breakpoint `lg`, 1024px) TETAP pakai tampilan
  list-row lama APA ADANYA** (diminta eksplisit user) — dua blok JSX
  terpisah (`hidden lg:flex` vs `lg:hidden`), bukan 1 layout yang
  di-reflow CSS grid, supaya perilaku mobile 100% tidak berubah.

**Branding dari database** (diminta user 2026-09-12, bukan hardcode):
`pilih-usaha-header.tsx` sekarang terima `logoUrl`/`faviconUrl` dari
`getPublicSettings()` (`settings.company.logo`/`company.favicon["32"]`,
sumber SAMA yang dipakai `Topbar`/sidebar app-shell) — fallback ke
ikon+teks lama HANYA kalau branding belum pernah di-upload admin. **Teks
"Facport" TETAP literal**, bukan diganti `company.name` — `company.name`
itu identitas badan usaha yang menjalankan platform (dipakai footer
copyright/invoice, bisa beda dari nama produk, mis. dev DB isinya "Test
Co"), keliru kalau dipakai gantikan nama produk di header.

**Rename Data Usaha** (kebutuhan baru, bukan cuma UI): `PATCH
/me/data-usaha/:id` (body `{name}`, `apps/api/src/routes/me.route.ts`) —
HANYA pemilik SAAT INI (`ownsDataUsaha`) yang boleh, member seat aktif
DITOLAK (rename itu aksi kelola, bukan cuma akses-pakai — konsisten
prinsip `ADR-0032`/fix `team.route.ts` Fase 111). Ikon pensil muncul di
tiap kartu/list-row HANYA untuk `row.isOwner === true`, `stopPropagation()`
supaya tidak ikut trigger pilih Data Usaha. 5 test baru
(`me.route.test.ts` § "PATCH /me/data-usaha/:id").

**Verifikasi**: `bun run typecheck` (0 error), `bun run test` (734
pass/0 fail, +5 baru), `bun run lint` (0 error baru — 1 pre-existing
`react-hooks/set-state-in-effect` di file ini dibiarkan, pola yang SAMA
dipakai 35 file lain di codebase, bukan regresi sesi ini). Security review
skill: 0 temuan untuk `PATCH /me/data-usaha/:id`. Browser walkthrough
penuh: header (favicon+logo asli dari DB, dikonfirmasi beda dari
hardcode), banner (collapse+persist reload+autoplay+arrows+dots),
grid (3↔5 kolom, search filter, create dialog), rename (dialog
pre-filled, `stopPropagation` tidak trigger select, optimistic update di
UI tanpa reload), mobile fallback (dipaksa render via override CSS
sementara karena `resize_window` tool tidak berfungsi di environment ini
— lihat batasan di bawah).

### Known Limitations (addendum)
- **Belum ada sistem admin untuk kelola isi banner** — 3 slide promo
  hardcode di `banner-slider.tsx`. Struktur sudah generik (`Slide[]`)
  supaya gampang disambung ke data dinamis nanti.
- **Mobile TIDAK diverifikasi di viewport asli** — `resize_window` (Claude
  in Chrome) tidak berhasil mengubah ukuran window nyata di lingkungan
  ini (window tetap ukuran native display walau tool melaporkan sukses).
  Diverifikasi via override CSS langsung (paksa toggle class
  `hidden`/`lg:hidden` lewat `<style>` injeksi) untuk konfirmasi JSX
  fallback mobile render benar dengan data asli — TIDAK membuktikan
  breakpoint `lg` (1024px) sendiri presisi di device fisik, tapi mekanisme
  breakpoint-nya reuse pola `AuthLayout` yang sudah lama dipakai project
  ini (`hidden lg:flex`/`lg:hidden`).
- **Belum di-commit** — menunggu review/feedback user (diminta eksplisit
  "pelan2 saja kita perbaiki ya" — user memvalidasi hasil dulu sebelum commit).
