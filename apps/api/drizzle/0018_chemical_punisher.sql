CREATE TABLE "customer_care_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"position" varchar(100) NOT NULL,
	"photo_url" text,
	"whatsapp_number" varchar(20) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"manually_offline_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_care_clicks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"clicked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_care_clicks" ADD CONSTRAINT "customer_care_clicks_agent_id_customer_care_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."customer_care_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_care_clicks" ADD CONSTRAINT "customer_care_clicks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;