import { Elysia, t } from "elysia";
import { eq, and, gte, sql } from "drizzle-orm";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { db } from "../../lib/db";
import { customerCareAgents, customerCareClicks, settings, auditLogs } from "../../db/schema";
import { permissionPlugin } from "../../lib/permission";
import { minioClient, PUBLIC_MEDIA_BUCKET, ensurePublicBucket } from "../../lib/minio";
import { env } from "../../lib/env";
import { getCompanyTimezone, startOfTodayInTimezone, zonedTimeToUtc } from "../../lib/company-timezone";
import {
  isAgentOnline,
  getWorkSchedule,
  markAgentOfflineToday,
  markAgentOnlineNow,
  WORK_START_MINUTES_KEY,
  WORK_END_MINUTES_KEY,
  WORK_DAYS_KEY,
} from "../../lib/customer-care";

const ALLOWED_PHOTO_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

function publicUrl(key: string) {
  return `${env.MINIO_PUBLIC_URL}/${PUBLIC_MEDIA_BUCKET}/${key}`;
}

async function attachOnlineStatus(agents: (typeof customerCareAgents.$inferSelect)[]) {
  const timezone = await getCompanyTimezone();
  const schedule = await getWorkSchedule();
  const now = new Date();
  return agents.map((agent) => ({ ...agent, isOnlineNow: isAgentOnline(agent, now, timezone, schedule) }));
}

export const adminCustomerCareRoute = new Elysia({ prefix: "/admin/customer-care" })
  .use(permissionPlugin)
  .get(
    "/agents",
    async () => {
      const rows = await db.select().from(customerCareAgents).orderBy(customerCareAgents.createdAt);
      return { agents: await attachOnlineStatus(rows) };
    },
    { permission: "customer_care.manage" },
  )
  .post(
    "/agents",
    async ({ body, user }) => {
      const [agent] = await db
        .insert(customerCareAgents)
        .values({ name: body.name, position: body.position, whatsappNumber: body.whatsappNumber })
        .returning();
      await db.insert(auditLogs).values({ entityType: "customer_care_agent", entityId: agent!.id, action: "create", changes: body, actorId: user.id });
      return agent;
    },
    {
      permission: "customer_care.manage",
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 100 }),
        position: t.String({ minLength: 1, maxLength: 100 }),
        whatsappNumber: t.String({ minLength: 8, maxLength: 20, pattern: "^[0-9]+$" }),
      }),
    },
  )
  .put(
    "/agents/:id",
    async ({ params, body, user, set }) => {
      const [existing] = await db.select().from(customerCareAgents).where(eq(customerCareAgents.id, params.id));
      if (!existing) {
        set.status = 404;
        return { code: "AGENT_NOT_FOUND" };
      }
      const [updated] = await db
        .update(customerCareAgents)
        .set({ name: body.name, position: body.position, whatsappNumber: body.whatsappNumber, updatedAt: new Date() })
        .where(eq(customerCareAgents.id, params.id))
        .returning();
      await db.insert(auditLogs).values({ entityType: "customer_care_agent", entityId: params.id, action: "update", changes: body, actorId: user.id });
      return updated;
    },
    {
      permission: "customer_care.manage",
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 100 }),
        position: t.String({ minLength: 1, maxLength: 100 }),
        whatsappNumber: t.String({ minLength: 8, maxLength: 20, pattern: "^[0-9]+$" }),
      }),
    },
  )
  // § arsip PERMANEN (CS resign) — soft delete, pola sama `plans.isActive`.
  // BEDA dari `offline-today` (temporary, 1 hari).
  .delete(
    "/agents/:id",
    async ({ params, user, set }) => {
      const [existing] = await db.select().from(customerCareAgents).where(eq(customerCareAgents.id, params.id));
      if (!existing) {
        set.status = 404;
        return { code: "AGENT_NOT_FOUND" };
      }
      await db.update(customerCareAgents).set({ isActive: false, updatedAt: new Date() }).where(eq(customerCareAgents.id, params.id));
      await db.insert(auditLogs).values({
        entityType: "customer_care_agent",
        entityId: params.id,
        action: "delete",
        changes: { isActive: { from: existing.isActive, to: false } },
        actorId: user.id,
      });
      return { id: params.id };
    },
    { permission: "customer_care.manage", params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  // § mirror PERSIS `admin/branding.route.ts` POST /logo (Fase 12, ADR-0017)
  // — resize webp, simpan bucket PUBLIK, TIDAK lewat Media Library modal
  // (foto 1-per-agent, tidak butuh reuse/search lintas fitur).
  .post(
    "/agents/:id/photo",
    async ({ params, body, set }) => {
      const [existing] = await db.select().from(customerCareAgents).where(eq(customerCareAgents.id, params.id));
      if (!existing) {
        set.status = 404;
        return { code: "AGENT_NOT_FOUND" };
      }

      const buffer = Buffer.from(await body.file.arrayBuffer());
      try {
        await sharp(buffer).metadata();
      } catch {
        set.status = 400;
        return { code: "INVALID_IMAGE_FILE" };
      }

      await ensurePublicBucket();
      const key = `customer-care/agent-${params.id}-${randomUUID()}.webp`;
      const webpBuffer = await sharp(buffer).resize(256, 256, { fit: "cover" }).webp({ quality: 82 }).toBuffer();
      await minioClient.putObject(PUBLIC_MEDIA_BUCKET, key, webpBuffer);
      const url = publicUrl(key);

      await db.update(customerCareAgents).set({ photoUrl: url, updatedAt: new Date() }).where(eq(customerCareAgents.id, params.id));
      return { photoUrl: url };
    },
    {
      permission: "customer_care.manage",
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({ file: t.File({ type: [...ALLOWED_PHOTO_MIME], maxSize: "5m" }) }),
    },
  )
  .post(
    "/agents/:id/offline-today",
    async ({ params, user, set }) => {
      const [existing] = await db.select().from(customerCareAgents).where(eq(customerCareAgents.id, params.id));
      if (!existing) {
        set.status = 404;
        return { code: "AGENT_NOT_FOUND" };
      }
      const timezone = await getCompanyTimezone();
      const until = await markAgentOfflineToday(params.id, timezone);
      await db.insert(auditLogs).values({
        entityType: "customer_care_agent",
        entityId: params.id,
        action: "update",
        changes: { manuallyOfflineUntil: until.toISOString() },
        actorId: user.id,
      });
      return { manuallyOfflineUntil: until };
    },
    { permission: "customer_care.manage", params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  .post(
    "/agents/:id/online-now",
    async ({ params, user, set }) => {
      const [existing] = await db.select().from(customerCareAgents).where(eq(customerCareAgents.id, params.id));
      if (!existing) {
        set.status = 404;
        return { code: "AGENT_NOT_FOUND" };
      }
      await markAgentOnlineNow(params.id);
      await db.insert(auditLogs).values({
        entityType: "customer_care_agent",
        entityId: params.id,
        action: "update",
        changes: { manuallyOfflineUntil: null },
        actorId: user.id,
      });
      return { ok: true };
    },
    { permission: "customer_care.manage", params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  .get(
    "/settings",
    async () => getWorkSchedule(),
    { permission: "customer_care.manage" },
  )
  .put(
    "/settings",
    async ({ body, user }) => {
      if (body.workStartMinutes >= body.workEndMinutes) {
        return { code: "INVALID_WORK_HOURS" };
      }
      for (const [key, value, group] of [
        [WORK_START_MINUTES_KEY, body.workStartMinutes, "customer_care"],
        [WORK_END_MINUTES_KEY, body.workEndMinutes, "customer_care"],
        [WORK_DAYS_KEY, body.workDays, "customer_care"],
      ] as const) {
        await db
          .insert(settings)
          .values({ key, value, group, updatedBy: user.id })
          .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date(), updatedBy: user.id } });
      }
      return getWorkSchedule();
    },
    {
      permission: "customer_care.manage",
      body: t.Object({
        workStartMinutes: t.Integer({ minimum: 0, maximum: 1439 }),
        workEndMinutes: t.Integer({ minimum: 1, maximum: 1440 }),
        workDays: t.Array(t.Integer({ minimum: 0, maximum: 6 })),
      }),
    },
  )
  // § "sudah melayani berapa orang" — COUNT DISTINCT customer (userId)
  // per agent dalam periode, BUKAN raw click count (1 customer klik 2x
  // hari yang sama TIDAK dihitung 2 orang).
  .get(
    "/analytics",
    async ({ query }) => {
      const timezone = await getCompanyTimezone();
      const now = new Date();
      const periodStart = periodStartFor(query.period ?? "today", now, timezone);

      const rows = await db
        .select({ agentId: customerCareClicks.agentId, uniqueCustomers: sql<number>`count(distinct ${customerCareClicks.userId})` })
        .from(customerCareClicks)
        .where(gte(customerCareClicks.clickedAt, periodStart))
        .groupBy(customerCareClicks.agentId);

      return { analytics: rows.map((r) => ({ agentId: r.agentId, uniqueCustomers: Number(r.uniqueCustomers) })) };
    },
    {
      permission: "customer_care.manage",
      query: t.Object({ period: t.Optional(t.Union([t.Literal("today"), t.Literal("week"), t.Literal("month")])) }),
    },
  );

// § batas awal periode analitik, DIHITUNG di timezone perusahaan (BUKAN
// UTC/local server) — "hari ini" yang berbeda artinya di tiap timezone.
// Reuse `zonedTimeToUtc`/`startOfTodayInTimezone` (§ company-timezone.ts)
// — JANGAN re-implementasikan offset calculation lagi di sini.
function periodStartFor(period: "today" | "week" | "month", now: Date, timezone: string): Date {
  if (period === "today") return startOfTodayInTimezone(now, timezone);

  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const y = get("year");
  const m = get("month");
  const d = get("day");

  if (period === "week") {
    // § awal minggu = Senin (konsisten `DEFAULT_WORK_DAYS` yang mulai dari 1=Senin)
    const fakeUtc = new Date(Date.UTC(y, m - 1, d));
    const weekday = fakeUtc.getUTCDay(); // 0=Minggu
    const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
    const monday = new Date(Date.UTC(y, m - 1, d - daysSinceMonday));
    return zonedTimeToUtc(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate(), 0, 0, 0, 0, timezone);
  }
  return zonedTimeToUtc(y, m, 1, 0, 0, 0, 0, timezone); // "month" — tanggal 1 bulan ini
}
