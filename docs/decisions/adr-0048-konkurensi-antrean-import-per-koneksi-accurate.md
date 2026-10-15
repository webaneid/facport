# ADR-0048 — Konkurensi antrean import: paralel antar koneksi Accurate, berurutan dalam satu koneksi

**Status:** Accepted (2026-10-15; user menyetujui paralel per koneksi/token)
**Fase:** 167

## Konteks
Worker `IMPORT_TO_ACCURATE` terdaftar tanpa opsi → pg-boss memproses **1 job pada satu waktu untuk SEMUA pelanggan**. Satu batch besar (mis. 4.858 baris, ±30 menit pada ±2,2 baris/detik) membuat batch kecil pelanggan lain menunggu di "Menunggu" tanpa kemajuan. Insiden berulang: 2026-10-02 (PT Futura Maju) dan 2026-10-15 (batch Sales Receipt 4.858 baris menahan batch 19 baris).

Batas Accurate (8 request/detik dan 8 paralel) berlaku **per token** (= per koneksi Accurate, ADR-0036). `lib/accurate-rate-limiter.ts` sekarang satu pembatas global di memori untuk semua pelanggan; bila antrean dibuat paralel tanpa mengubahnya, semua pelanggan berbagi kuota 8/detik.

## Opsi
1. **Tambah container worker (replika).** Ditolak: pembatas in-memory tidak terkoordinasi antar proses, memori 384 MB × N, tidak menyelesaikan fairness per koneksi.
2. **`localConcurrency` saja.** Ditolak sendirian: dua batch pelanggan yang SAMA bisa berjalan paralel dan menembus batas 8/detik per token.
3. **`localConcurrency` + `groupConcurrency` (pg-boss ≥12) per koneksi Accurate + pembatas Accurate per koneksi.** Dipilih.

## Keputusan (usulan)
- `IMPORT_TO_ACCURATE`, `CANCEL_IMPORT`, `PROCESS_AUTOPRODUKSI_ENTRY`: `boss.work(..., { localConcurrency: N, localGroupConcurrency: 1 })`; `N` dari env `IMPORT_WORKER_CONCURRENCY` (**default 2**, batas 1–8; naikkan bertahap setelah memantau galat batas Accurate).
- Kelompok (`group.id`) = id koneksi Accurate hasil `resolveConnectionForSubscription` (bukan id langganan: beberapa Data Usaha bisa memakai satu token). Satu koneksi tetap berurutan; koneksi berbeda paralel.
- Semua pengiriman job lewat satu helper `enqueueAccurateJob(jobName, payload)` yang mencari koneksi dan memasang `group`. Tes pagar memastikan tidak ada `boss.send(JOBS.<antrean-ini>` mentah tersisa.
- `withAccurateRateLimit` jadi per-koneksi: kunci diambil dari `AsyncLocalStorage` yang di-set handler worker (`runWithAccurateConnection(connectionId, fn)`). Panggilan tanpa konteks memakai bucket `"global"` (perilaku lama) — 45 titik panggilan tidak perlu diubah.
- `retryLimit: 0` dan `expireInSeconds` tidak berubah (ADR sebelumnya: cegah dobel-dispatch).

## Konsekuensi
- Batch kecil pelanggan lain tidak lagi menunggu batch besar, selama jumlah koneksi aktif ≤ N. Bila > N koneksi sibuk, sisanya tetap antre (FIFO) — dapat ditala lewat env tanpa rilis kode.
- Satu batch besar TIDAK menjadi lebih cepat (dibatasi balasan Accurate).
- Beban worker naik (CPU/memori); `cpus: 0.5` / `mem_limit: 384m` perlu ditinjau.
- Job yang sedang berjalan saat worker di-recreate tetap terbunuh (risiko lama, tidak berubah).
- **Hasil spike (2026-10-15, Postgres dev, pg-boss 12.27):** `groupConcurrency` (berbasis DB) TIDAK menahan — 3 job satu group jalan bersamaan karena beberapa worker lokal mengambil job pada detik yang sama (race, tanpa kunci). `localGroupConcurrency` (di memori) bekerja deterministik: job satu group berurutan, group lain paralel. Dipilih `localGroupConcurrency` karena worker memang satu proses (pembatas Accurate juga di memori). **Konsekuensi: worker TIDAK boleh di-scale ke >1 container** tanpa limiter + group terpusat.
- `job.groupId` tersedia di handler → dipakai sebagai kunci bucket pembatas (`withAccurateJobContext`), jadi isi handler tidak diubah.
- Batas "8/detik per token" berasal dari pesan galat Accurate; apakah ada batas tambahan per aplikasi/database belum teruji. Mitigasi: default N=2, pantau galat "melebihi toleransi" pasca rilis; retry-backoff 4x sudah ada.
