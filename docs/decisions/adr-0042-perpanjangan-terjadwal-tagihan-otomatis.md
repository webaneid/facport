# ADR-0042: Perpanjangan terjadwal — tagihan perpanjangan diterbitkan otomatis menjelang berakhir

**Status:** Proposed (menunggu konfirmasi pemilik produk — lihat "Keputusan yang masih perlu dikonfirmasi")
**Tanggal:** 2026-10-08

## Context
Langganan Facport dibayar manual (transfer bank/QRIS, diverifikasi admin). Perpanjangan sekarang SEPENUHNYA inisiatif pelanggan/admin: sistem hanya mengirim pengingat generik H-7/H-3/H-1 ("perpanjang sekarang") tanpa tagihan. Kasus nyata yang memicu: pelanggan migrasi dari aplikasi lama dengan sisa masa aktif (mis. 8 bulan) dan sudah disepakati diperpanjang 1 tahun SETELAH masa itu habis. Tidak ada cara menyatakan "langganan ini akan diperpanjang tahunan setelah berakhir" dan tidak ada tagihan yang terbit otomatis — admin harus mengingat sendiri. Perpanjangan itu sendiri (menambah dari tanggal berakhir, tanpa kehilangan hari) sudah didukung sejak ADR-0041 / Fase 176.

## Decision
1. **Penanda per langganan:** `subscriptions.renewal_interval` ∈ {`monthly`, `yearly`, NULL}. NULL = tidak ada perpanjangan terjadwal (perilaku sekarang, default untuk semua langganan yang ada). Hanya untuk langganan modul non-trial (bukan seat, bukan trial).
2. **Tagihan otomatis, mengikuti jadwal pengingat:** pada H-7 (= ambang pengingat terbesar `SUBSCRIPTION_REMINDER_THRESHOLDS`) sebuah job membuat invoice perpanjangan (invoice biasa: order `pending`, kode unik, bisa dibayar/diunduh/dibatalkan) dengan paket modul yang sama untuk periode yang ditandai. Notifikasi + email "Tagihan perpanjangan terbit" (dengan link bayar) menggantikan pengingat H-7 yang generik; H-3 dan H-1 mengingatkan tagihan yang BELUM dibayar. Pembayaran tetap manual — "otomatis" = tagihan terbit otomatis, bukan penarikan dana.
3. **Jatuh tempo tagihan perpanjangan = tanggal berakhir langganan** (bukan +3 hari seperti invoice biasa), supaya job kedaluwarsa invoice (Fase 178) tidak mengedaluwarsakannya sebelum langganan berakhir.
4. **Setelah dibayar & disetujui:** aktivasi memakai inti yang sudah ada (`activateInvoiceItems`): langganan aktif diperpanjang di tempat dari tanggal berakhirnya (jangkar); bila sudah berakhir saat disetujui → langganan baru dari saat disetujui (aturan ADR-0041). Penanda `renewal_interval` ikut terbawa (siklus berlanjut sampai dimatikan).
5. **Satu tagihan per Data Usaha per hari-berakhir:** langganan yang berakhir di hari kalender yang sama (zona perusahaan) pada Data Usaha yang sama digabung dalam 1 invoice multi-item (tidak membanjiri pelanggan dengan puluhan invoice saat banyak fitur di-assign bersamaan); jatuh tempo = berakhir paling awal di kelompok itu.
6. **Idempoten per siklus:** `subscriptions.renewal_invoiced_for_end_at` mencatat tanggal berakhir yang sudah ditagih; satu tagihan per siklus. Tagihan yang dibatalkan pelanggan/admin TIDAK diterbitkan ulang otomatis di siklus yang sama (admin dapat menerbitkan manual).
7. **Kegagalan tidak diam:** paket periode itu tidak ada/nonaktif → tagihan tidak dibuat, admin (`subscriptions.manage`) mendapat notifikasi sekali per siklus.
8. **Asal pesanan dicatat:** `orders.origin` ∈ {`checkout`, `admin`, `renewal`} (jejak audit/statistik; tanda "Tagihan perpanjangan" di UI).
9. Admin mengatur penanda saat assign/Tambah User (berlaku untuk semua fitur yang dicentang) dan kapan saja di detail user; pelanggan (pemilik Data Usaha) dapat MEMATIKAN (v1: tidak menyalakan sendiri).

## Alternatif yang Dipertimbangkan
- **Menambah masa aktif sekarang** (tanggal lanjutan) — bukan yang dimaksud: pelanggan belum membayar periode berikutnya; tidak ada tagihan; tidak menyelesaikan "ingatkan & tagih".
- **Penarikan dana otomatis (kartu/virtual account)** — pembayaran kita manual dan diverifikasi admin; di luar scope.
- **Satu invoice per langganan** — sederhana, tetapi membanjiri pelanggan (bulk assign membuat puluhan langganan berakhir di detik yang sama).
- **Tagihan dibuat saat berakhir (H-0)** — pelanggan tidak punya waktu membayar; langganan putus.
- **Jatuh tempo +3 hari (invoice biasa)** — kedaluwarsa otomatis sebelum langganan berakhir.

## Konsekuensi
- Migrasi aditif (kolom nullable/default) — tidak mengubah perilaku langganan yang ada sampai admin menandainya; rollback aman (kolom diabaikan).
- Job baru berjalan bersama job pengingat harian (09:00 zona perusahaan); satu kegagalan tidak boleh menghentikan pengingat.
- Harga tagihan = harga paket SAAT terbit (bukan harga saat langganan dibeli); pelanggan melihat total sebelum membayar.
- Pelanggan bisa menerima tagihan yang tidak mereka minta → wajib ada cara mudah mematikan dan membatalkan tagihan.

## Keputusan yang masih perlu dikonfirmasi pemilik produk
Default berikut dipakai sampai ada koreksi: (a) tagihan terbit H-7 untuk bulanan maupun tahunan; (b) jatuh tempo = tanggal berakhir, tanpa masa tenggang; (c) dibayar setelah berakhir → mulai dari saat disetujui; (d) paket tak tersedia → tidak terbit + notifikasi admin; (e) pelanggan hanya bisa mematikan (tidak menyalakan sendiri) di v1; (f) tagihan yang dibatalkan tidak otomatis diterbitkan ulang di siklus yang sama.

---
> Aturan: file ADR TIDAK diedit setelah Accepted. Kalau keputusan berubah, buat ADR baru dan tulis "Supersedes ADR-0042" di file baru itu.
