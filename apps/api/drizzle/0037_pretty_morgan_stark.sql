CREATE TABLE "autoproduksi_intermediary_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"data_usaha_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"account_no" varchar(50) NOT NULL,
	"account_name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "autoproduksi_intermediary_accounts" ADD CONSTRAINT "autoproduksi_intermediary_accounts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autoproduksi_intermediary_accounts" ADD CONSTRAINT "autoproduksi_intermediary_accounts_data_usaha_id_data_usaha_id_fk" FOREIGN KEY ("data_usaha_id") REFERENCES "public"."data_usaha"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autoproduksi_intermediary_accounts" ADD CONSTRAINT "autoproduksi_intermediary_accounts_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "autoproduksi_intermediary_accounts_subscription_no_uidx" ON "autoproduksi_intermediary_accounts" USING btree ("subscription_id","account_no");--> statement-breakpoint
CREATE INDEX "autoproduksi_intermediary_accounts_subscription_idx" ON "autoproduksi_intermediary_accounts" USING btree ("subscription_id");