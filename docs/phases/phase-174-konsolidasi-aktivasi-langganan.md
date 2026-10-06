# Fase 174 — Konsolidasi jalur aktivasi langganan
**Status:** Planned · ADR-0041
Konfirmasi order, Tambah User "sudah dibayar", assign admin, dan seat memanggil `addCalendarPeriod` dengan SATU `now` per transaksi (dari saat disetujui, zona
perusahaan); isi `period_anchor_at`/`period_months`. Admin assign: default dari paket, tanggal+jam akhir bisa diubah bebas. Trial tidak disentuh. Invoice menampilkan mulai/akhir.
