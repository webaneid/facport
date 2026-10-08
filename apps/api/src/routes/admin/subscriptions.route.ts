import { Elysia, t } from "elysia";
import { getCompanyTimezone } from "../../lib/company-timezone";
import { assignPlanToDataUsaha } from "../../lib/admin-assign";
import { renewSubscriptionInPlace } from "../../lib/subscription-renewal";
import { issueRenewalInvoiceNow, RenewalIssueError } from "../../lib/renewal-billing";
import { eq, desc, inArray, sql } from "drizzle-orm";
import { createInvoiceAndOrder, createPaidInvoiceAndOrder, inFlightModuleKeys } from "../../lib/invoice-order";
import { db } from "../../lib/db";
import { plans, subscriptions, auditLogs, user as userTable } from "../../db/schema";
import { permissionPlugin, userHasPermission } from "../../lib/permission";
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
  // § Fase 177/178, ADR-0041 — assign BANYAK paket sekaligus (komponen `SubscriptionPicker`, dialog Kelola Langganan): satu transaksi (semua atau tidak sama
  // sekali), satu `now`. MODE PEMBAYARAN (`payment`):
  //  - "free" (default, perilaku Fase 177): aktifkan langsung TANPA invoice (hadiah/kompensasi/kontrak khusus); aturan per paket sama dengan `POST /`
  //    (`assignPlanToDataUsaha`: modul aktif → diperpanjang, selain itu baru). Hanya mode ini yang boleh `endAt` override (sama untuk semua paket).
  //  - "paid_invoice": invoice dibuat OTOMATIS LUNAS + langganan aktif & tertaut ke invoice (catatan/PDF untuk pembukuan), inti aktivasi yang sama dengan
  //    konfirmasi pembayaran.
  //  - "invoice": invoice BELUM dibayar untuk customer (aktif saat admin menyetujui pembayarannya) — tambahan izin `invoices.manage`.
  // Mode invoice menolak fitur yang masih punya pesanan belum selesai (`MODULE_ORDER_IN_PROGRESS`) — batalkan dulu invoice lamanya.
  .post(
    "/bulk",
    async ({ body, user, set }) => {
      const mode = body.payment ?? "free";
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
      // 2 paket modul yang sama dalam 1 permintaan (mis. bulanan + tahunan) = ambigu → ditolak, bukan dipilih diam-diam. Seat (tanpa modul) boleh.
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

      if (mode !== "free" && body.endAt) {
        set.status = 400;
        return { code: "END_AT_ONLY_FOR_FREE" };
      }
      if (mode === "invoice" && !(await userHasPermission(user.id, "invoices.manage"))) {
        set.status = 403;
        return { code: "FORBIDDEN_INVOICE" };
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

      if (mode !== "free") {
        const [target] = await db.select().from(userTable).where(eq(userTable.id, body.userId));
        if (!target) {
          set.status = 404;
          return { code: "USER_NOT_FOUND" };
        }
        try {
          return await db.transaction(async (tx) => {
            const inFlight = await inFlightModuleKeys(tx, { userId: body.userId, dataUsahaId });
            const blocked = planRows.map((p) => p.modules[0]).find((m): m is string => !!m && inFlight.has(m));
            if (blocked) throw new Error(`MODULE_ORDER_IN_PROGRESS:${blocked}`);
            if (mode === "invoice") {
              const created = await createInvoiceAndOrder(tx, { userId: target.id, billToName: target.name, planRows, dataUsahaId, origin: "admin", renewalInterval: body.renewalInterval ?? null });
              return { dataUsahaId, payment: mode, invoiceId: created.invoiceId, orderId: created.orderId, amountDue: created.amountDue };
            }
            const paid = await createPaidInvoiceAndOrder(tx, { userId: target.id, billToName: target.name, planRows, dataUsahaId, actorId: user.id, now, timeZone, renewalInterval: body.renewalInterval ?? null });
            return {
              dataUsahaId,
              payment: mode,
              invoiceId: paid.invoiceId,
              orderId: paid.orderId,
              subscriptionsCreated: paid.subscriptionIds.length,
              subscriptionsRenewed: paid.renewals.length,
            };
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "";
          if (message.startsWith("MODULE_ORDER_IN_PROGRESS:")) {
            set.status = 400;
            return { code: "MODULE_ORDER_IN_PROGRESS", moduleKey: message.split(":")[1] };
          }
          throw err;
        }
      }

      const results = await db.transaction(async (tx) => {
        const out = [];
        for (const plan of planRows) {
          const r = await assignPlanToDataUsaha(tx, { userId: body.userId, plan, dataUsahaId, endAt: customEnd, now, timeZone, actorId: user.id, renewalInterval: body.renewalInterval ?? null });
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
      return { dataUsahaId, payment: "free" as const, results };
    },
    {
      permission: "subscriptions.manage",
      body: t.Object({
        userId: t.String(),
        planIds: t.Array(t.String({ format: "uuid" }), { minItems: 1, maxItems: 60 }),
        endAt: t.Optional(t.String({ format: "date-time" })),
        dataUsahaId: t.Optional(t.String({ format: "uuid" })),
        payment: t.Optional(t.Union([t.Literal("invoice"), t.Literal("paid_invoice"), t.Literal("free")])),
        // § Fase 181, ADR-0042 — "perpanjangan berikutnya" untuk semua paket MODUL yang dipilih (seat diabaikan).
        renewalInterval: t.Optional(t.Union([t.Literal("monthly"), t.Literal("yearly")])),
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
  
  )
  // § Fase 180, ADR-0041 — perpanjang langganan yang MASIH AKTIF sebanyak N periode (bulanan/tahunan) dari tanggal berakhirnya, memakai jangkar (tanggal tidak bergeser) —
  // aturan yang SAMA dengan perpanjangan lewat Assign/konfirmasi pembayaran (`computeRenewalEnd`). Dipakai tombol cepat +1 bulan / +3 bulan / +1 tahun di "Ubah Masa Aktif".
  // BEDA dari `PATCH` di atas (tanggal persis, jangkar dikosongkan). Tidak untuk trial dan tidak untuk yang sudah habis/dibatalkan (habis → Assign, mulai dari saat itu).
  .post(
    "/:id/extend",
    async ({ params, body, user, set }) => {
      try {
        return await db.transaction(async (tx) => {
          const [subscription] = await tx.select().from(subscriptions).where(sql`${subscriptions.id} = ${params.id} FOR UPDATE`).limit(1);
          if (!subscription) throw new Error("SUBSCRIPTION_NOT_FOUND");
          if (subscription.isTrial) throw new Error("TRIAL_NOT_EXTENDABLE");
          if (subscription.status !== "active" || !subscription.endAt || subscription.endAt.getTime() <= Date.now()) throw new Error("SUBSCRIPTION_NOT_RENEWABLE");
          const result = await renewSubscriptionInPlace(tx, {
            subscription,
            interval: body.interval,
            periods: body.periods,
            timeZone: await getCompanyTimezone(),
            source: "admin",
            actorId: user.id,
          });
          return { subscriptionId: result.subscriptionId, previousEndAt: result.previousEndAt.toISOString(), newEndAt: result.newEndAt.toISOString() };
        });
      } catch (err) {
        const code = err instanceof Error ? err.message : "";
        if (code === "SUBSCRIPTION_NOT_FOUND") {
          set.status = 404;
          return { code };
        }
        if (code === "TRIAL_NOT_EXTENDABLE" || code === "SUBSCRIPTION_NOT_RENEWABLE") {
          set.status = 400;
          return { code };
        }
        throw err;
      }
    },
    {
      permission: "subscriptions.manage",
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({ interval: t.Union([t.Literal("monthly"), t.Literal("yearly")]), periods: t.Integer({ minimum: 1, maximum: 36 }) }),
    },
  
  )
  // § Fase 181, ADR-0042 — atur penanda "perpanjangan berikutnya" langganan (monthly/yearly/null). Hanya langganan modul non-trial yang masih aktif (seat & trial tidak pernah ditandai).
  // Mengubah penanda tidak menyentuh tanggal berakhir dan tidak menerbitkan tagihan — penerbitan dilakukan job harian (7 hari sebelum berakhir) atau tombol manual di bawah.
  .patch(
    "/:id/renewal",
    async ({ params, body, user, set }) => {
      const [row] = await db.select({ sub: subscriptions, kind: plans.kind }).from(subscriptions).innerJoin(plans, eq(plans.id, subscriptions.planId)).where(eq(subscriptions.id, params.id));
      if (!row) {
        set.status = 404;
        return { code: "SUBSCRIPTION_NOT_FOUND" };
      }
      if (row.sub.isTrial || row.sub.status !== "active" || row.kind !== "module") {
        set.status = 400;
        return { code: "RENEWAL_NOT_APPLICABLE" };
      }
      const [updated] = await db.update(subscriptions).set({ renewalInterval: body.renewalInterval }).where(eq(subscriptions.id, params.id)).returning();
      await db.insert(auditLogs).values({
        entityType: "subscription",
        entityId: params.id,
        action: "update",
        changes: { renewalInterval: { old: row.sub.renewalInterval, new: body.renewalInterval } },
        actorId: user.id,
      });
      return updated;
    },
    {
      permission: "subscriptions.manage",
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({ renewalInterval: t.Union([t.Literal("monthly"), t.Literal("yearly"), t.Null()]) }),
    },
  )
  // § Fase 181 — terbitkan tagihan perpanjangan SEKARANG untuk satu langganan (mis. tagihan sebelumnya dibatalkan, atau paket periode baru tersedia): mengabaikan jendela 7 hari &
  // penanda siklus, tetap menolak trial/habis/seat, modul yang masih punya pesanan berjalan, dan paket periode yang tidak ada. Butuh izin `invoices.manage` juga (membuat invoice).
  .post(
    "/:id/renewal-invoice",
    async ({ params, body, user, set }) => {
      if (!(await userHasPermission(user.id, "invoices.manage"))) {
        set.status = 403;
        return { code: "FORBIDDEN_INVOICE" };
      }
      try {
        const outcome = await issueRenewalInvoiceNow(params.id, { timeZone: await getCompanyTimezone(), interval: body.interval });
        return { invoiceId: outcome.invoiceId, orderId: outcome.orderId, invoiceNumber: outcome.invoiceNumber, amountDue: outcome.amountDue };
      } catch (err) {
        if (err instanceof RenewalIssueError) {
          set.status = err.code === "SUBSCRIPTION_NOT_FOUND" ? 404 : 400;
          return { code: err.code };
        }
        throw err;
      }
    },
    {
      permission: "subscriptions.manage",
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({ interval: t.Optional(t.Union([t.Literal("monthly"), t.Literal("yearly")])) }),
    },
  );
