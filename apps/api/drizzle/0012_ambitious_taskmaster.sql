CREATE TABLE "invoice_sequences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" smallint NOT NULL,
	"month" smallint NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_sequences_year_month_unique" UNIQUE("year","month")
);
--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_external_id_unique";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "external_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "amount" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "method" varchar(20);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "unique_code" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "bank_account_ref" varchar(50);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "qris_account_ref" varchar(50);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "transfer_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "proof_url" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payer_note" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "confirmed_by" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "rejected_by" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "rejection_note" text;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_confirmed_by_user_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_rejected_by_user_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;