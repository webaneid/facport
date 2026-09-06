# Fase 28 — "Import Akun Hutang Pemasok" Jadi Sub-Modul Berbayar Terpisah

**Status:** Done
**Mulai:** 2026-09-05
**Selesai:** 2026-09-05

## Tujuan
User minta label sidebar "Import Data" (dashboard `app.`) ikut nama paket
yang mereka subscribe. Saat menelusuri ini, ketemu 1 sub-modul
(`purchase_invoice`) menaungi 2 link (Import Faktur Pembelian + Import
Akun Hutang Pemasok) — kalau dibiarkan bundel, label akan tabrakan/tidak
informatif. Setelah 2 putaran klarifikasi, user memutuskan: pisahkan
"Import Akun Hutang Pemasok" jadi sub-modul berbayar SENDIRI (§
ADR-0026), bukan cuma ganti label. Fase ini eksekusi keputusan itu.

## Scope
- [x] `apps/api/src/lib/accurate-scopes.ts` — pindah scope `vendor_view`/
      `vendor_save` dari `purchase_invoice` ke sub-modul baru
      `vendor_payable_account`. `item_save` TETAP di `purchase_invoice`.
- [x] `apps/api/src/routes/admin/plans.route.ts` — tambah
      `t.Literal("vendor_payable_account")` ke union `modules`.
- [x] `apps/api/src/routes/vendor-payable-account-import.route.ts` —
      ganti SEMUA 6 `moduleAccess: "purchase_invoice"` jadi
      `moduleAccess: "vendor_payable_account"`.
- [x] `apps/api/src/routes/vendor-payable-account-import.route.test.ts` —
      update helper `createProvisionedUser` (`modules: ["purchase_invoice"]`
      → `["vendor_payable_account"]`).
- [x] `apps/web/lib/module-options.ts` — tambah entry `vendor_payable_account`
      (label "Akun Hutang Pemasok", grup "Data Master").
- [x] `apps/web/components/app-shell/sidebar.tsx` — item nav "Import Akun
      Hutang Pemasok" ganti `moduleKey` ke `"vendor_payable_account"`.
      Label sidebar "Import Data" (fitur yang diminta di awal) TETAP
      pakai implementasi Fase sebelumnya (`modulePlanNames` override,
      sudah jalan) — sekarang tidak ambigu lagi karena 1 modul = 1 link.
- [x] Update `docs/architecture/architecture-accurate-integration.md` §
      "Vendor (Data Master)" — perbaiki status stale ("BELUM DIEKSEKUSI"
      padahal sudah live sejak Fase 04), tambah catatan ADR-0026.
- [x] Update `docs/architecture/architecture-subscription.md` — catatan
      sub-modul ke-6 di komentar skema `plans.modules`.

## Referensi
- ADR: `docs/decisions/adr-0026-modul-akun-hutang-pemasok-terpisah.md`
- Asal fitur: `docs/phases/phase-04-import-vendor.md`
- Katalog sub-modul asli: `docs/decisions/adr-0019-gating-per-sub-modul-dan-katalog-plan.md`

## Keputusan Kecil Selama Eksekusi
- Grup katalog modul baru "Data Master" (bukan ditambah ke "Pembelian"
  yang sudah ada) — `MODULE_GROUPS` di `module-options.ts` derive
  otomatis dari nilai unik `group`, jadi ini tidak perlu perubahan kode
  tambahan, cuma menambah 1 kategori baru di form admin `/admin/plans`.
  Dipilih karena konsisten dengan bahasa yang sudah dipakai
  `architecture-accurate-integration.md` sejak awal ("modul DATA MASTER",
  bukan modul transaksi).
- Tidak ada plan aktif untuk `vendor_payable_account` dibuat otomatis —
  sengaja diserahkan ke admin untuk bikin sendiri di `/admin/plans`
  kapan pun siap dijual (harga ditentukan admin, bukan hardcode).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — 0 error (api+web)
- [x] Security review dijalankan (inline — 6 file kecil & mekanis:
      tambah 1 literal union, pindah 2 string scope, ganti nilai string
      `moduleAccess`/`moduleKey`. Tidak ada endpoint baru, tidak ada
      perubahan pola validasi/auth — reuse pattern `moduleAccess` yang
      sudah diaudit sebelumnya. 0 temuan.)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan — 0)
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda
      (tidak ada temuan sama sekali, tidak perlu catatan)
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Tidak ada migrasi/grandfathering untuk subscription aktif existing
  (§ ADR-0026 Konsekuensi) — diterima sadar oleh user, dampak nihil
  saat ini (cuma 1 akun test).
- Belum ada plan aktif untuk `vendor_payable_account` di database — admin
  WAJIB bikin plan baru dulu di `/admin/plans` sebelum fitur ini bisa
  dibeli siapa pun.
- Verifikasi visual browser TIDAK dilakukan (ekstensi Chrome tidak
  tersambung, konsisten sepanjang sesi ini).

## Ringkasan Hasil

"Import Akun Hutang Pemasok" tidak lagi bundel gratis dengan sub-modul
Purchase Invoice — sekarang sub-modul berbayar sendiri
(`vendor_payable_account`, § ADR-0026), dipicu oleh permintaan awal user
untuk label sidebar "Import Data" ikut nama paket yang mereka subscribe
(ketemu ambiguitas: 1 modul menaungi 2 link, user putuskan pisah modulnya
alih-alih cuma ganti label).

Perubahan: scope OAuth Accurate (`vendor_view`/`vendor_save`) dipindah
dari daftar `purchase_invoice` ke daftar sub-modul barunya sendiri
(`item_save` tetap di `purchase_invoice`, tidak terkait fitur vendor);
6 endpoint `vendor-payable-account-import.route.ts` ganti `moduleAccess`;
katalog modul admin (`module-options.ts`, `plans.route.ts`) dan nav
sidebar (`sidebar.tsx`) ikut update. Label sidebar per-item (dari kerja
sebelumnya) sekarang tidak ambigu lagi — tiap sub-modul persis 1 link.

Typecheck 0 error, lint 0 error, test suite 173 pass/0 fail (tidak
berubah kuantitasnya, 1 test disesuaikan modul-nya). Security review
inline: 0 temuan (perubahan mekanis, reuse pattern `moduleAccess` yang
sudah teraudit). Data test yang regrow dari test run dibersihkan lagi,
sisa `admin@facport.test` + `user@facport.com` (akun test user, dengan
1 subscription Purchase Invoice + 1 order berstatus `paid`).

**Konsekuensi yang perlu ditindaklanjuti user** (bukan bug, keputusan
sadar § ADR-0026):
1. **Belum ada plan `vendor_payable_account` di database** — fitur ini
   TIDAK BISA dibeli siapa pun sampai admin bikin plan-nya sendiri di
   `/admin/plans` (grup katalog baru "Data Master").
2. Akun test `user@facport.com` yang sekarang subscribe "Purchase
   Invoice" TIDAK OTOMATIS dapat akses Akun Hutang Pemasok lagi — kalau
   mau tes fitur itu, perlu subscribe plan baru itu juga (setelah admin
   membuatnya).
3. Kalau ada koneksi Accurate yang sudah connect sebelum perubahan ini,
   perlu "Hubungkan Ulang" supaya scope OAuth-nya sesuai pemisahan baru.

Verifikasi visual browser TIDAK dilakukan (Chrome extension tetap tidak
tersambung, konsisten sepanjang sesi ini).
