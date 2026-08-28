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
      const endAt = new Date(startAt.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

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
        changes: { userId: body.userId, planId: plan.id, provisionedBy: "admin" },
        actorId: user.id,
      });

      return subscription;
    },
    {
      permission: "subscriptions.manage",
      body: t.Object({ userId: t.String(), planId: t.String({ format: "uuid" }) }),
    },
  );
