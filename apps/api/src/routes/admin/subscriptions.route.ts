import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db";
import { plans, subscriptions, auditLogs } from "../../db/schema";
import { permissionPlugin } from "../../lib/permission";

export const adminSubscriptionsRoute = new Elysia({ prefix: "/admin/subscriptions" })
  .use(permissionPlugin)
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
