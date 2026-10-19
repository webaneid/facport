# Architecture — Evaluasi kapasitas & ketahanan import (antrean, throughput, transaksi besar)

> Dibuat 2026-10-20 (Fase 199, evaluasi). Berisi BUKTI terukur dari production + celah yang ditemukan + opsi. BELUM keputusan desain — keputusan menunggu pengukuran sisa (§ 6) dan persetujuan user. Konteks: ADR-0048 (Fase 167) memperbaiki "1 batch besar menahan semua pelanggan" hanya sebagian.

## 1. Fakta terukur (production, 2026-10-19 UTC)
| # | Fakta | Sumber |
|---|---|---|
| F1 | Default `fetch` Bun **1.4.3** (runtime production) = **360 detik**. Kode TIDAK memasang timeout untuk `save.do`; "Accurate tidak membalas dalam batas waktu" = timeout bawaan HTTP client KITA, bukan penolakan Accurate. Accurate bisa saja masih memproses setelah kita memutus. (Bun 1.3.11 lokal = 300 detik → default beda antar versi; image `oven/bun:1` mengambang.) | probe di container worker + probe lokal |
| F2 | 11 batch Sales Receipt (4.208–6.614 baris, 62.000 baris total) dengan 1–3 nomor penerimaan raksasa → **0 sukses**, 21 panggilan × 6 menit = ±126 menit waktu koneksi. Satu batch (7.333 baris) yang TIDAK digabung (6.731 grup) → 6.881 sukses, 42 menit. Data sama berhasil bila tidak digabung. | `import_batches`/`import_batch_rows` |
| F3 | Waktu tunggu antrean 15 job terakhir < 1,5 detik (antrean tidak bermasalah pada beban hari itu). | `pgboss.job` |
| F4 | Throughput berurutan: Sales Receipt per-baris ±2,7 baris/dtk; Sales Invoice 5,3; Purchase Invoice 4,3; Sales Invoice batch kecil 1,3. Batas Accurate 8 req/dtk & 8 paralel per token → terpakai 16–66%. | selisih `processed_at` |
| F5 | Slot global `IMPORT_WORKER_CONCURRENCY` default **2** (ADR-0048); satu koneksi Accurate selalu berurutan. | ADR-0048 |
| F6 | `expireInSeconds` job import = 7200 (2 jam): batch ≥ ±16.000 baris pada 2,2–2,7 baris/dtk berisiko kedaluwarsa di tengah jalan. | `lib/queue.ts` |
| F7 | Job kedua pada koneksi sama menunggu job pertama (terlihat: 06:45→06:51 lalu 06:57→07:03). | `processed_at` |
| F8 | Anomali belum didalami: Batal Import Purchase Invoice 331 baris = 57 menit; Purchase Payment 243 baris = 32 menit; Work Order 7.812 baris gagal semua dalam 3 detik (validasi, bukan kapasitas). | tabel di atas |
| F9 | Insiden 14 Okt (1.239–1.539 baris timeout 6 menit; 1.249 baris sempat DIBALAS Accurate setelah ±4,7 menit dengan galat bisnis) terjadi SEBELUM Fase 167 (15 Okt) → timeout transaksi raksasa bukan akibat perubahan antrean. | lessons-learned Fase 195 |

### Hasil pengukuran A3 (riwayat Sales Receipt 18–19 Okt, guard 1.000 baris aktif sampai 19 Okt 04:23 UTC)
| Bukti | Hitungan |
|---|---|
| 926 baris, 10 grup, semua sukses, 3:54 | **0,25 dtk/baris** |
| 6.306 baris: grup 598 baris sukses, grup lain ditolak guard seketika; total 2:44 | **≤0,27 dtk/baris** |
| Insiden 14 Okt: 1.249 baris dibalas Accurate di 4,7 menit | 0,23 dtk/baris |
| Batch per-baris (6.400–7.650 sukses, 33–40 menit) | 2,9–3,3 baris/dtk = 0,31–0,34 dtk (incl. overhead kita) |
- **Model biaya:** Accurate ±0,25–0,30 dtk per baris detail, **linear**, baik dokumen kecil maupun besar. Konsekuensi: (1) batas 360 dtk ≈ **±1.300–1.400 baris per dokumen** (di atasnya pasti timeout); (2) throughput berurutan ±3 baris/dtk ≈ kecepatan Accurate per baris, bukan kelambatan loop kita; (3) penerimaan 3.391 baris ≈ 15 menit, 6.000 baris ≈ 26 menit (prediksi linear, belum terbukti).
- Tabel baru memuat Sales Receipt mulai 18 Okt 02:10 UTC; klaim "Jumat 16 Okt berhasil" tidak terlihat di data ini (tidak terverifikasi).
- Batch per-baris punya 5–9% baris gagal konsisten (452–1.249/batch): galat data/validasi sisi client, bukan kapasitas.

## 2. Dua masalah berbeda yang harus dipisah
1. **Transaksi raksasa (sedikit dokumen, ribuan baris per dokumen):** satu request; lama proses di Accurate naik dengan jumlah baris; kita memutus di 360 detik. Konkurensi/antrean TIDAK memperbaikinya.
2. **Kapasitas banyak pengguna paralel (banyak dokumen kecil):** dibatasi 2 slot global × throughput berurutan; satu koneksi berurutan; tak ada keadilan antar pelanggan; job yang berakhir timeout menahan slot.

Keduanya BERKAITAN: setiap timeout 6 menit menahan 1 dari 2 slot (50% kapasitas global). Dengan 3–10 pelanggan paralel, beberapa batch raksasa yang gagal dapat melumpuhkan kapasitas semua pelanggan.

## 3. Celah yang teridentifikasi
- **C1** Timeout bukan keputusan desain (bawaan runtime, berubah antar versi Bun, tak terdokumentasi di kode). Panggilan Accurate lain (list/detail) juga tanpa timeout eksplisit → panggilan menggantung menahan slot 6 menit.
- **C2** Setelah timeout kita tidak tahu apakah transaksi tersimpan; baris dicap "gagal" padahal mungkin sukses (atau sebaliknya). Pesan "periksa Accurate dulu" memindahkan beban ke pelanggan.
- **C3** Tidak ada pengaturan alur untuk transaksi besar: tak ada peringatan, estimasi, atau pemecahan; guard lama (Fase 195) hanya menolak lalu dicabut (Fase 197).
- **C4** Throughput dalam satu job berurutan (1 request sekali jalan), jauh di bawah batas 8 paralel/8 per detik.
- **C5** Slot global kecil (2), tanpa prioritas/jalur terpisah antara job kecil dan raksasa/gagal.
- **C6** `expireInSeconds` 2 jam tanpa pemeriksaan ukuran batch; deploy/restart worker membunuh job berjalan.
- **C7** Tak ada metrik: lama per grup, ukuran grup, waktu tunggu, utilisasi slot — keputusan kapasitas masih berbasis tebakan.

## 4. Opsi (belum diputuskan)
| Opsi | Memperbaiki | Catatan/risiko |
|---|---|---|
| A. Timeout eksplisit & lebih panjang untuk `save.do` (mis. 15–30 menit, terkonfigurasi) | C1, sebagian F2 | Belum terbukti Accurate selesai dalam waktu itu; menahan slot lebih lama → butuh C/E |
| B. Verifikasi setelah timeout (baca `*/detail.do?number=`), tandai sukses/gagal sesuai kenyataan | C2 | Butuh scope baca Sales Receipt (pelanggan "Perbarui izin" lagi) |
| C. Bangun 1 dokumen BERTAHAP: buat dengan N baris pertama, lalu `save.do` dengan `id` menambah N baris berikut (pola append Sales Invoice) | F2 tanpa mengubah catatan akuntansi (tetap SATU nomor) | **Perlu uji di Accurate demo**: validasi total (`chequeAmount`) pada keadaan parsial, biaya hitung ulang tiap update; belum terbukti |
| D. Peringatan lunak di preview ("nomor X berisi 3.391 baris, kemungkinan lambat/gagal") + estimasi | C3 | Tidak menyelesaikan, hanya transparan |
| E. Kapasitas: naikkan slot, jalur terpisah (job kecil vs besar), paralel 4–6 request dalam satu job (≤ batas 8), prioritas/keadilan, `expireInSeconds` dinamis, shutdown anggun | C4–C6 | Perlu model kapasitas + uji beban; batas "8/dtk per token" ada di pesan galat Accurate, cakupan sebenarnya belum teruji |
| F. Pecah-otomatis jadi beberapa dokumen | F2 | Mengubah catatan akuntansi — butuh persetujuan client |
| G. Metrik & log durasi per grup/slot | C7 | Dasar semua keputusan di atas |

## 5. Yang BELUM diketahui (jangan diasumsikan)
- Berapa lama Accurate sebenarnya memproses penerimaan 3.000–6.000 baris (≥ 360 dtk, tetapi berapa?) dan apakah tetap menyimpannya setelah kita memutus.
- Ukuran grup terbesar yang pernah sukses di production dan durasinya (query riwayat 10–19 Okt belum dijalankan).
- Apakah Accurate menerima update bertahap (Opsi C) pada Sales Receipt dan bagaimana validasi total.
- Cakupan sebenarnya batas 8/dtk (per token/aplikasi/database) saat beberapa koneksi aktif bersamaan.

## 6. Pengukuran berikutnya
1. Riwayat Sales Receipt 10–19 Okt: ukuran grup, ok/gagal, durasi (ukuran sukses terbesar).
2. Uji eksplisit di Accurate demo/trial (butuh akun uji): waktu proses penerimaan N baris untuk N = 500/1.000/2.000/4.000; perilaku bila klien memutus; update bertahap (Opsi C).
3. Telusuri anomali F8 (Batal Import 57 menit, Purchase Payment 32 menit): kemungkinan backoff batas request.
4. Uji beban terkontrol: 3–10 koneksi paralel (staging) dengan metrik slot/antrean.

## 7. Implementasi tahap 1 (2026-10-20): metrik + timeout adaptif eksplisit
- `lib/accurate-http.ts` → `accurateFetch` = SATU pintu semua panggilan ke `ctx.host` (45 titik di 28 file dialihkan; tes pagar mencegah `fetch(\`${ctx.host}` mentah). `save.do`: timeout = clamp(baris detail × 600 ms, 6 menit, 60 menit); panggilan lain: 360 dtk eksplisit (= perilaku sebelumnya, kini tertulis). Env: `ACCURATE_SAVE_TIMEOUT_MIN_MS`, `ACCURATE_SAVE_TIMEOUT_MAX_MS`, `ACCURATE_SAVE_MS_PER_LINE`, `ACCURATE_REQUEST_TIMEOUT_MS`.
- Metrik: log terstruktur `event: "accurate_request"` (save selalu; lainnya hanya bila ≥10 dtk/timeout/galat) berisi `path, lines, bodyBytes, timeoutMs, durationMs, outcome, status, connectionId` → kalibrasi model biaya & utilisasi dari `docker compose logs api worker | grep accurate_request`.
- **Mekanisme override (diuji, Bun 1.3.11):** `AbortSignal` panjang saja & `timeout:<ms>` tidak mengalahkan default; `timeout: false` + `signal` sendiri bekerja → dipakai `timeoutInit`. Wajib diverifikasi ulang di Bun 1.4.3 production setelah deploy (default di sana 360 dtk).
- Timeout kita sendiri = `AccurateTimeoutError` (name tetap `TimeoutError`); pesan baris gagal menyebut lama menunggu & jumlah baris, tetap menyarankan cek Accurate dulu.
- **Belum dilakukan (tahap berikut):** verifikasi setelah timeout, jalur terpisah job besar, paralel dalam satu job, `expireInSeconds` dinamis. Catatan: dengan timeout lebih panjang, satu job raksasa menahan 1 dari 2 slot hingga ±34 menit (sebelumnya 6 menit lalu gagal) → jalur terpisah makin mendesak.
