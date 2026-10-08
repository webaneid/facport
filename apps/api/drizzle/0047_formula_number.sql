ALTER TABLE "autoproduksi_formulas" ADD COLUMN "formula_number" integer;--> statement-breakpoint
ALTER TABLE "data_usaha" ADD COLUMN "formula_last_number" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "autoproduksi_formulas" f SET "formula_number" = r.rn FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY data_usaha_id ORDER BY created_at, id) AS rn FROM "autoproduksi_formulas") r WHERE f.id = r.id;--> statement-breakpoint
UPDATE "data_usaha" d SET "formula_last_number" = m.mx FROM (SELECT data_usaha_id, MAX(formula_number) AS mx FROM "autoproduksi_formulas" GROUP BY data_usaha_id) m WHERE d.id = m.data_usaha_id;--> statement-breakpoint
ALTER TABLE "autoproduksi_formulas" ALTER COLUMN "formula_number" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "autoproduksi_formulas_data_usaha_number_uidx" ON "autoproduksi_formulas" USING btree ("data_usaha_id","formula_number");
