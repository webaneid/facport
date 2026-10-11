-- § Fase 189C, ADR-0044 — izin baru `insights.view` (halaman/API Insight pelanggan) untuk Super Admin (role `admin`) DAN Admin (role `staff`), keputusan D6.
-- Production TIDAK menjalankan `db:seed` saat deploy, jadi izin ini masuk lewat migrasi data. IDEMPOTEN: aman dijalankan ulang dan aman bila `db:seed` (yang juga
-- menyebut izin ini) sudah/belum dijalankan. Role yang belum ada (DB kosong sebelum seed) dilewati — seed yang memberinya nanti.
INSERT INTO "permissions" ("key")
SELECT 'insights.view'
WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE "key" = 'insights.view');
--> statement-breakpoint
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."name" IN ('admin', 'staff') AND p."key" = 'insights.view'
ON CONFLICT DO NOTHING;
