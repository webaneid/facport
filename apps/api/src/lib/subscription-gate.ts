import { Elysia } from "elysia";
import { eq, and, desc } from "drizzle-orm";
import { auth } from "./auth";
import { db } from "./db";
import { subscriptions, plans } from "../db/schema";

// § architecture-subscription.md § "Gating Akses Modul" — LAPISAN TERPISAH
// dari RBAC permission (lib/permission.ts). Permission jawab "role kamu
// boleh manggil endpoint import sama sekali?"; ini jawab "ADA subscription
// AKTIF yang TERMASUK modul spesifik ini?".
// § Fase 14, ADR-0019 — PLURAL (array), ganti getActiveSubscriptionWithPlan
// (singular, ambil 1 baris terbaru) — sejak 1 subscription = 1 sub-modul,
// 1 user BOLEH punya banyak subscription aktif bersamaan (1 per modul
// dibeli), bukan cuma 1.
export async function getActiveSubscriptionsWithPlans(userId: string) {
  return db
    .select({ subscription: subscriptions, plan: plans })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
    // § security review 2026-09-04 (Low) — urutan WAJIB deterministik.
    // Invariant "1 modul aktif = 1 subscription" TIDAK dijaga unique
    // constraint DB — kalau user somehow punya 2 subscription aktif yang
    // sama-sama cover modul X, `.find()` di moduleAccess macro (di bawah)
    // harus konsisten ambil yang SAMA tiap request (terbaru), bukan
    // tergantung urutan return Postgres yang tidak dijamin tanpa ORDER BY.
    .orderBy(desc(subscriptions.createdAt));
  // § endAt > now TIDAK dicek manual di sini — job EXPIRE_SUBSCRIPTIONS
  // (§ architecture-jobs.md, jalan tiap hari) yang jaga `status` selalu
  // konsisten begitu lewat endAt, pola dari sebelum Fase 14, tidak berubah.
}

export const subscriptionGatePlugin = new Elysia({ name: "subscription-gate" }).macro({
  moduleAccess: (moduleKey: string) => ({
    async resolve({ status, request: { headers } }) {
      const session = await auth.api.getSession({ headers });
      if (!session) return status(401);

      const activeSubs = await getActiveSubscriptionsWithPlans(session.user.id);
      // § Fase 14 — moduleKey dicari lintas SEMUA subscription aktif
      // (union), bukan cuma 1 baris terbaru. `matching.subscription` yang
      // dikembalikan adalah baris SPESIFIK yang cover moduleKey ini —
      // route pemanggil pakai ini buat resolve `accurateConnectionId`
      // modul yang bersangkutan (tiap sub-modul bisa beda koneksi
      // Accurate, § architecture-accurate-integration.md § 1).
      const matching = activeSubs.find((s) => s.plan.modules.includes(moduleKey));
      // § 1 kode error (gabung SUBSCRIPTION_INACTIVE + MODULE_NOT_IN_PLAN
      // lama) — beda-in "tidak ada subscription" vs "ada tapi bukan modul
      // ini" sudah tidak relevan begitu 1 user bisa punya banyak
      // subscription independen; dari sudut pandang customer sama-sama
      // "sub-modul ini belum kamu langganan".
      if (!matching) return status(403, { code: "MODULE_NOT_SUBSCRIBED" });

      return { user: session.user, session: session.session, subscription: matching.subscription };
    },
  }),
});
