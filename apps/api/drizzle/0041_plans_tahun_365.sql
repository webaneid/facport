-- 2026-10-06 (permintaan user): "1 Tahun" selama ini disimpan 360 hari (12x30) sehingga pelanggan yang membeli 1 tahun hanya mendapat 360 hari.
-- Paket yang durasinya kelipatan 360 hari (360, 720, 1080, ...) digeser ke kelipatan 365 hari (365, 730, 1095, ...). Hanya data PAKET (dipakai pembelian
-- BERIKUTNYA) — subscription yang sedang berjalan (end_at sudah dihitung) dan snapshot invoice_items.duration_days (riwayat) TIDAK diubah; tampilan
-- web & PDF tetap mengenali 360 sebagai "1 Tahun". Aman dijalankan sekali (setelah ini tidak ada paket berdurasi kelipatan 360 yang tersisa kecuali
-- kelipatan 26280 hari — kelipatan bersama 360 & 365 — yang tidak realistis).
UPDATE "plans" SET "duration_days" = ("duration_days" / 360) * 365, "updated_at" = now() WHERE "duration_days" > 0 AND "duration_days" % 360 = 0;
