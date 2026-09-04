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
  "users.manage",
  "subscriptions.manage",
  "audit.view", // § Fase 10 — lihat riwayat audit_logs (dashboard admin)
  "invoices.view", // § Fase 15 — lihat SEMUA invoice lintas user (GET /admin/invoices, GET /invoices/:id/pdf milik user lain)
];

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
  const admin = await upsertRole("admin", true);
  const customer = await upsertRole("customer", true);

  for (const key of ADMIN_PERMISSION_KEYS) await grant(admin.id, key);
  for (const key of CUSTOMER_PERMISSION_KEYS) {
    await grant(admin.id, key); // admin juga boleh, keperluan support
    await grant(customer.id, key);
  }

  logger.info("Seed selesai: role admin (izin penuh) + role customer.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error({ err }, "Seed gagal");
    process.exit(1);
  });
