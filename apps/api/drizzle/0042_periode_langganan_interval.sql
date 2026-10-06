ALTER TABLE "plans" ADD COLUMN "interval" varchar(10) DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "period_anchor_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "period_months" integer;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD COLUMN "interval" varchar(10);
--> statement-breakpoint
-- Backfill (ADR-0041): >= 360 hari = tahunan (360 = tahun lama 12x30, 365 = tahun baru), selain itu bulanan.
UPDATE "plans" SET "interval" = 'yearly' WHERE "duration_days" >= 360;--> statement-breakpoint
UPDATE "invoice_items" SET "interval" = CASE WHEN "duration_days" >= 360 THEN 'yearly' ELSE 'monthly' END;
