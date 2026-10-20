# Architecture — Pemecahan Dokumen Bernomor Sama & Kirim Ulang Idempoten

> Status: **RENCANA (Fase 205)** — belum ada kode. Keputusan arah: ADR-0051.
> Bukti dasar: `architecture-import-capacity.md` § 11–14.
> Prinsip: ambil **esensinya**, bukan satu kasus pelanggan. Masalah ini bisa menimpa pelanggan mana pun.

## 1. Masalah (esensi)
- Excel dengan 1 nomor dokumen + ribuan baris → Facport menggabung jadi 1 dokumen Accurate.
- Accurate memproses satu dokumen dengan waktu ∝ N² (rancangan Accurate). 4.000+ baris = puluhan menit sampai tidak selesai; timeout kita (adaptif) hanya memindahkan kegagalan.
- Dibangun bertahap ke satu dokumen (update + `id`) TERBUKTI tidak menolong (§ 14 capacity).
- Kegagalan di tengah (timeout/restart/deploy) meninggalkan keadaan tak pasti.

## 2. Dua tujuan
1. **Pecah**: satu nomor ribuan baris → banyak dokumen kecil, dikirim bertahap dari data tersimpan di Facport.
2. **Recall sampai sukses**: setiap bagian dikirim ulang secara aman (tanpa duplikat) sampai benar-benar tersimpan di Accurate atau jelas gagal karena data.

## 3. Aturan pemecahan
| Aspek | Rancangan (usulan) |
|---|---|
| Ambang pecah | dokumen > `IMPORT_SPLIT_THRESHOLD_ROWS` (usul 200) baris |
| Ukuran bagian | ≤ `IMPORT_SPLIT_PART_ROWS` (usul 100), dibagi **seimbang** (mis. 1.050 → 11 bagian ±96) |
| Nomor bagian | `NOMOR-01`, `NOMOR-02`, … (lebar = max(2, digit jumlah bagian)); wajib dicek panjang maks nomor Accurate |
| Kesatuan baris | baris yang menunjuk faktur/akun/entitas sama tidak boleh terbelah (Sales Receipt: semua baris faktur yang sama di satu bagian — pecah di batas faktur) |
| Header | diambil dari baris pertama dokumen (sama seperti sekarang); tiap bagian memuat header sama |
| Total per bagian | dihitung otomatis dari baris bagian itu; `chequeAmount` eksplisit hanya dipakai validasi konsistensi atas total keseluruhan |
| Deskripsi/catatan | bagian diberi penanda "Bagian i/n dari NOMOR" (persetujuan wajib — tampak di Accurate) |
| Dokumen ≤ ambang | jalur lama persis, tidak berubah |

## 4. Cakupan modul bertahap
1. **Sales Receipt** (pembuktian; sudah ada lookup-by-number & C2).
2. **Purchase Payment** (dokumen pembayaran, baris saling bebas).
3. Modul faktur/transaksi lain: hanya dengan persetujuan eksplisit per modul (memecah faktur mengubah catatan akuntansi — pajak, nomor faktur pajak, retur, dll. perlu analisis sendiri). Sebelum itu tetap memakai timeout adaptif + C2.
Saklar: `IMPORT_SPLIT_MODULES` (daftar modul, default kosong = mati).

## 5. Data & status (migrasi baru, `when` > 1791775064770)
Tabel `import_batch_parts`:
| Kolom | Arti |
|---|---|
| id, batch_id, group_key | identitas; group_key = nomor dokumen asli |
| part_no, part_total | urutan & jumlah bagian |
| document_number | nomor eksplisit bagian (unik per koneksi + modul) |
| row_ids (jsonb/array) | baris `import_rows` pembentuk bagian |
| status | `planned → sending → verifying → succeeded | failed_business | failed_exhausted | cancelled` |
| attempts, next_attempt_at, last_error | kendali retry |
| accurate_id | id dokumen di Accurate bila sukses |
| started_at, finished_at | metrik |
Indeks: (batch_id, status), (status, next_attempt_at). Status batch diturunkan dari bagian.
Penyimpanan baris: `import_rows` yang sudah ada tetap sumber; tabel bagian hanya merujuk.

## 6. Alur
1. **Upload & validasi** (tidak berubah). Pemetaan menghasilkan grup per nomor.
2. **Rencana**: grup > ambang → daftar bagian dibuat (status `planned`), batch masuk status `awaiting_plan_approval`. UI menampilkan: jumlah dokumen yang dipecah, jumlah bagian, perkiraan waktu (model § capacity), contoh nomor bagian, penjelasan "rancangan Accurate".
3. **Persetujuan** pengguna → job dienqueue lewat `enqueueAccurateJob` (satu pintu). Tanpa persetujuan: tidak ada kiriman.
4. **Eksekutor bagian** (per bagian, urut atau paralel terbatas antar bagian — Accurate menerima paralel antar dokumen; batas `IMPORT_GROUP_PARALLELISM` + pembatas per koneksi):
   - klaim bagian atomik (`UPDATE … WHERE status IN (planned, retry) … RETURNING`, mencegah dua pekerja sekaligus);
   - **cek dulu** `detail.do?number=<document_number>`: ada → tandai `succeeded` (ambil id), lanjut;
   - tidak ada → `save.do` dengan nomor eksplisit;
   - sukses → `succeeded`; galat bisnis (validasi Accurate) → `failed_business`, tidak diulang;
   - timeout/transport/5xx → status `verifying`: polling `detail.do?number=` (C2); ada → sukses; absen pasti → jadwalkan ulang dengan backoff (`attempts+1`, `next_attempt_at`); tak pasti → tetap jadwalkan verifikasi sebelum kirim ulang (tidak pernah kirim buta);
   - batas `IMPORT_PART_MAX_ATTEMPTS` (usul 6) lalu `failed_exhausted` dengan pesan jelas + tombol "Coba lagi".
5. **Penjadwal berantai**: satu job memproses sejumlah bagian lalu menjadwal ulang dirinya (bukan satu job panjang) → keadilan antar pelanggan, tahan deploy, job tidak melebihi expire. Worker start: bagian `sending/verifying` yang basi dikembalikan ke `planned` (bukan failed) — **adaptasi Fase 204** untuk batch ber-rencana.
6. **Penutupan**: semua bagian terminal → batch `completed` / `completed_with_errors`; tiap baris `import_rows` mewarisi hasil bagiannya (sukses + id Accurate / gagal + pesan).

## 7. Idempotensi — jaminan
- Nomor dokumen eksplisit + unik → Accurate menolak duplikat nomor; cek `detail.do?number=` sebelum tiap kirim.
- Klaim atomik di DB mencegah paralel ganda.
- Restart di titik mana pun: bagian dalam keadaan antara diperiksa ulang lewat nomor, tidak dikirim buta.
- **Batasan jujur**: dokumen tanpa nomor (auto-number) tidak bisa diverifikasi, tetapi dokumen yang dipecah selalu bernomor (baris tanpa nomor menjadi dokumen sendiri), jadi tidak terdampak.
- **Terkonfirmasi di trial (2026-10-21, baca-saja):** `detail.do?number=<tidak ada>` → HTTP 200, `{"s":false,"d":["<Jenis> tidak tepat"]}` untuk Sales Receipt ("Penerimaan Penjualan tidak tepat"), Purchase Payment ("Pembayaran Pembelian tidak tepat"), Sales Invoice. Nomor yang ada → `s:true` + detail (~0,2 dtk). Jadi "absen" dapat dibedakan pasti dari "ada"; galat lain (jaringan/5xx/otorisasi) tetap "tak pasti".

## 8. UI
- Halaman rencana (setuju/batal), progres per dokumen asli (n/N bagian, bagian gagal + alasan), tombol "Coba lagi bagian gagal", Batal Import (bagian `planned` → `cancelled`; yang sudah `succeeded` tetap dan dilaporkan).
- Ringkasan galat (`import-error-summary`) mendapat petunjuk untuk `failed_exhausted`.
- Teks penjelasan untuk pelanggan: "Accurate memproses satu dokumen besar secara kuadrat; Facport membaginya menjadi beberapa dokumen kecil bernomor berurutan agar cepat dan pasti."

## 9. Konfigurasi (env, default aman)
`IMPORT_SPLIT_MODULES` (kosong), `IMPORT_SPLIT_THRESHOLD_ROWS` 200, `IMPORT_SPLIT_PART_ROWS` 100, `IMPORT_PART_MAX_ATTEMPTS` 6, `IMPORT_PART_BACKOFF_BASE_MS` 30000, `IMPORT_PART_BATCH_PER_JOB`.

## 10. Estimasi (model trial N², produksi dapat berbeda ±)
8.000 baris = 80 bagian ×100 baris ≈ 7 dtk/bagian → ±10 menit sekuensial, jauh lebih cepat dengan paralel 4. Bandingkan ±5,7 jam sebagai satu dokumen.

## 11. Pengujian
- Unit: pemecah (seimbang, batas faktur, penomoran, panjang nomor), mesin status, backoff, klaim atomik.
- Integrasi (DB uji): kill di tiap titik status → lanjut tanpa duplikat; deploy-saat-jalan; Batal.
- Trial Accurate (2977590 saja, `trial:true`): 5.000 baris = 50 bagian; paksa timeout; matikan worker di tengah; verifikasi jumlah dokumen & total = Excel.
- Pembersihan DB uji sesuai aturan.

## 12. Keputusan (dikonfirmasi user 2026-10-21)
1. Ambang pecah 200 baris (ukuran bagian 100; keduanya env, dievaluasi ulang setelah tryout).
2. Penanda "Bagian i/n dari NOMOR" di deskripsi: disetujui. Format nomor `NOMOR-01`.
3. Persetujuan lewat popup sederhana + alasan dari rancangan Accurate (bahasa awam): wajib.
4. Cakupan awal: Sales Receipt + Purchase Payment; faktur belakangan.
5. Dokumen tanpa nomor: TIDAK relevan untuk pemecahan. Baris tanpa nomor menjadi dokumen sendiri (`groupSalesReceiptRows`), jadi dokumen ribuan baris pasti bernomor; nomor asli dipakai, tidak ada "nomor dasar". Dokumen tanpa nomor tetap jalur lama (tak bisa diverifikasi setelah timeout).
6. Paralel antar bagian: mulai sekuensial, coba paralel terbatas setelah terbukti.
7. Uji dulu di trial: perilaku `detail.do?number=` untuk nomor yang tidak ada (Sales Receipt) sebelum bergantung padanya.
