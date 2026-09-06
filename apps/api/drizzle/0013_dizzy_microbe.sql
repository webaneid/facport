ALTER TABLE "orders" ALTER COLUMN "invoice_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "external_id";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "amount";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "payment_method";--> statement-breakpoint
ALTER TABLE "orders" DROP COLUMN "raw_webhook_payload";