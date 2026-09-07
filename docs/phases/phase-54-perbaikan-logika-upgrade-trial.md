# Fase 54 — Perbaikan Logika Trial: Upgrade ke Paket Asli Tidak Boleh Terblokir

**Status:** Done
**Mulai:** 2026-09-07
**Selesai:** 2026-09-07

## Tujuan
User memberi catatan eksplisit soal logika trial: trial itu OPSIONAL,
tidak berarti user harus menunggu masa trial habis sebelum bisa
berlangganan paket asli. Ditemukan 2 masalah nyata:
1. **Regresi UI** (dari redesain Fase 53) — section "Pilih Paket" di
   `/subscribe` ikut disembunyikan total begitu modul sedang trial aktif,
   jadi user TIDAK BISA klik "Berlangganan" sama sekali selama trial
   berjalan — bertentangan langsung dengan maksud trial.
2. **Bug data laten** (sudah ada sejak Fase 43, baru ketahuan sekarang) —
   saat admin confirm pembayaran paket asli untuk modul yang usernya
   SEDANG trial, subscription trial LAMA tidak pernah ditutup. User jadi
   punya 2 subscription "active" bersamaan untuk modul yang sama (trial +
   asli) — bikin status yang ditampilkan (`/subscribe`, badge "Sedang
   Trial" vs "Sudah Berlangganan") jadi order-dependent/tidak konsisten.

## Scope
- [x] `apps/web/app/app/(protected)/subscribe/page.tsx` — hapus gate `!isTrialActive` di section "Pilih Paket"
- [x] `apps/api/src/routes/admin/orders.route.ts` — confirm menutup (cancelled) subscription aktif LAIN untuk modul yang sama sebelum insert baru
- [x] `apps/api/src/routes/admin/subscriptions.route.ts` — fix sama untuk jalur admin assign manual

## Referensi
- Architecture doc: `docs/architecture/architecture-subscription.md` (tidak diubah — perilaku "trial tidak blokir checkout" MEMANG sudah didokumentasikan benar sejak Fase 43, cuma implementasinya belum lengkap)

## Keputusan Kecil Selama Eksekusi
- Subscription trial lama di-set `status: "cancelled"` (bukan status baru) — nilai enum sudah cukup ("pending_payment"|"active"|"expired"|"cancelled"), tidak perlu migration.
- Fix diterapkan di 2 endpoint (`admin/orders.route.ts` confirm DAN `admin/subscriptions.route.ts` assign manual) — keduanya bisa membuat subscription baru untuk user existing yang mungkin sedang trial, `manual-subscription.ts` (batch onboarding user BARU) TIDAK perlu fix karena user baru mustahil sudah punya trial.
- Test route baru ditambah untuk `admin/orders.route.ts` (jalur paling sering dipakai). `admin/subscriptions.route.ts` TIDAK ada test file sama sekali sejak awal (gap pre-existing) — tidak dibuat set test baru dari nol, di luar scope perbaikan ini, dicatat di Known Limitations.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck` — api+web)
- [x] Security review dijalankan (inline — perubahan kecil, tidak ada endpoint/permission baru)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — 0 temuan
- [x] Temuan Medium/Low dicatat — lihat Known Limitations
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- `admin/subscriptions.route.ts` (`POST /admin/subscriptions`) tidak
  punya test route sama sekali sejak awal — fix supersede-trial di sini
  TIDAK punya test otomatis (diverifikasi manual/logika identik dengan
  fix `admin/orders.route.ts` yang SUDAH punya test). Backfill test
  dasar endpoint ini di luar scope fase ini.

## Ringkasan Hasil
2 bug logika trial diperbaiki: (1) regresi UI Fase 53 yang tidak
sengaja menyembunyikan tombol "Berlangganan" selama trial aktif — kini
selalu tampil selama modul belum jadi subscription asli, (2) bug data
laten sejak Fase 43 — subscription trial lama sekarang otomatis
ditutup (`status: "cancelled"`) begitu admin confirm pembayaran paket
asli untuk modul yang sama, mencegah 2 subscription "active" bersamaan
untuk 1 modul. Diterapkan di 2 titik (`admin/orders.route.ts` confirm,
`admin/subscriptions.route.ts` assign manual).

Test baru: 1 test route (`admin/orders.route.test.ts`) verifikasi
subscription trial lama ter-cancel + subscription baru aktif non-trial.
Full suite `apps/api` 414 pass/0 fail, `apps/web` 21 pass/0 fail.
Typecheck+lint+build bersih.
