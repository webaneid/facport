ALTER TABLE "plans" ALTER COLUMN "price" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "import_retention_days_override" integer;