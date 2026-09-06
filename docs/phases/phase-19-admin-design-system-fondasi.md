# Fase 19 — Admin Design System: Fondasi (Komponen & Utilitas Bersama)

**Status:** Done
**Mulai:** 2026-09-05
**Selesai:** 2026-09-05

## Tujuan
Fase pertama dari inisiatif 4-fase (19-22) memperbaiki konsistensi
UI/UX admin dashboard (dipicu feedback user 2026-09-05: "tidak menarik,
tidak konsisten"). Fase ini SENGAJA tidak mengubah tampilan halaman
manapun — cuma membangun building block bersama (komponen primitif,
status registry, formatter tersentralisasi) yang akan dipakai Fase 20
(unifikasi status invoice/pembayaran) dan Fase 21 (rollout ke semua
halaman admin existing).

Latar belakang lengkap (audit konkret, keputusan cakupan yang
dikonfirmasi user) → ADR-0023, plan session 2026-09-05.

## Scope
- [x] `apps/web/components/ui/textarea.tsx` (baru)
- [x] `apps/web/components/ui/select.tsx` (baru) — native `<select>`
      bergaya untuk pilihan tetap/sedikit; `Combobox` existing tetap
      dipakai untuk pilihan banyak/async (2 pola dipertahankan sengaja,
      lihat Keputusan Kecil)
- [x] `apps/web/components/ui/checkbox.tsx` (baru, Radix Checkbox styled
      — ganti raw `<input type="checkbox">`)
- [x] `apps/web/components/ui/tabs.tsx` (baru, Radix Tabs)
- [x] `apps/web/components/ui/tooltip.tsx` (baru, Radix Tooltip)
- [x] `apps/web/components/ui/alert.tsx` (baru — banner
      default/success/warning/destructive)
- [x] `apps/web/components/ui/pagination.tsx` (baru — generik,
      `page`/`totalPages`/`onPageChange`)
- [x] `apps/web/components/ui/data-table.tsx` (baru — wrapper
      `@tanstack/react-table` v9, sorting + pagination bawaan via
      `Pagination`, slot `toolbar` opsional; row-selection SENGAJA belum
      diaktifkan sampai ada use case konkret saat rollout)
- [x] `apps/web/components/ui/page-header.tsx` (baru — `title` +
      `description` + slot `action`)
- [x] `apps/web/components/ui/stat-card.tsx` (baru — `icon`+`label`+
      `value`+`trend` opsional)
- [x] `apps/web/components/ui/permission-guard.tsx` (baru, presentational
      — terima `permissions: string[]` langsung, BELUM di-wire ke Context/
      AppShell, itu bagian Fase 21) + `apps/api/src/routes/me.route.ts`
      extend balas `permissions: string[]` (`lib/permission.ts`
      `getUserPermissionKeys()` baru)
- [x] `apps/web/lib/status-badges.tsx` (baru — `.tsx` karena
      `<StatusBadge>` JSX, bukan `.ts` seperti direncanakan) —
      `STATUS_REGISTRY` 4 domain (invoice/order/subscription/
      import-batch) + `<StatusBadge>` component + `getStatusMeta()`
- [x] `apps/web/lib/utils.ts` — tambah `currencyFormatter` tersentralisasi
- [x] `apps/web/components/ui/button.tsx` — tambah variant
      `destructive`/`secondary` + prop `size` (`default`/`sm`/`icon`)
- [x] `apps/web/components/ui/card.tsx` — tambah `CardFooter`
- [x] `apps/web/components/ui/dialog.tsx` — tambah
      `DialogHeader`/`DialogFooter`/`DialogDescription`

**TIDAK termasuk scope fase ini** (sengaja): mengubah halaman admin/app
manapun untuk PAKAI komponen baru ini — itu Fase 21. Menghapus 6 mapping
status duplikat yang ada sekarang — itu juga Fase 20/21 (setelah
`StatusBadge` teruji, baru migrasi pemakai lama).

## Referensi
- ADR: `docs/decisions/adr-0023-admin-design-system.md`
- Architecture doc: tidak ada perubahan arsitektur besar di luar yang
  sudah dicatat ADR-0023 — `docs/architecture/architecture-components.md`
  akan diupdate saat komponen ini dipakai nyata (Fase 21), bukan sekarang

## Keputusan Kecil Selama Eksekusi
- **`@tanstack/react-table` ternyata v9 — API BEDA TOTAL dari v8**
  (bukan cuma minor bump): `useReactTable`+`getCoreRowModel()` dkk sudah
  digantikan `useTable`+`tableFeatures({...})` (registrasi fitur eksplisit
  per tabel, bukan implisit). Ada compat layer `useLegacyTable` (import
  dari `@tanstack/react-table/legacy`) tapi ditandai *deprecated* oleh
  library-nya sendiri — diputuskan pakai API v9 native (`useTable`) di
  `data-table.tsx`, BUKAN shim deprecated, supaya tidak numpuk utang
  teknis baru di komponen yang baru dibuat. Ketahuan API-nya dari file
  `skills/*/SKILL.md` yang di-ship package ini sendiri (fitur baru
  ekosistem TanStack per 2026 — dokumentasi ditulis utk coding agent),
  bukan dari training data yang mengasumsikan v8.
- **`select.tsx` = native `<select>` bergaya, BUKAN Radix Select baru**
  — sudah ada `Combobox` (Popover+cmdk) untuk pilihan banyak/async;
  nambah Radix Select sebagai KETIGA akan bikin 2 pola dropdown lagi
  (persis masalah yang mau dihindari). Native select cukup untuk
  pilihan tetap/sedikit (mis. pilih 1 sub-modul di form plan).
- **`PermissionGuard` presentational-only fase ini** — terima
  `permissions: string[]` sebagai prop langsung, BELUM di-wire ke
  Context/AppShell/layout (butuh sentuh banyak file layout yang memang
  scope-nya Fase 21 rollout, bukan fondasi).
- **`lib/status-badges.ts` jadi `.tsx`** — file rencana awal `.ts` tapi
  isinya termasuk komponen `<StatusBadge>` (JSX), harus `.tsx` biar
  transform JSX jalan.
- **`buttonVariants()` overload dipertahankan backward-compatible** —
  signature lama `buttonVariants(variant, className)` dipakai ~20 tempat
  existing; prop `size` baru dideteksi otomatis (kalau argumen ke-2 ADALAH
  `"sm"`/`"icon"`/`"default"` diperlakukan sebagai size, selain itu tetap
  diperlakukan sebagai className seperti sebelumnya) — TIDAK perlu
  migrasi 20 call-site itu sekarang.

## Verifikasi Tambahan (di luar SOP baku, khusus fase ini)
`apps/web` TIDAK PUNYA test runner sama sekali (beda dari `apps/api` yang
pakai `bun:test`) — menambah satu sekarang di luar scope fase ini.
`status-badges.tsx` diverifikasi via script sekali-jalan (bukan test
permanen): semua 22 kombinasi domain/status terdaftar (label+variant
terisi) DAN status tak dikenal mengembalikan fallback aman (tidak crash)
— hasil: **OK**, dihapus setelah dijalankan (bukan file baru yang tersisa
di repo).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck` — apps/api & apps/web)
- [x] Security review dijalankan (self-review, 2 file backend kecil —
      `GET /me` tetap `auth: true`, data selalu scoped ke `user.id` dari
      session, tidak ada input client baru; `PermissionGuard` didokumentasikan
      eksplisit sebagai UI hint, bukan pengganti authorization)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — 0 temuan
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda — 0 temuan
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- **Komponen baru BELUM dipakai di halaman manapun** — sesuai scope
  fase ini (fondasi dulu, rollout Fase 21). Nilai baru terasa/terlihat
  mulai Fase 20.
- **`apps/web` tidak punya test runner** — `status-badges.tsx` diverifikasi
  manual (lihat § Verifikasi Tambahan), bukan test permanen yang jalan
  di CI. Kalau ke depan `apps/web` butuh test unit sungguhan, itu
  keputusan infra terpisah (di luar scope inisiatif ini).
- **`PermissionGuard` belum ada sumber data nyata** (Context/hook yang
  fetch `/me`) — baru presentational component, di-wire Fase 21.
- **`data-table.tsx` row-selection/bulk-action belum diaktifkan** —
  fitur tersedia di `@tanstack/react-table` yang dipakai, tapi sengaja
  belum ada API publik untuk itu di wrapper ini sampai ada halaman
  konkret yang butuh (keputusan per-halaman, § ADR-0023).

## Ringkasan Hasil
Fase pertama dari inisiatif 4-fase (19-22) memperbaiki konsistensi
UI/UX admin dashboard. Sesuai rencana, fase ini TIDAK mengubah tampilan
halaman manapun — membangun 9 komponen primitif baru (`Textarea`,
`Select`, `Checkbox`, `Tabs`, `Tooltip`, `Alert`, `Pagination`,
`DataTable`, `PageHeader`, `StatCard`, `PermissionGuard` — 11 sebenarnya)
plus 1 status registry tunggal (`lib/status-badges.tsx`, 4 domain: invoice/
order/subscription/import-batch) dan 1 utilitas tersentralisasi
(`currencyFormatter`), serta extend 3 komponen existing (`Button` dapat
variant `destructive`/`secondary`+prop `size`, `Card` dapat `CardFooter`,
`Dialog` dapat `DialogHeader`/`DialogFooter`/`DialogDescription`).

Temuan teknis penting: `@tanstack/react-table` (dependency sejak
ADR-0004, sebelumnya 0 pemakaian nyata) ternyata versi 9 dengan API yang
BEDA TOTAL dari v8 yang lazim dikenal (`useTable`+`tableFeatures`
eksplisit, bukan `useReactTable`+opsi implisit) — ada compat shim
`useLegacyTable` tapi ditandai deprecated oleh library sendiri, jadi
`data-table.tsx` dibangun native di atas v9 (`useTable`, `rowSortingFeature`,
`rowPaginationFeature`) supaya tidak menumpuk utang teknis di komponen
yang baru saja dibuat. Detail ditemukan lewat file dokumentasi
`skills/*/SKILL.md` yang di-ship package itu sendiri.

Backend: `GET /me` extend balas `permissions: string[]` (fungsi baru
`getUserPermissionKeys()` di `lib/permission.ts`, reuse query yang sama
dengan `userHasPermission`) — fondasi untuk `PermissionGuard` frontend
(baru presentational, belum di-wire ke data nyata, itu Fase 21).

Typecheck 0 error (apps/api & apps/web), full API test suite tetap
151 pass/2 skip/0 fail (tidak ada regresi dari extend `/me`), security
review self-review 0 temuan (perubahan backend kecil & low-risk — data
selalu scoped ke user sendiri, tidak ada endpoint/input baru).
`status-badges.tsx` diverifikasi manual (22 kombinasi status + fallback,
lihat § Verifikasi Tambahan) karena `apps/web` belum punya test runner.

**Belum ada perubahan visual apa pun yang bisa diverifikasi browser** —
sesuai rencana, itu baru relevan mulai Fase 20 (unifikasi status
invoice/pembayaran) dan terutama Fase 21 (rollout, di situ verifikasi
visual browser WAJIB dilakukan).
