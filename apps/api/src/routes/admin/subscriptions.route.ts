import { Elysia, t } from "elysia";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../../lib/db";
import { plans, subscriptions, auditLogs, accurateConnections } from "../../db/schema";
import { permissionPlugin } from "../../lib/permission";
import { createNotification, NOTIFICATION_TYPES } from "../../lib/notifications";
import { getOrCreateDefaultDataUsaha, ownsDataUsaha } from "../../lib/data-usaha";

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

      // § Fase 108, architecture-user-tambahan.md § Fase B1 — admin
      // belum pilih Data Usaha spesifik lewat body di sebagian besar
      // pemanggilan endpoint ini (UI itu menyusul Fase 109/110) — kalau
      // tidak dikirim, reuse/buat "Data Usaha Utama" default.
      // § security review Fase 107/108 — kalau admin KIRIM dataUsahaId
      // eksplisit, WAJIB divalidasi itu benar milik body.userId (target
      // user), bukan cuma divalidasi format UUID — tanpa ini admin bisa
      // (sengaja/keliru) bikin subscription userId A menempel ke
      // data_usaha milik user B, merusak invariant 1 data_usaha = 1
      // pemilik yang jadi dasar guard checkout/trial (`ownsDataUsaha`).
      if (body.dataUsahaId && !(await ownsDataUsaha(body.userId, body.dataUsahaId))) {
        set.status = 404;
        return { code: "DATA_USAHA_NOT_FOUND" };
      }
      const dataUsahaId = body.dataUsahaId ?? (await getOrCreateDefaultDataUsaha(body.userId));

      // § ditemukan 2026-09-07 — sama fix-nya seperti admin/orders.route.ts
      // POST /:id/confirm: tutup subscription aktif LAIN utk modul yang
      // sama SEBELUM insert baru (mis. user punya trial aktif, admin
      // assign manual paket asli) — cegah 2 subscription "active"
      // bersamaan utk 1 modul yang sama. § Fase 108 — di-SCOPE PER DATA
      // USAHA (bukan lagi per akun) — modul yang sama BOLEH aktif di
      // Data Usaha LAIN, konsisten guard checkout/trial customer.
      const moduleKey = plan.modules[0];
      const existingActive = await db
        .select({ id: subscriptions.id, modules: plans.modules })
        .from(subscriptions)
        .innerJoin(plans, eq(plans.id, subscriptions.planId))
        .where(and(eq(subscriptions.userId, body.userId), eq(subscriptions.status, "active"), eq(subscriptions.dataUsahaId, dataUsahaId)));
      for (const s of existingActive.filter((s) => s.modules[0] === moduleKey)) {
        await db.update(subscriptions).set({ status: "cancelled", endAt: startAt }).where(eq(subscriptions.id, s.id));
      }

      // orderId = null — dianggap sudah dibayar di luar sistem (invoice
      // manual/kontrak korporat), § architecture-subscription.md
      const [subscription] = await db
        .insert(subscriptions)
        .values({ userId: body.userId, planId: plan.id, status: "active", startAt, endAt, dataUsahaId })
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
        dataUsahaId: t.Optional(t.String({ format: "uuid" })),
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
  )
  // § Fase 92 (2026-09-10) — self-service admin untuk gap yang ditemukan
  // sesi ini: sebelum ini, koneksi Accurate yang bermasalah (mis. token
  // sudah di-revoke tapi subscription masih "menempel" ke koneksi lama)
  // cuma bisa diperbaiki dengan edit database manual. Cuma mengosongkan
  // `accurateConnectionId` MILIK SUBSCRIPTION INI — TIDAK menghapus baris
  // `accurate_connections` itu sendiri (bisa dipakai bareng subscription
  // lain, § ADR-0020) — customer tinggal klik "Hubungkan Ulang" (Fase 91)
  // dari sisi mereka setelah ini.
  .post(
    "/:id/disconnect-accurate",
    async ({ params, user, set }) => {
      const [existing] = await db.select().from(subscriptions).where(eq(subscriptions.id, params.id));
      if (!existing) {
        set.status = 404;
        return { code: "SUBSCRIPTION_NOT_FOUND" };
      }
      if (!existing.accurateConnectionId) {
        set.status = 400;
        return { code: "NOT_CONNECTED" };
      }

      const [connection] = await db.select().from(accurateConnections).where(eq(accurateConnections.id, existing.accurateConnectionId));
      const [plan] = await db.select().from(plans).where(eq(plans.id, existing.planId));

      await db.update(subscriptions).set({ accurateConnectionId: null }).where(eq(subscriptions.id, params.id));

      await db.insert(auditLogs).values({
        entityType: "subscription",
        entityId: params.id,
        action: "disconnect_accurate",
        changes: {
          previousConnectionId: existing.accurateConnectionId,
          previousAccurateDbAlias: connection?.accurateDbAlias ?? null,
        },
        actorId: user.id,
      });

      await createNotification({
        userId: existing.userId,
        type: NOTIFICATION_TYPES.ACCURATE_CONNECTION_DISCONNECTED_BY_ADMIN,
        title: "Koneksi Accurate diputuskan admin",
        body: `Koneksi Accurate untuk fitur ${plan?.name ?? "langganan kamu"}${connection?.accurateDbAlias ? ` (${connection.accurateDbAlias})` : ""} diputuskan oleh admin — hubungkan ulang untuk lanjut import.`,
        entityType: "subscription",
        entityId: params.id,
      });

      return { subscriptionId: params.id, disconnected: true };
    },
    {
      permission: "subscriptions.manage",
      params: t.Object({ id: t.String({ format: "uuid" }) }),
    },
  );
