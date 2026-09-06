import "../lib/env";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { logger } from "../lib/logger";
import { roles, permissions, rolePermissions } from "./schema";

// Permission admin-only (kelola settings/media/paket/user/subscription).
const ADMIN_PERMISSION_KEYS = [
  "settings.update",
  "media.manage",
  "media.upload",
  "plans.manage",
  "users.view", // § Fase 29, ADR-0027 — lihat daftar user, dipisah dari users.manage
  "users.manage", // § Fase 29, ADR-0027 — SATU-SATUNYA permission yang TIDAK didapat role "staff" (Admin terbatas) — tambah/nonaktifkan user
  "subscriptions.manage",
  "audit.view", // § Fase 10 — lihat riwayat audit_logs (dashboard admin)
  "invoices.view", // § Fase 15 — lihat SEMUA invoice lintas user (GET /admin/invoices, GET /invoices/:id/pdf milik user lain)
  "invoices.manage", // § Fase 27, ADR-0025 — bikin invoice baru untuk user existing (POST /admin/invoices)
  "orders.manage", // § Fase 16 — antrian konfirmasi pembayaran (GET/POST /admin/orders/*)
  "notifications.broadcast", // § Fase 45 — buat pengumuman/broadcast ke customer
  "customer_care.manage", // § Fase 46 — kelola profil CS, jam kerja, analitik
];

// § Fase 29, ADR-0027 — role "staff" (label UI "Admin", beda dari
// "Super Admin" = role "admin") dapat SEMUA permission admin KECUALI
// yang ada di sini. Sengaja daftar EXCLUDE (bukan daftar terpisah penuh)
// supaya permission baru yang ditambah ke ADMIN_PERMISSION_KEYS otomatis
// ikut ke staff juga TANPA perlu diingat update 2 tempat — kecuali
// memang harus dikecualikan (masuk sini).
const STAFF_EXCLUDED_PERMISSION_KEYS = ["users.manage"];

// Permission customer (fitur import — digabung dengan requireModuleAccess()
// di route sungguhan, § architecture-subscription.md). Admin JUGA punya ini
// untuk keperluan support (§ architecture-domain-routing.md).
const CUSTOMER_PERMISSION_KEYS = ["import.create"];

async function upsertRole(name: string, isSystem: boolean) {
  const existing = await db.select().from(roles).where(eq(roles.name, name));
  if (existing[0]) return existing[0];
  const [created] = await db.insert(roles).values({ name, isSystem }).returning();
  return created!;
}

async function upsertPermission(key: string) {
  const existing = await db.select().from(permissions).where(eq(permissions.key, key));
  if (existing[0]) return existing[0];
  const [created] = await db.insert(permissions).values({ key }).returning();
  return created!;
}

async function grant(roleId: string, permissionKey: string) {
  const permission = await upsertPermission(permissionKey);
  await db
    .insert(rolePermissions)
    .values({ roleId, permissionId: permission.id })
    .onConflictDoNothing();
}

async function main() {
  const admin = await upsertRole("admin", true); // label UI: "Super Admin"
  const staff = await upsertRole("staff", true); // label UI: "Admin"
  const customer = await upsertRole("customer", true);

  for (const key of ADMIN_PERMISSION_KEYS) {
    await grant(admin.id, key);
    if (!STAFF_EXCLUDED_PERMISSION_KEYS.includes(key)) await grant(staff.id, key);
  }
  for (const key of CUSTOMER_PERMISSION_KEYS) {
    await grant(admin.id, key); // admin juga boleh, keperluan support
    await grant(staff.id, key); // § Fase 29 — staff juga boleh, sama alasan seperti admin
    await grant(customer.id, key);
  }

  logger.info("Seed selesai: role admin (Super Admin) + staff (Admin) + customer.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "Seed gagal");
    process.exit(1);
  });
