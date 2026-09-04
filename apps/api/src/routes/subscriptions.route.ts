import { Elysia, t } from "elysia";
import { randomUUID } from "crypto";
import { eq, desc, and } from "drizzle-orm";
import { db } from "../lib/db";
import { orders, plans, subscriptions } from "../db/schema";
import { permissionPlugin } from "../lib/permission";

export const subscriptionsRoute = new Elysia()
  .use(permissionPlugin)
  // § Fase 14, ADR-0019 — PLURAL (semua subscription AKTIF user), ganti
  // GET /me/subscription (singular, 1 baris terbaru apa pun status-nya).
  // 1 user sekarang bisa punya banyak subscription aktif bersamaan (1
  // per sub-modul dibeli) — dipakai sidebar/dashboard buat tahu union
  // modul yang dia langganan.
  .get(
    "/me/subscriptions",
    async ({ user }) => {
      const rows = await db
        .select({ subscription: subscriptions, plan: plans })
        .from(subscriptions)
        .innerJoin(plans, eq(plans.id, subscriptions.planId))
        .where(and(eq(subscriptions.userId, user.id), eq(subscriptions.status, "active")))
        .orderBy(desc(subscriptions.createdAt));
      return { subscriptions: rows };
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
      // § Fase 14, ADR-0019 — `plans.price` WAJIB lagi (supersede
      // ADR-0015), cek "harga null" sudah tidak relevan lagi.

      // § architecture-payment.md — provider (Ipaymu) BELUM diintegrasi
      // (§ Fase 16, ADR-0021 direncanakan). Order & subscription tetap
      // dibuat (status pending_payment) supaya alur bisa di-test
      // end-to-end minus redirect ke payment gateway asli — lihat Known
      // Limitations docs/phases/phase-01-fondasi-produk.md. Endpoint ini
      // MASIH 1-plan-per-checkout (bukan cart) — cart multi-modul §
      // Fase 16 rework `{ planIds: uuid[] }`.
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
