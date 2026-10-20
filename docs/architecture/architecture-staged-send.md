# Architecture — Kirim Bertahap ke Dokumen yang Sama & Kirim Ulang Idempoten

> Status: **RENCANA (Fase 205)** — belum ada kode. Keputusan: ADR-0051 (revisi).
> Bukti dasar: `architecture-import-capacity.md` § 11–14.

## 0. Aturan emas
**Dokumen pelanggan TIDAK BOLEH diubah oleh Facport.** Satu nomor Excel = satu dokumen Accurate; nomor, header, baris, urutan, jumlah — persis sesuai Excel. Kita hanya mengatur *cara kirim*. Setiap fitur di dokumen ini wajib lolos uji: *"hasil akhir di Accurate identik dengan Excel?"* (jumlah baris, nilai, total, nomor).

## 1. Masalah
Satu nomor dengan ribuan baris → Accurate memproses ∝ N² (rancangan Accurate). Kirim sekali = puluhan menit sampai gagal; yang gagal tidak tersimpan.

## 2. Pendekatan
Kirim dalam cicilan ke dokumen yang sama:
1. Cicilan 1: `save.do` buat dokumen (nomor asli, header asli, K baris pertama).
2. Cicilan 2..m: `save.do` dengan `id` dokumen, baris yang sudah ada ditulis `{id}` saja, ditambah K baris baru (terbukti di trial: mode "id-saja").
3. Akhir: dokumen berisi persis semua baris Excel.
Harga: tiap cicilan memproses ulang seluruh dokumen → total lebih lama daripada sekali kirim. Imbalan: tiap langkah punya batas waktu sendiri, progres tersimpan di Accurate, bisa dilanjutkan.

### Perkiraan waktu (model trial; produksi bisa berbeda)
| Baris | Cicilan 500 | Sekali kirim |
|---|---|---|
| 1.000 | ±10 mnt | ±5 mnt |
| 2.000 | ±45 mnt | ±21 mnt |
| 4.000 | ±6 jam | ±85 mnt |
Cicilan terakhir pada dokumen N baris ≈ 1,6·3,2·10⁻⁴·N² dtk (4.000 → ±2,3 jam). Timeout per langkah memakai timeout adaptif (Fase 197–199).

## 3. Kapan dipakai
| Aspek | Rancangan |
|---|---|
| Ambang | dokumen > `IMPORT_STAGED_THRESHOLD_ROWS` (usul 200, user setuju coba 200, env) |
| Ukuran cicilan | `IMPORT_STAGED_CHUNK_ROWS` (usul 500; dievaluasi ulang setelah tryout) |
| Baris dikelompokkan | baris yang tak boleh terbelah (mis. Sales Receipt: baris faktur yang sama digabung jadi satu entri `detailInvoice`) tidak dipisah antar cicilan |
| Dokumen ≤ ambang | jalur lama persis |
| Dokumen tanpa nomor | tidak relevan: baris tanpa nomor menjadi dokumen sendiri (`groupSalesReceiptRows`); dokumen besar pasti bernomor |
| Modul | `IMPORT_STAGED_MODULES` (default kosong = mati); awal: Sales Receipt, Purchase Payment |
| Batas | dokumen > ~2.000 baris: tetap dicoba dengan persetujuan + peringatan jujur "bisa berjam-jam" |

## 4. Hasil uji trial 205a (2026-10-21, database trial 2977590; terukur)
| # | Pertanyaan | Hasil |
|---|---|---|
| 1 | Update `{id}` + `id` dokumen tanpa mengulang header | Header (pelanggan, bank, deskripsi, tanggal) tetap utuh; 300 baris dibangun 3×100 → jumlah bayar & `chequeAmount` = harapan (345.150), urutan & `seq` identik dengan Excel |
| 2 | `chequeAmount` sementara per cicilan | DITERIMA (set = jumlah baris sampai cicilan itu; cicilan terakhir = total akhir) |
| 3 | Dua update bersamaan ke dokumen sama | Accurate menserialkan: satu sukses (71 dtk), satu ditolak ("Nilai Pembayaran tidak mencukupi…"); tidak ada baris hilang/ganda (350 baris, `optLock` naik). Tetap: klaim kita memastikan satu pekerja per dokumen |
| 4 | Klien memutus koneksi (timeout) saat update | **Accurate TETAP menyelesaikan update** (±100 dtk setelah diputus pada 350→400 baris). Selama diproses, pembacaan dokumen tetap cepat (±1 dtk) dan menampilkan keadaan LAMA (perubahan muncul sekaligus) → verifikasi = baca ulang berkala, TIDAK kirim ulang selama belum lewat batas |
| 5 | Purchase Payment | Perilaku sama persis (60+60 baris, total & urutan identik) |
| 6 | Nomor tak ada | `s:false` "…tidak tepat" (SR, PP, SI); ada → `s:true` |
Waktu update terukur: 100→200: 24 dtk; 200→300: 61 dtk (konsisten ±1,6·3,2·10⁻⁴·N²).

## 5. Keputusan desain (menggantikan draf awal): TANPA tabel baru
Sumber kebenaran kemajuan = **isi dokumen di Accurate** (dibaca by nomor), ditambah status `import_batch_rows` (baris yang sudah tersimpan ditandai `success` bertahap sehingga UI menampilkan progres tanpa perubahan skema). Alasan: tabel kemajuan lokal bisa menyimpang dari kenyataan (terutama setelah timeout — poin 4); membaca Accurate selalu benar. Tidak ada migrasi.

## 6. Alur (dalam handler impor yang ada)
1. Upload & validasi (tidak berubah) → grup per nomor.
2. **Persetujuan** di `confirm`: server menghitung rencana (grup dengan baris > ambang di modul bersaklar). Bila ada dan `approveStaged` belum true → `409 STAGED_APPROVAL_REQUIRED` + rencana; web menampilkan popup; setuju → confirm diulang dengan `approveStaged: true`. `retry` tidak meminta persetujuan ulang.
3. Worker, per grup > ambang (modul bersaklar): payload dibangun SEKALI seperti biasa (semua validasi/pajak tetap), lalu `runStagedSend`:
   a. baca dokumen by nomor. Tidak ada → buat dengan header lengkap + K entri pertama. Ada → isinya harus **awalan persis** dari entri Excel (faktur & jumlah sama, urutan sama) → lanjut dari situ; tidak cocok → gagal "nomor sudah dipakai dokumen lain dengan isi berbeda" (tidak menimpa).
   b. Cicilan: `save.do` `{id, chequeAmount sementara, detailInvoice: [{id}…lama, …K entri baru], detailTax: (id lama + pajak entri baru)}`. Cicilan terakhir memakai `chequeAmount` akhir asli.
   c. Sukses → baca ulang → tandai baris entri yang tersimpan `success` (id dokumen) → lanjut.
   d. Timeout/jaringan/5xx → **polling baca** sampai jumlah entri bertambah atau lewat batas (perkiraan durasi langkah × 2, min 5 mnt); bertambah → lanjut; tidak → kirim ulang (setelah backoff) hingga `IMPORT_STAGED_MAX_ATTEMPTS`; lalu gagal dengan pesan jelas (baris belum tersimpan = `failed`; Retry melanjutkan dari awalan yang sudah ada).
   e. Galat bisnis Accurate → gagal, tidak diulang; baris yang sudah tersimpan tetap `success`.
   f. Selesai: baca akhir dan cocokkan seluruh isi dengan Excel (jumlah entri & jumlah bayar); beda → baris dilaporkan gagal dengan penjelasan.
4. **Pemulihan restart/deploy:** pemulihan job hantu (Fase 204) untuk batch yang punya grup bertahap → job DIANTRIKAN ULANG otomatis (maks 5×, penghitung di data job), bukan digagalkan. Karena langkah 3a membaca kenyataan, melanjutkan aman.
5. **Waktu job:** `enqueueAccurateJob` memakai perkiraan waktu bertahap (bukan rumus linear) untuk expire.

## 7. Idempotensi — jaminan
- Tiap langkah dihitung dari isi dokumen di Accurate, bukan catatan lokal → restart/timeout/kirim ulang tidak membuat baris ganda.
- Satu pekerja per koneksi Accurate (group concurrency 1) + serialisasi Accurate (poin 3 uji).
- Verifikasi akhir (3f) menangkap penyimpangan apa pun.
- Dokumen yang sama dikirim ulang oleh Retry pengguna → awalan cocok → melanjutkan; sudah lengkap → baris ditandai `success` tanpa kirim.

## 8. UI
- **Popup persetujuan** (bahasa awam): "Dokumen <nomor> berisi N baris. Accurate memproses dokumen besar makin lambat secara kuadrat, sehingga Facport mengirimnya bertahap (cicilan K baris) ke dokumen yang sama. Dokumen Anda tidak diubah — nomor dan isinya sama persis seperti di Excel. Perkiraan waktu: ± X. Selama proses, dokumen di Accurate terisi bertahap." Tombol Setuju / Batal.
- Progres: "Dokumen <nomor>: 1.500 / 4.000 baris tersimpan", status, "Coba lagi", "Batal" (dokumen setengah jadi tetap di Accurate; dijelaskan dan dilaporkan).
- Ringkasan galat mendapat petunjuk untuk `failed_exhausted`.

## 9. Konfigurasi (env, default aman)
`IMPORT_STAGED_MODULES` (kosong = mati; mis. `sales_receipt,purchase_payment`), `IMPORT_STAGED_THRESHOLD_ROWS` 200, `IMPORT_STAGED_CHUNK_ROWS` 500 (jumlah entri/faktur per cicilan), `IMPORT_STAGED_MAX_ATTEMPTS` 4, `IMPORT_STAGED_BACKOFF_BASE_MS` 30000, `IMPORT_STAGED_POLL_INTERVAL_MS` 15000, `IMPORT_STAGED_SECONDS_COEFF` 5.2e-4 (detik·baris⁻², model trial), `IMPORT_STAGED_MAX_RESUMES` 5.

## 10. Pengujian
- Unit: pemotong cicilan (batas entri tak terbelah), hitung `confirmed_lines`, mesin status, backoff, klaim atomik, pembanding isi dokumen vs Excel.
- Integrasi (DB uji): kill di tiap status → lanjut tanpa dobel; deploy-saat-jalan; Batal.
- **Trial Accurate (2977590, `trial:true`):** (a) header/total sementara diterima? (b) penulisan bersamaan pada dokumen sama; (c) update timeout → Accurate menyelesaikan atau tidak; (d) hasil akhir 1.000–2.000 baris identik dengan Excel (jumlah baris, nilai, total); (e) matikan worker di tengah lalu lanjut.
- Pembersihan DB uji sesuai aturan.

## 11. Keputusan (user, 2026-10-21)
Ambang 200 (env, evaluasi ulang) · penanda/pop-up persetujuan sederhana + alasan Accurate · cakupan awal Sales Receipt + Purchase Payment · paralel antar dokumen dicoba bertahap · uji perilaku "tidak ada" (SELESAI) · **DILARANG mengubah dokumen pelanggan; yang diatur hanya pengiriman**.

## 12. Terbuka
Ukuran cicilan 500 vs lain (evaluasi setelah uji trial); batas atas baris yang diizinkan (peringatan vs blokir); penanganan total sementara (§ 4) menunggu hasil uji.
