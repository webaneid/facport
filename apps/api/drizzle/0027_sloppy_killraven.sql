ALTER TABLE "accurate_connections" ADD COLUMN "granted_scopes" text[];--> statement-breakpoint
ALTER TABLE "accurate_connections" ADD COLUMN "accurate_user_id" varchar(100);--> statement-breakpoint
ALTER TABLE "accurate_connections" ADD COLUMN "accurate_user_email" varchar(255);