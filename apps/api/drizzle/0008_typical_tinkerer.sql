ALTER TABLE "accurate_connections" DROP CONSTRAINT "accurate_connections_subscription_id_unique";--> statement-breakpoint
ALTER TABLE "accurate_connections" ALTER COLUMN "subscription_id" DROP NOT NULL;--> statement-breakpoint
-- § Fase 14, ADR-0019 — backfill WAJIB sebelum SET NOT NULL: plan lama
-- (dibuat selama ADR-0015 berlaku) mungkin punya price NULL. 0 dipilih
-- sebagai placeholder eksplisit (BUKAN klaim "gratis" secara bisnis) —
-- admin WAJIB isi ulang harga sungguhan lewat /admin/plans manual
-- setelah migration ini, dicatat di phase-14 doc § Known Limitations.
UPDATE "plans" SET "price" = 0 WHERE "price" IS NULL;--> statement-breakpoint
ALTER TABLE "plans" ALTER COLUMN "price" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "accurate_connections" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "accurate_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "accurate_connections" ADD CONSTRAINT "accurate_connections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_accurate_connection_id_accurate_connections_id_fk" FOREIGN KEY ("accurate_connection_id") REFERENCES "public"."accurate_connections"("id") ON DELETE no action ON UPDATE no action;