# ADR-0050: Timeout eksplisit adaptif untuk panggilan Accurate + jalur terpisah batch besar

**Status:** Accepted (2026-10-20; user menyetujui lanjut langkah metrik/timeout adaptif lalu jalur terpisah — Fase 199)
**Tanggal:** 2026-10-20

## Context
Insiden 2026-10-19: 11 batch Sales Receipt (±62.000 baris, nomor penerimaan digabung) gagal 100% dengan "Accurate tidak membalas dalam batas waktu", tepat 360 detik per panggilan. Pembuktian (docs/architecture/architecture-import-capacity.md): (1) kode TIDAK memasang timeout untuk `save.do`; 360 dtk = default `fetch` Bun 1.4.3 production (Bun 1.3.11 lokal = 300; image `oven/bun:1` mengambang) — kita yang memutus, bukan Accurate; (2) biaya Accurate ±0,25–0,30 dtk/baris detail, linear → 360 dtk ≈ 1.300–1.400 baris, di atasnya pasti gagal; (3) dengan 2 slot worker global, tiap panggilan yang pasti timeout menahan separuh kapasitas semua pelanggan; (4) `AbortSignal.timeout(lebih-panjang)` saja dan `timeout:<ms>` TIDAK mengalahkan default runtime (diuji), hanya `timeout: false` + signal sendiri.

## Decision
1. **Satu pintu `accurateFetch`** (`lib/accurate-http.ts`) untuk semua panggilan ke `ctx.host`; tes pagar melarang `fetch` mentah. Timeout menjadi keputusan kita: `save.do` = jumlah baris detail × `ACCURATE_SAVE_MS_PER_LINE` (600 ms ≈ 2× biaya terukur), dijepit `ACCURATE_SAVE_TIMEOUT_MIN_MS` (6 menit) … `ACCURATE_SAVE_TIMEOUT_MAX_MS` (60 menit); panggilan lain `ACCURATE_REQUEST_TIMEOUT_MS` (360 dtk = perilaku lama, kini tertulis). Mekanisme: `timeout: false` + `signal: AbortSignal.timeout(ms)`. Metrik log terstruktur `accurate_request` per panggilan save (dan yang lambat/gagal).
2. **Jalur terpisah batch besar:** `enqueueAccurateJob` (satu-satunya pintu kirim job) mengalihkan job `IMPORT_TO_ACCURATE` dengan `total_rows ≥ IMPORT_LARGE_BATCH_ROWS` (default 1.500) ke antrean `import-to-accurate-large`, handler SAMA, slot sendiri (`IMPORT_LARGE_WORKER_CONCURRENCY`, default 2, `localGroupConcurrency: 1`). Pemanggil (±50 route) tidak berubah.
3. **`expireInSeconds` dinamis per job:** `clamp(baris × 0,6 + 900, 7200, 86400)` (dasar 2 jam = perilaku lama).

## Alternatif yang Dipertimbangkan
- Hanya memperpanjang `AbortSignal` — ditolak: terbukti tidak mengalahkan default runtime.
- Timeout tetap besar (mis. 30 menit) untuk semua — ditolak: dokumen kecil yang macet menahan slot lama tanpa alasan; adaptif menjaga batas bawah lama.
- Memperbanyak slot global saja — ditolak: batch raksasa tetap bisa menghabiskan semua slot; pemisahan jalur menjamin batch kecil selalu punya slot.
- Pecah-otomatis menjadi banyak dokumen — ditolak untuk saat ini: mengubah catatan akuntansi (butuh persetujuan client); opsi update bertahap pada dokumen yang sama belum terbukti di Accurate.
- Guard batas baris keras (Fase 195) — ditolak: batas buatan sendiri, memblokir alur yang bisa berhasil.

## Konsekuensi
- Penerimaan ribuan baris kini diberi waktu cukup (3.391 baris ≈ 34 menit batas, prediksi Accurate ≈ 15 menit). Prediksi linear BELUM terbukti pada kasus itu; verifikasi di Bun 1.4.3 production wajib setelah deploy.
- Satu job raksasa menahan 1 dari 2 slot jalur besar hingga puluhan menit; batch kecil tidak terganggu. Total job paralel maksimum naik dari 2 menjadi 4 (2 biasa + 2 besar) — pantau CPU/memori worker (`cpus: 0.5`, `mem_limit: 384m`).
- Jalur biasa dan besar untuk koneksi Accurate yang SAMA dapat berjalan bersamaan (tidak lagi 1 job per koneksi lintas jalur); batas 8 request/detik & 8 paralel per token tetap dijaga karena pembatas berkunci per koneksi dan dipakai bersama. Preseden: `CANCEL_IMPORT` sudah antrean terpisah.
- Timeout kita sendiri = `AccurateTimeoutError` (name `TimeoutError`); baris gagal menyebut lama menunggu dan jumlah baris. Status "mungkin sudah tersimpan" TETAP tidak terselesaikan sampai verifikasi setelah timeout dibangun (butuh scope baca per modul).
- Tidak menyelesaikan: kapasitas paralel dalam satu job, verifikasi setelah timeout, deploy yang membunuh job berjalan.

---
> Aturan: file ADR TIDAK diedit setelah Accepted. Kalau keputusan berubah,
> buat ADR baru dan tulis "Supersedes ADR-XXXX" di file baru itu.
