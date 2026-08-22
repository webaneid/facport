import { Elysia } from "elysia";
import { eq, and, desc } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "./db";
import { subscriptions, plans } from "../db/schema";

// § architecture-subscription.md § "Gating Akses Modul" — LAPISAN TERPISAH
// dari RBAC permission (lib/permission.ts). Permission jawab "role kamu
// boleh manggil endpoint import sama sekali?"; ini jawab "paket langganan
// kamu AKTIF dan TERMASUK modul spesifik ini?". Belum dipakai route manapun
// di Fase 01 — disiapkan sekarang, dipakai mulai Fase 02 (Modul Pembelian).
export async function getActiveSubscriptionWithPlan(userId: string) {
  const [row] = await db
    .select({ subscription: subscriptions, plan: plans })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  return row ?? null;
}

export const subscriptionGatePlugin = new Elysia({ name: "subscription-gate" }).macro({
  moduleAccess: (moduleKey: string) => ({
    async resolve({ status, request: { headers } }) {
      const session = await auth.api.getSession({ headers });
      if (!session) return status(401);

      const active = await getActiveSubscriptionWithPlan(session.user.id);
      if (!active) return status(403, { code: "SUBSCRIPTION_INACTIVE" });

      if (!active.plan.modules.includes(moduleKey)) {
        return status(403, { code: "MODULE_NOT_IN_PLAN" });
      }

      return { user: session.user, session: session.session, subscription: active.subscription };
    },
  }),
});
