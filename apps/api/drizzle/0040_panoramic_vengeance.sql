CREATE TABLE "autoproduksi_defaults" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"data_usaha_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"branch_name" varchar(100),
	"warehouse_name" varchar(100),
	"raw_material_warehouse_name" varchar(100),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "autoproduksi_defaults_subscription_id_unique" UNIQUE("subscription_id")
);
--> statement-breakpoint
ALTER TABLE "autoproduksi_defaults" ADD CONSTRAINT "autoproduksi_defaults_data_usaha_id_data_usaha_id_fk" FOREIGN KEY ("data_usaha_id") REFERENCES "public"."data_usaha"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autoproduksi_defaults" ADD CONSTRAINT "autoproduksi_defaults_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;