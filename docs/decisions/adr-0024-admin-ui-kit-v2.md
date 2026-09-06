# ADR-0024: Admin UI Kit v2 — Redesign Total (Supersede ADR-0004 komponen & ADR-0023)

**Status:** Accepted
**Tanggal:** 2026-09-05

**Supersedes:** ADR-0004 (bagian komponen visual — Button/Card/Badge/
Table/Sidebar/Topbar spesifik, TIDAK termasuk keputusan tool seperti
`react-hook-form`/`zod`/`sonner`/`@tanstack/react-table`/`lucide-react`
yang TETAP berlaku), ADR-0023 (seluruh Design System Fase 19-22
digantikan struktur & visual baru di ADR ini).

## Context
User menilai admin dashboard hasil ADR-0023 (Fase 19-22) masih belum
sesuai keinginan — minta redesign TOTAL, bukan iterasi. Referensi
diberikan lewat 2 sumber: (1) repo sibling
`/Users/webane/sites/master-typescript` — project template internal
dengan `docs/decisions/adr-0006-admin-ui-kit.md` (dibuat 2026-09-05,
hari yang sama) yang men-spesifikasi "Admin UI Kit" lengkap sebagai
dokumen kode-referensi lintas project; (2) 1 screenshot dashboard nyata
("Jalacolor") yang menunjukkan gaya visual konkret: sidebar gradient
gelap dengan grup nav berlabel kategori, identity card, stat cards,
tabel dengan badge status pill, seluruh shell dibungkus 1 card besar
rounded mengambang di atas kanvas bergradasi.

Struktur baru ini BEDA TOTAL dari ADR-0023: sidebar gelap collapsible+
nested-group (vs sidebar putih flat statis), breadcrumbs+search+
notifikasi+user-dropdown di topbar (vs topbar minimal), filter panel
dengan state di URL query param (net-new), bulk row-selection + aksi
massal (net-new), `FormField` wrapper seragam (net-new), `<Can>`
permission-guard berbasis session (vs `PermissionGuard` prop-based ADR-0023).

## Decision
1. **Adopsi struktur "Admin UI Kit" dari `master-typescript` ADR-0006**
   sebagai kerangka (6 kelompok: Shell, Primitives, Data Table, Form
   Controls, Feedback, Permission Guard), dengan 2 penyesuaian sengaja:
   - **Palet warna BIRU** (bukan teal/oranye contoh di dokumen sumber):
     `--admin-accent: #023e8a`, `--admin-accent-strong: #03045e`,
     `--admin-canvas-deep: #ebf2fa` (3 nilai dari user), sisanya
     digenerate mengikuti pola token yang sama (lihat phase doc Fase 23
     untuk daftar lengkap).
   - **`@tanstack/react-table` TETAP v9 native** (`useTable`+
     `tableFeatures`, sudah benar sejak Fase 19 — lihat
     `docs/lessons-learned.md` 2026-09-05 soal v9 vs v8), BUKAN mundur
     ke pola v8 (`useReactTable`) seperti dicontohkan dokumen sumber —
     itu ditulis untuk project lain yang belum tentu sudah kena
     masalah versi yang sama.
2. **ADR lama TIDAK dihapus/diedit** (aturan project: ADR Accepted
   tidak boleh diedit) — supersede eksplisit lewat ADR ini. Alasan
   histori keputusan lama (kenapa ADR-0023 dulu dipilih) tetap
   tersimpan sebagai jejak, bukan hilang.
3. **Kode komponen DITULIS ULANG TOTAL** di file yang sama (`button.tsx`,
   `card.tsx`, `badge.tsx`, `sidebar.tsx`, `topbar.tsx`, `data-table.tsx`,
   dst) — bukan ditambal/dipertahankan sebagian, bukan juga file baru
   paralel yang dibiarkan menua. Karena banyak primitif ini punya
   puluhan pemakai existing, migrasi caller dilakukan DALAM fase yang
   sama dengan penulisan ulang komponennya (lihat phase doc per fase)
   — bukan "bangun dulu, rollout belakangan" seperti pola ADR-0023,
   supaya app tidak pernah berada di state "primitif baru ada tapi
   pemakai lama patah" di antara fase.
4. **`<Can>`/permission guard TIDAK pakai plugin `customSession` Better
   Auth** (yang dicontohkan dokumen sumber via `useSession().data.user.
   permissions`) — project sudah punya jalur lebih sederhana sejak
   Fase 19: `GET /me` balas `permissions: string[]`. `usePermissions()`
   dibangun sebagai Context yang fetch `/me` sekali, bukan
   `useSession()` — API pemakaian `<Can>` tetap identik dengan spec
   sumber, cuma sumber datanya beda.

## Alternatif yang Dipertimbangkan
- **Iterasi dari ADR-0023 (ubah warna/spacing saja)** — ditolak, user
  eksplisit minta redesign total mengikuti referensi konkret, bukan
  penyesuaian kecil dari yang sudah ada.
- **Hapus ADR-0004/ADR-0023 dan file lama sepenuhnya** — ditolak,
  menyimpang dari aturan project sendiri soal ADR Accepted, kehilangan
  jejak kenapa keputusan lama pernah diambil.
- **Bangun primitif baru di file/folder terpisah, migrasi bertahap
  tanpa batas waktu** — ditolak untuk primitif dengan banyak pemakai
  (Button/Card/Badge/Table) karena berisiko 2 sistem hidup berdampingan
  lama (persis masalah "drift" yang ADR-0006 sumber coba hindari) —
  cuma dipakai untuk komponen yang genuinely net-new (Filter Panel,
  Form Field, Can) yang memang tidak punya pemakai lama untuk di-migrasi.
- **Pakai plugin `customSession` Better Auth untuk `<Can>`** — ditolak,
  kompleksitas client+server type-matching baru belum sepadan ketika
  `/me` sudah menyelesaikan kebutuhan yang sama sejak Fase 19.

## Konsekuensi
- 4 fase baru (23-26), migrasi total menyentuh hampir semua halaman
  admin+app frontend (32 file pemakai Button, 21 Card, 11 Table, 10
  Dialog, 8 Badge) — blast radius jauh lebih besar dari ADR-0023.
  Setiap fase WAJIB `bun run typecheck`/`lint` 0 error di titik tutup
  (bukan cuma di fase rollout terpisah) karena mengganti API existing,
  bukan menambah yang net-new.
- `docs/architecture/architecture-components.md` (index) perlu update
  besar begitu semua fase selesai — daftar komponen bertambah signifikan
  (Modal, FilterPanel, StatCards versi array, SearchForm, FormField, Can).
- Search & notifikasi topbar dibangun UI-only (tidak ada backend) —
  konsisten dengan keputusan ADR-0023 sebelumnya untuk skip fitur itu,
  sekarang dibangun sebagai shell visual kosong (bukan logic palsu)
  supaya struktur visual sesuai referensi tanpa berpura-pura ada fitur.
- Kalau ke depan ganti desain lagi, ADR ini yang di-supersede
  berikutnya — bukan diedit.
