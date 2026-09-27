CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "import_batch_rows_batch_status_idx" ON "import_batch_rows" USING btree ("batch_id","status");--> statement-breakpoint
CREATE INDEX "import_batches_subscription_module_idx" ON "import_batches" USING btree ("subscription_id","module");--> statement-breakpoint
CREATE INDEX "subscriptions_data_usaha_status_idx" ON "subscriptions" USING btree ("data_usaha_id","status");--> statement-breakpoint
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscriptions_accurate_connection_id_idx" ON "subscriptions" USING btree ("accurate_connection_id");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","is_read");