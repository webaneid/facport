ALTER TABLE "import_batches" ALTER COLUMN "status" SET DEFAULT 'mapping_pending';--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN "column_mapping" jsonb;