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

## 4. Total/header per cicilan (harus dibuktikan di trial)
- Header (pelanggan, bank, tanggal, keterangan, dst) sama pada setiap cicilan, dari baris pertama seperti sekarang.
- `chequeAmount`/total: pada tiap cicilan diset sebagai jumlah baris yang sudah terkirim sampai cicilan itu (supaya valid di Accurate); cicilan terakhir = total akhir persis seperti Excel. Bila pelanggan mengisi total eksplisit, nilai itu hanya dicek konsistensi terhadap jumlah akhir (aturan lama), dan menjadi nilai final.
- Diuji: apakah Accurate menerima total sementara; jika tidak, cari cara lain TANPA mengubah hasil akhir.

## 5. Data & status (migrasi baru, `when` > 1791775064770)
Tabel `import_staged_documents`:
| Kolom | Arti |
|---|---|
| id, batch_id, module, document_number | identitas (nomor asli) |
| total_lines, chunk_size | rencana |
| accurate_id | id dokumen di Accurate (setelah cicilan 1) |
| confirmed_lines | jumlah baris terverifikasi tersimpan di Accurate |
| status | `planned → running → verifying → completed | failed_business | failed_exhausted | cancelled` |
| attempts, next_attempt_at, last_error | kendali retry |
| started_at, finished_at | metrik |
`import_rows` TIDAK diubah isinya; urutan baris dokumen = urutan baris Excel.

## 6. Alur
1. Upload & validasi (tidak berubah) → grup per nomor.
2. **Rencana & persetujuan:** bila ada dokumen > ambang → popup (§ 8); tanpa persetujuan tidak ada kiriman. Batch masuk `awaiting_staged_approval`.
3. Setelah setuju → job lewat `enqueueAccurateJob` (satu pintu).
4. **Eksekutor per dokumen** (satu dokumen tidak pernah dikerjakan dua pekerja sekaligus — klaim atomik di DB):
   a. Baca dokumen di Accurate by nomor → `confirmed_lines` (kenyataan, bukan catatan kita). Belum ada → cicilan 1.
   b. Hitung cicilan berikutnya = baris Excel ke-(confirmed+1 … confirmed+K) (verifikasi baris yang sudah ada cocok dengan Excel; ketidakcocokan → berhenti dengan galat jelas, JANGAN menimpa).
   c. `save.do` (create atau update). Sukses → baca ulang, `confirmed_lines`, lanjut.
   d. Timeout/transport/5xx → status `verifying`: tunggu & baca ulang berkala (Accurate mungkin masih menyelesaikan); `confirmed_lines` bertambah → anggap sukses; tidak → ulang dengan backoff; tak pasti → baca ulang dulu, tidak pernah kirim buta.
   e. Galat bisnis dari Accurate → `failed_business`, tidak diulang (pesan jelas, baris terkait).
   f. Batas `IMPORT_STAGED_MAX_ATTEMPTS` → `failed_exhausted` + tombol "Coba lagi" (lanjut dari `confirmed_lines`).
5. **Penjadwal berantai:** satu job mengerjakan sebagian lalu menjadwal ulang dirinya → keadilan antar pelanggan, tahan deploy. Pemulihan job hantu (Fase 204) diadaptasi: batch ber-dokumen-bertahap di-**requeue**, bukan digagalkan.
6. **Antar dokumen** (batch berisi banyak dokumen kecil + satu raksasa) tetap memakai paralel yang ada (Fase 202); bagian bertahap tidak menghalangi dokumen lain.
7. Penutupan: semua dokumen terminal → batch `completed` / `completed_with_errors`; baris Excel mewarisi hasil dokumennya.

## 7. Idempotensi — jaminan
- Sumber kebenaran = isi dokumen di Accurate (dibaca by nomor), bukan catatan lokal.
- Klaim atomik mencegah dua pekerja pada dokumen yang sama (juga melindungi `optLock`).
- Restart di titik mana pun: baca ulang → lanjut dari baris tersimpan. Tidak ada baris dobel karena cicilan dihitung dari `confirmed_lines`.
- Dokumen yang sudah ada sebelum import (nomor sama, bukan buatan kita) → terdeteksi di langkah 4a/4b (isi tidak cocok) → berhenti, tidak menimpa.
- Terkonfirmasi di trial (2026-10-21): `detail.do?number=<tak ada>` → `s:false` "<Jenis> tidak tepat" (Sales Receipt, Purchase Payment, Sales Invoice); ada → `s:true` + detail.

## 8. UI
- **Popup persetujuan** (bahasa awam): "Dokumen <nomor> berisi N baris. Accurate memproses dokumen besar makin lambat secara kuadrat, sehingga Facport mengirimnya bertahap (cicilan K baris) ke dokumen yang sama. Dokumen Anda tidak diubah — nomor dan isinya sama persis seperti di Excel. Perkiraan waktu: ± X. Selama proses, dokumen di Accurate terisi bertahap." Tombol Setuju / Batal.
- Progres: "Dokumen <nomor>: 1.500 / 4.000 baris tersimpan", status, "Coba lagi", "Batal" (dokumen setengah jadi tetap di Accurate; dijelaskan dan dilaporkan).
- Ringkasan galat mendapat petunjuk untuk `failed_exhausted`.

## 9. Konfigurasi (env, default aman)
`IMPORT_STAGED_MODULES` (kosong), `IMPORT_STAGED_THRESHOLD_ROWS` 200, `IMPORT_STAGED_CHUNK_ROWS` 500, `IMPORT_STAGED_MAX_ATTEMPTS` 6, `IMPORT_STAGED_BACKOFF_BASE_MS` 30000, `IMPORT_STAGED_VERIFY_WAIT_MS`.

## 10. Pengujian
- Unit: pemotong cicilan (batas entri tak terbelah), hitung `confirmed_lines`, mesin status, backoff, klaim atomik, pembanding isi dokumen vs Excel.
- Integrasi (DB uji): kill di tiap status → lanjut tanpa dobel; deploy-saat-jalan; Batal.
- **Trial Accurate (2977590, `trial:true`):** (a) header/total sementara diterima? (b) penulisan bersamaan pada dokumen sama; (c) update timeout → Accurate menyelesaikan atau tidak; (d) hasil akhir 1.000–2.000 baris identik dengan Excel (jumlah baris, nilai, total); (e) matikan worker di tengah lalu lanjut.
- Pembersihan DB uji sesuai aturan.

## 11. Keputusan (user, 2026-10-21)
Ambang 200 (env, evaluasi ulang) · penanda/pop-up persetujuan sederhana + alasan Accurate · cakupan awal Sales Receipt + Purchase Payment · paralel antar dokumen dicoba bertahap · uji perilaku "tidak ada" (SELESAI) · **DILARANG mengubah dokumen pelanggan; yang diatur hanya pengiriman**.

## 12. Terbuka
Ukuran cicilan 500 vs lain (evaluasi setelah uji trial); batas atas baris yang diizinkan (peringatan vs blokir); penanganan total sementara (§ 4) menunggu hasil uji.
