ALTER TABLE "autoproduksi_formulas" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "autoproduksi_production_entries" ADD COLUMN "branch_name" varchar(100);--> statement-breakpoint
ALTER TABLE "autoproduksi_production_entries" ADD COLUMN "warehouse_name" varchar(100);--> statement-breakpoint
ALTER TABLE "autoproduksi_production_entries" ADD COLUMN "raw_material_warehouse_name" varchar(100);--> statement-breakpoint
ALTER TABLE "autoproduksi_production_entries" ADD COLUMN "project_no" varchar(50);--> statement-breakpoint
ALTER TABLE "autoproduksi_production_entries" ADD COLUMN "department_name" varchar(100);--> statement-breakpoint
ALTER TABLE "autoproduksi_formula_items" DROP COLUMN "warehouse_name";--> statement-breakpoint
ALTER TABLE "autoproduksi_formula_items" DROP COLUMN "project_no";--> statement-breakpoint
ALTER TABLE "autoproduksi_formula_items" DROP COLUMN "department_name";--> statement-breakpoint
ALTER TABLE "autoproduksi_formulas" DROP COLUMN "branch_name";--> statement-breakpoint
ALTER TABLE "autoproduksi_formulas" DROP COLUMN "warehouse_name";--> statement-breakpoint
ALTER TABLE "autoproduksi_formulas" DROP COLUMN "finished_good_project_no";--> statement-breakpoint
ALTER TABLE "autoproduksi_formulas" DROP COLUMN "finished_good_department_name";