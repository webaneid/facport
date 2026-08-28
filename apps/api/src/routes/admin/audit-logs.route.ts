import { Elysia, t } from "elysia";
import { desc } from "drizzle-orm";
import { db } from "../../lib/db";
import { auditLogs } from "../../db/schema";
import { permissionPlugin } from "../../lib/permission";

// § Fase 10 — riwayat aksi admin (dashboard `/admin`), read-only ringkas.
// Permission TERPISAH dari plans/users/subscriptions.manage — cuma
// melihat, tidak berarti boleh mengubah apa pun.
export const adminAuditLogsRoute = new Elysia({ prefix: "/admin/audit-logs" }).use(permissionPlugin).get(
  "/",
  async ({ query }) => {
    const limit = query.limit ?? 10;
    const rows = await db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
    return { auditLogs: rows };
  },
  { permission: "audit.view", query: t.Object({ limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50 })) }) },
);
