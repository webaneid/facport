# Fase 23 — Admin Shell v2 + Token Biru + ADR-0024

**Status:** Done
**Mulai:** 2026-09-05
**Selesai:** 2026-09-05

## Tujuan
Fase pertama dari redesign total Admin UI Kit v2 (4 fase, 23-26,
menggantikan ADR-0023/Fase 19-22 sepenuhnya). Bangun ulang shell visual
(Sidebar/Topbar/AppShell) + token warna biru + kanvas gradient — TANPA
migrasi primitif Button/Card/Badge/Table di halaman (itu Fase 24-25).

Referensi: ADR-0024, `/Users/webane/sites/master-typescript/docs/architecture/components/architecture-component-admin-shell.md`.

## Scope
- [x] `apps/web/app/globals.css` — token `--admin-*` biru penuh
      (`:root` raw vars + `@theme inline` expose), token lama
      `--color-primary-*` DIPERTAHANKAN sementara (dipakai primitif
      lama sampai Fase 24-25), `body` dapat radial-gradient kanvas baru
- [x] `apps/web/components/app-shell/sidebar.tsx` — tulis ulang:
      gradient rail gelap, collapsible (persist `localStorage`), nested
      nav group (3 grup admin: Utama/Manajemen/Sistem; 3 grup app:
      Utama/Import Data/Langganan), identity card
- [x] `apps/web/components/app-shell/topbar.tsx` — tulis ulang:
      breadcrumbs (baru, `breadcrumbs.tsx`), search (UI-only, `disabled`
      + tooltip jujur), notifikasi (UI-only, `disabled` + tooltip jujur),
      user dropdown (link Profil dari Fase 22 tetap ada, restyle token)
- [x] `apps/web/components/app-shell/app-shell.tsx` — tulis ulang:
      shell jadi 2 panel rounded terpisah (rail + konten) mengambang di
      atas kanvas gradient `body`
- [x] Refactor kontrak nav data — `NAV_ITEMS_BY_SURFACE` (flat) jadi
      `NAV_GROUPS_BY_SURFACE` (`NavGroup[]`), `navGroupsFor()` baru +
      `navItemsFor()` dipertahankan (flat, dipakai `breadcrumbs.tsx`)
- [x] Cek 2 `layout.tsx` (admin & app `(protected)`) — TIDAK perlu
      diubah, prop `AppShell` (`surface`/`logoUrl`/`subscriptionModules`/
      `user`/`children`) tidak berubah

## Referensi
- ADR: `docs/decisions/adr-0024-admin-ui-kit-v2.md`
- Sumber spesifikasi: `master-typescript` ADR-0006 + 6 file component doc

## Keputusan Kecil Selama Eksekusi
- **Grup nav digenerate baru** (project tidak punya kategori
  "CORE/EXPANSION/VERTICAL" seperti contoh screenshot) — dipetakan
  masuk akal per surface: admin → Utama/Manajemen/Sistem, app →
  Utama/Import Data/Langganan. Grup yang kosong setelah filter
  `moduleKey` (customer tanpa subscription modul tertentu) disembunyikan
  total, bukan ditampilkan sebagai judul kosong.
- **Identity card TIDAK dapat "nama organisasi" dinamis** — tetap
  hardcode teks "Facport" (sama seperti fallback wordmark lama), cuma
  subtitle yang beda per surface ("Admin Panel"/"Dashboard Pelanggan").
  Nambah company-name dinamis butuh plumbing prop baru dari layout.tsx
  (settings sudah punya `company.name` sejak Fase 15/21) — di luar
  scope shell murni, bisa fase lain kalau dianggap perlu.
- **Search & notifikasi topbar dibangun `disabled` + tooltip jujur**
  ("belum tersedia"), BUKAN interaktif tanpa fungsi atau disembunyikan
  total — technical debt visual yang sengaja terlihat, bukan
  disamarkan seolah berfungsi.
- **`app-shell.tsx` jadi 2 panel rounded TERPISAH** (rail + konten),
  bukan 1 card tunggal yang membungkus keduanya — pembacaan ulang
  screenshot referensi menunjukkan sidebar & konten masing-masing
  punya rounding sendiri dengan gap kecil di antaranya, bukan 1
  border tunggal mengelilingi semuanya.
- **`navItemsFor()` (flat) DIPERTAHANKAN** di samping `navGroupsFor()`
  baru — `breadcrumbs.tsx` butuh daftar flat buat cari nav item paling
  spesifik yang cocok pathname, tidak perlu tahu struktur grup.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck` — apps/api & apps/web)
- [x] Security review dijalankan — self-review (5 file, murni frontend
      visual/struktur, tidak ada endpoint/data flow baru — search &
      notifikasi eksplisit `disabled`, tidak ada dead-end interaktif
      yang menipu)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — 0 temuan
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda — 0 temuan
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- **Verifikasi visual browser BELUM bisa dilakukan** — ekstensi Chrome
  dicoba ulang sesi ini (sesuai instruksi ADR-0024 "jangan asumsikan
  gagal lagi tanpa cek"), TETAP "Browser extension is not connected".
  Shell baru (gradient rail, collapsible, breadcrumbs, 2-panel rounded)
  belum pernah dilihat langsung di browser sungguhan.
- **Inkonsistensi visual SEMENTARA** (disengaja, lihat § Tujuan) —
  primitif di DALAM shell baru (Button di Topbar, dst) masih pakai
  warna/token LAMA (`primary-*` indigo) sampai Fase 24 selesai. Shell
  luarnya sudah biru, sebagian kecil elemen di dalamnya masih indigo
  sampai fase berikutnya.
- **Identity card nama company hardcode** — lihat Keputusan Kecil.

## Ringkasan Hasil
Fase pertama dari redesign total Admin UI Kit v2 (4 fase, 23-26).
Shell (Sidebar/Topbar/AppShell) ditulis ulang TOTAL mengikuti spec
`master-typescript` ADR-0006 + screenshot referensi, dengan palet biru
custom (3 anchor dari user: `#023e8a`/`#03045e`/`#ebf2fa`, sisanya
digenerate). Perubahan struktural utama: sidebar jadi gradient rail
gelap collapsible dengan nav berkelompok (label kategori + collapse per
grup, dipersist `localStorage`) — sebelumnya flat list statis tanpa
grup; topbar dapat breadcrumbs sungguhan (jejak navigasi, bukan 1 label
statis), search & notifikasi UI-only yang jujur (disabled+tooltip,
bukan pura-pura berfungsi); seluruh shell jadi 2 panel rounded terpisah
mengambang di atas kanvas gradient, bukan edge-to-edge seperti
sebelumnya.

ADR-0024 ditulis men-supersede ADR-0004 (bagian komponen) dan ADR-0023
(seluruh Design System Fase 19-22) — TIDAK menghapus keduanya (aturan
project: ADR Accepted tidak boleh diedit), cuma menjelaskan alasan
ganti arah total.

Token `--admin-*` biru ditambahkan BERDAMPINGAN dengan token
`--color-primary-*` lama (sengaja, sampai Fase 24-25 migrasi semua
primitif) — sesuai rencana, fase ini TIDAK menyentuh Button/Card/Badge/
Table di halaman manapun, jadi ada inkonsistensi visual sementara yang
disengaja (shell luar biru, sebagian isi masih indigo) sampai fase
berikutnya selesai.

Typecheck 0 error (apps/api & apps/web), lint 0 error (1 fix:
`react-hooks/set-state-in-effect` untuk hidrasi `localStorage` saat
mount, pola sama seperti fetch-data-awal existing), test suite API
tidak berubah (155 pass/2 skip/0 fail — backend tidak disentuh),
security review self-review 0 temuan.

**Verifikasi visual browser dicoba ulang, TETAP tidak bisa** (ekstensi
Chrome belum tersambung sesi ini) — shell baru belum pernah dilihat
langsung. Ini fase PALING berisiko secara visual dari seluruh inisiatif
(perubahan struktural besar: gradient, collapsible, rounded panel) untuk
belum diverifikasi mata langsung — direkomendasikan KUAT dicek manual
sebelum lanjut Fase 24, supaya kalau ada yang salah secara struktural
(kontras, layout pecah, dst) ketahuan sebelum primitif ikut dimigrasi
di atasnya.
