import { Elysia, t } from "elysia";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { orders, plans, subscriptions, invoices, invoiceItems, user as userTable } from "../db/schema";
import { permissionPlugin } from "../lib/permission";
import { getActiveSubscriptionsWithPlans } from "../lib/subscription-gate";
import { generateInvoiceNumber } from "../lib/invoice-number";

const NON_TERMINAL_ORDER_STATUSES = ["pending", "submitted"] as const;

const INVOICE_DUE_DAYS = 3;

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

      try {
        const result = await db.transaction(async (tx) => {
          // § lock baris user ini — serialisasi SEMUA checkout request
          // dari user yang sama (request user LAIN tetap jalan paralel,
          // beda baris yang dikunci).
          const [me] = await tx.select().from(userTable).where(sql`${userTable.id} = ${user.id} FOR UPDATE`).limit(1);
          if (!me) throw new Error("USER_NOT_FOUND");

          const activeSubs = await getActiveSubscriptionsWithPlans(user.id);
          const activeModules = new Set(activeSubs.flatMap((s) => s.plan.modules));

          const inFlightRows = await tx
            .select({ moduleKey: invoiceItems.moduleKey })
            .from(orders)
            .innerJoin(invoices, eq(invoices.id, orders.invoiceId))
            .innerJoin(invoiceItems, eq(invoiceItems.invoiceId, invoices.id))
            .where(and(eq(invoices.userId, user.id), inArray(orders.status, [...NON_TERMINAL_ORDER_STATUSES])));
          const inFlightModules = new Set(inFlightRows.map((r) => r.moduleKey));

          const cartModules = planRows.flatMap((p) => p.modules);
          const alreadySubscribed = cartModules.find((m) => activeModules.has(m) || inFlightModules.has(m));
          if (alreadySubscribed) throw new Error(`MODULE_ALREADY_SUBSCRIBED:${alreadySubscribed}`);

          const subtotal = planRows.reduce((sum, p) => sum + p.price, 0);
          const invoiceNumber = await generateInvoiceNumber();
          const dueDate = new Date(Date.now() + INVOICE_DUE_DAYS * 24 * 60 * 60 * 1000);

          const [invoice] = await tx
            .insert(invoices)
            .values({
              invoiceNumber,
              userId: user.id,
              status: "unpaid",
              billToName: me.name,
              subtotal,
              total: subtotal,
              dueDate,
            })
            .returning();

          await tx.insert(invoiceItems).values(
            planRows.map((p) => ({
              invoiceId: invoice!.id,
              planId: p.id,
              moduleKey: p.modules[0]!,
              label: p.name,
              price: p.price,
            })),
          );

          // § kode unik 100-999 (§ architecture-payment.md § Skema
          // Database) — ditambahkan ke invoice.total agar admin bisa
          // cocokkan mutasi bank ke invoice yang tepat tanpa API
          // cek-mutasi otomatis.
          const uniqueCode = Math.floor(Math.random() * 900) + 100;
          const [order] = await tx.insert(orders).values({ invoiceId: invoice!.id, uniqueCode }).returning();

          return { invoiceId: invoice!.id, orderId: order!.id, amountDue: subtotal + uniqueCode };
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
    { auth: true, body: t.Object({ planIds: t.Array(t.String({ format: "uuid" }), { minItems: 1 }) }) },
  );
