import { Elysia, t } from "elysia";
import { desc, ilike } from "drizzle-orm";
import { db } from "../../lib/db";
import { announcements } from "../../db/schema";
import { permissionPlugin } from "../../lib/permission";
import { createAnnouncement } from "../../lib/announcements";
import { boss, JOBS } from "../../lib/queue";

// § Fase 45, ADR-0029 — konten broadcast ASLI disimpan di sini; penerima
// fan-out (§ `notifications` table) dibuat ASYNC lewat `JOBS.SEND_ANNOUNCEMENT`
// (worker, workers/index.ts) — endpoint POST balik SEGERA, tidak nunggu
// resolve target + bulk-insert selesai (bisa banyak baris kalau
// target="all_customers").
export const adminAnnouncementsRoute = new Elysia({ prefix: "/admin/announcements" })
  .use(permissionPlugin)
  .get(
    "/",
    async ({ query }) => {
      const search = query.search?.trim();
      // § Fase 105 (2026-09-11) — search judul saja (bukan `body`, isi
      // pengumuman bisa panjang & bukan yang biasa dicari admin untuk
      // menemukan pengumuman tertentu, beda dari nomor invoice/nama
      // yang jadi identifier alami di halaman lain).
      const rows = await db
        .select()
        .from(announcements)
        .where(search ? ilike(announcements.title, `%${search}%`) : undefined)
        .orderBy(desc(announcements.createdAt));
      return { announcements: rows };
    },
    { permission: "notifications.broadcast", query: t.Object({ search: t.Optional(t.String()) }) },
  )
  .post(
    "/",
    async ({ body, user, set }) => {
      if (body.target === "specific_modules" && (!body.targetModules || body.targetModules.length === 0)) {
        set.status = 400;
        return { code: "TARGET_MODULES_REQUIRED" };
      }
      if (body.target === "specific_users" && (!body.targetUserIds || body.targetUserIds.length === 0)) {
        set.status = 400;
        return { code: "TARGET_USER_IDS_REQUIRED" };
      }

      const announcement = await createAnnouncement({
        title: body.title,
        body: body.body,
        target: body.target,
        targetModules: body.targetModules,
        targetUserIds: body.targetUserIds,
        createdBy: user.id,
      });

      await boss.send(JOBS.SEND_ANNOUNCEMENT, { announcementId: announcement.id });

      return announcement;
    },
    {
      permission: "notifications.broadcast",
      body: t.Object({
        title: t.String({ minLength: 1, maxLength: 200 }),
        body: t.String({ minLength: 1 }),
        target: t.Union([t.Literal("all_customers"), t.Literal("specific_modules"), t.Literal("specific_users")]),
        targetModules: t.Optional(t.Array(t.String())),
        targetUserIds: t.Optional(t.Array(t.String())),
      }),
    },
  );
