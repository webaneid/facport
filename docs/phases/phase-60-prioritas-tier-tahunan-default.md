# Fase 60 — Prioritas Tier Tahunan sebagai Default Auto-Select

**Status:** Done
**Mulai:** 2026-09-08
**Selesai:** 2026-09-08

## Tujuan
User minta tier yang auto-select (default aktif) di card paket
diprioritaskan tahunan dulu, baru bulanan, terakhir harian kalau ada —
konsisten di card `/subscribe` (app) MAUPUN landing page. Sebelumnya
(Fase 53) urutan ASC durasi-terpendek-dulu (bulanan jadi default).

## Scope
- [x] `apps/web/lib/use-grouped-plans.ts` — sort tier `durationDays` DESC
  (bukan ASC), default tier aktif tetap `tiers[0]` (otomatis jadi
  tahunan/terpanjang setelah dibalik)
- [x] `apps/web/lib/use-grouped-plans.test.ts` — update 5 test yang
  berasumsi urutan/default lama
- [x] `docs/architecture/architecture-subscription.md` § Multi-Tier per
  Sub-Modul — catat perubahan urutan + implikasi ke tombol "Coba Gratis"

## Referensi
- `docs/phases/phase-53-multi-tier-billing-per-modul.md` — desain awal
  yang diubah urutannya di sini

## Keputusan Kecil Selama Eksekusi
- Cukup balik 1 comparator (`a.durationDays - b.durationDays` →
  `b.durationDays - a.durationDays`) di SATU hook shared — otomatis
  berlaku ke urutan pill DAN default auto-select di KEDUA tempat
  (landing & subscribe), karena keduanya cuma `.map()` array `tiers`
  apa adanya tanpa logic urutan sendiri.
- TIDAK mengubah jalur pre-select dari query string (`/subscribe`
  `?plans=`) — itu eksplisit `selectTier()` per plan id yang dibawa dari
  landing, tidak bergantung default `tiers[0]`.
- Konsekuensi disengaja (bukan bug, dicatat di architecture doc): kalau
  admin cuma nyalakan `trialEligible` di tier bulanan (konvensi lama),
  tombol "Coba Gratis" tidak muncul default lagi (customer harus pindah
  pill ke bulanan) — beri tahu user lewat ringkasan, bukan diam-diam.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review — tidak relevan (murni urutan array frontend,
  tidak ada input/endpoint baru)
- [x] Temuan Critical/High — tidak ada
- [x] Temuan Medium/Low — konsekuensi trial di atas, dicatat di
  architecture doc (bukan bug, bukan technical debt)
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Kalau admin punya tier "harian" (belum pernah dipakai nyata di
  production sejauh ini), urutan DESC otomatis menaruhnya PALING BAWAH —
  belum diuji dengan skenario 3 tier nyata (cuma disimulasikan via
  reasoning `durationDays` lebih kecil = urutan lebih akhir), tapi
  logic-nya generik (sort numerik biasa), bukan hardcode 2 tier saja.

## Ringkasan Hasil
Tier pill & auto-select default di card paket (landing DAN `/subscribe`)
sekarang prioritas durasi TERPANJANG dulu (tahunan → bulanan → harian
kalau ada), dibalik dari ASC (bulanan dulu) di Fase 53. Perubahan di 1
hook shared (`useGroupedPlans`), otomatis konsisten kedua tempat.

Typecheck 0 error. Full suite `apps/web` 27 pass/0 fail (5 test
diupdate, bukan test baru — mengubah asumsi urutan lama). Build sukses.
