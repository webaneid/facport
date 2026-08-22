import { Elysia, t } from "elysia";
import { randomUUID } from "crypto";
import { eq, desc } from "drizzle-orm";
import { db } from "../lib/db";
import { orders, plans, subscriptions } from "../db/schema";
import { permissionPlugin } from "../lib/permission";

export const subscriptionsRoute = new Elysia()
  .use(permissionPlugin)
  .get(
    "/me/subscription",
    async ({ user }) => {
      const [row] = await db
        .select({ subscription: subscriptions, plan: plans })
        .from(subscriptions)
        .innerJoin(plans, eq(plans.id, subscriptions.planId))
        .where(eq(subscriptions.userId, user.id))
        .orderBy(desc(subscriptions.createdAt))
        .limit(1);
      return row ?? null;
    },
    { auth: true },
  )
  .post(
    "/subscriptions/checkout",
    async ({ body, user, set }) => {
      const [plan] = await db.select().from(plans).where(eq(plans.id, body.planId));
      if (!plan) {
        set.status = 404;
        return { code: "PLAN_NOT_FOUND" };
      }

      // § architecture-payment.md — provider (Ipaymu/Xendit) BELUM final.
      // Order & subscription tetap dibuat (status pending_payment) supaya
      // alur bisa di-test end-to-end minus redirect ke payment gateway
      // asli — lihat Known Limitations docs/phases/phase-01-fondasi-produk.md
      const [order] = await db
        .insert(orders)
        .values({ externalId: randomUUID(), status: "pending", amount: plan.price })
        .returning();

      await db.insert(subscriptions).values({
        userId: user.id,
        planId: plan.id,
        orderId: order!.id,
        status: "pending_payment",
      });

      set.status = 501;
      return { code: "PAYMENT_PROVIDER_NOT_CONFIGURED", orderId: order!.id };
    },
    { auth: true, body: t.Object({ planId: t.String({ format: "uuid" }) }) },
  );
