-- Custom SQL migration file, put your code below! --

-- § Fase 14, ADR-0019 — backfill taksonomi modul LAMA (grup top-level) ke
-- SUB-MODUL. Cuma 2 sub-modul yang sudah live (Purchase Invoice, Sales
-- Invoice) yang punya data existing untuk di-backfill.
UPDATE "plans" SET "modules" = '["purchase_invoice"]'::jsonb WHERE "modules" = '["pembelian"]'::jsonb;--> statement-breakpoint
UPDATE "plans" SET "modules" = '["sales_invoice"]'::jsonb WHERE "modules" = '["penjualan"]'::jsonb;--> statement-breakpoint

-- § Fase 14, ADR-0020 — backfill "accurate_connections.user_id" dari
-- relasi LAMA (subscription_id -> subscriptions.user_id), WAJIB terjadi
-- SEBELUM kolom subscription_id dihapus di migration berikutnya (0010).
UPDATE "accurate_connections" ac
SET "user_id" = s."user_id"
FROM "subscriptions" s
WHERE ac."subscription_id" = s."id" AND ac."user_id" IS NULL;--> statement-breakpoint

-- § Fase 14, ADR-0020 — backfill pointer BALIK "subscriptions.accurate_connection_id"
-- dari relasi 1:1 LAMA yang sama — subscription yang DULU sudah connect
-- (via accurate_connections.subscription_id) tetap "terhubung" apa
-- adanya setelah migration, tidak perlu re-OAuth.
UPDATE "subscriptions" s
SET "accurate_connection_id" = ac."id"
FROM "accurate_connections" ac
WHERE ac."subscription_id" = s."id" AND s."accurate_connection_id" IS NULL;--> statement-breakpoint
