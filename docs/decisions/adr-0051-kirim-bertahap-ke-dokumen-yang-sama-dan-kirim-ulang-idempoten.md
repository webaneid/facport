# ADR-0051: Kirim dokumen besar ke Accurate secara bertahap (cicilan) ke DOKUMEN YANG SAMA, dengan kirim ulang idempoten sampai sukses

**Status:** Accepted (2026-10-21) — diimplementasi di Fase 205; saklar default mati
**Tanggal:** 2026-10-21
**Revisi:** menggantikan rancangan awal hari yang sama ("pecah menjadi banyak dokumen bernomor turunan") yang DITOLAK user karena mengubah dokumen pelanggan.

## Prinsip yang tidak boleh dilanggar
**Facport tidak berhak mengubah dokumen pelanggan dengan alasan apa pun.** Satu nomor di Excel = satu dokumen di Accurate dengan nomor, header, isi baris, dan struktur persis seperti yang pelanggan tulis. Yang boleh kita atur hanyalah **cara pengiriman** (waktu, urutan, cicilan, pengulangan). Hasil akhir di Accurate harus identik dengan jalur kirim sekali (kalau Accurate sanggup menerimanya), meski memakan waktu lebih lama.

## Context
Dokumen berisi ribuan baris dengan nomor sama tidak dapat diproses Accurate dalam sekali kirim secara andal. Bukti terkontrol (trial Accurate, `architecture-import-capacity.md` § 11–14):
1. Waktu satu dokumen ∝ N² (±3,2·10⁻⁴·N² dtk). Sifat Accurate, bukan beban/jaringan/mesin kita.
2. Menambah baris ke dokumen yang sama lewat `save.do` + `id` (baris lama cukup `{id}`) BERHASIL dan hasilnya satu dokumen utuh, tetapi tiap update memproses ULANG seluruh dokumen (±1,6×·3,2·10⁻⁴·N² dtk; 600 baris = 198 dtk terukur). Jadi lebih lambat daripada sekali kirim, tetapi **tiap langkah punya batas waktu sendiri dan progresnya tersimpan di Accurate**.
3. Membagi menjadi banyak dokumen bernomor turunan jauh lebih cepat, tetapi **mengubah dokumen pelanggan → dilarang** (keputusan user).
4. Timeout saja bukan solusi: dokumen besar kadang selesai, kadang tidak; yang gagal tidak tersimpan.

## Decision
1. Dokumen yang melebihi ambang baris dikirim **bertahap ke dokumen yang sama**: cicilan pertama membuat dokumen (nomor asli, header asli); cicilan berikutnya menambah baris ke dokumen itu (`id` + baris lama `{id}` + baris baru). Nomor dan struktur tidak berubah.
2. Data pelanggan tetap utuh di `import_batch_rows` (tidak diubah). Kemajuan = isi dokumen di Accurate (dibaca by nomor) + status baris yang bertahap menjadi `success`; TANPA tabel baru (kenyataan di Accurate lebih dapat dipercaya daripada catatan lokal, terutama setelah timeout — uji trial: Accurate tetap menyelesaikan update walau klien memutus koneksi).
3. **Idempoten & dapat dilanjutkan:** sebelum tiap cicilan, baca dokumen di Accurate lewat nomor (`detail.do?number=`) dan hitung baris yang SUDAH tersimpan; cicilan berikutnya dihitung dari kenyataan itu, bukan dari catatan kita. Timeout/galat transport → verifikasi (polling baca) lalu ulangi berjarak (backoff) sampai sukses atau batas percobaan; galat bisnis tidak diulang. Restart/deploy di titik mana pun → lanjut tanpa duplikat baris.
4. **Persetujuan:** popup sederhana sebelum kirim bila ada dokumen yang akan dicicil — memberi tahu bahwa dokumen tetap utuh, kirim akan lebih lama (perkiraan waktu), dan alasannya: Accurate memproses dokumen besar makin lambat secara kuadrat.
5. **Batas realistis:** cicilan ~500 baris (env). Dokumen > ~2.000 baris tetap dicoba bila pelanggan menyetujui, dengan peringatan jujur bahwa bisa berjam-jam (batas ada di Accurate). Facport tidak memecah dokumen otomatis.
6. Cakupan awal: **Sales Receipt**, **Purchase Payment**. Modul lain menyusul per modul. Saklar env, default mati.
7. Pemecahan menjadi banyak dokumen **tidak dilakukan**; bila nanti ditawarkan, hanya sebagai pilihan sadar pelanggan (ADR terpisah).

## Alternatif
- **Banyak dokumen bernomor turunan** — ditolak: mengubah dokumen pelanggan.
- **Sekali kirim + timeout panjang saja** — dipertahankan sebagai jalur untuk dokumen di bawah ambang; tidak cukup untuk dokumen sangat besar.
- **Menolak dokumen besar** — ditolak: memblokir alur yang bisa dilayani.

## Konsekuensi
- (+) Dokumen pelanggan utuh; progres tersimpan; tahan timeout/restart; tidak ada pekerjaan hilang.
- (−) Lebih lambat dari sekali kirim (hukum Accurate): perkiraan total ±10 mnt/1.000 baris, ±45 mnt/2.000, ±6 jam/4.000 (cicilan 500).
- (−) Dokumen sempat berada dalam keadaan setengah jadi di Accurate selama pengiriman (terlihat jika dibuka); popup menyebutkannya.
- Terbukti di trial (205a/g): total sementara diterima; penulisan bersamaan diserialkan Accurate; update tetap selesai walau klien memutus koneksi; restart di tengah cicilan pulih. Belum terbukti: `detailTax` (PPh) → dokumen ber-PPh tidak dicicil.

---
> Aturan: file ADR TIDAK diedit setelah Accepted. Kalau keputusan berubah,
> buat ADR baru dan tulis "Supersedes ADR-XXXX" di file baru itu.
