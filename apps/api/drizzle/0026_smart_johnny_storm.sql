ALTER TABLE "invoice_items" ADD COLUMN "duration_days" integer;--> statement-breakpoint
UPDATE "invoice_items" SET "duration_days" = "plans"."duration_days" FROM "plans" WHERE "plans"."id" = "invoice_items"."plan_id";--> statement-breakpoint
ALTER TABLE "invoice_items" ALTER COLUMN "duration_days" SET NOT NULL;
