ALTER TABLE "autoproduksi_formula_items" ADD COLUMN "item_name" varchar(255);--> statement-breakpoint
ALTER TABLE "autoproduksi_formulas" ADD COLUMN "finished_good_item_name" varchar(255);--> statement-breakpoint
ALTER TABLE "autoproduksi_formulas" ADD COLUMN "adjustment_account_name" varchar(255);