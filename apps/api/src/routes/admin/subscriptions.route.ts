import { Elysia, t } from "elysia";
import { getCompanyTimezone } from "../../lib/company-timezone";
import { assignPlanToDataUsaha } from "../../lib/admin-assign";
import { eq, desc, inArray } from "drizzle-orm";
import { db } from "../../lib/db";
import { plans, subscriptions, auditLogs } from "../../db/schema";
import { permissionPlugin } from "../../lib/permission";
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

      const now = new Date();
      // § ADR-0016 + § Fase 174 (ADR-0041) — `endAt` OPSIONAL: tanpa `endAt` akhir dihitung dari periode paket (atau perpanjangan bila modul masih aktif,
      // § Fase 176); dengan `endAt` = override admin (kontrak khusus, tanggal+jam bebas, tidak terikat bulanan/tahunan).
      const customEnd = body.endAt ? new Date(body.endAt) : null;
      if (customEnd && customEnd.getTime() <= now.getTime()) {
        set.status = 400;
        return { code: "END_AT_MUST_BE_FUTURE" };
      }

      // § Fase 108 — kalau admin KIRIM dataUsahaId eksplisit, WAJIB divalidasi benar milik body.userId (security review Fase 107/108); tanpa itu,
      // reuse/buat "Data Usaha Utama" default.
      if (body.dataUsahaId && !(await ownsDataUsaha(body.userId, body.dataUsahaId))) {
        set.status = 404;
        return { code: "DATA_USAHA_NOT_FOUND" };
      }
      const dataUsahaId = body.dataUsahaId ?? (await getOrCreateDefaultDataUsaha(body.userId));
      const timeZone = await getCompanyTimezone();

      const result = await db.transaction((tx) => assignPlanToDataUsaha(tx, { userId: body.userId, plan, dataUsahaId, endAt: customEnd, now, timeZone, actorId: user.id }));
      // Bentuk respons lama dipertahankan: baris langganan (+ `renewed`/`previousEndAt` bila perpanjangan, § Fase 176).
      return result.renewed ? { ...result.subscription, renewed: true, previousEndAt: result.previousEndAt!.toISOString() } : result.subscription;
    },
    {
      permission: "subscriptions.manage",
      body: t.Object({
        userId: t.String(),
        planId: t.String({ format: "uuid" }),
        endAt: t.Optional(t.String({ format: "date-time" })),
        dataUsahaId: t.Optional(t.String({ format: "uuid" })),
      }),
    },
  )
  // § Fase 177, ADR-0041 — assign BANYAK paket sekaligus (komponen `SubscriptionPicker`, dialog Kelola Langganan): satu transaksi (semua atau tidak sama
  // sekali), satu `now` untuk semuanya (fitur baru berakhir di instan yang sama), aturan per paket sama dengan `POST /` (`assignPlanToDataUsaha`):
  // modul aktif → diperpanjang, selain itu baru. `endAt` (opsional) = override yang SAMA untuk semua paket.
  .post(
    "/bulk",
    async ({ body, user, set }) => {
      const planIds = [...new Set(body.planIds)];
      const planRows = await db.select().from(plans).where(inArray(plans.id, planIds));
      if (planRows.length !== planIds.length) {
        set.status = 404;
        return { code: "PLAN_NOT_FOUND" };
      }
      if (planRows.some((p) => !p.isActive)) {
        set.status = 400;
        return { code: "PLAN_NOT_ACTIVE" };
      }
      // 2 paket modul yang sama dalam 1 permintaan (mis. bulanan + tahunan) = ambigu → ditolak, bukan dipilih diam-diam. Seat (tanpa modul) boleh banyak.
      const seenModules = new Set<string>();
      for (const p of planRows) {
        const moduleKey = p.modules[0];
        if (!moduleKey) continue;
        if (seenModules.has(moduleKey)) {
          set.status = 400;
          return { code: "DUPLICATE_MODULE_IN_REQUEST", moduleKey };
        }
        seenModules.add(moduleKey);
      }

      const now = new Date();
      const customEnd = body.endAt ? new Date(body.endAt) : null;
      if (customEnd && customEnd.getTime() <= now.getTime()) {
        set.status = 400;
        return { code: "END_AT_MUST_BE_FUTURE" };
      }
      if (body.dataUsahaId && !(await ownsDataUsaha(body.userId, body.dataUsahaId))) {
        set.status = 404;
        return { code: "DATA_USAHA_NOT_FOUND" };
      }
      const dataUsahaId = body.dataUsahaId ?? (await getOrCreateDefaultDataUsaha(body.userId));
      const timeZone = await getCompanyTimezone();

      const results = await db.transaction(async (tx) => {
        const out = [];
        for (const plan of planRows) {
          const r = await assignPlanToDataUsaha(tx, { userId: body.userId, plan, dataUsahaId, endAt: customEnd, now, timeZone, actorId: user.id });
          out.push({
            planId: plan.id,
            subscriptionId: r.subscription.id,
            renewed: r.renewed,
            previousEndAt: r.previousEndAt?.toISOString() ?? null,
            endAt: r.subscription.endAt?.toISOString() ?? null,
          });
        }
        return out;
      });
      return { dataUsahaId, results };
    },
    {
      permission: "subscriptions.manage",
      body: t.Object({
        userId: t.String(),
        planIds: t.Array(t.String({ format: "uuid" }), { minItems: 1, maxItems: 60 }),
        endAt: t.Optional(t.String({ format: "date-time" })),
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
        // § Fase 174 — admin mengubah tanggal manual → jangkar dikosongkan (akhir tidak lagi = jangkar + N bulan); perpanjangan berikutnya
        // menetapkan jangkar baru di akhir saat itu (ADR-0041 poin 3).
        .set({ endAt: newEndAt, periodAnchorAt: null, periodMonths: null })
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
