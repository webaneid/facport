CREATE TABLE "data_usaha" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" varchar(200) NOT NULL,
	"accurate_connection_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_usaha_accurate_connection_id_unique" UNIQUE("accurate_connection_id")
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "data_usaha_id" uuid;--> statement-breakpoint
ALTER TABLE "data_usaha" ADD CONSTRAINT "data_usaha_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_usaha" ADD CONSTRAINT "data_usaha_accurate_connection_id_accurate_connections_id_fk" FOREIGN KEY ("accurate_connection_id") REFERENCES "public"."accurate_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_data_usaha_id_data_usaha_id_fk" FOREIGN KEY ("data_usaha_id") REFERENCES "public"."data_usaha"("id") ON DELETE no action ON UPDATE no action;