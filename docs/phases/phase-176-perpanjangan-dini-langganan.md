# Fase 176 — Perpanjangan dini
**Status:** Planned · ADR-0041 poin 4
Pembelian modul yang masih aktif diizinkan sebagai perpanjangan (blokir invoice berjalan tetap): saat disetujui dan masih aktif → `end_at` diperpanjang di tempat (akhir lama + periode, via
jangkar); sudah habis → langganan baru dari saat disetujui. Tabel `subscription_renewals` (akhir lama→baru, invoice, order); invoice menampilkan perpanjangan; admin assign: "perpanjang" vs tanggal manual.
Seat ditunda (logika sama).
