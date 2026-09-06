# Fase 26 — Admin UI Kit v2: Permission Guard + Verifikasi Penuh

**Status:** Done
**Mulai:** 2026-09-05
**Selesai:** 2026-09-05

## Tujuan
Fase penutup inisiatif Admin UI Kit v2 (Fase 23-26). Sejauh ini shell,
primitif UI, dan data table/form controls sudah di-restyle total ke token
biru (Fase 23-25), tapi belum ada lapisan UI yang mencerminkan permission
RBAC yang sudah lama ada di backend (`permissionPlugin`) — tombol/menu yang
seharusnya butuh permission tertentu masih tampil ke siapa saja yang bisa
akses halamannya. Fase ini menutup celah UI itu (murni UI hint, bukan
authorization — backend tetap satu-satunya penjaga sungguhan) dan menutup
seluruh inisiatif dengan verifikasi penuh (typecheck/lint/test + security
review) sebelum dianggap selesai.

## Scope
- [x] `apps/web/lib/use-permissions.tsx` — `PermissionsProvider` (Context,
      fetch `GET /me` sekali), `usePermissions()`, `usePermission(key)`.
- [x] `apps/web/components/auth/can.tsx` — `<Can permission="...">`,
      GANTI `components/ui/permission-guard.tsx` (Fase 19, 0 pemakai,
      dihapus tanpa migrasi).
- [x] `apps/web/components/app-shell/app-shell.tsx` — mount
      `<PermissionsProvider>` sekali di root shell (admin & app, 1 tempat
      karena `AppShell` dipakai kedua surface).
- [x] Audit silang semua `permission: "..."` backend
      (`audit.view, import.create, invoices.manage, invoices.view,
      media.upload, orders.manage, plans.manage, settings.update,
      subscriptions.manage, users.manage`) vs UI guard yang sudah/belum ada.
- [x] `admin/users/page.tsx` — bungkus checkbox "Tandai Sudah Dibayar"
      dengan `<Can permission="subscriptions.manage">` (celah yang jadi
      temuan HIGH di Fase 18 — halaman bisa diakses dgn `users.manage`
      tapi aksi ini butuh permission terpisah).
- [x] `admin/invoices/page.tsx` — bungkus trigger dialog "Buat Invoice"
      dengan `<Can permission="invoices.manage">` (halaman viewable dgn
      `invoices.view`, create butuh permission terpisah).
- [x] `components/app-shell/sidebar.tsx` — field `permission` diisi di
      tiap `NavItem` grup Manajemen+Sistem admin, filter tambahan by
      `usePermissions()` di dalam komponen `Sidebar` (bukan di fungsi
      murni `navGroupsFor`/`navItemsFor` yang juga dipakai `breadcrumbs.tsx`).
- [x] Verifikasi penuh: `bun run typecheck`, `bun run lint`, `bun run test`
      seluruh monorepo — 0 error typecheck (api+web), 0 error lint, 170
      pass/0 fail/3 skip (skip MinIO lokal, sudah dikenal).
- [x] Security review (subagent `security-auditor`, lintas 20 file — 6
      file frontend baru/diubah + cross-check ke backend/docs).
- [x] Verifikasi visual browser (dicoba lagi — Chrome extension MASIH
      belum terhubung, konsisten dgn setiap fase sebelumnya di sesi ini).
- [x] Tutup fase, update `docs/PROGRESS.md` (Fase 26 → Done, baris
      "Admin UI Kit v2" ditandai selesai 4 fase).

## Referensi
- ADR: `docs/decisions/adr-0024-admin-ui-kit-v2.md`
- Architecture: `docs/architecture/architecture-auth.md` (RBAC, permission keys)

## Keputusan Kecil Selama Eksekusi
- **`admin/orders/page.tsx` TIDAK diberi guard tambahan** — semua aksi di
  halaman itu (list, confirm, reject, lihat QRIS) sama-sama butuh SATU
  permission yang sama (`orders.manage`), yang juga jadi syarat akses
  halamannya sendiri. Tidak ada skenario "bisa lihat halaman tapi tidak
  boleh aksi tertentu" seperti kasus `users`/`invoices`, jadi tidak ada
  yang perlu disembunyikan lagi.
- **Filter permission nav ditaruh di komponen `Sidebar`, bukan
  `navGroupsFor()`** — fungsi itu murni (tanpa akses hook) dan dipakai
  juga oleh `topbar.tsx`/`breadcrumbs.tsx` untuk cari label halaman aktif;
  menambah dependency `usePermissions()` di sana akan memaksa breadcrumbs
  ikut butuh Provider di context yang sama, padahal breadcrumbs cuma
  butuh label dari href, bukan visibility.
- Fase ini dieksekusi TANPA menulis phase doc di awal (menyimpang dari
  pola SOP yang konsisten dipakai Fase 19-25 sesi ini) — dokumen ini
  ditulis SETELAH sebagian besar eksekusi selesai, murni backfill supaya
  tetap ada jejak tertulis sebelum fase ditutup.
- **2 temuan Medium dari security-auditor DIPERBAIKI sebelum tutup fase**
  (bukan ditunda ke lessons-learned, karena fix-nya cepat & pola sudah
  ada contohnya di file yang sama):
  1. Tombol trigger `ManageSubscriptionDialog` (`admin/users/page.tsx`)
     dibungkus `<Can permission="subscriptions.manage">` — sebelumnya
     tampil ke siapa saja yang bisa akses halaman `/users` (`users.manage`),
     padahal dialog itu assign/edit/lihat riwayat subscription yang
     digerbangi backend dgn permission BERBEDA (`subscriptions.manage`).
  2. `searchUsers()` di `CreateInvoiceDialog` (`admin/invoices/page.tsx`)
     sekarang set `searchDenied` saat `GET /admin/users` ditolak (403) dan
     `FormField` menampilkan pesan eksplisit — sebelumnya gagal diam-diam
     (Combobox selalu kosong tanpa penjelasan) untuk role `invoices.manage`
     tanpa `users.manage`.
- **2 temuan Low DITERIMA sebagai trade-off** (dicatat di
  `docs/lessons-learned.md` 2026-09-05, bukan diperbaiki): (a)
  `usePermissions()` fetch `/me` sekali per mount, tidak live-refresh
  kalau role berubah di sesi berjalan; (b) nav "Dashboard" tidak
  permission-gated walau kontennya fetch data dari 2 permission berbeda
  (`users.manage`+`audit.view`) — keduanya murni UX stale-hint, backend
  tetap jadi penjaga sesungguhnya di kedua kasus.
- Security-auditor juga mengonfirmasi (tanpa diminta eksplisit) bahwa
  SEMUA 10 permission key backend yang diketahui sudah terpasang lewat
  `permissionPlugin` macro (0 endpoint tanpa guard ditemukan) — dan
  `<Can>` fail-closed by default (`PermissionsContext` default `[]`,
  bukan default tampil) — konfirmasi independen atas keputusan desain
  Fase 26.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review dijalankan (subagent `security-auditor`)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan — 0
      Critical, 0 High)
- [x] Temuan Medium diperbaiki langsung (lihat § Keputusan Kecil), Low
      dicatat di `docs/lessons-learned.md`
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- `usePermissions()` mulai dengan array kosong sebelum `GET /me` selesai
  — sekilas item nav ber-permission bisa "berkedip hilang" saat load
  pertama sebelum permission ter-fetch. Diterima sebagai trade-off (sama
  seperti pola loading state lain di app ini), bukan bug — tidak
  berdampak keamanan karena backend tetap jadi penjaga sungguhan.
- `usePermissions()` tidak live-refresh kalau role user yang sedang login
  diubah admin lain di sesi yang sama (§ `docs/lessons-learned.md`
  2026-09-05) — perlu reload/login ulang untuk lihat perubahan.
- Nav "Dashboard" tidak permission-gated walau isinya fetch data dari 2
  permission berbeda — admin tanpa salah satunya lihat placeholder kosong
  (bukan error), diterima sebagai kosmetik (§ `docs/lessons-learned.md`
  2026-09-05).
- Verifikasi visual browser GAGAL lagi — Chrome extension tidak
  terhubung (sudah dicoba ulang, konsisten dgn Fase 23-25 & 27).
- Tidak ada halaman manajemen role/permission custom di admin
  (`/admin/roles` tidak ada) — kalau production butuh role selain
  `admin`/`customer` bawaan seed, itu harus dibuat manual di DB (celah
  tooling yang sudah dicatat berulang di lessons-learned Fase 12/14/15/
  16/18, bukan temuan baru fase ini).

## Ringkasan Hasil

Fase 26 menutup inisiatif Admin UI Kit v2 (Fase 23-26) dengan memasang
lapisan permission-guard di UI admin — `PermissionsProvider`
(`lib/use-permissions.tsx`, fetch `GET /me` sekali per mount) +
`<Can permission="...">` (`components/auth/can.tsx`, GANTI
`permission-guard.tsx` Fase 19 yang 0 pemakai) dipasang di 3 titik yang
sebelumnya punya guard backend tanpa padanan UI: checkbox "Tandai Sudah
Dibayar" (`subscriptions.manage`), tombol trigger "Kelola Langganan"
(`subscriptions.manage`, ditemukan security-auditor), dan tombol trigger
"Buat Invoice" (`invoices.manage`). Filter nav Sidebar ditambah
berdasarkan `permission` per item (5 item admin: Pengguna/Paket/Invoice/
Konfirmasi Pembayaran/Pengaturan), diimplementasikan DI DALAM komponen
`Sidebar` (bukan di fungsi murni `navGroupsFor`) supaya `breadcrumbs.tsx`
yang juga pakai fungsi itu tidak ikut butuh Provider.

Security review subagent menemukan 0 Critical/0 High — semua 10
permission key backend sudah terpasang lewat `permissionPlugin` macro,
`<Can>` fail-closed by default. 2 temuan Medium (gap kelengkapan UI-hint,
bukan celah otorisasi) langsung diperbaiki: guard `ManageSubscriptionDialog`
di atas, dan pesan error eksplisit di `CreateInvoiceDialog` saat
pencarian user ditolak backend (403) untuk role `invoices.manage` tanpa
`users.manage`. 2 temuan Low (stale-hint permission, dashboard tanpa
guard) diterima sebagai trade-off, dicatat di lessons-learned.

Verifikasi penuh: `bun run typecheck` 0 error (api+web), `bun run lint`
0 error, `bun run test` 170 pass/0 fail/3 skip (skip MinIO lokal, sudah
dikenal). Data test yang regrow dari test run (322 user, 210 plans, dst)
dibersihkan lagi via transaksi DELETE yang sama seperti sebelumnya,
menyisakan HANYA `admin@facport.test`. Verifikasi visual browser gagal
lagi (Chrome extension tidak terhubung).

**Inisiatif Admin UI Kit v2 (Fase 23-26) SELESAI TOTAL**: shell admin
gradient biru + token warna (Fase 23), primitif UI (Button/Card/Badge/
Dialog/dll, Fase 24), data table + form controls v2 (Fase 25), dan
permission guard UI (Fase 26) — semua 4 fase Done, konsisten dengan
`master-typescript` ADR-0006 sebagai referensi struktural, diadaptasi ke
palet biru custom user dan keputusan teknis project sendiri (tetap
`@tanstack/react-table` v9, `usePermissions()` Context alih-alih plugin
`customSession` Better Auth).
