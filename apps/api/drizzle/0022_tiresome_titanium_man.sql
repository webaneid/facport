CREATE TABLE "member_seats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"primary_user_id" text NOT NULL,
	"data_usaha_id" uuid NOT NULL,
	"seat_subscription_id" uuid NOT NULL,
	"member_user_id" text,
	"invited_email" varchar(255),
	"invite_token_hash" text,
	"invite_token_expires_at" timestamp with time zone,
	"status" varchar(20) DEFAULT 'available' NOT NULL,
	"invited_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_seats_seat_subscription_id_unique" UNIQUE("seat_subscription_id")
);
--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "kind" varchar(20) DEFAULT 'module' NOT NULL;--> statement-breakpoint
ALTER TABLE "member_seats" ADD CONSTRAINT "member_seats_primary_user_id_user_id_fk" FOREIGN KEY ("primary_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_seats" ADD CONSTRAINT "member_seats_data_usaha_id_data_usaha_id_fk" FOREIGN KEY ("data_usaha_id") REFERENCES "public"."data_usaha"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_seats" ADD CONSTRAINT "member_seats_seat_subscription_id_subscriptions_id_fk" FOREIGN KEY ("seat_subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_seats" ADD CONSTRAINT "member_seats_member_user_id_user_id_fk" FOREIGN KEY ("member_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_seats" ADD CONSTRAINT "member_seats_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;