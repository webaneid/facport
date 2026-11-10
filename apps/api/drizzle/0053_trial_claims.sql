CREATE TABLE "trial_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"accurate_db_id" varchar(100) NOT NULL,
	"module" varchar(50) NOT NULL,
	"subscription_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"data_usaha_id" uuid,
	"rows_used" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	"released_by" text,
	"release_reason" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "trial_claims_active_db_module_uidx" ON "trial_claims" USING btree ("accurate_db_id","module") WHERE "trial_claims"."released_at" IS NULL;--> statement-breakpoint
CREATE INDEX "trial_claims_subscription_idx" ON "trial_claims" USING btree ("subscription_id");--> statement-breakpoint
-- Seeding sekali (Fase 217, ADR-0054 butir 9): langganan trial yang Data Usaha-nya sudah punya database terpilih dianggap "sudah dicoba".
-- rows_used = 0 (riwayat baris sudah dipurge, tidak diketahui). Pasangan ganda (db+modul) -> langganan tertua. Akun internal dilewati.
INSERT INTO "trial_claims" ("accurate_db_id", "module", "subscription_id", "user_id", "data_usaha_id", "claimed_at")
SELECT DISTINCT ON (d."accurate_db_id", m.module) d."accurate_db_id", m.module, s."id", s."user_id", d."id", s."created_at"
FROM "subscriptions" s
JOIN "plans" p ON p."id" = s."plan_id"
JOIN "data_usaha" d ON d."id" = s."data_usaha_id"
CROSS JOIN LATERAL jsonb_array_elements_text(p."modules") AS m(module)
WHERE s."is_trial" = true
  AND d."accurate_db_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "user" u WHERE u."id" = s."user_id" AND u."is_internal" = true)
  AND NOT EXISTS (SELECT 1 FROM "user_roles" ur JOIN "roles" r ON r."id" = ur."role_id" WHERE ur."user_id" = s."user_id" AND r."name" IN ('admin', 'staff'))
ORDER BY d."accurate_db_id", m.module, s."created_at"
ON CONFLICT DO NOTHING;
