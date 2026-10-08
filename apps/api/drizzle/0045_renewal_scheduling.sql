ALTER TABLE "orders" ADD COLUMN "origin" varchar(12) DEFAULT 'checkout' NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "renewal_interval" varchar(10);--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "renewal_invoiced_for_end_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD COLUMN "renewal_interval" varchar(10);