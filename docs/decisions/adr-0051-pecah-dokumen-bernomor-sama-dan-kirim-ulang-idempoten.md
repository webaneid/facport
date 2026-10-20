# ADR-0051: Pecah dokumen bernomor sama berisi ribuan baris menjadi bagian-bagian kecil, kirim bertahap, dan kirim ulang idempoten sampai sukses

**Status:** Proposed (2026-10-21) — keputusan arah disetujui user; rincian menunggu konfirmasi (lihat § Keputusan terbuka di `docs/architecture/architecture-document-splitting.md`)
**Tanggal:** 2026-10-21

## Context
Banyak baris Excel dengan nomor dokumen yang sama digabung Facport menjadi SATU dokumen Accurate (Fase 49). Dokumen berisi ribuan baris tidak dapat diproses Accurate dalam waktu wajar. Bukti terkontrol (database trial Accurate, 2026-10-20/21, arsitektur § 14):
1. **Waktu satu dokumen ∝ N²** (50 baris 2,6 dtk; 100 → 7,0; 200 → 17,1; 400 → 55,9; 800 → 207,8; kuadrat ±3,2·10⁻⁴·N² dtk). Ini sifat Accurate, bukan beban/jaringan/mesin kita (database kosong, tanpa beban lain).
2. **Membangun satu dokumen bertahap (tambah 100 baris demi 100 lewat `save.do` + `id`) tidak menolong:** tiap update memproses ULANG seluruh dokumen dan ±1,6× lebih mahal daripada membuat dokumen seukuran itu sekali kirim (update ke 600 baris = 198 dtk; total kumulatif ±4× lebih lambat).
3. Karena total waktu L baris dalam dokumen berukuran N ≈ c·L·N, **dokumen kecil membuat seluruhnya jauh lebih cepat** (8.000 baris sebagai 80 dokumen ≈ 9–10 menit vs ±5,7 jam sebagai satu dokumen di trial).
4. Accurate menerima penulisan paralel antar dokumen (4 paralel ≈ 5× lebih cepat di trial).
5. Timeout kita tidak menyelesaikan masalah: dokumen besar kadang selesai (±44 menit untuk 4.447 baris di produksi), kadang tidak; verifikasi setelah timeout (C2) menunjukkan dokumen yang tidak selesai tidak tersimpan.
Selain itu, kegagalan di tengah (timeout, restart worker) saat ini bisa menyisakan keadaan tak pasti ("mungkin tersimpan").

## Decision
1. **Dokumen bernomor sama yang melebihi ambang baris dipecah menjadi beberapa DOKUMEN Accurate berukuran kecil** (bagian), dikirim bertahap/bergiliran dari data yang tersimpan di database Facport. Bukan membangun satu dokumen bertahap (terbukti tidak layak).
2. **Rencana sebelum kirim + persetujuan:** setelah pemetaan, Facport menampilkan rencana (berapa dokumen, berapa bagian, perkiraan waktu) dan meminta persetujuan eksplisit bila ada dokumen yang akan dipecah — karena satu nomor menjadi beberapa dokumen di Accurate.
3. **Pengiriman bagian idempoten dan dapat dilanjutkan:** tiap bagian punya nomor dokumen eksplisit dan unik serta penanda idempotensi; sebelum setiap percobaan, cek ke Accurate lewat nomor; timeout/galat transport → verifikasi lalu kirim ulang berjarak (backoff) sampai sukses atau batas percobaan; galat bisnis tidak diulang. Status per bagian disimpan di database sehingga pekerjaan lanjut setelah restart/crash tanpa duplikat.
4. Cakupan awal: **Sales Receipt**, lalu **Purchase Payment** (dokumen pembayaran: baris saling bebas). Modul lain (faktur, dst.) memakai jaring pengaman yang ada (timeout adaptif + verifikasi) sampai kebijakan pecah-nya disetujui per modul.
5. Peluncuran di balik saklar env, default mati.

## Alternatif yang Dipertimbangkan
- **Bangun satu dokumen bertahap lewat update** — ditolak: terbukti lebih lambat dari sekali kirim (update memproses ulang seluruh dokumen).
- **Memperpanjang timeout** — ditolak sebagai solusi utama: memindahkan kegagalan tanpa mengubah hasil; tetap sebagai jaring pengaman.
- **Menolak dokumen besar (guard)** — ditolak sebagai solusi utama (memblokir alur yang bisa dilayani); tetap relevan untuk modul yang belum punya kebijakan pecah.
- **Pecah tanpa persetujuan** — ditolak: mengubah catatan akuntansi pelanggan (beberapa dokumen menggantikan satu nomor).

## Konsekuensi
- (+) Waktu turun drastis, tidak ada pekerjaan puluhan menit tanpa hasil; hasil pasti (sukses/gagal per bagian); tahan restart; paralel antar bagian memungkinkan.
- (−) Satu nomor di Excel menjadi beberapa dokumen di Accurate (diterangkan di Rencana; pelanggan perlu paham — rancangan ini berasal dari cara kerja Accurate).
- (−) Tabel dan alur baru (migrasi, eksekutor, UI Rencana) — kompleksitas harus dibayar dengan tes ketat dan uji di database trial.
- Risiko tersisa: nomor dokumen bentrok dengan dokumen lain di Accurate (ditangani penanda idempotensi); batas panjang nomor di Accurate (perlu dipastikan); penanda di deskripsi tampak di Accurate (perlu persetujuan).

---
> Aturan: file ADR TIDAK diedit setelah Accepted. Kalau keputusan berubah,
> buat ADR baru dan tulis "Supersedes ADR-XXXX" di file baru itu.
