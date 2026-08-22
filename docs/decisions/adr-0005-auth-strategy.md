# ADR-0005: Auth Strategy — Better Auth + RBAC Dinamis

**Status:** Accepted
**Tanggal:** 2026-08-18

## Context
Auth adalah komponen yang dipakai ulang di HAMPIR SEMUA project, tapi
sebelumnya tidak ada standar eksplisit di template ini (cuma prinsip umum di
`architecture-security.md`). Tanpa standar, tiap project cenderung
re-implementasi JWT handling dari nol (rawan bug: expiry salah, refresh token
tidak di-rotate, dst — semua kelas bug yang sudah pernah ditemukan di
security review project sebelumnya).

## Decision
- **Better Auth** untuk authentication (session/JWT, social login opsional) —
  bukan implementasi JWT manual dari nol.
- **RBAC dengan role dinamis** — role baku (`isSystem: true`, tidak bisa
  dihapus) + custom role yang bisa dibuat user (pola yang sudah terbukti di
  Jalajogja: owner/ketua/sekretaris/bendahara + custom role organisasi).
- **Authorization terpisah dari authentication** — permission check via
  middleware terpusat (`requirePermission()`), ownership check di service
  layer terpisah (bukan diasumsikan otomatis dari role).

## Alternatif yang Dipertimbangkan
- **JWT manual** (tanpa library) — ditolak, terlalu rawan salah implementasi
  (expiry, refresh rotation, secret rotation) untuk hal yang sama-sama harus
  dibangun ulang tiap project.
- **NextAuth/Auth.js** — dipertimbangkan tapi ditolak untuk project ini
  karena API dipisah dari Next.js (arsitektur project ini backend independen
  Elysia, bukan Next.js API routes — lihat ADR-0001), NextAuth lebih native
  untuk auth yang menyatu dengan Next.js.
- **RBAC statis** (role hardcoded di enum, tanpa tabel `roles`) — ditolak,
  karena pola nyata di organisasi (Jalajogja: IKPM Gontor) butuh role custom
  yang dibuat pengurus sendiri, bukan cuma role yang di-define developer di awal.

## Konsekuensi
- Skema DB nambah 4 tabel: `roles`, `permissions`, `role_permissions`,
  `user_roles` — lihat `docs/architecture/architecture-auth.md`.
- Fase 00 (fondasi, lihat skill `project-init`) perlu seed role/permission
  dasar sebelum fitur pertama jalan (minimal 1 role admin + izin penuh).
- Kalau project multi-tenant → role/permission WAJIB di-scope per-tenant,
  lihat catatan tambahan di `architecture-tenancy.md`.
