import { Elysia, t } from "elysia";
import { eq, desc } from "drizzle-orm";
import { db } from "../../lib/db";
import { plans, subscriptions, auditLogs } from "../../db/schema";
import { permissionPlugin } from "../../lib/permission";

export const adminSubscriptionsRoute = new Elysia({ prefix: "/admin/subscriptions" })
  .use(permissionPlugin)
  // § Fase 10 — riwayat subscription 1 user, dipakai halaman `/admin/users`
  // (dialog "Kelola Langganan") — TIDAK ada halaman `/admin/subscriptions`
  // terpisah, sengaja digabung jadi 1 alur (§ phase-10 doc Known Limitations).
  .get(
    "/",
    async ({ query }) => {
      const rows = await db
        .select({
          id: subscriptions.id,
          status: subscriptions.status,
          startAt: subscriptions.startAt,
          endAt: subscriptions.endAt,
          createdAt: subscriptions.createdAt,
          planId: subscriptions.planId,
          planName: plans.name,
          planModules: plans.modules,
        })
        .from(subscriptions)
        .innerJoin(plans, eq(subscriptions.planId, plans.id))
        .where(eq(subscriptions.userId, query.userId))
        .orderBy(desc(subscriptions.createdAt));
      return { subscriptions: rows };
    },
    { permission: "subscriptions.manage", query: t.Object({ userId: t.String() }) },
  )
  .post(
    "/",
    async ({ body, user, set }) => {
      const [plan] = await db.select().from(plans).where(eq(plans.id, body.planId));
      if (!plan) {
        set.status = 404;
        return { code: "PLAN_NOT_FOUND" };
      }

      const startAt = new Date();
      // § ADR-0016 — endAt WAJIB diinput admin, BUKAN dihitung otomatis
      // dari plan.durationDays (yang cuma dipakai jalur self-service
      // checkout). Admin-provisioned justru sering butuh tanggal custom
      // (kontrak korporat, dst).
      const endAt = new Date(body.endAt);
      if (endAt.getTime() <= startAt.getTime()) {
        set.status = 400;
        return { code: "END_AT_MUST_BE_FUTURE" };
      }

      // orderId = null — dianggap sudah dibayar di luar sistem (invoice
      // manual/kontrak korporat), § architecture-subscription.md
      const [subscription] = await db
        .insert(subscriptions)
        .values({ userId: body.userId, planId: plan.id, status: "active", startAt, endAt })
        .returning();

      await db.insert(auditLogs).values({
        entityType: "subscription",
        entityId: subscription!.id,
        action: "create",
        changes: { userId: body.userId, planId: plan.id, endAt: endAt.toISOString(), provisionedBy: "admin" },
        actorId: user.id,
      });

      return subscription;
    },
    {
      permission: "subscriptions.manage",
      body: t.Object({
        userId: t.String(),
        planId: t.String({ format: "uuid" }),
        endAt: t.String({ format: "date-time" }),
      }),
    },
  )
  // § Fase 11, ADR-0016 — edit endAt subscription "active" yang SUDAH
  // ADA (perpanjang/perpendek), tanpa bikin baris subscription baru
  // (beda dari POST di atas yang selalu bikin baris baru).
  .patch(
    "/:id",
    async ({ params, body, user, set }) => {
      const [existing] = await db.select().from(subscriptions).where(eq(subscriptions.id, params.id));
      if (!existing) {
        set.status = 404;
        return { code: "SUBSCRIPTION_NOT_FOUND" };
      }
      if (existing.status !== "active") {
        set.status = 400;
        return { code: "SUBSCRIPTION_NOT_ACTIVE" };
      }

      const newEndAt = new Date(body.endAt);
      if (newEndAt.getTime() <= Date.now()) {
        set.status = 400;
        return { code: "END_AT_MUST_BE_FUTURE" };
      }

      const [updated] = await db
        .update(subscriptions)
        .set({ endAt: newEndAt })
        .where(eq(subscriptions.id, params.id))
        .returning();

      await db.insert(auditLogs).values({
        entityType: "subscription",
        entityId: params.id,
        action: "update",
        changes: { endAt: { old: existing.endAt?.toISOString() ?? null, new: newEndAt.toISOString() } },
        actorId: user.id,
      });

      return updated;
    },
    {
      permission: "subscriptions.manage",
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({ endAt: t.String({ format: "date-time" }) }),
    },
  );
