ALTER TABLE "autoproduksi_formula_items" ADD COLUMN "project_no" varchar(50);--> statement-breakpoint
ALTER TABLE "autoproduksi_formula_items" ADD COLUMN "department_name" varchar(100);--> statement-breakpoint
ALTER TABLE "autoproduksi_formulas" ADD COLUMN "finished_good_project_no" varchar(50);--> statement-breakpoint
ALTER TABLE "autoproduksi_formulas" ADD COLUMN "finished_good_department_name" varchar(100);