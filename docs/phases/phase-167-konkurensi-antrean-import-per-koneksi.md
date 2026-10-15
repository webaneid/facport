# Fase 167 — Konkurensi antrean import per koneksi Accurate

**Status:** Done (2026-10-15, belum dirilis)
**Mulai:** 2026-10-15
**Selesai:** 2026-10-15

## Tujuan
Satu batch besar milik satu pelanggan tidak lagi menahan import pelanggan lain. Dipicu insiden berulang (2026-10-02, 2026-10-15). Detail keputusan: `docs/decisions/adr-0048-konkurensi-antrean-import-per-koneksi-accurate.md`.

## Mode kerja
Sedang-besar, menyentuh jalur kritis produksi → TDD bertahap, spike pg-boss dulu, security-review dan uji beban lokal sebelum rilis. Tanpa migrasi skema aplikasi (pg-boss mengelola tabelnya sendiri; verifikasi di spike).

## Scope
- [x] S1 Spike: pastikan `localConcurrency` + `groupConcurrency` + `send({ group })` di pg-boss 12.27 bekerja pada Postgres nyata, termasuk untuk queue yang SUDAH ada di produksi (`updateQueue`/migrasi internal pg-boss). Catat hasilnya di ADR.
- [x] S2 `lib/accurate-rate-limiter.ts`: bucket per koneksi via `AsyncLocalStorage` (`runWithAccurateConnection`), bucket `"global"` bila tanpa konteks; tes (dua koneksi tidak saling menahan, satu koneksi tetap ≤8/detik dan ≤8 paralel).
- [x] S3 Helper `enqueueAccurateJob` (cari koneksi → `group.id`); ganti SELURUH `boss.send(JOBS.IMPORT_TO_ACCURATE | CANCEL_IMPORT | PROCESS_AUTOPRODUKSI_ENTRY` (±70 titik) + tes pagar anti `boss.send` mentah.
- [x] S4 Worker: `boss.work` dengan `localConcurrency` (env `IMPORT_WORKER_CONCURRENCY`, default **2**, dijepit 1–8) + `localGroupConcurrency: 1` (hasil spike: `groupConcurrency` DB-based race); handler dibungkus `runWithAccurateConnection`.
- [x] S5 Tes integrasi: dua koneksi → paralel; satu koneksi dua batch → berurutan; batch kecil tidak menunggu batch besar koneksi lain.
- [x] S6 Env, `docker-compose.prod.yml` (tinjau `cpus`/`mem_limit` worker), dokumen (`architecture-jobs.md`, `architecture-accurate-integration.md` § 4, runbook deploy: worker di-recreate bunuh job berjalan → deploy saat antrean kosong), lessons-learned.
- [x] S7 Typecheck, suite penuh, security review, tutup fase.

## Di luar scope
Mempercepat satu batch besar (dibatasi Accurate); prioritas/antrean berbobot; replika worker; mengubah `retryLimit`/`expireInSeconds`.

## Keputusan
- Default konkurensi **2** (bukan 4) karena batas Accurate "per token" belum teruji lintas koneksi (lihat ADR-0048); `CANCEL_IMPORT` dan `PROCESS_AUTOPRODUKSI_ENTRY` ikut grup koneksi yang sama.
- Resource worker (`cpus: 0.5`, `mem_limit: 384m`) TIDAK diubah di fase ini; pertanyaan kapasitas VPS menunggu user. Pantau memori worker setelah rilis (`docker stats facport-worker-1`).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error
- [x] Security review
- [x] Temuan Critical/High diperbaiki
- [x] Temuan Medium/Low dicatat
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Worker HARUS tetap 1 container (group + limiter di memori).
- Satu batch besar tidak lebih cepat (dibatasi Accurate). Bila koneksi sibuk > N, sisanya antre FIFO.
- Job yang sedang berjalan saat worker di-recreate (deploy/restart) tetap terbunuh — deploy saat antrean kosong.
- Batas Accurate lintas koneksi (per token vs per aplikasi) belum teruji di produksi: pantau galat "melebihi toleransi" pada `import_batch_rows.error_message` setelah rilis.
- Job lama yang sudah antre sebelum rilis tidak punya group → bucket "global" (berjalan normal, hanya tidak dikelompokkan).

## Ringkasan Hasil
Antrean import kini paralel antar koneksi Accurate (default 2, env `IMPORT_WORKER_CONCURRENCY`) dan berurutan dalam satu koneksi. `lib/accurate-rate-limiter.ts` memakai bucket per koneksi (`AsyncLocalStorage`, bucket "global" tanpa konteks). `lib/accurate-job-dispatch.ts` (`enqueueAccurateJob`, `accurateWorkOptions`, `withAccurateJobContext`) menggantikan 70 `boss.send` mentah di 25 file; tes pagar mencegah regresi.
**Verifikasi:** typecheck bersih; API 2.395 tes lulus (termasuk tes integrasi pg-boss nyata: koneksi sama berurutan, koneksi lain tidak menunggu); data uji dibersihkan. **Security review inline:** 0 temuan — kunci group/bucket hanya dari id DB (bukan input pengguna), lookup via Drizzle terparameter, env di-parse dan dijepit, kegagalan lookup tidak menghilangkan job.
