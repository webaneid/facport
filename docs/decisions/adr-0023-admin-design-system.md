# ADR-0023: Admin Design System — Komponen Bersama & Status Registry

**Status:** Accepted
**Tanggal:** 2026-09-05

## Context
User menilai admin dashboard "tidak menarik dan tidak konsisten". Audit
(2 subagent riset paralel, baca kode nyata) mengkonfirmasi ini bukan cuma
persepsi:

- `@tanstack/react-table` sudah jadi dependency & "standar wajib" per
  `apps/web/CLAUDE.md`/ADR-0004, tapi **0 pemakaian nyata** — semua
  listing (plans/users/orders/billing) pakai `<table>`+`.map()` manual,
  pagination di-reinvent beda-beda per halaman.
- **6 mapping status→Badge terpisah** ter-duplikasi/inkonsisten:
  `SUBSCRIPTION_STATUS` (app dashboard) vs `SUB_STATUS` (admin users) —
  logic identik, nama beda; `BATCH_STATUS` di-copy 3x verbatim;
  `order.status` malah TIDAK PERNAH dipetakan ke Badge sama sekali —
  tiap cabang di-hardcode manual per halaman, menghasilkan copy berbeda
  untuk konsep yang sama ("Lunas" vs "✓ Lunas").
- Tidak ada `PageHeader`/`StatCard` reusable — tiap halaman hand-code
  header block & stat card sendiri, ukuran/spacing bisa drift diam-diam.
- Komponen primitif hilang: `Textarea`, `Select` bergaya, `Checkbox`
  bergaya, `Tabs`, `Tooltip`, `Alert`, `Pagination`.
- `currencyFormatter` di-copy verbatim di 8 file berbeda.
- Frontend tidak punya pola Permission/Role Guard sama sekali walau
  backend RBAC dinamis sudah lengkap sejak Fase 00/18.

Detail lengkap riset & keputusan cakupan (apa yang di-skip dan kenapa,
dikonfirmasi langsung ke user) → plan session 2026-09-05, diringkas di
`docs/phases/phase-19-admin-design-system-fondasi.md`.

## Decision
1. **Bangun primitif dulu (Fase 19), baru rollout (Fase 21)** — komponen
   baru WAJIB dipakai di ≥2 halaman existing saat rollout, bukan cuma
   didokumentasikan tanpa pemakaian nyata (mengulang nasib
   `@tanstack/react-table` yang jadi dependency mangkrak).
2. **Status registry tunggal** — 1 file `apps/web/lib/status-badges.ts`,
   1 fungsi `getStatusBadge(domain, status)` untuk SEMUA domain (invoice,
   order, subscription, import-batch). Hapus 6 mapping duplikat yang ada
   sekarang. Domain TETAP dipisah (bukan digabung jadi 1 status buatan)
   karena invoice/order/subscription merepresentasikan 3 hal yang
   berbeda (dokumen tagihan vs upaya bayar vs akses aktif) — yang
   disatukan adalah SUMBER label/warna-nya, bukan makna domainnya.
3. **`@tanstack/react-table` akhirnya benar-benar dipakai** lewat 1
   wrapper `components/ui/data-table.tsx` — sorting + pagination bawaan,
   slot toolbar opsional, row-selection/bulk-action OPSIONAL (tidak
   dipaksa aktif di semua tabel, keputusan per-halaman saat rollout).
4. **`PermissionGuard` component baru** — butuh `apps/api` `/me` extend
   balas `permissions: string[]` (reuse `userHasPermission`/
   `rolePermissions` yang sudah ada, bukan sistem baru).
5. **Cakupan dipersempit sengaja** (dikonfirmasi user via
   `AskUserQuestion`) — item dari daftar awal user yang di-skip: ikon
   notifikasi & search topbar (tidak ada backend/sumber data), sidebar
   collapsible (nav admin cuma 5 item, manfaat kecil). Item yang
   di-include walau bukan bagian "konsistensi visual" murni: Profile
   Settings + Ganti Password (dipilih eksplisit user, jadi Fase 22
   terpisah).

## Alternatif yang Dipertimbangkan
- **Perbaiki per-halaman langsung tanpa fase fondasi terpisah** —
  ditolak: hasilnya tetap N versi yang KEBETULAN mirip saat ini, bukan 1
  sumber kebenaran yang bertahan saat halaman baru ditambah nanti.
- **Gabungkan invoice+order+subscription jadi 1 status universal** —
  ditolak: 3 tabel itu representasi 3 lifecycle stage yang beda (lihat
  `docs/architecture/architecture-payment.md`), memaksa 1 status buatan
  akan mengaburkan makna yang sudah benar dipisah di skema DB.
- **Pakai library data-table pihak ketiga siap pakai (mis. shadcn
  data-table generator penuh dengan semua fitur)** — ditolak untuk versi
  awal: kompleksitas (virtualization, server-side sorting) belum
  dibutuhkan skala data admin sekarang (puluhan-ratusan baris, bukan
  puluhan ribu) — wrapper tipis di atas `@tanstack/react-table` cukup,
  bisa diperluas nanti kalau kebutuhan muncul.

## Konsekuensi
- Fase 19 TIDAK mengubah tampilan halaman manapun (komponen dibuat,
  belum dipakai) — nilai baru terlihat mulai Fase 20-21.
- Rollout (Fase 21) menyentuh hampir semua halaman admin + beberapa
  halaman customer app (`BATCH_STATUS` ikut dikonsolidasi karena
  duplikasinya sama nyata) — perlu security review lintas file (subagent
  `security-auditor`), bukan self-review.
- Beberapa item dari wishlist awal user (WhatsApp input, Alamat, Rich
  Text Editor, Media Library penuh, bulk action blanket) sengaja TIDAK
  dikerjakan — didokumentasikan alasannya di phase doc supaya jelas
  disengaja, bukan kelupaan.
