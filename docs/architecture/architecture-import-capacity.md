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
| F8 | **DIKOREKSI 2026-10-20 — bukan anomali.** Dugaan awal "Batal Import 57 menit / Purchase Payment 32 menit / Work Order gagal 3 detik" dari rentang `min/max(processed_at)` per batch. Ternyata: PP 243 baris = ±20 job pendek (7–8 dtk) hasil klien menekan "Retry baris gagal" berulang (jeda = waktu klien); PI 331 baris = import awal 68 dtk (±4,9 baris/dtk) + retry; job `cancel-import` semua 0,8–25 dtk. Work Order gagal 3 dtk = bug validasi (Fase 200, nyata). Pelajaran: durasi batch dari `processed_at` menyesatkan bila batch pernah di-retry — ukur dari `pgboss.job` per run. | query tersebut |
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

## 8. Implementasi tahap 2 (2026-10-20): jalur terpisah batch besar + expire dinamis (ADR-0050)
- `JOBS.IMPORT_TO_ACCURATE_LARGE` (`import-to-accurate-large`): handler impor yang SAMA (`importToAccurateHandler`) didaftarkan dua kali di worker — jalur biasa (`IMPORT_WORKER_CONCURRENCY`, default 2) dan jalur besar (`IMPORT_LARGE_WORKER_CONCURRENCY`, default 2, maks 4), masing-masing `localGroupConcurrency: 1`.
- Routing di SATU titik: `enqueueAccurateJob` memilih antrean dari `import_batches.total_rows` (≥ `IMPORT_LARGE_BATCH_ROWS`, default 1.500 ≈ 7,5 menit pada ±0,3 dtk/baris). Ukuran tak terbaca/galat → jalur biasa (job tidak pernah hilang). `CANCEL_IMPORT`/AutoProduksi tidak pernah dialihkan.
- `expireInSeconds` per job = `clamp(baris × 0,6 + 900, 7200, 86400)`; batch 25.000 baris kini 15.900 dtk (dulu pasti lewat 7.200).
- Diuji ke pg-boss asli (Postgres dev): antrean terbentuk, `expire_seconds` per job tersimpan, `group_id` ikut, job terkonsumsi dengan `groupId`/`expireInSeconds` yang sama.
- **Perhatian operasional:** maksimum job paralel jadi 4; jalur biasa & besar untuk koneksi Accurate yang sama bisa jalan bersamaan (batas 8/dtk tetap dijaga pembatas per koneksi). Pantau CPU/memori worker; tala lewat env tanpa rilis kode.

## 9. Implementasi C2 (2026-10-20): verifikasi setelah timeout — Sales Receipt
- **Masalah:** setelah `save.do` timeout kita tidak tahu apakah Accurate menyimpan transaksinya (bisa masih memproses); baris dicap "Gagal" dengan pesan "MUNGKIN" dan beban memeriksa jatuh ke pelanggan (risiko dobel atau data tampak hilang).
- **Alur:** `AccurateTimeoutError` pada grup Sales Receipt BERNOMOR → `settleTimedOutGroup` memanggil `verifyAfterTimeout` (polling `sales-receipt/detail.do?number=` tiap 30 dtk sampai 5 menit; env `ACCURATE_VERIFY_MAX_WAIT_MS` (0 = sekali cek), `ACCURATE_VERIFY_INTERVAL_MS`) → **found**: semua baris grup SUKSES dengan id transaksi Accurate; **absent**: GAGAL dengan pesan "BELUM terlihat" (Accurate bisa baru selesai sesudahnya → tetap disarankan periksa sebelum import ulang); **unknown** (pengecekan sendiri gagal): perilaku lama ("MUNGKIN"). Grup tanpa nomor: perilaku lama (tak ada yang dicari). Log `accurate_verify_after_timeout`.
- **Scope:** `GET sales-receipt/detail.do` masuk registri modul `sales_receipt`; `sales_receipt_view` sebelumnya "warisan" (`extraScopes`) kini turunan dari endpoint → himpunan scope modul TIDAK berubah, koneksi yang ada tidak perlu memperbarui izin (diuji).
- **Biaya:** menahan slot sampai +5 menit per grup timeout (jarang; jalur besar memisahkan dari batch kecil). ⚠️ Belum terkonfirmasi test call nyata: bentuk respons `sales-receipt/detail.do` (id/number) dan pesan "tidak ada" untuk Sales Receipt (terkonfirmasi hanya Faktur Penjualan: "tidak tepat"); pesan lain → hasil "unknown" (aman). Modul lain bernomor (Purchase Payment, Sales/Purchase Invoice, dst.) memakai helper yang sama bila diperlukan (butuh fetcher + scope baca masing-masing).

## 10. Catatan pengukuran (2026-10-20)
- **Jangan menyimpulkan durasi/throughput dari `max(processed_at) - min(processed_at)` per batch** kecuali jumlah `processed_at` unik = jumlah unit kerja satu run (tanpa retry). Rentang itu mencakup jeda antar-retry. Ukur dari `pgboss.job` (`started_on`/`completed_on` per run) atau dari log `accurate_request`.
- Model biaya Accurate (±0,25–0,28 dtk/baris) tetap valid: batch dasarnya (926 baris/10 grup; 6.306 baris/4 grup) memiliki jumlah waktu unik = jumlah grup (satu run); kelipatan timeout 6:00,5/18:01 berasal dari `pgboss.job`.
- Pola perilaku klien teramati: me-retry batch yang galatnya deterministik (PPh Ps. 23 tidak ada di Master Pajak, pembayaran melebihi nilai utang) berkali-kali — murah (±7 dtk/run) tetapi tak berguna; kandidat UX: tandai galat deterministik dan arahkan ke "Edit" alih-alih "Retry".

## 11. Implementasi C4b (2026-10-20): paralel dalam satu job (dark launch, default OFF)
- **Latar:** biaya Accurate ±0,25–0,30 dtk/permintaan; job berurutan ≈ 3 baris/dtk (Sales Receipt per-baris), sedangkan Accurate mengizinkan 8 paralel & 8 req/dtk per token (§ 1 F4). Satu job tidak memakai kapasitas itu.
- **Mekanisme:** `lib/group-concurrency.ts` `forEachGroupConcurrent(groups, parallelism, fn)` menggantikan ke-22 `for (const group of groups)` di handler impor (pindai otomatis: tidak ada loop yang memutasi state di luar badannya; satu-satunya `continue` — Sales Receipt — menjadi `return`). **`IMPORT_GROUP_PARALLELISM` default 1 = perilaku lama persis**; 1–6. Batas 8 req/dtk & 8 paralel per koneksi TETAP dijaga `withAccurateRateLimit` (kunci per koneksi, dipakai bersama semua job/jalur) → paralelisme berlebih hanya mengantre. Galat yang lolos dari badan grup: item baru berhenti dimulai, yang berjalan dituntaskan, galat pertama dilempar (sama dengan loop berurutan).
- **Balapan data master:** dua grup paralel bisa sama-sama melihat "barang/pelanggan/vendor/klasifikasi/PIC belum ada" lalu sama-sama membuat (yang kedua gagal duplikat). `lib/keyed-lock.ts` `runExclusive` membungkus 5 fungsi `findOrCreate*` dengan kunci `<sesi Accurate>|<jenis>|<id ternormalisasi>`: kunci sama berurutan (yang kedua menjalankan fungsinya SENDIRI setelah yang pertama selesai → menemukan data baru; tidak ada langkah yang dilewati), kunci beda paralel; kunci memuat id sesi agar lintas-database tidak saling menunggu; dibersihkan setelah selesai.
- **Tidak diparalelkan:** AutoProduksi (per baris, berurutan) dan cabang bawaan per-baris (`vendor_payable_account` dst.).
- **Metrik:** log "Import batch selesai" kini memuat `module`, `parallelism`, `durationMs` → bandingkan baris/dtk sebelum-sesudah (ukur dari log per job, bukan dari rentang `processed_at`, § 10).
- **Rencana peluncuran (belum dilakukan; butuh keputusan user):** (1) deploy dengan nilai default 1 → tanpa perubahan perilaku; (2) set `IMPORT_GROUP_PARALLELISM=2` di production dan restart worker (tanpa batch aktif); (3) jalankan satu batch per-baris yang sudah dikenal (mis. Sales Receipt tanpa penggabungan) → bandingkan `durationMs`/`total` dengan job paralelisme 1; (4) pantau galat "melebihi toleransi", duplikat ("sudah ada"), dan durasi permintaan di log `accurate_request` (bila durasi per permintaan naik tajam → Accurate menserialisasi penulisan, paralelisme tak berguna); (5) naikkan ke 3 bila bersih; kembalikan ke 1 lewat env bila ada masalah.
- ⚠️ **BELUM teruji terhadap Accurate asli** (tidak ada database uji): apakah Accurate melayani penulisan paralel secepat itu atau menserialisasinya, dan apakah ada kunci di sisi mereka yang memunculkan galat baru. Karena itu default OFF.
