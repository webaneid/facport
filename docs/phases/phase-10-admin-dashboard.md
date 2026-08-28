# Fase 10 — Admin Dashboard (Settings, User, Paket, Retensi Data)

**Status:** In Progress
**Mulai:** 2026-08-28
**Selesai:**

## Tujuan
Halaman admin sejauh ini cuma scaffold (login + placeholder). Bangun
admin dashboard sungguhan: pengaturan umum + retensi data, kelola user
(provisioning manual), kelola paket (module-based, TANPA harga untuk
fase ini — ADR-0015). Backend admin sebagian sudah ada dari Fase 00/01
(write-only) — fase ini melengkapi endpoint list/GET yang belum ada
sama sekali, plus job retensi data terjadwal baru.

## Scope
- [ ] ADR-0015 (harga dinonaktifkan sementara) + update
      `architecture-subscription.md`/`architecture-settings.md`.
- [ ] Schema: `plans.price` nullable,
      `subscriptions.importRetentionDaysOverride` baru (migration).
- [ ] `GET /admin/plans`, `GET /admin/users`, `GET /admin/subscriptions?userId=`.
- [ ] Job terjadwal `PURGE_OLD_IMPORTS` (retensi data import, default 2
      hari, batas keras 7 hari) — `lib/queue.ts` + `workers/index.ts`.
- [ ] Refactor `AppShell`/`Sidebar`/`Topbar` — `navItems` jadi prop
      (dipakai ulang customer + admin, bukan hardcode customer-only).
- [ ] `app/admin/(protected)/layout.tsx` — bungkus `AppShell`.
- [ ] Halaman `/admin` (dashboard ringkasan), `/admin/settings`
      (umum + retensi data), `/admin/plans` (CRUD tanpa harga),
      `/admin/users` (list + tambah user + kelola langganan).

## Referensi
- ADR: `docs/decisions/adr-0015-facport-tanpa-harga-sementara.md`
- Architecture: `docs/architecture/architecture-subscription.md` §
  "Retensi Data Import", `docs/architecture/architecture-settings.md` §
  "Field Group `data`"
- Fase sebelumnya: Fase 00/01 (scaffold admin, RBAC, plans/subscriptions
  schema — ADR-0008)

## Keputusan Kecil Selama Eksekusi
(hal yang diputuskan di tengah jalan, nggak cukup besar buat ADR tapi tetap
perlu diingat kenapa dipilih begitu)
-

## Checklist Sebelum Ditutup (sesuai SOP)
- [ ] Type check nol error (`bun run typecheck`)
- [ ] Security review dijalankan (skill `security-review`) — endpoint
      admin baru (GET list), permission guard tiap route dicek eksplisit
- [ ] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan)
- [ ] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda
- [ ] `docs/PROGRESS.md` diupdate
- [ ] **Divalidasi NYATA**: buat user + assign paket lewat UI admin
      sungguhan → user itu benar bisa akses modul yang di-assign, user
      lain tanpa paket itu ditolak; job retensi dites langsung (bukan
      nunggu cron) dengan data test → batch lama benar terhapus, batch
      baru/processing tidak ikut kehapus

## Known Limitations
(hal yang sengaja belum ditangani di fase ini, biar jelas dan disengaja —
bukan kelupaan)
- Upload logo/favicon company (butuh integrasi media-library) — ditunda.
- Halaman setting retensi data di sisi CUSTOMER (`app.ane.web.id`)
  ditunda — kolom `subscriptions.importRetentionDaysOverride` sudah
  disiapkan di fase ini, tinggal tambah endpoint+halaman kecil nanti.
- Halaman `/admin/subscriptions` terpisah tidak dibuat — digabung ke
  halaman Users (1 alur "tambah user → assign paket").
- Force-change-password login pertama untuk user admin-provisioned —
  known limitation sejak Fase 01, tidak diperluas di fase ini.

## Ringkasan Hasil (isi pas fase Done)
