# Fase 173 — Fondasi periode langganan (ADR-0041)

**Status:** Done · **Mulai:** 2026-10-06 · **Selesai:** 2026-10-06

## Tujuan
Meletakkan fondasi periode berbasis kalender: fungsi hitung tunggal, kolom data, dan form paket Bulanan/Tahunan — tanpa mengubah jalur aktivasi (Fase 174).

## Scope
- [x] `apps/api/src/lib/subscription-period.ts`: `addCalendarMonths`, `addCalendarPeriod`, `intervalMonths` (murni, tanpa DB, Intl) + tes tanggal sulit; re-export web
- [x] Migrasi 0042: `plans.interval` (backfill ≥360 hari→yearly else monthly), `invoice_items.interval` (snapshot, backfill sama), `subscriptions.period_anchor_at`, `subscriptions.period_months` (NULL)
- [x] API paket: terima/keluarkan `interval`; `durationDays` diturunkan (30/365) bila `interval` dikirim; kompatibel dengan klien lama
- [x] Form paket admin: pilihan Bulanan/Tahunan saja
- [x] Snapshot `interval` ke `invoice_items` saat checkout/invoice admin

## Referensi
- ADR: `docs/decisions/adr-0041-periode-langganan-kalender.md`
- Architecture: `docs/architecture/architecture-subscription.md` § "Periode Langganan (ADR-0041)"

## Keputusan Kecil Selama Eksekusi
- Fungsi periode dibuat mandiri (tidak mengimpor `company-timezone.ts` yang menarik DB) supaya bisa di-re-export ke web; salinan algoritma `zonedTimeToUtc` disengaja.
- Klien lama yang hanya mengirim `durationDays` tetap diterima (dipetakan; nilai hari lama dipertahankan di kolom kompatibilitas) agar deploy API/web yang tidak sinkron sesaat aman.
- Backfill: `duration_days >= 360` → yearly (mencakup 360 lama & 365 baru), selain itu monthly. Jangkar `period_anchor_at/period_months` dibiarkan NULL (data lama) — diisi Fase 174.
- Jalur aktivasi (konfirmasi order, Tambah User, assign admin, trial) SENGAJA belum disentuh — perilaku produksi tidak berubah sampai Fase 174.

## Ringkasan Hasil
`subscription-period.ts` (+12 tes tanggal sulit: 31 Jan, kabisat, 31 Des 23:59:59.999, WIB≠UTC, zona Makassar, jangkar 12 bulan), migrasi 0042 (+backfill diuji di DB dev), API paket `interval`, form paket Bulanan/Tahunan, snapshot `interval` di invoice item. Typecheck bersih; tes terkait lulus.

## Known Limitations
- Migrasi belum dijalankan di production (butuh deploy Full + `db:migrate`, bersama Fase 174–175).
- UI form paket belum dilihat di browser.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error
- [x] Security review
- [x] Temuan Medium/Low dicatat bila ditunda
- [x] `docs/PROGRESS.md` diupdate
