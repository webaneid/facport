# Architecture — Laboratorium kecepatan import (perilaku Accurate yang terukur)

> **Tujuan:** menemukan ritme pengiriman tercepat ke Accurate secara EMPIRIS, bukan asumsi. Prinsip user (2026-11-06): kecepatan import adalah isu prinsipil dan harus terus dicari tahu; kita tidak boleh terus menambah pembatas tanpa mengukur biayanya. Dokumen ini adalah catatan HIDUP: setiap percobaan ditulis di sini (metode + angka + batas uji). Pelengkap `architecture-import-capacity.md` (data produksi) — dokumen ini berisi percobaan terkendali.
> **Aturan dokumen pelanggan** ([[feedback-never-alter-customer-documents]]): hanya CARA PENGIRIMAN yang boleh diubah; bentuk/nomor dokumen tidak.

## 0. Lingkungan uji & cara membaca angka
- Database Accurate uji: **"facport"** (id 3083006), trial s/d 2026-12-06, akses ADMIN, baru & kosong (dibuat user 2026-11-06). Terhubung ke Data Usaha "Webane Indonesia" di DB dev lewat koneksi `8e510951…`. Semua tulis uji HANYA ke DB ini; dokumen uji dihapus setelah tiap percobaan (sisa: pelanggan `BENCH-C1`, barang jasa `BENCH-I1`, faktur `BENCH-SETUP-001`).
- Klien: mesin dev (Mac) → `zeus.accurate.id`. **Latensi dari VPS produksi bisa berbeda** (data produksi: ±0,25–0,30 dtk/permintaan tulis; di sini ±0,5 dtk/faktur 1 baris). Yang dapat dipindahkan ke produksi adalah RASIO/bentuk kurva, bukan angka mutlak.
- Semua permintaan lewat `accurateFetch`; "+pembatas" = lewat `withAccurateRateLimit` (perilaku produksi: 8 req/dtk & 8 paralel per koneksi); "MENTAH" = tanpa pembatas Facport.
- Batas uji umum: dokumen kecil, barang JASA (tanpa stok), satu mesin, rentang beberapa detik per fase (batas Accurate yang bergantung durasi panjang BELUM teruji).

## 1. Beban pengaman Facport sendiri (tanpa Accurate)
| Pengaman | Diukur | Hasil |
|---|---|---|
| Pembatas per koneksi (`withAccurateRateLimit`) | 8 panggilan kosong di bawah batas | 0,28 ms total |
| Kunci per data master (`runExclusive`) | 20.000 panggilan kosong | 0,35 µs/panggilan |
| Pengatur paralelisme (`forEachGroupConcurrent`, paralel 1) | 20.000 item kosong | 4 ms total |
**Kesimpulan:** pengaman TIDAK menambah waktu berarti. Pembatas hanya menahan bila kita mengirim >8 req/dtk (tidak pernah terjadi pada import berurutan produksi ≈ 3–4 req/dtk).

## 2. Faktur Penjualan 1 baris — satu per satu (`save.do`) berurutan vs paralel (+pembatas)
| Paralel | Faktur/dtk | Latensi/permintaan rata-rata |
|---|---|---|
| 1 | 1,95 | 512 ms |
| 2 | 3,71 | 537 ms |
| 3 | 5,30 | 540 ms |
| 4 | 7,01 | 529 ms |
| 6 | 7,69 | 551 ms |
| 8 | 8,23 | 541 ms |
**Kesimpulan:** Accurate melayani tulis paralel HAMPIR LINEAR (latensi per permintaan tidak naik), tanpa satu galat. Di atas paralel 4 kurva dipotong oleh pembatas Facport 8 req/dtk (8,23 ≈ batas).

## 3. `bulk-save.do` (banyak faktur dalam SATU permintaan) — `POST sales-invoice/bulk-save.do`
- **Bentuk yang benar:** `{"data":[ {…faktur 1…}, {…faktur 2…} ]}`. Array telanjang ditolak ("parameter diawali prefix data[n].…"). Respons: `{s:true, d:[ {s, d:"Faktur … berhasil disimpan", r:{…rekaman penuh…}}, … ]}` — **hasil PER FAKTUR** (`s` per item, `r.id`, `r.detailItem[].id` tersedia).
- **Berurutan (1 permintaan = N faktur, 1 baris/faktur):**
| N per permintaan | Waktu | Faktur/dtk | ms/faktur |
|---|---|---|---|
| 1 | 0,59 s | 1,70 | 589 |
| 5 | 2,35 s | 2,13 | 469 |
| 10 | 4,50 s | 2,22 | 450 |
| 20 | 7,99 s | 2,50 | 399 |
| 50 | 20,98 s | 2,38 | 420 |
| 100 | 39,46 s | 2,53 | 395 |
**Temuan 1: bulk TIDAK mempercepat pemrosesan di dalam Accurate** (≈ 400 ms/faktur, hanya ±20–30% lebih baik dari `save.do` satu-satu; selisih = sekadar hemat bolak-balik jaringan). Accurate memproses faktur dalam satu permintaan bulk SECARA BERURUTAN.
- **Paralel bulk (+pembatas), ukuran bulk 10:**
| Paralel | Faktur/dtk | Req/dtk |
|---|---|---|
| 2 | 4,55 | — |
| 4 | 8,75 | — |
| 6 | 11,62 | 1,16 |
| 8 | 16,03 | 1,60 |
**Temuan 2: bulk + paralel melampaui batas "8 req/dtk"** karena satu permintaan membawa banyak faktur (16 faktur/dtk hanya 1,6 req/dtk). Penghambat sebenarnya bergeser ke "8 proses paralel per token".

## 4. Langit-langit & apakah Accurate benar-benar menegakkan batas (MENTAH, tanpa pembatas Facport)
| Mode | Paralel | Faktur/dtk | Req/dtk | Galat |
|---|---|---|---|---|
| single MENTAH | 8 | 12,95 | 12,95 | 0 |
| single MENTAH | 12 | 16,20 | 16,20 | 0 |
| bulk10 MENTAH | 8 | 15,98 | 1,60 | 0 |
| bulk10 MENTAH | 12 | 14,32 | 1,43 | 0 |
**Temuan 3:** dalam rentang beberapa detik, Accurate TIDAK menolak >8 req/dtk maupun 12 paralel (0 galat dari 801 faktur). ⚠️ Jangan menyimpulkan batas tidak berlaku: pesan "melebihi toleransi (8 paralel/8 req/dtk per Token)" pernah muncul di produksi; penegakan mungkin bergantung durasi/beban/DB. Pembatas Facport TETAP dipertahankan sampai ada uji durasi panjang.
**Temuan 4:** bulk paralel 12 LEBIH LAMBAT dari paralel 8 (latensi per bulk naik 4,7 → 6,0 dtk) → jenuh sekitar 8 paralel. **Langit-langit praktis di DB ini ≈ 16 faktur/dtk (1 baris/faktur) — ±8× lipat import berurutan sekarang (1,95/dtk).**

## 5. Galat PARSIAL di dalam bulk (6 faktur: idx1 pelanggan tidak ada, idx3 nomor duplikat, idx4 barang tidak ada)
Hasil: `top s=false`, `d.length=6`; **tiap item punya hasil sendiri, URUTAN SAMA dengan urutan kirim**: idx0 sukses (id), idx1 gagal ("Pelanggan … tidak ditemukan"), idx2 sukses, idx3 gagal ("Sudah ada data lain dengan …" — duplikat nomor), idx4 gagal ("Barang & Jasa … tidak ditemukan"), idx5 sukses.
**Temuan 5:** bulk BUKAN semua-atau-tidak-sama-sekali; faktur yang valid tetap tersimpan, yang salah ditolak dengan pesan SAMA seperti `save.do` tunggal. **Jangan membaca `s` tingkat atas sebagai "sukses"** (bernilai `false` bila ada satu saja yang gagal) — baca `d[i].s` per item. Galat duplikat per item dapat dikenali memakai `isDuplicateNumberError` yang sudah ada.

## 6. Biaya per dokumen & per baris — Faktur Penjualan (`save.do`, berurutan, barang jasa)
| Baris/faktur | ms/faktur | ms/baris |
|---|---|---|
| 1 | 481 | 481 |
| 5 | 574 | 115 |
| 10 | 770 | 77 |
| 25 | 965 | 39 |
| 50 | 1.591 | 32 |
| 100 | 2.284 | 23 |
| 200 | 4.895 | 24 |
**Temuan 6:** biaya ≈ **±450–480 ms TETAP per dokumen + ±20 ms per baris**, LINEAR sampai 200 baris (tidak kuadratik di rentang ini, beda dengan Sales Receipt ber-ratusan baris di `architecture-import-capacity.md` § 14). Untuk dokumen kecil, biaya tetap per dokumen yang mendominasi → inilah sumber "batch kecil terasa lambat per baris" (biaya tetap itu milik Accurate, bukan Facport).

## 7. Dokumen besar secara paralel (+pembatas)
| Baris/faktur | Paralel | Faktur/dtk | Baris/dtk |
|---|---|---|---|
| 25 | 1 | 1,01 | 25 |
| 25 | 4 | 3,82 | 96 |
| 25 | 8 | 6,91 | 173 |
| 100 | 1 | 0,37 | 37 |
| 100 | 4 | 1,40 | 140 |
| 100 | 8 | 2,37 | 237 |
**Temuan 7:** dokumen besar juga skala paralel hampir linear (paralel 8 ≈ 6,4–6,9× paralel 1), latensi per dokumen naik hanya ±10–40% (mis. 100 baris: 2,3 s → 2,0–3,3 s). Tanpa galat. Paralelisme melintasi FAKTUR berbeda (grup berbeda), tidak mengubah isi/bentuk dokumen mana pun.

## 8. Barang PERSEDIAAN: kontensi barang sama vs beda (Faktur Penjualan 1 baris, +pembatas)
| Skenario | Paralel | Faktur/dtk | Latensi rata-rata |
|---|---|---|---|
| barang jasa sama | 1 | 2,05 | 487 ms |
| barang jasa sama | 8 | 7,87 | 566 ms |
| persediaan, barang SAMA | 1 | 1,74 | 575 ms |
| persediaan, barang SAMA | 8 | 7,94 | 607 ms |
| persediaan, 8 barang BEDA | 8 | 8,01 | 588 ms |
**Temuan 8:** 32 faktur paralel yang memakai barang persediaan YANG SAMA tidak lebih lambat dari barang berbeda (7,94 vs 8,01 faktur/dtk) dan tanpa galat → tidak ada antrean kunci stok yang terukur. Persediaan hanya ±18% lebih lambat per faktur dibanding barang jasa (575 vs 487 ms). ⚠️ **Batas uji:** stok awal GAGAL dibuat (Faktur Pembelian memakai `billNumber`, bukan `number`: galat "No Faktur # harus diisi") sehingga stok barang 0/negatif — Accurate tetap menerima faktur. Ulangi dengan stok nyata + HPP bila perlu.

## 9. Biaya pencarian data master (GET, +pembatas, 10 ulangan)
| Panggilan | Rata-rata | p90 |
|---|---|---|
| `item/detail.do?no=` (ADA) | 94 ms | 224 |
| `item/detail.do?no=` (TIDAK ADA) | 59 ms | 79 |
| `customer/detail.do?customerNo=` (ADA) | 92 ms | 194 |
| `item/list.do` 1 baris | 54 ms | 57 |
| `item/list.do` **100 baris** | **58 ms** | 65 |
| `item/list.do` 100 baris + filter `no` | 63 ms | 110 |
**Temuan 9:** mengambil 100 barang sekaligus (58 ms) HAMPIR SAMA mahalnya dengan mengambil 1 (54 ms). Satu panggilan `list.do` 100 baris ≈ biaya 1 pencarian per-baris tetapi menggantikan sampai 100 pencarian. Peluang: **ambil data master per halaman (prefetch) / cache per batch** alih-alih cek cari-atau-buat per baris. Biaya satu pencarian (±60–95 ms) jauh di bawah satu tulis dokumen (±480 ms), jadi pencarian per baris baru terasa bila sebuah baris memicu beberapa pencarian (lihat hitungan permintaan per baris, § 11).

## 10. Pembuatan data master (pelanggan) — berurutan, paralel, balapan duplikat
- `customer/save.do` berurutan: **174 ms/pelanggan** (jauh lebih murah dari faktur ±480 ms); `item/save.do` (persediaan): 212 ms.
- Paralel 8 (24 pelanggan): **7,98 pelanggan/dtk** (dibatasi pembatas Facport 8 req/dtk).
- **Balapan:** 8 pembuat pelanggan DENGAN NOMOR SAMA serentak → **1 sukses, 7 gagal** "Sudah ada data lain dengan ID Pelanggan …". Accurate sendiri menjamin keunikan (tidak ada duplikat); `runExclusive` di Facport hanya menghindari 7 percobaan gagal yang sia-sia.
- Pembersihan: faktur penjualan 120/120, pelanggan 33/33, barang 7/8 dihapus (1 barang persediaan tersisa), pemasok `BENCH-V1` tersisa.

## 11. Jumlah permintaan Accurate per faktur di kode Facport (pembacaan kode, Sales Invoice — `processSalesInvoiceGroup`, `workers/index.ts:1127`)
Per FAKTUR (grup) tanpa perluasan dokumen sumber: `findOrCreateCustomer` (1 pencarian) + `findOrCreateItem` untuk TIAP kode barang berbeda dalam faktur itu (1 pencarian per barang; **tidak ada cache lintas faktur** — `lib/accurate-item.ts:36`, kunci `runExclusive` hanya mencegah balapan, bukan menyimpan hasil) + `ensureDataClassifications` (0 bila tak ada kolom klasifikasi) + 1 `save.do`. Jadi **k + 2 permintaan per faktur** dengan k barang berbeda; barang/pelanggan yang SAMA dicari ulang di setiap faktur.
Perkiraan waktu per faktur (k = 3, angka § 6/§ 9): 1 pelanggan (±90 ms) + 3 barang (±75 ms) + save 3 baris (±540 ms) ≈ **±850 ms, ±35% di antaranya hanya pencarian yang berulang**.
**Implikasi 1 (kecepatan berurutan):** cache hasil POSITIF "barang/pelanggan sudah ada" per batch (aman: barang yang ada tetap ada dalam satu batch; bila terhapus di tengah jalan, `save.do` menolak dengan galat jelas) memotong ±30–35% waktu per faktur tanpa mengubah dokumen apa pun.
**Implikasi 2 (paralel):** bila batas efektif memang 8 req/dtk, kapasitas paralel dibatasi `8 ÷ (k+2)` faktur/dtk (k=3 → 1,6 faktur/dtk) — jauh di bawah 8 faktur/dtk yang terukur di § 2 (itu dengan 1 permintaan per faktur). **Mengurangi permintaan per faktur adalah syarat agar paralelisme berguna** selama batas 8 req/dtk dipatuhi.

## 12. Apakah Accurate benar-benar menegakkan "8 req/dtk & 8 paralel per token"? (beban BERKELANJUTAN, GET `item/list.do` 1 baris, TANPA pembatas Facport)
| Paralel | Durasi | Permintaan | Req/dtk | Latensi rata-rata | Galat "melebihi toleransi" (HTTP 429) | Galat lain |
|---|---|---|---|---|---|---|
| 4 | 20 s | 1.234 | 61,6 | 65 ms | 1 (0,08%) | — |
| 8 | 40 s | 5.134 | 128,2 | 62 ms | 24 (0,47%) | — |
| 12 | 40 s | 7.382 | 184,3 | 65 ms | 84 (1,14%) | — |
| 16 | 30 s | 6.934 | 230,6 | 69 ms | 81 (1,17%) | HTTP 503 × 7 |
**Temuan 10:** batas ADA (429 nyata dengan pesan resmi "Jumlah request API melebihi toleransi…") tetapi penegakannya JAUH lebih longgar daripada "8 req/dtk": bacaan ringan 8–30× angka itu diterima ±99% dan latensi tidak naik. Galat muncul sporadis (bukan ambang tegas); pada paralel 16 mulai ada 503. Retry-backoff yang sudah ada (§ `accurate-rate-limiter.ts`, 4× sampai ±22 dtk) akan menyerap 429 sporadis.
**⚠️ Batas uji & risiko (JANGAN dibaca sebagai izin melampaui batas resmi):** (a) hanya BACA ringan (65 ms); tulis jauh lebih berat dan bobotnya bagi Accurate belum tentu sama; (b) satu token uji, satu database trial, ±2,5 menit total; (c) angka resmi dari Accurate adalah 8 req/dtk & 8 paralel per token — melampauinya secara sengaja di produksi adalah KEPUTUSAN BISNIS/risiko (kebijakan API Accurate, kemungkinan pembatasan token) yang harus diputuskan user/FAC, bukan teknis semata; (d) pembatas Facport TIDAK diubah. Pengujian di atas dilakukan hanya pada token & database uji milik pengembang.

## 13. Cache pencarian positif per sesi — HASIL NYATA (Fase 215; fungsi produksi `findOrCreateCustomer`/`findOrCreateItem` + `saveSalesInvoice`, DB facport; faktur = 1 pelanggan + 3 barang berbeda + save)
| Skenario | Cache | Faktur/dtk | Permintaan/faktur |
|---|---|---|---|
| berurutan (20 faktur) | MATI | 1,17 | 5,00 |
| berurutan | HIDUP | **1,75** (+50%) | **1,20** |
| berurutan, ulangan | MATI / HIDUP | 1,19 / 1,60 | 5,00 / 1,20 |
| paralel 4 (40 faktur) | MATI | 1,59 | 5,00 |
| paralel 4 | HIDUP | **6,13** (3,9×) | 1,10 |
| paralel 8 (48 faktur) | MATI | 1,59 | 5,00 |
| paralel 8 | HIDUP | **6,94** (4,4×) | 1,08 |
**Temuan 11:** (a) cache menurunkan permintaan per faktur 5,0 → ±1,1–1,2 dan mempercepat berurutan ±33–50%; (b) **TANPA cache, paralel tidak menolong**: paralel 4 dan 8 sama-sama mentok 1,59 faktur/dtk = tepat batas pembatas 8 req/dtk ÷ 5 permintaan/faktur (prediksi § 11 terbukti); (c) dengan cache paralel baru bekerja: dari 1,17 (berurutan, tanpa cache) ke 6,94 faktur/dtk (paralel 8 + cache) ≈ **5,9×**, tetap di bawah batas resmi 8 req/dtk. Tes unit (10) menjaga: hasil "tidak ketemu" tidak dicache, sesi berbeda tidak berbagi cache, update akun piutang/hutang tetap dikirim bila nilai berbeda, 5 grup paralel dengan barang sama → 1 pencarian, `ACCURATE_LOOKUP_CACHE=0` mematikan.
Batas uji: barang NON_INVENTORY/jasa, 3 barang per faktur (faktur dengan lebih banyak barang berbeda diuntungkan lebih besar), satu mesin dev; cache baru diterapkan pada pelanggan/vendor/barang (BELUM pada klasifikasi data, PIC Work Order, pencarian dokumen sumber, dst — lihat `findOrCreate*` lain).

## 14. UJI UJUNG-KE-UJUNG lewat WORKER ASLI (2026-11-06): Excel → batch → pg-boss → worker → Accurate "facport"
Metode: file Excel 100 faktur × 3 baris (300 baris; 6 pelanggan bergilir, 3 barang, gudang "Utama") diparse `parseExcelBuffer`, dimasukkan sebagai batch + baris persis seperti route (`upload` + `confirm`, tanpa sesi login: skrip menulis langkah DB yang sama), diantre `enqueueAccurateJob(IMPORT_TO_ACCURATE)`, lalu diproses worker Facport ASLI (proses `src/workers/index.ts` dinyalakan ulang per konfigurasi dengan env berbeda). Waktu = `pgboss.job` (`completed_on - started_on`). Faktur uji dihapus di Accurate & DB dev setelah tiap uji.
| Konfigurasi | Waktu job | Faktur/dtk | Baris/dtk | vs sekarang |
|---|---|---|---|---|
| cache MATI, paralel 1 (= produksi sekarang) | 89,0 s | 1,12 | 3,37 | 1,0× |
| cache HIDUP, paralel 1 | 60,2 s | 1,66 | 4,98 | 1,5× |
| cache HIDUP, paralel 2 | 31,7 s | 3,15 | 9,46 | 2,8× |
| cache HIDUP, paralel 3 | 21,3 s | 4,69 | 14,08 | 4,2× |
| cache HIDUP, paralel 4 | 16,9 s | 5,92 | 17,75 | 5,3× |
| cache HIDUP, paralel 6 | 14,7 s | 6,80 | 20,41 | **6,1×** |
| cache MATI, paralel 4 | 63,5 s | 1,57 | 4,72 | 1,4× |
**Hasil:** 7 dari 7 batch: 300/300 baris sukses, 100/100 faktur, `retry=0`, tanpa satu galat (termasuk paralel 6).
**Temuan 12:** (a) uji ujung-ke-ujung MENGONFIRMASI hasil skrip § 13 (cache saja ±+48% di sini; skrip: +50%); (b) **tanpa cache paralel hampir tidak menolong** (paralel 4: 1,57 ≈ batas 8 req/dtk ÷ 5 permintaan/faktur = 1,6), **dengan cache paralel menskala** (1,66 → 3,15 → 4,69 → 5,92); (c) **hasil menurun di atas paralel 4** (paralel 6 hanya +15% dari paralel 4): 6,80 faktur/dtk ≈ 93% dari langit-langit `8 req/dtk ÷ ±1,1 permintaan/faktur` = ±7,3 faktur/dtk → penghambatnya kini pembatas 8 req/dtk (batas resmi), bukan Accurate maupun kode kita; (d) total: 89 s → 14,7 s = **6,1× lebih cepat** untuk 300 baris, semua tetap di bawah batas resmi Accurate.
**Cara menembus langit-langit berikutnya (belum dikerjakan):** kurangi permintaan per faktur lebih jauh (sisa ±1,1 = 1 save + pencarian pelanggan baru), atau kirim banyak faktur per permintaan lewat `bulk-save.do` (§ 3: 1 permintaan membawa N faktur → langit-langit permintaan tidak lagi mengikat; hasil per item berurutan; kompleksitas pemulihan/adopsi per faktur perlu dirancang), atau (keputusan bisnis, § 12) memperlonggar batas.
**Batas uji:** barang jasa/NON_INVENTORY, 3 baris/faktur, satu koneksi/DB trial, mesin dev (latensi VPS bisa beda), `IMPORT_WORKER_CONCURRENCY` default (2): beberapa pelanggan serentak di produksi berbagi CPU/memori worker (384 MB) — memori & CPU di paralel tinggi BELUM diukur.

## 15. CPU & MEMORI worker, banyak akun serentak (server Accurate PALSU lokal, 2026-11-06)
**Pertanyaan:** satu akun sudah bisa dimaksimalkan (§ 14: paralel per akun naik sampai ≈ 7 faktur/dtk, batas resmi 8 req/dtk berlaku PER TOKEN = per akun). Berapa banyak akun yang dapat berjalan serentak sebelum CPU/memori satu proses worker menjadi penghambat?
**Metode:** server Accurate palsu (`Bun.serve`, baca 60 ms, tulis 450 ms + 20 ms/baris, mencatat in-flight per token) + N "akun" palsu di DB dev (koneksi/Data Usaha/langganan berawalan `ZZ-STUB`, token palsu) + worker ASLI dengan `bun --preload` (mengarahkan `open-db.do` ke stub, MEMBLOKIR semua panggilan lain ke `accurate.id`, mencatat CPU/RSS/lag event-loop dari DALAM proses tiap 500 ms). Statistik hanya jendela aktif (8 dtk pertama = start worker dikecualikan). Tiap akun = 1 batch Sales Invoice; `IMPORT_WORKER_CONCURRENCY` = jumlah akun.
**A. Baris 7 kolom, 100 faktur × 3 baris (300 baris) per akun:**
| Akun | Paralel/akun | Faktur/dtk per akun | Total faktur/dtk | CPU rata/puncak (1 core) | RSS puncak | Lag loop maks | In-flight maks per token |
|---|---|---|---|---|---|---|---|
| 1 | 1 | 1,88 | 1,88 | 8% / 26% | 169 MB | 7 ms | 1 |
| 1 | 4 | 6,62 | 6,62 | 13% / 30% | 173 MB | 5 ms | 4 |
| 1 | 6 | 7,09 | 7,09 | 15% / 28% | 174 MB | 6 ms | 6 |
| 2 | 4 | 6,61 | 13,2 | 16% / 34% | 186 MB | 6 ms | 4 |
| 4 | 4 | 6,59 | 26,4 | 20% / 39% | 194 MB | 9 ms | 4 |
| 8 | 4 | 6,56 | 52,5 | 23% / 36% | 204 MB | 7 ms | 4 |
| 8 | 6 | 7,03 | 56,2 | 25% / 42% | 213 MB | 4 ms | 6 |
**B. Baris LEBAR (67 kolom, meniru file klien), 400 faktur × 3 baris (1.200 baris) per akun:**
| Akun | Paralel/akun | Faktur/dtk per akun | Total faktur/dtk | Baris di memori | CPU rata/puncak | RSS puncak | Lag loop maks |
|---|---|---|---|---|---|---|---|
| 1 | 4 | 7,36 | 7,36 | 1.200 | 12% / 34% | **205 MB** | 6 ms |
| 8 | 4 | 7,29 | 58,3 | 9.600 | 31% / 91% | **383 MB** | 78 ms |
| 8 | 6 | 7,66 | 61,3 | 9.600 | 27% / 94% | **409 MB** | 34 ms |
Semua batch: 100% baris sukses, tanpa galat.
**Temuan 13:**
(a) **Skala banyak akun hampir sempurna:** tiap akun mempertahankan kecepatannya (≈ 6,6–7,7 faktur/dtk) walau 8 akun serentak; total naik lurus (7 → 58 faktur/dtk). Batas 8 req/dtk adalah PER AKUN — akun berbeda tidak saling mengurangi.
(b) **CPU BUKAN penghambat:** rata-rata ≤ 31% dari satu core; lonjakan 91–94% hanya singkat (saat memuat/menormalkan ribuan baris), lag event-loop ≤ 78 ms.
(c) **MEMORI adalah batas nyata.** RSS dasar ±158 MB; tumbuh menurut JUMLAH BARIS yang sedang dimuat (job memuat seluruh baris batch ke memori) dan LEBAR baris: ±40 KB/baris lebar pada 1 akun, ±23 KB/baris pada 8 akun. 9.600 baris lebar serentak → **383–409 MB, MELEWATI `mem_limit: 384m` worker produksi** (di uji lokal tanpa batas; di Docker proses itu akan di-OOM-kill).
(d) **Paralel per akun nyaris tidak menambah memori** (8 akun: paralel 4 → 6 = +26 MB) → menaikkan `IMPORT_GROUP_PARALLELISM` aman dari sisi memori. Yang menaikkan memori adalah banyak baris/akun serentak (`IMPORT_WORKER_CONCURRENCY`, jalur besar), bukan paralel.
(e) Server palsu membuktikan in-flight per token tidak pernah melebihi paralel yang diatur (4/6) — jauh di bawah 8 paralel resmi.
**Batas uji:** Accurate PALSU (respons kecil; respons asli `save.do` jauh lebih besar → parse JSON sedikit lebih berat, perkiraan tetap kecil dibanding 450 ms), satu mesin dev, baris dummy (isi seragam), pembatas 8 req/dtk tidak ditegakkan oleh stub (ditegakkan oleh pembatas Facport). Produksi default: `IMPORT_WORKER_CONCURRENCY=2` + jalur besar 2 → paling banyak 4 job serentak, jauh dari skenario 8 akun × 1.200 baris.
**Implikasi:** (1) `IMPORT_GROUP_PARALLELISM` 3–4 aman untuk CPU dan memori; (2) jangan menaikkan `IMPORT_WORKER_CONCURRENCY` di atas default tanpa menaikkan `mem_limit` worker ATAU mengurangi memori per baris; (3) peluang optimasi: jangan memuat seluruh baris batch ke memori sekaligus (proses per potongan) dan/atau buang kolom yang tidak dipakai dari `rawData` di memori — membuka ruang untuk lebih banyak akun serentak tanpa menambah RAM.

## 16. Mengurangi memori per baris (Fase 215, 2026-11-06)
**Akar (dari kode `workers/index.ts` handler import):** (1) `db.select().from(importBatchRows)` memuat SEMUA baris batch sekaligus dengan SELURUH kolom Excel (67 kolom pada file lebar); (2) tiap baris disalin DUA kali (`cleanRawData`, lalu `normalizeKeyColumns`); (3) di akhir job seluruh baris dimuat ULANG lengkap dengan data mentah hanya untuk membaca `id` dan `status`. Seluruh kode impor membaca baris hanya lewat `columnMapping` (diverifikasi: tidak ada akses literal ke kolom lain; semua akses dinamis memakai kolom hasil `columnMapping`; satu-satunya iterasi semua kolom adalah `cleanRawData` itu sendiri).
**Perubahan (hasil pada kolom yang dipetakan IDENTIK, dokumen yang dikirim tidak berubah):** `makeRowPreparer` (`input-hygiene.ts`): bersihkan + normalkan kolom kunci, HANYA untuk kolom yang dipetakan, satu salinan; pemetaan kosong → perilaku lama. `loadProcessableRows` (`import-rows-loader.ts`): muat per halaman (keyset `row_number`, 50 baris/halaman) dan siapkan tiap baris langsung. `finalRows` hanya memuat `id` & `status`. Tes: 10 tes baru (kesetaraan dengan pipeline lama, kolom dibuang, nama kolom berkarakter tak terlihat, pemetaan kosong, paging lintas ukuran halaman 1/3/7/500).
**Hasil (worker asli + Accurate palsu, 8 akun × 1.200 baris lebar 67 kolom = 9.600 baris, paralel 4):**
| Versi | RSS puncak | Di atas dasar (±158 MB) | Faktur/dtk total |
|---|---|---|---|
| sebelum (muat semua, 2 salinan, muat ulang penuh) | **383 MB** | +225 MB | 58,3 |
| sesudah, halaman 500 | 285 MB | +127 MB | 58,4 |
| sesudah, halaman 100 | 263 MB | +105 MB | 58,3 |
| sesudah, halaman **50** (dipakai) | **223 MB** | **+65 MB** | 56,3* |
| sesudah, halaman 25 | 211 MB | +53 MB | 55,6* |
| sesudah, halaman 10 | 204 MB | +46 MB | 55,3* |
(paralel 6: 409 MB → 281 MB dengan halaman 500). *Selisih kecepatan ±2–4% ada dalam derau pengukuran (waktu job 54,3–56,3 s); tidak ada tren menurut ukuran halaman di bawah 100.
**Temuan 14:** puncak memori turun 383 → 223 MB (−42% total, **−71% di atas dasar**, +225 → +65 MB) tanpa mengubah kecepatan; heap JavaScript puncak hanya 49 MB — sisanya adalah lonjakan sesaat memori native (buffer driver DB) saat banyak job memuat baris bersamaan, sehingga halaman kecil yang menurunkannya. Titik belok di sekitar 25–50 baris/halaman (di bawahnya hasil menipis, kueri bertambah dan lonjakan CPU sesaat naik: 127% pada 10 baris). Regresi ke Accurate ASLI (100 faktur × 3 baris, paralel 4, cache hidup): 300/300 sukses, 16,9 s — identik dengan sebelum perubahan.
**Sisa/diketahui:** ada satu tempat lain dengan pola lama (`workers/index.ts` ±baris 1427, jalur modul lain) — belum diubah; modul selain Sales Invoice diverifikasi secara statis (akses lewat `columnMapping`) dan akan teruji nyata pada uji modul lain.

## 17. Modul Purchase Invoice (+ baris hanya-Beban, pola file client) — worker asli + Accurate asli (2026-11-06)
Metode: 100 faktur × (3 baris barang + 1 baris HANYA-Beban `Akun Beban 600001 / Jumlah Beban 5000`) = 400 baris, 6 vendor bergilir, Excel → batch → worker (`mod-run.ts`); jumlah permintaan per jalur dihitung dari DALAM worker (preload) dan dibagi jumlah faktur; faktur dihapus setelah tiap uji.
| Konfigurasi | Waktu job | Faktur/dtk | Baris/dtk | Permintaan/faktur | vs sekarang |
|---|---|---|---|---|---|
| cache MATI, paralel 1 (= produksi sekarang) | 85,5 s | 1,17 | 4,68 | **5,01** (item 3,00 + vendor 1,00 + save 1,00) | 1,0× |
| cache HIDUP, paralel 1 | 59,4 s | 1,68 | 6,73 | **1,10** (save 1,00 + vendor 0,06 + item 0,03) | 1,4× |
| cache HIDUP, paralel 2 | 29,9 s | 3,34 | 13,38 | 1,10 | 2,9× |
| cache HIDUP, paralel 4 | 16,4 s | 6,10 | 24,39 | 1,10 | 5,2× |
| cache HIDUP, paralel 6 | 14,7 s | 6,80 | 27,21 | 1,10 | **5,8×** |
Semua: 400/400 baris sukses (termasuk 100 baris hanya-Beban), 100/100 faktur, `retry=0`; worker CPU rata-rata ≤ 17% (puncak 36%), RSS puncak 158–184 MB.
**Temuan 15:** Purchase Invoice berperilaku SAMA dengan Sales Invoice: 5,0 → 1,1 permintaan/faktur dengan cache; paralel menskala sampai ±6,8 faktur/dtk (langit-langit batas 8 req/dtk ÷ 1,1); 85,5 s → 14,7 s (5,8×). Jalur baris hanya-Beban Fase 214 TERBUKTI di Accurate asli pada skala 100 faktur.
**Penutupan item terbuka Fase 214 (diuji di Accurate asli, DB facport):** (a) `detail.do?number=` mengembalikan `detailExpense[]` dengan `account.no` dan `expenseAmount` (+ banyak field lain) — parser `getPurchaseInvoiceByNumber` membacanya benar (akun 600001/5000 dan 600002/700, urutan terjaga); (b) faktur HANYA-Beban tanpa satu pun barang diterima Accurate dalam tiga bentuk: `detailItem: [{}]` (payload lama yang dipertahankan Fase 214), tanpa `detailItem`, dan `detailItem: []` — hasil `detailItem` selalu kosong (sesuai pemetaan "tidak dipetakan dari result" di Fase 214).

## 18. Modul Sales Receipt — worker asli + Accurate asli (2026-11-06)
Metode: faktur penjualan yang akan dibayar dibuat dulu lewat `bulk-save.do` (dihapus setelah uji); Excel → batch → worker. Dua pola: (1) 100 penerimaan × 3 faktur (dikelompokkan kolom "No. Sales Receipt", 300 baris); (2) 150 penerimaan, SATU BARIS = SATU PENERIMAAN (pola import besar client di produksi). Akun bank 110102, cabang Kantor Pusat, 6 pelanggan bergilir.
| Pola | Paralel | Waktu job | Penerimaan/dtk | Baris/dtk | Permintaan/penerimaan | vs paralel 1 |
|---|---|---|---|---|---|---|
| 3 faktur/penerimaan | 1 | 52,2 s | 1,92 | 5,75 | 1,01 | 1,0× |
| 3 faktur/penerimaan | 2 | 26,6 s | 3,76 | 11,28 | 1,01 | 2,0× |
| 3 faktur/penerimaan | 4 | 14,3 s | 6,99 | 20,98 | 1,01 | 3,7× |
| 3 faktur/penerimaan | 6 | 13,7 s | 7,30 | 21,90 | 1,01 | 3,8× |
| 1 baris/penerimaan | 1 | 55,3 s | **2,71** | 2,71 | 1,01 | 1,0× |
| 1 baris/penerimaan | 4 | 19,9 s | **7,54** | 7,54 | 1,01 | 2,8× |
| 1 baris/penerimaan | 6 | 20,0 s | 7,50 | 7,50 | 1,01 | 2,8× |
Semua: 100% baris sukses, `retry=0`, CPU rata-rata ≤ 16%, RSS ≤ 183 MB; faktur persiapan & penerimaan dihapus semua.
**Temuan 16:** (a) Sales Receipt TIDAK punya pencarian per baris: hanya ±1,01 permintaan/penerimaan (cuma `save`), jadi cache pencarian tidak berpengaruh — seluruh percepatan datang dari paralel; (b) paralel 1 untuk pola 1 baris = penerimaan menghasilkan **2,71 baris/dtk, persis angka produksi yang terukur** (`architecture-import-capacity.md` F4 ±2,7) → uji ini mereproduksi perilaku produksi; (c) paralel 4 mencapai **7,54 baris/dtk ≈ 95% dari batas resmi 8 req/dtk ÷ 1,01** — untuk modul per-baris batas per-akun "8 baris/dtk" praktis sudah tercapai pada paralel 4; paralel 6 tidak menambah (langit-langit batas resmi); (d) menembus lebih jauh untuk modul per-baris hanya mungkin dengan mengirim banyak dokumen per permintaan (`bulk-save.do`, § 3) atau memperlonggar batas (keputusan bisnis, § 12).

## 19. Modul Purchase Payment — worker asli + Accurate asli (2026-11-06)
Metode sama dengan § 18 (faktur pembelian persiapan dibuat lewat `bulk-save.do`, dihapus setelah uji): 100 pembayaran × 3 faktur (kolom "Purchase Payment No") dan 150 pembayaran satu-baris-satu-dokumen; vendor `BENCH-V1..6` bergilir.
| Pola | Paralel | Waktu job | Pembayaran/dtk | Baris/dtk | Permintaan/pembayaran | vs paralel 1 |
|---|---|---|---|---|---|---|
| 3 faktur/pembayaran | 1 | 48,6 s | 2,06 | 6,17 | 1,01 | 1,0× |
| 3 faktur/pembayaran | 2 | 25,6 s | 3,91 | 11,72 | 1,01 | 1,9× |
| 3 faktur/pembayaran | 4 | 14,4 s | 6,94 | 20,83 | 1,01 | 3,4× |
| 3 faktur/pembayaran | 6 | 13,9 s | 7,19 | 21,58 | 1,01 | 3,5× |
| 1 baris/pembayaran | 1 | 63,9 s | 2,35 | 2,35 | 1,01 | 1,0× |
| 1 baris/pembayaran | 4 | 21,1 s | 7,11 | 7,11 | 1,01 | 3,0× |
| 1 baris/pembayaran | 6 | 19,7 s | 7,61 | 7,61 | 1,01 | 3,2× |
Semua: 100% baris sukses, `retry=0`, CPU ≤ 14%, RSS ≤ 182 MB; data uji dihapus semua.
**Temuan 17:** Purchase Payment berperilaku SAMA dengan Sales Receipt: ±1,01 permintaan/dokumen (hanya `save`), tanpa pencarian per baris (cache tidak berpengaruh), seluruh percepatan dari paralel, mentok di langit-langit batas resmi 8 req/dtk ÷ 1,01 ≈ 7,9 (paralel 4 sudah 7,1–7,0, paralel 6 7,2–7,6).

## 20. RINGKASAN lintas modul (satu akun, 100–150 dokumen, worker asli, Accurate asli; "sekarang" = cache mati, paralel 1)
| Modul / pola | Sekarang | Terbaik terukur | Konfigurasi terbaik | Percepatan |
|---|---|---|---|---|
| Sales Invoice (3 baris/faktur) | 1,12 faktur/dtk (3,37 baris/dtk) | 6,80 faktur/dtk (20,4 baris/dtk) | cache + paralel 6 | **6,1×** |
| Purchase Invoice (3 baris + Beban) | 1,17 faktur/dtk (4,68 baris/dtk) | 6,80 faktur/dtk (27,2 baris/dtk) | cache + paralel 6 | **5,8×** |
| Sales Receipt (3 faktur/penerimaan) | 1,92 /dtk (5,75 baris/dtk) | 7,30 /dtk (21,9 baris/dtk) | paralel 6 | 3,8× |
| Sales Receipt (1 baris = 1 dokumen) | 2,71 baris/dtk | 7,54 baris/dtk | paralel 4 | 2,8× |
| Purchase Payment (3 faktur/pembayaran) | 2,06 /dtk (6,17 baris/dtk) | 7,19 /dtk (21,6 baris/dtk) | paralel 6 | 3,5× |
| Purchase Payment (1 baris = 1 dokumen) | 2,35 baris/dtk | 7,61 baris/dtk | paralel 6 | 3,2× |
**Pola umum:** setelah cache, modul menjadi ±1,0–1,1 permintaan/dokumen sehingga satu akun mentok di batas resmi 8 req/dtk (≈ 7,0–7,6 dokumen/dtk); paralel 4 sudah memberi ±90% dari hasil terbaik, paralel 6 hanya +4–12%. **Rekomendasi `IMPORT_GROUP_PARALLELISM` = 4** (memori & CPU aman, § 15–16). Menembus langit-langit ini untuk modul per-baris butuh `bulk-save.do` (banyak dokumen per permintaan) atau keputusan bisnis soal batas (§ 12).

## 21. Urutan nomor otomatis & penjaga pengiriman paralel (Fase 215)
**Temuan 18 (Accurate asli, 30 faktur tanpa nomor):** paralel 1 → nomor otomatis (`SI.2026.11.00001…`) PERSIS mengikuti urutan baris; **paralel 4 → tidak**: 7 dari 30 pasangan terbalik, pergeseran maks 2 posisi (contoh urutan baris menurut nomor: 0,2,3,1,5,4,6,7,8,10,11,9,…). Sebab: dokumen DIMULAI berurutan tetapi SELESAI tidak berurutan, dan Accurate menomori menurut urutan TIBA. Bila kolom nomor diisi di Excel tidak ada dampak.
**Keputusan (user, 2026-11-06): pilihan "aman".** `lib/import-parallelism.ts` — `decideGroupParallelism` memilih CARA PENGIRIMAN sebelum batch diproses (isi/nomor dokumen tidak berubah): paralel (> 1) hanya bila (1) `IMPORT_GROUP_PARALLELISM` > 1, (2) modul termasuk daftar terbukti (default `sales_invoice, purchase_invoice, sales_receipt, purchase_payment`; ubah tanpa rilis lewat env `IMPORT_PARALLEL_MODULES`, `*` = semua), (3) kolom nomor dokumen (field berpath Accurate `number`: `number` / `receiptNumber` / `paymentNumber`) dipetakan, dan (4) SETIAP baris yang diproses punya nomor tidak kosong. Selain itu SELURUH batch berurutan (perilaku lama persis) + log `Import: paralel tidak dipakai untuk batch ini` dengan `reason`. Versi campuran (sebagian bernomor) sengaja TIDAK dibuat (lebih rumit & lebih berisiko). `Bill No` Purchase Invoice BUKAN nomor dokumen.
**Pembuktian di Accurate asli lewat worker asli (paralel dikonfigurasi 4):**
| Skenario | Hasil |
|---|---|
| Sales Invoice, kolom nomor dipetakan tapi KOSONG (40 baris) | berurutan (log "paralel tidak dipakai"), 1,74 dok/dtk; nomor `SI.2026.11.00101…00140` **mengikuti urutan baris Excel, 0 pasangan terbalik** |
| Sales Receipt satu-baris-satu-dokumen TANPA kolom nomor (30) | berurutan (log), 2,31 dok/dtk |
| Sales Receipt bernomor (40 penerimaan) | paralel, 6,06 dok/dtk (18,2 baris/dtk) |
| Purchase Invoice bernomor (40 faktur) | paralel, 4,88 dok/dtk (19,5 baris/dtk) |
Tes unit: 12 (`import-parallelism.test.ts`): mati→1; bernomor+modul terbukti→paralel; satu baris kosong/spasi/null/undefined→berurutan; nomor numerik 0 dianggap terisi; kolom nomor tak dipetakan→berurutan; modul belum terbukti→berurutan; Bill No bukan nomor; `all` tetap berurutan untuk modul tanpa field nomor dikenal; parsing env.
**Catatan jujur:** pola import besar client produksi (mis. Sales Receipt dengan "No Bukti" terisi) bernomor → paralel berlaku; file yang mengosongkan nomor tetap mendapat percepatan cache (SI/PI ≈ 1,4–1,5×) tetapi tidak paralel. Pergeseran nomor akibat paralel TIDAK mungkin lagi untuk batch tanpa nomor.

## 22. Retur Penjualan (modul paling lambat di produksi: ±0,8 baris/dtk) — worker asli + Accurate asli (2026-11-06)
**Akar (kode `processSalesReturnGroup` + `fillReturnPricesFromInvoice`):** bila Unit Price kosong (Return Type INVOICE), TIAP retur mengambil SELURUH isi faktur asal (`sales-invoice/detail.do?number=`, respons besar) lalu `save`; hasil pengambilan TIDAK dicache, sehingga retur yang merujuk faktur yang sama mengambilnya berulang → **2,0 permintaan/retur**. Pola yang sama di Retur Pembelian (`getPurchaseInvoiceLinesByNumber`).
**Perbaikan (Fase 215):** `cachedLookup` (`accurate-lookup-cache.ts`): hasil POSITIF pengambilan isi faktur asal dicache per sesi; panggilan SERENTAK dengan kunci sama menunggu satu pengambilan (`runExclusive`); galat tidak dicache; mati lewat `ACCURATE_LOOKUP_CACHE=0`. Dipakai pada Retur Penjualan & Retur Pembelian. Dokumen retur yang dikirim tidak berubah. 5 tes unit baru.
**Hasil (retur 2 baris, Unit Price kosong, 10 faktur asal berbagi atau 1 faktur per retur; "sekarang" = kode v2.49.0, paralel tidak dipakai karena modul belum dikenal penjaga):**
| Pola | Konfigurasi | Waktu | Retur/dtk | Permintaan/retur | vs sekarang |
|---|---|---|---|---|---|
| 80 retur berbagi 10 faktur | sekarang | 54,1 s | 1,48 | 2,01 | 1,0× |
| 80 retur berbagi 10 faktur | cache, paralel 1 | 49,1 s | 1,63 | **1,14** | 1,1× |
| 80 retur berbagi 10 faktur | cache, paralel 4 | **13,6 s** | **5,88** | 1,14 | **4,0×** |
| 80 retur diurutkan per faktur (retur serentak pada faktur SAMA) | cache, paralel 1 | 47,9 s | 1,67 | 1,14 | — |
| 80 retur diurutkan per faktur | cache, paralel 4 | **15,8 s** | **5,06** | 1,14 | 3,0× vs paralel 1 |
| 60 retur, tiap retur faktur sendiri | sekarang | 41,8 s | 1,44 | 2,02 | 1,0× |
| 60 retur, tiap retur faktur sendiri | cache, paralel 4 | 16,1 s | 3,73 | 2,02 | 2,6× |
Semua: 100% baris sukses (≥ 500 retur total), `retry=0`, CPU ≤ 12%, RSS ≤ 160 MB.
**Temuan 19:** (a) cache mengurangi permintaan 2,0 → 1,14/retur pada pola berbagi faktur; waktu berurutan hanya −9% di lab karena faktur uji kecil (detail ±60–90 ms vs save ±600 ms) — di produksi faktur asal besar membuat `detail.do` jauh lebih mahal, sehingga penghematan lebih besar (belum diukur); (b) paralel 4 menghasilkan **4,0×** pada pola berbagi faktur dan 2,6× pada pola faktur-sendiri (langit-langit 8 req/dtk ÷ 2,02 = 3,96/dtk, tercapai 94%); (c) **retur serentak pada faktur asal yang SAMA tidak bentrok** (80/80 sukses, paralel 4) — kekhawatiran awal (bentrok pada dokumen induk) tidak terjadi pada penyimpanan retur; (d) bentrok HANYA terlihat pada PENGHAPUSAN paralel retur pada faktur yang sama (pembersihan skrip uji: 73/80 dan 68/80 terhapus; sisa 19 retur & 13 faktur dibersihkan manual lewat `returnHistory` faktur) — tidak relevan bagi import, tetapi menunjukkan operasi PARALEL pada dokumen induk yang sama bisa bentrok (kandidat bila nanti ada fitur Hapus Massal/Batal Import paralel: serialkan per faktur). (e) `sales-return/list.do` mengembalikan respons kosong (tidak bisa dipakai untuk daftar); retur ditemukan lewat `returnHistory` pada `sales-invoice/detail.do`.
**Keputusan:** `sales_return` MASUK daftar default modul paralel (`DEFAULT_PARALLEL_MODULES`), tetap dijaga nomor-dokumen-eksplisit; `purchase_return` TIDAK (belum diuji paralel; cache faktur asalnya sudah aktif).

## 23. Daftar percobaan berikutnya (status)
- [x] Retur Penjualan via worker asli (§ 22): cache faktur asal + paralel 4 → 2,6–4,0×.
- [x] Penjaga nomor otomatis + daftar modul terbukti (§ 21), diuji di Accurate asli.
- [x] Purchase Payment via worker asli (§ 19) — modul uji utama selesai (SI, PI, SR, PP).
- [x] Sales Receipt via worker asli (§ 18): per-baris 2,71 → 7,54 baris/dtk.
- [x] Purchase Invoice via worker asli (§ 17), termasuk baris hanya-Beban dan penutupan item terbuka Fase 214.
- [x] Kurangi memori per baris (§ 16): 383 → 223 MB pada 9.600 baris lebar; paralel/akun nyaris tak menambah memori.
- [x] Uji ujung-ke-ujung via worker dengan paralel 1/2/3/4/6 + cache hidup/mati (§ 14).
- [x] Barang persediaan, kontensi (§ 8) — selesai, stok awal belum nyata (ulang dengan `billNumber`).
- [x] Biaya pencarian (§ 9), pembuatan data master & balapan (§ 10), bulk & galat parsial (§ 3, 5), biaya per baris (§ 6), dokumen besar paralel (§ 7).
- [x] Beban berkelanjutan: penegakan batas untuk BACA (§ 12).
- [x] Prototipe cache pencarian positif per batch + ukur di jalur Sales Invoice (§ 13, Fase 215).
- [ ] Penegakan batas untuk TULIS berkelanjutan (≥ 60 dtk) — di bawah batas resmi dulu (mis. paralel 4–8 lewat pembatas), lihat apakah ada 429 pada tulis.
- [ ] Cache untuk pencarian lain yang berulang per faktur (klasifikasi data, PIC Work Order, dokumen sumber SQ/SO/DO).
- [ ] Cek RAM VPS: bila longgar, naikkan `mem_limit` worker sebagai alternatif/tambahan.
- [ ] Uji `bulk-save.do` sebagai jalur kirim untuk modul per-baris (menembus langit-langit 8 req/dtk; perlu rancangan pemulihan per dokumen).
- [ ] Modul lain yang belum diuji via worker: Purchase Return, Sales Quotation/Order, Delivery Order, Purchase Order, Receive Item, Jurnal Umum, Other Payment/Deposit, Work Order, dst. (memakai `findOrCreate*` yang sama → cache berlaku; per-baris tanpa pencarian → paralel).
- [ ] Ulangi inti percobaan dari VPS produksi (latensi nyata).
