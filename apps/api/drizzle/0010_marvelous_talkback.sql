ALTER TABLE "accurate_connections" DROP CONSTRAINT "accurate_connections_subscription_id_subscriptions_id_fk";
--> statement-breakpoint
ALTER TABLE "accurate_connections" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "accurate_connections" DROP COLUMN "subscription_id";