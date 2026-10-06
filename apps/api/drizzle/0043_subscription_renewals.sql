CREATE TABLE "subscription_renewals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"order_id" uuid,
	"invoice_item_id" uuid,
	"source" varchar(10) NOT NULL,
	"previous_end_at" timestamp with time zone NOT NULL,
	"new_end_at" timestamp with time zone NOT NULL,
	"interval" varchar(10) NOT NULL,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subscription_renewals" ADD CONSTRAINT "subscription_renewals_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_renewals" ADD CONSTRAINT "subscription_renewals_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_renewals" ADD CONSTRAINT "subscription_renewals_invoice_item_id_invoice_items_id_fk" FOREIGN KEY ("invoice_item_id") REFERENCES "public"."invoice_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_renewals" ADD CONSTRAINT "subscription_renewals_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscription_renewals_subscription_id_idx" ON "subscription_renewals" USING btree ("subscription_id");--> statement-breakpoint
CREATE INDEX "subscription_renewals_invoice_item_id_idx" ON "subscription_renewals" USING btree ("invoice_item_id");