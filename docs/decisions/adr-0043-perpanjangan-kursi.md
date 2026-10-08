# ADR-0043 — Perpanjangan kursi (Slot User Tambahan)
**Status:** Accepted (2026-10-08, keputusan pemilik) · terkait ADR-0032 (model seat), ADR-0041 (periode kalender), ADR-0042 (perpanjangan terjadwal)

## Konteks
Kursi (`seat_addon`) = 1 slot = 1 baris `subscriptions` + 1 baris `member_seats` (anggota melekat ke slot). Sebelumnya pembelian kursi SELALU membuat slot baru; kursi yang berakhir tidak bisa diperpanjang. Pelanggan sering membeli >1 kursi sekaligus.

## Keputusan
1. **Unit perpanjangan = per slot.** Tiap slot punya masa aktif sendiri; membeli N slot tetap N baris; memperpanjang N slot sekaligus = 1 invoice berisi N item, masing-masing menunjuk slotnya.
2. **Item invoice menunjuk slot target** (`invoice_items.renew_subscription_id`, nullable). Tanpa target = pembelian slot BARU (alur lama tidak berubah).
3. **Dibayar (disetujui) saat slot masih aktif** → diperpanjang di tempat dari akhir lama (jangkar, ADR-0041). **Sudah habis (expired)** → slot yang SAMA dihidupkan kembali, masa aktif baru dimulai dari saat pembayaran disetujui; `member_seats` & anggota tidak disentuh (anggota otomatis bisa masuk lagi). **Dibatalkan** → tidak bisa diperpanjang. Target tidak valid saat aktivasi → fallback membuat slot baru (pelanggan sudah membayar).
4. **Beli baru = slot baru**; slot lama yang mati tetap mati.
5. **Perpanjangan terjadwal (ADR-0042) ikut mencakup kursi:** penanda `renewal_interval` boleh dipasang di kursi; tagihan H-7 memuat item kursi (bersama modul, per Data Usaha per hari berakhir). Kunci "pesanan berjalan" kursi = per slot (`seat:<subscriptionId>`), bukan per modul.
6. Pelanggan memperpanjang dari halaman Tim (per slot atau beberapa slot sekaligus), hanya pemilik Data Usaha. Pelanggan tetap hanya bisa MEMATIKAN penanda terjadwal yang sudah ada; penanda baru pada kursi dipasang lewat pilihan "ulangi otomatis" saat membayar perpanjangan ini atau oleh admin.

## Konsekuensi
Migrasi aditif 0046 (`invoice_items.renew_subscription_id`). Slot kedaluwarsa kehilangan akses anggota hanya selama jeda (aturan `seat-access.ts` tidak berubah).
