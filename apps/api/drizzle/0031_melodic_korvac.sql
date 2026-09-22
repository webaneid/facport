CREATE TABLE "conversion_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"data_usaha_id" uuid NOT NULL,
	"subscription_id" uuid NOT NULL,
	"module_key" varchar(50) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"row_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversion_logs" ADD CONSTRAINT "conversion_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_logs" ADD CONSTRAINT "conversion_logs_data_usaha_id_data_usaha_id_fk" FOREIGN KEY ("data_usaha_id") REFERENCES "public"."data_usaha"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_logs" ADD CONSTRAINT "conversion_logs_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;