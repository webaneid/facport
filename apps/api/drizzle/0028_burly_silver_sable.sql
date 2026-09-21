ALTER TABLE "data_usaha" DROP CONSTRAINT "data_usaha_accurate_connection_id_unique";--> statement-breakpoint
ALTER TABLE "data_usaha" ADD COLUMN "accurate_db_id" varchar(100);--> statement-breakpoint
ALTER TABLE "data_usaha" ADD COLUMN "accurate_db_alias" varchar(255);--> statement-breakpoint
CREATE UNIQUE INDEX "accurate_connections_accurate_user_uidx" ON "accurate_connections" USING btree ("accurate_user_id") WHERE "accurate_connections"."accurate_user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "data_usaha_connection_db_uidx" ON "data_usaha" USING btree ("accurate_connection_id","accurate_db_id") WHERE "data_usaha"."accurate_connection_id" IS NOT NULL AND "data_usaha"."accurate_db_id" IS NOT NULL;--> statement-breakpoint
-- § Fase 143, ADR-0037 #7 — backfill "database terakhir diketahui" per Data Usaha dari koneksi LAMA yang dipakai
-- subscription-nya (koneksi terbaru menang). TANPA panggilan Accurate; pointer koneksi sengaja TIDAK di-backfill
-- (cutover: customer hubungkan ulang). Idempotent: hanya mengisi yang masih NULL.
UPDATE "data_usaha" AS du
SET "accurate_db_id" = x.db_id, "accurate_db_alias" = x.db_alias
FROM (
  SELECT DISTINCT ON (s."data_usaha_id") s."data_usaha_id" AS du_id, c."accurate_db_id" AS db_id, c."accurate_db_alias" AS db_alias
  FROM "subscriptions" s
  JOIN "accurate_connections" c ON c."id" = s."accurate_connection_id"
  WHERE c."accurate_db_id" IS NOT NULL
  ORDER BY s."data_usaha_id", c."connected_at" DESC
) AS x
WHERE du."id" = x.du_id AND du."accurate_db_id" IS NULL;
