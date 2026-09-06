# Fase 41 — Arsip Import Gabungan Lintas Modul + Card "Import Terakhir" Unifikasi

**Status:** Done
**Mulai:** 2026-09-06
**Selesai:** 2026-09-06

## Tujuan
User minta 2 perubahan besar di dashboard customer (`app.`):
1. Card "Import Terakhir" — SEBELUMNYA 1 card TERPISAH per modul (bisa
   sampai 6 card bertumpuk kalau subscribe semua modul) — GANTI jadi
   **1 card gabungan**, menampilkan batch terbaru dari SEMUA modul yang
   pernah diimport user, dicampur (bukan dikelompokkan per modul).
2. Item nav baru **"Arsip Import"** di PALING BAWAH grup "Import Data"
   (sidebar) — halaman arsip PENUH (paginated) yang JUGA gabungan
   lintas semua modul (bukan 6 halaman riwayat per-modul terpisah lagi
   sebagai titik akses utama).
3. Notifikasi dismissible di puncak halaman Arsip Import: "Untuk
   menjaga privasi pelanggan, Facport akan menghapus secara otomatis
   arsip import selama {N} hari" — angka N ditarik LANGSUNG dari
   setting admin `data.importRetentionDays` (`/admin/settings`), bukan
   hardcode.

## Scope
- [x] `apps/api/src/routes/me.route.ts` — endpoint baru
      `GET /me/import-batches` (`limit`/`offset`, generik LINTAS SEMUA
      modul, scoped `importBatches.userId`, TIDAK dibatasi subscription
      aktif sekarang — arsip histori milik user, bukan gerbang akses
      modul).
- [x] `apps/api/src/routes/me.route.test.ts` — 2 test baru (401, hitung
      benar lintas 2 modul + exclude batch user lain + `total` benar).
- [x] `apps/web/lib/module-import-routes.ts` (baru) — `MODULE_IMPORT_BASE_PATH`,
      SATU sumber kebenaran base path halaman import tiap modul (dipakai
      bikin link Detail per baris tanpa tahu modul apa sebelumnya).
- [x] `apps/web/components/import-archive/import-batch-table.tsx` (baru)
      — `ImportBatchTable`, SATU komponen tabel gabungan (kolom File/
      Modul/Status/Baris/Tanggal/Aksi) dipakai OLEH KEDUANYA (card
      dashboard DAN halaman Arsip Import) — dispatch Detail/Cancel/
      Delete per baris berdasarkan `batch.module` (Cancel HANYA untuk
      `purchase_invoice`/`sales_invoice`, dua-duanya modul yang punya
      fitur itu).
- [x] `apps/web/app/app/(protected)/page.tsx` — HAPUS 6 blok "Import
      Terakhir" per-modul (~370 baris), GANTI 1 card pakai
      `ImportBatchTable` + fetch `GET /me/import-batches?limit=5`.
      Hapus juga 8 import dialog per-modul, `hasXxx` booleans, 6-fetch
      `Promise.all` — semua pindah ke komponen baru.
- [x] `apps/web/app/app/(protected)/import/arsip/page.tsx` (baru) —
      halaman arsip paginated (mirror pola `.../import/riwayat/page.tsx`
      per-modul yang sudah ada, tapi data dari `/me/import-batches`),
      + `RetentionNotice` (dismissible, localStorage, tarik
      `data.importRetentionDays` live dari `GET /settings?group=data`
      — endpoint ini cuma butuh `auth: true`, customer BOLEH akses).
- [x] `apps/web/components/app-shell/sidebar.tsx` — item nav baru
      "Arsip Import" (icon `Archive`, TANPA `moduleKey` — selalu
      tampil), PALING BAWAH grup "Import Data".

**TIDAK dihapus**: 6 halaman `.../import/riwayat/page.tsx` per-modul
(Fase 09 PI/SI + Fase 36-39 VPA/PP/SR/JV) — TETAP ADA di kode (tidak
lagi jadi titik akses utama dari dashboard/sidebar, tapi tidak dihapus,
biar tidak ada broken link kalau ada yang masih bookmark URL lama).
Halaman per-modul `[batchId]/page.tsx` (detail 1 batch) JUGA tidak
berubah — link Detail dari Arsip Import gabungan tetap arahkan ke
halaman detail per-modul yang sudah ada.

## Referensi
- Pola Riwayat per-modul asli: `docs/phases/phase-09-batal-import.md`,
  `docs/phases/phase-36-riwayat-vendor-payable-account.md`
- Setting retensi: `docs/architecture/architecture-subscription.md` §
  "Retensi Data Import"

## Keputusan Kecil Selama Eksekusi
- `ImportBatchTable` di-EKSTRAK jadi komponen SHARED (bukan duplikasi
  "3 baris mirip" seperti pola mapping file backend) — beda kasusnya:
  logic dispatch 6-modul ini 100% IDENTIK di 2 tempat pakai (dashboard
  & Arsip Import), dan justru DUPLIKASI-nya yang jadi akar bug
  sebelumnya (admin batch-view lupa di-backfill, § lessons-learned.md
  2026-09-06). Extract di sini SENGAJA supaya modul baru nanti cukup
  update 2 file (`module-import-routes.ts` + `import-batch-table.tsx`),
  bukan N file tersebar.
- Arsip gabungan TIDAK difilter oleh subscription AKTIF sekarang —
  keputusan sadar: ini "riwayat milik user", user yang sudah unsubscribe
  1 modul TETAP bisa lihat histori lamanya (beda dari gate akses modul
  yang memang membatasi FITUR AKTIF, bukan data historis).
- Cancel HANYA dirender untuk `purchase_invoice`/`sales_invoice` di
  tabel gabungan (dua-duanya SATU-SATUNYA modul yang punya fitur itu)
  — TIDAK menambah Cancel ke 4 modul lain (sudah diputuskan sejak
  Fase 33-35, bukan bagian scope fase ini).
- Notifikasi retensi dismiss via `localStorage` (bukan DB) — cukup
  untuk "sudah baca sekali", tidak perlu round-trip server untuk
  preferensi UI kosmetik semacam ini.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`, api+web) — 0 error
- [x] Lint nol error (`bun run lint`) — 0 error (termasuk fix
      `react-hooks/set-state-in-effect` untuk baca localStorage di effect)
- [x] Test suite penuh `apps/api` — **264 pass / 0 fail** (2 baru, naik
      dari 262)
- [x] Security review inline: endpoint baru scoped `userId` (tidak ada
      cara akses data user lain), reuse dialog Cancel/Delete yang sudah
      teraudit, tidak ada string modul yang dipakai untuk konstruksi
      path tanpa lookup table (`MODULE_IMPORT_BASE_PATH[batch.module]`
      aman — key tidak dikenal cuma menghasilkan `undefined`, link
      Detail di-skip). 0 temuan.
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Verifikasi visual browser TIDAK dilakukan (ekstensi Chrome tidak
  tersambung) — diverifikasi lewat test suite otomatis + typecheck.
- 6 halaman Riwayat per-modul TIDAK dihapus tapi juga TIDAK di-update
  (masih pola lama, 1 modul saja) — dibiarkan sebagai jalur akses
  sekunder yang tidak terhubung dari UI utama lagi.
- Sama seperti Fase 40: test yang menulis row `settings` global
  (`data.manualInputSecondsPerRow`, dipakai `me.route.test.ts`) TIDAK
  cleanup diri sendiri — dibersihkan manual lagi dari DB dev setelah
  test run. Ini pola pre-existing di `settings.route.test.ts` (bukan
  regresi baru), dicatat di sini supaya ketahuan kalau terulang lagi.

## Ringkasan Hasil
Dashboard customer sekarang punya 1 card "Import Terakhir" gabungan
(bukan sampai 6 card bertumpuk), dan sidebar dapat item baru "Arsip
Import" (paling bawah grup "Import Data") yang membuka halaman arsip
penuh gabungan lintas semua modul, lengkap dengan notifikasi retensi
data yang dismissible dan angkanya SELALU sinkron dengan setting admin.

Perubahan backend minimal (1 endpoint baru, generik, scoped per-user).
Perubahan frontend signifikan tapi NET pengurangan kode — 1 komponen
tabel baru menggantikan ~370 baris duplikasi 6× di dashboard, dipakai
ulang di halaman arsip baru.

Typecheck 0 error (api+web), lint 0 error, test suite 264 pass/0 fail
(2 baru). Security review inline: 0 temuan.
