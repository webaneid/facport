-- § Fase 145 (keputusan user 2026-09-22) — PUTUS TOTAL ke koneksi Accurate lama; semua customer menghubungkan ulang dan memilih
-- database dari nol. Alasan: pemetaan lama (subscription -> koneksi -> database) adalah sumber kekacauan Data Usaha (kasus Pak Untung),
-- dan backfill "database terakhir diketahui" (migrasi 0028) memakai pemetaan yang sama — tidak dipercaya lagi. Berjalan SEKALI saat
-- deploy cutover (di production belum ada koneksi model baru pada saat itu); tidak ada carry-over token lama.
--
-- 1. Data Usaha yang belum/tidak menunjuk koneksi model baru: kosongkan pointer & database (termasuk hasil backfill 0028).
UPDATE "data_usaha"
SET "accurate_connection_id" = NULL,
    "accurate_db_id" = NULL,
    "accurate_db_alias" = NULL,
    "accurate_db_confirmed_at" = NULL,
    "updated_at" = now()
WHERE "accurate_connection_id" IS NULL
   OR "accurate_connection_id" IN (SELECT "id" FROM "accurate_connections" WHERE "accurate_user_id" IS NULL);
--> statement-breakpoint
-- 2. Semua koneksi LAMA (tanpa identitas akun) dinyatakan dicabut: tidak dibaca, tidak di-refresh oleh job harian (yang hanya memilih
--    status "active"), dan tidak memicu notifikasi "koneksi terputus" saat token lamanya mati akibat customer menghubungkan ulang.
--    Baris TIDAK dihapus (riwayat & rollback kode); dihapus di rilis kontrak (Fase 145 bagian C).
UPDATE "accurate_connections"
SET "status" = 'revoked', "updated_at" = now()
WHERE "accurate_user_id" IS NULL AND "status" <> 'revoked';
