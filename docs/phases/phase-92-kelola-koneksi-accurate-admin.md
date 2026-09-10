# Fase 92 — Kelola Koneksi Accurate dari Admin ("Putuskan Koneksi")

**Status:** Done
**Mulai:** 2026-09-10
**Selesai:** 2026-09-10

## Tujuan
Setelah Fase 91 (tombol "Hubungkan Ulang" untuk customer), user minta
kemampuan SETARA untuk admin: lihat status langganan+koneksi Accurate
user dari halaman detail admin, dan bisa "putuskan" koneksi yang
bermasalah supaya customer tinggal connect ulang — tidak perlu lagi
developer edit database manual (seperti yang berkali-kali dilakukan
sepanjang sesi ini).

## Scope
- [x] `GET /admin/users/:id/subscriptions` (baru, permission `users.view`)
- [x] `POST /admin/subscriptions/:id/disconnect-accurate` (baru,
      permission `subscriptions.manage`) — audit log + notifikasi ke
      customer
- [x] Tipe notifikasi baru `accurate_connection_disconnected_by_admin`
      (beda dari `accurate_connection_expired` — aksi disengaja, bukan
      kegagalan organik)
- [x] Domain badge baru `"accurate-connection"` di `status-badges.tsx`
      (ADR-0023 — satu sumber kebenaran label/warna status)
- [x] Card "Langganan & Koneksi Accurate" di `/admin/users/:id`
- [x] Dialog konfirmasi `DisconnectAccurateDialog` (simpel, BUKAN pola
      ketik-ulang-nama seperti Batal Import)
- [x] Test baru (2 file test route)

## Keputusan Kecil Selama Eksekusi
- **File route baru terpisah** (`admin/user-subscriptions.route.ts`)
  untuk `GET /admin/users/:id/subscriptions` — bukan ditumpuk di
  `import-batches.route.ts` (topik beda) atau `subscriptions.route.ts`
  (prefix beda: `/admin/subscriptions` vs `/admin/users/:id/...`).
- **Koneksi TIDAK dihapus saat disconnect** — cuma pointer
  `subscriptions.accurateConnectionId` yang dikosongkan, konsisten pola
  existing ("Ganti Data Usaha WAJIB lewat koneksi baru, bukan endpoint
  select") dan ADR-0020 (koneksi bisa dipakai bareng subscription lain).
- **Notifikasi ke PEMILIK subscription, bukan admin** — konsisten pola
  `ACCURATE_CONNECTION_EXPIRED` (Fase 45).
- **Tipe notifikasi BARU** (bukan reuse `accurate_connection_expired`)
  — supaya pesan jelas ini aksi admin disengaja, bukan kegagalan
  sistem yang bikin customer panik/bingung.
- **Daftar subscription tampilkan SEMUA status** (bukan cuma "active")
  — use case admin support butuh histori lengkap, bukan cuma yang
  aktif sekarang.
- **Test file `admin/subscriptions.route.ts` baru dibuat** (sebelumnya
  TIDAK ADA test sama sekali untuk file itu, gap pre-existing) — FOKUS
  ke endpoint BARU `disconnect-accurate` saja, tidak backfill test
  untuk endpoint lain yang sudah ada (di luar scope fase ini).

## File yang Diubah
- `apps/api/src/routes/admin/user-subscriptions.route.ts` (BARU).
- `apps/api/src/routes/admin/user-subscriptions.route.test.ts` (BARU).
- `apps/api/src/routes/admin/subscriptions.route.ts` — endpoint baru
  `POST /:id/disconnect-accurate`.
- `apps/api/src/routes/admin/subscriptions.route.test.ts` (BARU —
  sebelumnya tidak ada test sama sekali untuk file ini).
- `apps/api/src/lib/notifications.ts` — tipe baru
  `ACCURATE_CONNECTION_DISCONNECTED_BY_ADMIN`.
- `apps/api/src/app.ts` — registrasi route baru.
- `apps/web/lib/notification-routes.ts` — link untuk tipe notifikasi baru.
- `apps/web/lib/status-badges.tsx` — domain baru `"accurate-connection"`.
- `apps/web/components/admin/disconnect-accurate-dialog.tsx` (BARU).
- `apps/web/app/admin/(protected)/users/[id]/page.tsx` — Card baru.
- `docs/architecture/architecture-accurate-integration.md`,
  `architecture-notifications.md` — dokumentasi lengkap.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Eksekusi kode.
- [x] Test baru (7 test — 2 file baru).
- [x] Type check nol error (`bun run typecheck`).
- [x] Security review inline — permission gate konsisten (`users.view`
      baca, `subscriptions.manage` aksi), notifikasi ke pemilik yang
      benar, audit log lengkap. Tidak ada temuan.
- [x] `docs/PROGRESS.md` diupdate ke Done.

## Known Limitations
- Belum ada verifikasi visual di browser (klik tombol "Putuskan
  Koneksi" sungguhan dari UI admin) — logic backend & frontend sudah
  dites (unit test), tapi alur end-to-end (klik → konfirmasi → refresh
  tabel → customer dapat notifikasi) belum dicoba langsung di browser
  sesi ini (extension browser bermasalah sepanjang sesi).
- Tidak ada halaman `/admin/subscriptions` terpisah (konsisten
  keterbatasan lama sejak Fase 10) — kelola subscription/koneksi tetap
  lewat halaman detail user, bukan daftar subscription global.

## Ringkasan Hasil
Admin sekarang bisa lihat status langganan+koneksi Accurate SETIAP
customer dari halaman detail user, dan memutuskan koneksi yang
bermasalah sendiri tanpa perlu developer edit database manual —
menutup gap yang berulang kali dialami sepanjang sesi ini. Customer
otomatis dapat notifikasi saat koneksinya diputuskan admin, dan tinggal
"Hubungkan Ulang" (Fase 91) dari sisi mereka. `bun run typecheck` 0
error, 584 test apps/api (7 baru) + 50 test apps/web, semua pass.
