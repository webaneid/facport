CREATE TABLE "autoproduksi_formula_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"formula_id" uuid NOT NULL,
	"item_no" varchar(100) NOT NULL,
	"item_unit_name" varchar(50) NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"warehouse_name" varchar(100),
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "autoproduksi_formulas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"data_usaha_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"finished_good_item_no" varchar(100) NOT NULL,
	"finished_good_item_unit_name" varchar(50) NOT NULL,
	"standard_cost" numeric(18, 2),
	"adjustment_account_no" varchar(50) NOT NULL,
	"branch_name" varchar(100) NOT NULL,
	"warehouse_name" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "autoproduksi_production_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"data_usaha_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"formula_id" uuid NOT NULL,
	"produced_qty" numeric(18, 4) NOT NULL,
	"trans_date" varchar(10) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"accurate_transaction_id" varchar(100),
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "autoproduksi_formula_items" ADD CONSTRAINT "autoproduksi_formula_items_formula_id_autoproduksi_formulas_id_fk" FOREIGN KEY ("formula_id") REFERENCES "public"."autoproduksi_formulas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autoproduksi_formulas" ADD CONSTRAINT "autoproduksi_formulas_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autoproduksi_formulas" ADD CONSTRAINT "autoproduksi_formulas_data_usaha_id_data_usaha_id_fk" FOREIGN KEY ("data_usaha_id") REFERENCES "public"."data_usaha"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autoproduksi_formulas" ADD CONSTRAINT "autoproduksi_formulas_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autoproduksi_production_entries" ADD CONSTRAINT "autoproduksi_production_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autoproduksi_production_entries" ADD CONSTRAINT "autoproduksi_production_entries_data_usaha_id_data_usaha_id_fk" FOREIGN KEY ("data_usaha_id") REFERENCES "public"."data_usaha"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autoproduksi_production_entries" ADD CONSTRAINT "autoproduksi_production_entries_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autoproduksi_production_entries" ADD CONSTRAINT "autoproduksi_production_entries_formula_id_autoproduksi_formulas_id_fk" FOREIGN KEY ("formula_id") REFERENCES "public"."autoproduksi_formulas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "autoproduksi_formula_items_formula_idx" ON "autoproduksi_formula_items" USING btree ("formula_id");--> statement-breakpoint
CREATE INDEX "autoproduksi_formulas_subscription_idx" ON "autoproduksi_formulas" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "autoproduksi_production_entries_subscription_idx" ON "autoproduksi_production_entries" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "autoproduksi_production_entries_formula_idx" ON "autoproduksi_production_entries" USING btree ("formula_id");