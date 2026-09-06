import { Elysia, t } from "elysia";
import { eq, and, desc, count } from "drizzle-orm";
import { db } from "../lib/db";
import { notifications } from "../db/schema";
import { permissionPlugin } from "../lib/permission";

// § Fase 45 — dipakai SEMUA user login (customer MAUPUN admin/staff),
// keyed by `userId` — TIDAK ada endpoint terpisah per surface, notifikasi
// admin (mis. "ada bukti transfer baru") lewat jalur yang SAMA persis.
export const notificationsRoute = new Elysia()
  .use(permissionPlugin)
  .get(
    "/me/notifications",
    async ({ user, query }) => {
      const limit = query.limit ?? 10;
      const offset = query.offset ?? 0;
      const where = query.unreadOnly
        ? and(eq(notifications.userId, user.id), eq(notifications.isRead, false))
        : eq(notifications.userId, user.id);
      const [rows, totalRows] = await Promise.all([
        db.select().from(notifications).where(where).orderBy(desc(notifications.createdAt)).limit(limit).offset(offset),
        db.select({ total: count() }).from(notifications).where(where),
      ]);
      return { notifications: rows, total: totalRows[0]?.total ?? 0 };
    },
    {
      auth: true,
      query: t.Object({
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50 })),
        offset: t.Optional(t.Numeric({ minimum: 0 })),
        unreadOnly: t.Optional(t.Boolean()),
      }),
    },
  )
  // § dipoll ringan oleh bell dropdown (§ notification-bell.tsx) — SATU
  // angka saja, sengaja TERPISAH dari GET list di atas supaya polling
  // tiap 30 detik tidak ikut narik seluruh daftar tiap kali.
  .get(
    "/me/notifications/unread-count",
    async ({ user }) => {
      const [row] = await db
        .select({ total: count() })
        .from(notifications)
        .where(and(eq(notifications.userId, user.id), eq(notifications.isRead, false)));
      return { count: row?.total ?? 0 };
    },
    { auth: true },
  )
  .patch(
    "/me/notifications/:id/read",
    async ({ user, params, set }) => {
      const [existing] = await db.select().from(notifications).where(eq(notifications.id, params.id));
      if (!existing || existing.userId !== user.id) {
        set.status = 404;
        return { code: "NOTIFICATION_NOT_FOUND" };
      }
      const [updated] = await db
        .update(notifications)
        .set({ isRead: true, readAt: new Date() })
        .where(eq(notifications.id, params.id))
        .returning();
      return updated;
    },
    { auth: true, params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  .post(
    "/me/notifications/read-all",
    async ({ user }) => {
      await db
        .update(notifications)
        .set({ isRead: true, readAt: new Date() })
        .where(and(eq(notifications.userId, user.id), eq(notifications.isRead, false)));
      return { ok: true };
    },
    { auth: true },
  );
