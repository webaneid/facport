# Fase 204 — Pemulihan otomatis job impor "hantu" saat worker mulai

**Status:** Done (2026-10-20, belum dirilis)
**Mulai:** 2026-10-20
**Selesai:** 2026-10-20

## Tujuan
Insiden 2026-10-20: penerimaan 4.447 baris (PT Buana Indah) dimulai 11:25 WIB di sela langkah deploy `v2.39.1`; container worker diganti ±11:29 sehingga prosesnya mati. `pgboss.job` tetap `active`, batch `processing`, 4.447 baris `pending`, tanpa proses yang mengerjakan — pelanggan melihat "sedang diproses" tanpa kemajuan. Pemulihan manual (SQL dijalankan user) berhasil, tetapi bergantung pada ketelitian pengecekan dan kebetulan terdeteksi. Fase ini mengotomatisasinya.

## Cara kerja
Saat worker MULAI — setelah `startQueue()` dan SEBELUM `boss.work(...)` apa pun — tidak ada handler yang berjalan di proses ini, sehingga SETIAP job `active` di antrean impor (`import-to-accurate`, `import-to-accurate-large`) pasti milik proses lama yang sudah mati. `recoverOrphanedImportJobs`:
- batch berstatus `processing` → baris `pending` menjadi `failed` dengan pesan "Import terputus saat pembaruan sistem sebelum selesai. Periksa dulu di Accurate apakah transaksi file ini sudah ada, lalu tekan Retry." (baris `success`/`failed` lama TIDAK diubah), batch → `completed_with_errors` (atau `completed` bila tak ada yang gagal) — satu transaksi dengan kunci baris (`FOR UPDATE`);
- batch yang BUKAN `processing` (baru/selesai/menunggu mapping) → tidak disentuh; batch tak ada → dilewati;
- job pg-boss digagalkan (`boss.fail`) agar tidak menggantung sampai kedaluwarsa;
- galat per job dicatat dan tidak menghentikan job lain maupun start worker; log `orphaned_import_recovered` + ringkasan.
Hanya antrean impor; Batal Import dan AutoProduksi tidak disentuh.

## Scope
- [x] `lib/orphaned-imports.ts` (`recoverOrphanedBatch`, `recoverOrphanedImportJobs`, `defaultOrphanDeps`) + panggilan di `main()` worker sebelum registrasi handler.
- [x] Tes (9): database nyata (pending→failed + pesan, success/failed lama tak berubah, semua-success→completed, batch non-processing tak disentuh, batch hilang), orkestrasi (ringkasan, galat per job, hanya antrean impor), dan pg-boss ASLI dengan antrean sementara.
- [x] **Bug tertangkap oleh uji pg-boss asli:** parameter `Date` mentah di `sql` ditolak driver ("string argument must be … Received an instance of Date") → dikirim sebagai ISO + `::timestamptz`. Tes unit dengan tiruan tidak akan menemukannya.

## Keputusan Kecil Selama Eksekusi
- Pengecekan "batch aktif tepat sebelum `up -d`" (SOP 2c) TETAP dilakukan: pemulihan otomatis memulihkan, bukan mencegah; baris yang terputus tetap perlu Retry dan pengecekan Accurate oleh pelanggan.
- Memakai "semua job `active` saat start" (bukan perbandingan waktu terhadap start proses): handler belum terdaftar sehingga tidak ada job milik proses ini. Asumsi satu instance worker (sesuai ADR-0048); `docker compose up -d` menghentikan container lama sebelum yang baru mulai.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error
- [x] Suite API 2518 hijau; data uji dibersihkan
- [x] Security review inline: tanpa endpoint/input pengguna; SQL mentah memakai parameter (nama antrean berasal dari konstanta kode); hanya batch berstatus `processing`
- [x] `docs/PROGRESS.md`, lessons-learned

## Known Limitations
- Baris yang terputus di tengah `save.do` bisa saja sudah tersimpan di Accurate — pesan baris menyuruh pelanggan memeriksa Accurate sebelum Retry. Verifikasi otomatis untuk kasus ini (bukan hanya timeout) dapat menjadi lanjutan.
- Bila kelak worker dijalankan lebih dari satu instance, pemulihan saat start perlu penanda kepemilikan job.

## Ringkasan Hasil
Job impor hantu akibat restart worker kini dipulihkan otomatis saat worker mulai: pelanggan melihat baris gagal dengan penjelasan dan tombol Retry, bukan "sedang diproses" selamanya.
