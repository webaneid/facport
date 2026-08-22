import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db";
import { plans, auditLogs } from "../../db/schema";
import { permissionPlugin } from "../../lib/permission";

const planBody = t.Object({
  name: t.String({ minLength: 1, maxLength: 100 }),
  price: t.Integer({ minimum: 0 }),
  durationDays: t.Integer({ minimum: 1 }),
  modules: t.Array(t.String()),
  isActive: t.Optional(t.Boolean()),
});

export const adminPlansRoute = new Elysia({ prefix: "/admin/plans" })
  .use(permissionPlugin)
  .post(
    "/",
    async ({ body, user }) => {
      const [plan] = await db.insert(plans).values(body).returning();
      await db.insert(auditLogs).values({
        entityType: "plan",
        entityId: plan!.id,
        action: "create",
        changes: body,
        actorId: user.id,
      });
      return plan;
    },
    { permission: "plans.manage", body: planBody },
  )
  .put(
    "/:id",
    async ({ params, body, user, set }) => {
      const [existing] = await db.select().from(plans).where(eq(plans.id, params.id));
      if (!existing) {
        set.status = 404;
        return { code: "PLAN_NOT_FOUND" };
      }
      const [updated] = await db
        .update(plans)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(plans.id, params.id))
        .returning();
      await db.insert(auditLogs).values({
        entityType: "plan",
        entityId: params.id,
        action: "update",
        changes: body,
        actorId: user.id,
      });
      return updated;
    },
    { permission: "plans.manage", params: t.Object({ id: t.String({ format: "uuid" }) }), body: planBody },
  )
  .delete(
    "/:id",
    async ({ params, user, set }) => {
      const [existing] = await db.select().from(plans).where(eq(plans.id, params.id));
      if (!existing) {
        set.status = 404;
        return { code: "PLAN_NOT_FOUND" };
      }
      // Soft — nonaktifkan, JANGAN hard delete (subscription lama masih
      // referensi planId ini, § architecture-database.md soft delete)
      await db.update(plans).set({ isActive: false, updatedAt: new Date() }).where(eq(plans.id, params.id));
      await db.insert(auditLogs).values({
        entityType: "plan",
        entityId: params.id,
        action: "delete",
        changes: { isActive: { from: existing.isActive, to: false } },
        actorId: user.id,
      });
      return { id: params.id };
    },
    { permission: "plans.manage", params: t.Object({ id: t.String({ format: "uuid" }) }) },
  );
