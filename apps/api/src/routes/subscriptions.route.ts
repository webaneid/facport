import { Elysia, t } from "elysia";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { orders, plans, subscriptions, invoices, invoiceItems, user as userTable } from "../db/schema";
import { permissionPlugin } from "../lib/permission";
import { getActiveSubscriptionsWithPlans } from "../lib/subscription-gate";
import { createInvoiceAndOrder } from "../lib/invoice-order";
import { createTrialSubscription } from "../lib/trial";
import { createNotification, formatNotificationDate, NOTIFICATION_TYPES } from "../lib/notifications";
import { getCompanyTimezone } from "../lib/company-timezone";
import { ownsDataUsaha } from "../lib/data-usaha";

const NON_TERMINAL_ORDER_STATUSES = ["pending", "submitted"] as const;

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

      // § Fase 43 — union modul yang PERNAH ditrial user ini, APA PUN
      // status subscription-nya sekarang (aktif/expired/habis kuota) —
      // dipakai frontend nentuin tombol "Coba Gratis" mana yang WAJIB
      // di-disable permanen (1x trial seumur hidup per modul per user).
      const everTrialedRows = await db
        .select({ modules: plans.modules })
        .from(subscriptions)
        .innerJoin(plans, eq(plans.id, subscriptions.planId))
        .where(and(eq(subscriptions.userId, user.id), eq(subscriptions.isTrial, true)));
      const everTrialedModules = [...new Set(everTrialedRows.flatMap((r) => r.modules))];

      return { subscriptions: rows, everTrialedModules };
    },
    { auth: true },
  )
  // § Fase 16, ADR-0022 — REWORK TOTAL: dari 1-plan-per-checkout (return
  // 501, provider belum ada) jadi CART multi-modul beneran. Checkout
  // SEKARANG bikin 1 invoice (N invoiceItems, 1 per plan dibeli) + 1
  // order (status "pending", method BELUM dipilih — itu langkah
  // terpisah, § orders.route.ts). TIDAK ADA subscription yang dibuat di
  // sini lagi — subscription baru tercipta SETELAH admin konfirmasi
  // pembayaran (§ admin/orders.route.ts `POST /admin/orders/:id/confirm`),
  // beda dari versi lama yang langsung insert subscription
  // "pending_payment" saat checkout.
  //
  // § security review 2026-09-04 (High) — SELURUH alur checkout WAJIB 1
  // transaction + row lock pada `user` (bukan lock invoice/order — belum
  // ada baris untuk dikunci saat checkout PERTAMA kali) supaya 2 request
  // checkout BERSAMAAN dari user yang sama (2 tab, double-click) tidak
  // bisa lolos guard "modul sama" secara bersamaan (TOCTOU). Guard modul
  // juga diperluas: bukan cuma subscription AKTIF, tapi JUGA invoice/order
  // NON-TERMINAL (`pending`/`submitted`) milik user ini untuk modul yang
  // sama — subscription baru tercipta belakangan (saat admin confirm),
  // jadi cek "subscription aktif" saja tidak cukup untuk cegah 2 invoice
  // pending untuk modul yang sama.
  .post(
    "/subscriptions/checkout",
    async ({ body, user, set }) => {
      // § Fase 108, architecture-user-tambahan.md § Fase B1 — WAJIB
      // eksplisit dari body (user sadar sedang di dalam konteks Data
      // Usaha mana, BUKAN auto-default diam-diam seperti jalur admin) —
      // dicek dulu KEPEMILIKANNYA sebelum apa pun (cegah IDOR: user A
      // checkout ke Data Usaha milik user B).
      if (!(await ownsDataUsaha(user.id, body.dataUsahaId))) {
        set.status = 404;
        return { code: "DATA_USAHA_NOT_FOUND" };
      }

      const uniquePlanIds = [...new Set(body.planIds)];
      const planRows = await db.select().from(plans).where(inArray(plans.id, uniquePlanIds));
      if (planRows.length !== uniquePlanIds.length) {
        set.status = 404;
        return { code: "PLAN_NOT_FOUND" };
      }
      if (planRows.some((p) => !p.isActive)) {
        set.status = 400;
        return { code: "PLAN_NOT_ACTIVE" };
      }

      // § Fase 53 — 1 modul sekarang boleh punya >1 baris plan (tier
      // durasi/harga beda, mis. Bulanan/Tahunan). UI resmi (tier-picker)
      // mutually-exclusive per modul jadi ini harusnya mustahil lewat
      // jalur normal, TAPI tetap divalidasi di server sebagai pertahanan
      // berlapis (defense-in-depth, § architecture-security.md) — cegah
      // 1 checkout bikin 2 invoiceItems utk modul yang sama (endAt beda
      // per tier saat admin confirm nanti, ambigu kalau dibiarkan lolos).
      const cartModuleCounts = new Map<string, number>();
      for (const p of planRows) {
        const moduleKey = p.modules[0];
        if (!moduleKey) continue;
        cartModuleCounts.set(moduleKey, (cartModuleCounts.get(moduleKey) ?? 0) + 1);
      }
      const duplicateModule = [...cartModuleCounts.entries()].find(([, count]) => count > 1);
      if (duplicateModule) {
        set.status = 400;
        return { code: "DUPLICATE_MODULE_IN_CART", moduleKey: duplicateModule[0] };
      }

      try {
        const result = await db.transaction(async (tx) => {
          // § lock baris user ini — serialisasi SEMUA checkout request
          // dari user yang sama (request user LAIN tetap jalan paralel,
          // beda baris yang dikunci).
          const [me] = await tx.select().from(userTable).where(sql`${userTable.id} = ${user.id} FOR UPDATE`).limit(1);
          if (!me) throw new Error("USER_NOT_FOUND");

          // § Fase 108 — SEMUA guard "modul sudah aktif/in-flight" di
          // bawah ini di-SCOPE PER DATA USAHA (bukan lagi per akun) —
          // modul yang sama BOLEH aktif di Data Usaha LAIN milik user
          // yang sama (itu tujuan utama restrukturisasi ini, § Keputusan
          // Desain arsitektur "Data Usaha → Modul → Fitur"). Perubahan
          // lebih kecil & lebih aman dari draf awal (dulu diusulkan
          // "hapus guard total") — cukup tambah filter `dataUsahaId`.
          const activeSubs = await getActiveSubscriptionsWithPlans(user.id);
          // § Fase 43 — trial TIDAK memblokir pembelian paket ASLI modul
          // yang sama, supaya user bisa upgrade kapan saja tanpa nunggu
          // trial habis/expired. Guard "modul sudah aktif" cuma berlaku
          // untuk subscription NON-trial.
          const activeModules = new Set(
            activeSubs
              .filter((s) => !s.subscription.isTrial && s.subscription.dataUsahaId === body.dataUsahaId)
              .flatMap((s) => s.plan.modules),
          );

          const inFlightRows = await tx
            .select({ moduleKey: invoiceItems.moduleKey })
            .from(orders)
            .innerJoin(invoices, eq(invoices.id, orders.invoiceId))
            .innerJoin(invoiceItems, eq(invoiceItems.invoiceId, invoices.id))
            .where(
              and(
                eq(invoices.userId, user.id),
                eq(orders.dataUsahaId, body.dataUsahaId),
                inArray(orders.status, [...NON_TERMINAL_ORDER_STATUSES]),
              ),
            );
          const inFlightModules = new Set(inFlightRows.map((r) => r.moduleKey));

          const cartModules = planRows.flatMap((p) => p.modules);
          const alreadySubscribed = cartModules.find((m) => activeModules.has(m) || inFlightModules.has(m));
          if (alreadySubscribed) throw new Error(`MODULE_ALREADY_SUBSCRIBED:${alreadySubscribed}`);

          // § Fase 18 — logic bikin invoice+items+order diekstrak ke
          // `lib/invoice-order.ts` (dipakai ulang di `admin/users.route.ts`
          // "Kirim Invoice"). Guard di atas (row lock + modul sudah
          // aktif/in-flight) TETAP di sini — spesifik checkout customer.
          const created = await createInvoiceAndOrder(tx, { userId: user.id, billToName: me.name, planRows, dataUsahaId: body.dataUsahaId });

          // § Fase 45 — notifikasi awal alur subscribe: "pesanan dibuat,
          // selesaikan pembayaran". Ikut transaction yang sama (tx) — kalau
          // checkout gagal di langkah manapun, notifikasi ikut rollback.
          await createNotification(
            {
              userId: user.id,
              type: NOTIFICATION_TYPES.ORDER_CREATED,
              title: "Pesanan dibuat",
              body: `Pesanan kamu untuk ${planRows.length} paket sudah dibuat — selesaikan pembayaran supaya langgananmu aktif.`,
              entityType: "order",
              entityId: created.orderId,
            },
            tx,
          );

          return { invoiceId: created.invoiceId, orderId: created.orderId, amountDue: created.amountDue };
        });

        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "CHECKOUT_FAILED";
        if (message.startsWith("MODULE_ALREADY_SUBSCRIBED:")) {
          set.status = 400;
          return { code: "MODULE_ALREADY_SUBSCRIBED", moduleKey: message.split(":")[1] };
        }
        if (message === "USER_NOT_FOUND") {
          set.status = 404;
          return { code: "USER_NOT_FOUND" };
        }
        throw err;
      }
    },
    {
      auth: true,
      body: t.Object({ planIds: t.Array(t.String({ format: "uuid" }), { minItems: 1 }), dataUsahaId: t.String({ format: "uuid" }) }),
    },
  )
  // § Fase 43 — self-service "Coba Gratis": customer klik sendiri, TANPA
  // approval admin, TANPA invoice/order/pembayaran sama sekali (langsung
  // "active", § lib/trial.ts `createTrialSubscription`). Row lock + guard
  // sama pola checkout (cegah race 2 klik/2 tab bikin 2 trial modul sama).
  .post(
    "/subscriptions/trial",
    async ({ body, user, set }) => {
      // § Fase 108 — sama alasan checkout: WAJIB eksplisit, dicek
      // kepemilikan dulu (cegah IDOR).
      if (!(await ownsDataUsaha(user.id, body.dataUsahaId))) {
        set.status = 404;
        return { code: "DATA_USAHA_NOT_FOUND" };
      }

      const [plan] = await db.select().from(plans).where(eq(plans.id, body.planId));
      if (!plan) {
        set.status = 404;
        return { code: "PLAN_NOT_FOUND" };
      }
      if (!plan.isActive) {
        set.status = 400;
        return { code: "PLAN_NOT_ACTIVE" };
      }
      // § Fase 43 (koreksi) — trial BUKAN otomatis untuk semua paket,
      // admin WAJIB tandai eksplisit per paket (`plans.trialEligible`)
      // supaya admin tetap punya otoritas penuh atas paketnya sendiri.
      if (!plan.trialEligible) {
        set.status = 400;
        return { code: "TRIAL_NOT_AVAILABLE_FOR_PLAN" };
      }

      try {
        const result = await db.transaction(async (tx) => {
          const [me] = await tx.select().from(userTable).where(sql`${userTable.id} = ${user.id} FOR UPDATE`).limit(1);
          if (!me) throw new Error("USER_NOT_FOUND");

          // § Fase 108 — di-SCOPE PER DATA USAHA (bukan lagi per akun),
          // sama alasan checkout: "1x trial per modul" sekarang berarti
          // "1x trial per modul PER DATA USAHA" — konsisten dengan guard
          // "sudah aktif" di bawah yang juga di-scope per Data Usaha
          // (kalau tidak, muncul asimetri janggal: modul boleh aktif
          // lagi di Data Usaha baru, tapi trial dianggap "sudah dipakai"
          // dari riwayat Data Usaha lain yang tidak relevan).
          const everTrialedRows = await tx
            .select({ modules: plans.modules })
            .from(subscriptions)
            .innerJoin(plans, eq(plans.id, subscriptions.planId))
            .where(and(eq(subscriptions.userId, user.id), eq(subscriptions.isTrial, true), eq(subscriptions.dataUsahaId, body.dataUsahaId)));
          const everTrialedModules = new Set(everTrialedRows.flatMap((r) => r.modules));
          const alreadyTrialed = plan.modules.find((m) => everTrialedModules.has(m));
          if (alreadyTrialed) throw new Error(`TRIAL_ALREADY_USED:${alreadyTrialed}`);

          // § modul yang SUDAH aktif (paket asli ATAU trial lain yang
          // somehow masih aktif) juga tidak boleh ditrial lagi — reuse
          // guard yang sama seperti checkout, TANPA filter isTrial di sini
          // (beda dari checkout: trial harus benar2 belum ada apa pun).
          const activeSubs = await getActiveSubscriptionsWithPlans(user.id);
          const activeModules = new Set(
            activeSubs.filter((s) => s.subscription.dataUsahaId === body.dataUsahaId).flatMap((s) => s.plan.modules),
          );
          const alreadySubscribed = plan.modules.find((m) => activeModules.has(m));
          if (alreadySubscribed) throw new Error(`MODULE_ALREADY_SUBSCRIBED:${alreadySubscribed}`);

          const subscription = await createTrialSubscription(tx, { userId: user.id, plan, actorId: user.id, dataUsahaId: body.dataUsahaId });

          const companyTimezone = await getCompanyTimezone();
          const endAtLabel = subscription.endAt ? formatNotificationDate(subscription.endAt, companyTimezone) : "-";
          await createNotification(
            {
              userId: user.id,
              type: NOTIFICATION_TYPES.TRIAL_STARTED,
              title: `Trial ${plan.name} aktif`,
              body: `Trial kamu berlaku sampai ${endAtLabel}, dibatasi jumlah baris import. Manfaatkan sebaik-baiknya!`,
              entityType: "subscription",
              entityId: subscription.id,
            },
            tx,
          );

          return { subscriptionId: subscription.id, endAt: subscription.endAt };
        });

        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "TRIAL_FAILED";
        if (message.startsWith("TRIAL_ALREADY_USED:")) {
          set.status = 400;
          return { code: "TRIAL_ALREADY_USED", moduleKey: message.split(":")[1] };
        }
        if (message.startsWith("MODULE_ALREADY_SUBSCRIBED:")) {
          set.status = 400;
          return { code: "MODULE_ALREADY_SUBSCRIBED", moduleKey: message.split(":")[1] };
        }
        if (message === "USER_NOT_FOUND") {
          set.status = 404;
          return { code: "USER_NOT_FOUND" };
        }
        throw err;
      }
    },
    { auth: true, body: t.Object({ planId: t.String({ format: "uuid" }), dataUsahaId: t.String({ format: "uuid" }) }) },
  );
