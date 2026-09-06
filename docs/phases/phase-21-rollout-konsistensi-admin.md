# Fase 21 — Rollout Konsistensi ke Semua Halaman Admin

**Status:** Done
**Mulai:** 2026-09-05
**Selesai:** 2026-09-05

## Tujuan
Fase ke-3 dari inisiatif 4-fase (19-22) Design System Admin. Fase 19
membangun primitif, Fase 20 membuktikan pola di titik paling kritikal
(status invoice/order). Fase ini pakai SEMUA primitif itu di setiap
halaman admin existing + halaman app yang share pain point sama
(`BATCH_STATUS` ter-triplikasi) — inilah yang benar-benar mewujudkan
permintaan eksplisit user: "lebar card sama di semua menu, ukuran title
sama, bentuk table sama, paginasi sama, semua form/select/dropdown sama,
di SEMUA halaman."

Referensi: ADR-0023, `docs/phases/phase-19-admin-design-system-fondasi.md`,
`docs/phases/phase-20-unifikasi-status-invoice-pembayaran.md`.

## Scope
- [x] `apps/web/app/admin/(protected)/page.tsx` — 3 stat card inline →
      `<StatCard>`, header → `<PageHeader>`
- [x] `apps/web/app/admin/(protected)/plans/page.tsx` — `<PageHeader>`,
      `<DataTable>` (pagination baru), `plan.isActive` ternary inline →
      `StatusBadge domain="plan"` (domain baru ditambah ke registry)
- [x] `apps/web/app/admin/(protected)/users/page.tsx` — `<PageHeader>`,
      `<DataTable>` (ganti Prev/Next manual + `Pagination` server-side
      terpisah), `SUB_STATUS` lokal dihapus pakai
      `StatusBadge domain="subscription"`, raw `<select>`/checkbox di
      dialog ganti `<Combobox>`/`<Checkbox>` styled
- [x] `apps/web/app/admin/(protected)/settings/page.tsx` — `<PageHeader>`,
      2 raw `<textarea>` → `<Textarea>`, raw checkbox QRIS →
      `<Checkbox>`, pesan error → `<Alert variant="destructive">`
- [x] `apps/web/app/app/(protected)/page.tsx` — `<PageHeader>`,
      `SUBSCRIPTION_STATUS` lokal → `StatusBadge domain="subscription"`,
      `BATCH_STATUS` lokal → `StatusBadge domain="import-batch"`
- [x] `apps/web/app/app/(protected)/sales-invoice/import/riwayat/page.tsx`
      — `<PageHeader>`, `BATCH_STATUS` (copy verbatim) →
      `StatusBadge domain="import-batch"`, Prev/Next manual → `<Pagination>`
- [x] `apps/web/app/app/(protected)/purchase-invoice/import/riwayat/page.tsx`
      — sama persis (mirror 1:1 sales-invoice)
- [x] (tambahan, ditemukan saat sapuan akhir) `apps/web/app/landing/catalog-cart.tsx`
      dan `apps/web/app/app/(protected)/subscribe/page.tsx` — 2 duplikat
      `currencyFormatter` lokal tersisa, disatukan ke `lib/utils.ts`

## Referensi
- ADR: `docs/decisions/adr-0023-admin-design-system.md`

## Keputusan Kecil Selama Eksekusi
- **`plan.isActive` (boolean) dijadikan domain registry baru `"plan"`**
  (`active`/`inactive`) — bukan cuma dibiarkan ternary inline seperti
  rencana awal. Dipilih supaya SEMUA badge status (termasuk toggle
  boolean) lewat 1 sumber, sesuai prinsip ADR-0023, bukan pengecualian.
- **Radio group pilih sub-modul di form Plan TIDAK diganti `<Select>`**
  (beda dari rencana awal yang menyebut "form pilih sub-modul pakai
  `<Select>` baru") — radio group yang ada (dikelompokkan per kategori,
  `MODULE_GROUPS`) BUKAN raw `<select>` yang jadi masalah audit, dan
  untuk ~5 opsi radio grup justru UX lebih baik dari dropdown. `<Select>`
  dipakai di tempat yang MEMANG raw `<select>` (tidak ada) — ternyata
  gap raw-`<select>` yang sebenarnya ada di "Assign Paket Baru"
  (`admin/users/page.tsx`), yang DIGANTI `<Combobox>` (bukan `<Select>`)
  karena daftar plan bisa tumbuh >10 opsi (§ CLAUDE.md, Combobox WAJIB
  untuk pilihan besar/async) — `<Select>` yang baru dibangun Fase 19
  jadi TIDAK terpakai fase ini, tetap tersedia untuk kasus depan yang
  benar-benar pilihan tetap/sedikit.
- **`admin/users/page.tsx` — `DataTable` dipadukan dengan `Pagination`
  TERPISAH, bukan pagination bawaan `DataTable`** — `DataTable` (Fase 19)
  cuma dukung pagination CLIENT-SIDE (slice array lokal), sedangkan
  daftar user ini SERVER-SIDE (`offset`/`limit` ke API, tidak semua data
  ada di client). Solusi: `pageSize` `DataTable` disamakan `PAGE_SIZE`
  (jadi pagination bawaannya no-op, 1 "halaman" client = 1 halaman
  server), navigasi sungguhan pakai komponen `Pagination` yang SAMA
  (dari Fase 19), di-wire ke state server. Pola ini didokumentasikan di
  komentar kode — akan jadi referensi kalau ada listing server-paginated
  lain nanti.
- **`app/(protected)/page.tsx` (dashboard) dan halaman `riwayat` import
  TIDAK dimigrasi ke `DataTable`** (tetap `Table` primitif polos) —
  widget "5 import terakhir" di dashboard adalah PREVIEW (bukan listing
  penuh, tidak butuh sorting/pagination), dan halaman ini Server
  Component (`DataTable` butuh `"use client"`) — migrasi paksa jadi
  scope creep tanpa manfaat nyata. Halaman `riwayat` (listing penuh,
  sudah client component) TETAP dimigrasi Pagination-nya ke komponen
  bersama, tapi table-nya dibiarkan `Table` primitif (bukan `DataTable`)
  karena sudah punya polling 5 detik + custom action buttons yang lebih
  simpel dipertahankan sebagai-adalah — hanya status badge & pagination
  yang dikonsolidasi (sesuai scope asli rencana, tidak diperluas).
- **2 duplikat `currencyFormatter` di luar daftar scope asli** (`landing/
  catalog-cart.tsx`, `app/(protected)/subscribe/page.tsx`) ikut
  dibersihkan saat sapuan akhir `grep` — perbaikan 1-baris, risiko nol,
  konsisten dengan tujuan fase (sebelumnya cuma 8 kandidat teridentifikasi
  audit awal, 6 sudah kesentuh Fase 19-20, 2 sisanya diselesaikan di sini).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck` — apps/api & apps/web)
- [x] Security review dijalankan — subagent `security-auditor` (9 file
      lintas admin+app), 0 Critical/High/Medium/Low
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — 0 temuan
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda — 0 temuan
- [x] `docs/PROGRESS.md` diupdate
- [ ] **Verifikasi visual browser sungguhan — TIDAK BISA dilakukan sesi
      ini** (ekstensi Chrome tidak terhubung, `tabs_context_mcp` gagal
      dengan "Browser extension is not connected"). Diminta ke user
      untuk cek manual (dev server sudah jalan): `admin.localhost:6209`
      {`/`, `/plans`, `/users`, `/orders`, `/settings`}. Ini SATU-SATUNYA
      checklist item yang tidak bisa dituntaskan sesi ini — ditandai
      belum, bukan diam-diam dilewati.

## Known Limitations
- **Verifikasi visual browser sungguhan BELUM dilakukan oleh sesi ini**
  (lihat checklist di atas) — kode sudah lolos typecheck+lint+security
  review, tapi tampilan SUNGGUHAN (lebar card, alignment, responsive,
  interaksi Tabs/Combobox/Checkbox di layar nyata) belum pernah dilihat
  langsung sepanjang seluruh inisiatif 4-fase (19-22) ini. User sudah
  diminta cek manual — kalau ada masalah visual, laporkan sebagai
  temuan baru (bukan technical debt terjadwal).
- **Halaman dashboard app (`app/(protected)/page.tsx`) dan 2 halaman
  riwayat TIDAK dimigrasi ke `DataTable`** — sengaja (lihat Keputusan
  Kecil), bukan kelupaan. Tabel di sana tetap `Table` primitif polos.
- **`<Select>` (komponen baru Fase 19) masih 0 pemakaian nyata** sampai
  akhir fase ini — mirip nasib awal `@tanstack/react-table` sebelum
  Fase 19-20, TAPI beda konteks: `<Select>` memang didesain untuk kasus
  "pilihan tetap/sedikit" yang ternyata tidak muncul di rollout ini
  (radio group dipertahankan, dropdown besar pakai `Combobox`). Bukan
  dependency mangkrak yang problematik — cuma belum ada use case yang
  pas, akan dipakai kalau muncul kebutuhan sesuai desainnya.

## Ringkasan Hasil
Fase ke-3 dari inisiatif 4-fase (19-22) — rollout SEMUA primitif Fase 19
(`PageHeader`, `StatCard`, `DataTable`, `Pagination`, `Textarea`,
`Checkbox`, `Combobox` existing, `Alert`) dan registry Fase 20
(`StatusBadge`) ke 7 halaman admin+app existing, sesuai permintaan
eksplisit user: "lebar card sama di semua menu, ukuran title sama,
bentuk table sama, paginasi sama, semua form/select/dropdown sama."

Perubahan konkret: dashboard admin (3 stat card inline → `StatCard`),
halaman Paket (`PageHeader`+`DataTable`+`StatusBadge domain="plan"`
domain baru), halaman Pengguna (`PageHeader`+`DataTable`+`Pagination`
server-side terpisah+`Combobox`+`Checkbox`, `SUB_STATUS` lokal dihapus),
halaman Pengaturan (`PageHeader`+`Textarea`+`Checkbox`+`Alert`),
dashboard app + 2 halaman riwayat import (`PageHeader`+`StatusBadge`
domain `subscription`/`import-batch` — `BATCH_STATUS` yang sebelumnya
ter-triplikasi verbatim di 3 file akhirnya jadi 1 sumber, `Pagination`
bersama menggantikan Prev/Next hand-roll). Sapuan akhir juga membereskan
2 duplikat `currencyFormatter` di luar daftar scope asli
(`catalog-cart.tsx`, `subscribe/page.tsx`).

Temuan teknis: `DataTable` (client-side pagination only) TIDAK bisa
langsung dipasang di listing yang server-side paginated
(`admin/users/page.tsx`) — diselesaikan dengan memadukan `DataTable`
(pageSize disamakan page size server, jadi pagination bawaannya no-op)
dengan komponen `Pagination` terpisah yang di-wire ke state server;
pola ini didokumentasikan sebagai referensi untuk listing
server-paginated berikutnya. `plan.isActive` (boolean toggle, bukan
status lifecycle) tetap dimasukkan ke `status-badges.tsx` sebagai domain
`"plan"` supaya SEMUA badge lewat 1 sumber tanpa pengecualian.

Security review (subagent `security-auditor`, 9 file lintas admin+app):
**0 Critical/High/Medium/Low**. Verifikasi eksplisit: coercion
`CheckedState` (`Checkbox` Radix) ke boolean asli sebelum masuk
state/payload di semua 3 pemakaian baru (tidak ada kebocoran
`"indeterminate"`), tidak ada `dangerouslySetInnerHTML`/render HTML
mentah di `DataTable`/`status-badges.tsx`, field yang diekspos
`admin/users/page.tsx` identik dengan versi tabel lama, dan 0 endpoint
backend baru dipanggil (dikonfirmasi silang dengan `git status
apps/api/` — tidak ada file backend tersentuh fase ini).

Typecheck 0 error (apps/api & apps/web), lint 0 error, test suite API
tetap 155 pass/2 skip/0 fail (backend tidak disentuh fase ini).

**Verifikasi visual browser sungguhan TIDAK BISA dilakukan sesi ini**
(ekstensi Chrome tidak terhubung — beda dari rencana yang berharap ini
jadi kesempatan pertama verifikasi visual sepanjang inisiatif 14-21).
Ini satu-satunya item checklist yang tidak tuntas — diserahkan ke user
untuk cek manual di `admin.localhost:6209` (dev server sudah jalan).
