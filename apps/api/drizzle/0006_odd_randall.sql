ALTER TABLE "import_batch_rows" ADD COLUMN "accurate_detail_item_id" varchar(100);--> statement-breakpoint
ALTER TABLE "import_batch_rows" ADD COLUMN "cancelled_at" timestamp with time zone;