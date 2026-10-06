# ADR-0041: Periode langganan berbasis kalender (bulanan/tahunan), bukan hitungan hari

**Status:** Accepted
**Tanggal:** 2026-10-06

## Context
Langganan dulu dihitung `sekarang + plan.durationDays × 24 jam` (1 bulan = 30 hari, 1 tahun = 360 lalu 365 hari). Akibatnya "1 bulan" tidak jatuh di
tanggal yang sama bulan depan, "1 tahun" bisa meleset hari, dan ada EMPAT jalur terpisah yang menghitung `end_at` dengan aturan berbeda
(konfirmasi order, Tambah User "sudah dibayar", assign admin tanggal-saja akhir-hari, trial). Gerbang akses juga tidak mengecek `end_at` — akses baru
terputus saat job harian jalan (kelonggaran sampai ±24 jam). Semua paket produksi hanya dua jenis: 41 bulanan (30 hari) dan 41 tahunan (365 hari).
Prinsip pemilik produk: **tidak boleh ada satu tanggal pun yang menjadi hak pelanggan diambil.**

## Decision
1. **Dua periode saja: `monthly` dan `yearly`** (`plans.interval`). `duration_days` tetap diisi (30/365) hanya sebagai kompatibilitas/tampilan lama.
2. **Mulai = saat pembayaran DISETUJUI** (admin konfirmasi / admin assign). **Akhir = tanggal & jam dinding yang SAMA** di bulan/tahun berikutnya, dalam
   zona `company.timezone` (satu zona perusahaan, default Asia/Jakarta). Tanggal yang tidak ada di bulan tujuan **dijepit ke hari terakhir bulan itu**
   (31 Jan → 28/29 Feb; 29 Feb + 1 tahun → 28 Feb). Zona diganti di setting → hanya langganan BARU yang memakai zona baru (`end_at` lama absolut).
3. **Jangkar (anti-geser tanggal):** akhir selalu dihitung dari tanggal mulai asli + total bulan (`subscriptions.period_anchor_at` + `period_months`),
   bukan berantai dari akhir sebelumnya — 12× perpanjang bulanan dari 31 Jan berakhir 31 Jan tahun depan, bukan 28 Jan. Jangkar `NULL` (data lama / admin
   mengubah tanggal manual) → ditetapkan ulang di `end_at` saat itu pada perpanjangan berikutnya.
4. **Perpanjangan dini** (fase 176): bila langganan modul yang sama MASIH AKTIF saat pembayaran disetujui → `end_at` yang ada **diperpanjang di tempat**
   (akhir lama + periode, mulai tetap), BUKAN dihitung dari saat disetujui — tidak ada hari pelanggan yang hilang. Bila SUDAH habis saat disetujui →
   langganan baru mulai dari saat disetujui (pelanggan tidak memakai fitur di masa jeda, tidak ada hak yang terambil). Riwayat di `subscription_renewals`.
5. **Admin boleh custom**: default tanggal+jam akhir dihitung dari paket, tetapi admin bebas mengisi tanggal+jam lain (kontrak khusus) — tidak terikat
   bulanan/tahunan (melanjutkan ADR-0016, kini dengan jam, bukan akhir-hari).
6. **Trial TIDAK diubah** (tetap `trial.durationDays` hari). **Seat (slot user)** memakai logika yang sama dengan langganan modul (periode sendiri);
   perpanjangan dini seat ditunda ke fase terpisah.
7. **Akses diputus tepat di `end_at`** (gerbang mengecek `end_at > sekarang`; job kedaluwarsa & reminder jalan dalam WIB / lebih sering). Fitur terkunci
   saat kedaluwarsa, Data Usaha tetap bisa diakses.
8. Satu fungsi murni (`apps/api/src/lib/subscription-period.ts`, tanpa DB, dipakai juga web lewat re-export) adalah SATU-SATUNYA tempat aritmetika periode.

## Alternatif yang Dipertimbangkan
- Mulai dari waktu invoice dibuat — pelanggan yang bayar belakangan / admin yang menyetujui terlambat kehilangan hari; admin assign tidak punya invoice.
- Tetap hitungan hari (30/365) — sumber masalah ini.
- Perpanjangan berantai dari akhir sebelumnya tanpa jangkar — tanggal bergeser ke hari terakhir bulan pendek dan ~3 hari hilang per tahun.
- Perpanjangan dini sebagai baris langganan baru — merusak invarian "1 modul aktif = 1 baris", pointer invoice 1:1, dan `member_seats`.

## Konsekuensi
- Aturan periode satu tempat; pratinjau UI persis sama dengan server.
- Migrasi menyentuh data produksi (kolom baru + backfill), deploy Full + `db:migrate` dengan backup.
- Langganan berjalan tidak disentuh; langganan tahunan ber-360 hari dikoreksi satu kali di Fase 178 (dry-run, dijalankan pemilik).
- Gerbang akses mengecek `end_at` → perilaku akses berubah tepat di jam akhir (sebelumnya longgar sampai job harian).
