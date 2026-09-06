import { Elysia, t } from "elysia";
import { eq, desc, sql } from "drizzle-orm";
import { db } from "../../lib/db";
import { orders, invoices, invoiceItems, plans, subscriptions, auditLogs } from "../../db/schema";
import { permissionPlugin } from "../../lib/permission";
import { minioClient, PAYMENT_PROOF_BUCKET } from "../../lib/minio";
import { logger } from "../../lib/logger";
import { createNotification, NOTIFICATION_TYPES } from "../../lib/notifications";

const PROOF_URL_EXPIRY_SECONDS = 10 * 60; // 10 menit

export const adminOrdersRoute = new Elysia({ prefix: "/admin/orders" })
  .use(permissionPlugin)
  // § Fase 16 — antrian konfirmasi: default filter status="submitted"
  // (yang butuh aksi admin, perilaku lama TIDAK berubah kalau query
  // kosong). § Fase 20, ADR-0023 — sebelumnya "submitted" adalah
  // SATU-SATUNYA jalur (hardcode), admin tidak pernah bisa lihat order
  // yang sudah paid/rejected/cancelled/expired lewat UI sama sekali.
  // Sekarang bisa pilih status lain eksplisit, atau "all" untuk semua.
  .get(
    "/",
    async ({ query }) => {
      const statusFilter = query.status ?? "submitted";
      const rows = await db
        .select({ order: orders, invoice: invoices })
        .from(orders)
        .innerJoin(invoices, eq(invoices.id, orders.invoiceId))
        .where(statusFilter === "all" ? undefined : eq(orders.status, statusFilter))
        .orderBy(desc(orders.submittedAt), desc(orders.createdAt));
      return { orders: rows.map((r) => ({ ...r.order, invoice: r.invoice, amountDue: r.invoice.total + r.order.uniqueCode })) };
    },
    {
      permission: "orders.manage",
      query: t.Object({
        status: t.Optional(
          t.Union([
            t.Literal("pending"),
            t.Literal("submitted"),
            t.Literal("paid"),
            t.Literal("rejected"),
            t.Literal("cancelled"),
            t.Literal("expired"),
            t.Literal("all"),
          ]),
        ),
      }),
    },
  )
  // § presigned URL, expiry PENDEK — bukti pembayaran adalah dokumen
  // finansial customer, TIDAK disimpan sebagai URL permanen di mana pun
  // (§ architecture-payment.md § "Bucket Bukti Pembayaran").
  .get(
    "/:id/proof-url",
    async ({ params, set }) => {
      const [order] = await db.select().from(orders).where(eq(orders.id, params.id));
      if (!order || !order.proofUrl) {
        set.status = 404;
        return { code: "PROOF_NOT_FOUND" };
      }
      try {
        const url = await minioClient.presignedGetObject(PAYMENT_PROOF_BUCKET, order.proofUrl, PROOF_URL_EXPIRY_SECONDS);
        return { url, expiresInSeconds: PROOF_URL_EXPIRY_SECONDS };
      } catch (err) {
        logger.error({ err, orderId: params.id }, "Gagal generate presigned URL bukti pembayaran");
        set.status = 502;
        return { code: "PRESIGN_FAILED" };
      }
    },
    { permission: "orders.manage", params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  // § Fase 16, ADR-0022 — row lock WAJIB di DALAM transaction, guard
  // status di-cek ULANG setelah lock (bukan cuma sebelum) — persis
  // lesson dari bug produksi jalajogja (invoice nyangkut karena guard
  // pre-check tidak diulang setelah lock, race 2 admin proses order yang
  // sama bersamaan). Confirm SEKALIGUS aktivasi: loop semua invoiceItems
  // invoice ini, buat 1 subscriptions row PER item.
  .post(
    "/:id/confirm",
    async ({ params, user, set }) => {
      try {
        const result = await db.transaction(async (tx) => {
          const [lockedOrder] = await tx.select().from(orders).where(sql`${orders.id} = ${params.id} FOR UPDATE`).limit(1);
          if (!lockedOrder) throw new Error("ORDER_NOT_FOUND");
          if (lockedOrder.status !== "submitted") throw new Error("ORDER_NOT_SUBMITTED");

          const [lockedInvoice] = await tx
            .select()
            .from(invoices)
            .where(sql`${invoices.id} = ${lockedOrder.invoiceId} FOR UPDATE`)
            .limit(1);
          if (!lockedInvoice) throw new Error("INVOICE_NOT_FOUND");
          if (lockedInvoice.status === "paid") throw new Error("INVOICE_ALREADY_PAID");

          const now = new Date();
          await tx.update(orders).set({ status: "paid", confirmedBy: user.id, confirmedAt: now, updatedAt: now }).where(eq(orders.id, params.id));
          await tx.update(invoices).set({ status: "paid", paidAt: now }).where(eq(invoices.id, lockedInvoice.id));

          const items = await tx
            .select({ item: invoiceItems, plan: plans })
            .from(invoiceItems)
            .innerJoin(plans, eq(plans.id, invoiceItems.planId))
            .where(eq(invoiceItems.invoiceId, lockedInvoice.id));

          const createdSubscriptionIds: string[] = [];
          for (const { item, plan } of items) {
            const endAt = new Date(now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);
            const [sub] = await tx
              .insert(subscriptions)
              .values({
                userId: lockedInvoice.userId,
                planId: plan.id,
                orderId: lockedOrder.id,
                invoiceItemId: item.id,
                status: "active",
                startAt: now,
                endAt,
              })
              .returning();
            createdSubscriptionIds.push(sub!.id);
          }

          await tx.insert(auditLogs).values({
            entityType: "order",
            entityId: lockedOrder.id,
            action: "update",
            changes: { status: { from: "submitted", to: "paid" }, subscriptionsCreated: createdSubscriptionIds },
            actorId: user.id,
          });

          await createNotification(
            {
              userId: lockedInvoice.userId,
              type: NOTIFICATION_TYPES.PAYMENT_VERIFIED,
              title: "Pembayaran terverifikasi",
              body:
                createdSubscriptionIds.length === 1
                  ? "Pembayaran kamu terverifikasi — langganan sudah aktif, selamat menggunakan Facport!"
                  : `Pembayaran kamu terverifikasi — ${createdSubscriptionIds.length} langganan sudah aktif, selamat menggunakan Facport!`,
              entityType: "order",
              entityId: lockedOrder.id,
            },
            tx,
          );

          return { subscriptionsCreated: createdSubscriptionIds.length };
        });

        return result;
      } catch (err) {
        const code = err instanceof Error ? err.message : "CONFIRM_FAILED";
        const knownCodes = ["ORDER_NOT_FOUND", "ORDER_NOT_SUBMITTED", "INVOICE_NOT_FOUND", "INVOICE_ALREADY_PAID"];
        if (knownCodes.includes(code)) {
          set.status = code === "ORDER_NOT_FOUND" || code === "INVOICE_NOT_FOUND" ? 404 : 400;
          return { code };
        }
        logger.error({ err, orderId: params.id }, "Gagal konfirmasi pembayaran");
        set.status = 500;
        return { code: "CONFIRM_FAILED" };
      }
    },
    { permission: "orders.manage", params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  .post(
    "/:id/reject",
    async ({ params, body, user, set }) => {
      try {
        await db.transaction(async (tx) => {
          const [lockedOrder] = await tx.select().from(orders).where(sql`${orders.id} = ${params.id} FOR UPDATE`).limit(1);
          if (!lockedOrder) throw new Error("ORDER_NOT_FOUND");
          if (lockedOrder.status !== "submitted") throw new Error("ORDER_NOT_SUBMITTED");

          const now = new Date();
          await tx
            .update(orders)
            .set({ status: "rejected", rejectedBy: user.id, rejectedAt: now, rejectionNote: body.reason, updatedAt: now })
            .where(eq(orders.id, params.id));

          await tx.insert(auditLogs).values({
            entityType: "order",
            entityId: params.id,
            action: "update",
            changes: { status: { from: "submitted", to: "rejected" }, reason: body.reason },
            actorId: user.id,
          });

          const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, lockedOrder.invoiceId));
          await createNotification(
            {
              userId: invoice!.userId,
              type: NOTIFICATION_TYPES.PAYMENT_REJECTED,
              title: "Bukti transfer ditolak",
              body: `Bukti transfer kamu ditolak: ${body.reason}. Silakan upload ulang bukti transfer yang benar.`,
              entityType: "order",
              entityId: params.id,
            },
            tx,
          );
        });

        return { ok: true };
      } catch (err) {
        const code = err instanceof Error ? err.message : "REJECT_FAILED";
        if (code === "ORDER_NOT_FOUND" || code === "ORDER_NOT_SUBMITTED") {
          set.status = code === "ORDER_NOT_FOUND" ? 404 : 400;
          return { code };
        }
        logger.error({ err, orderId: params.id }, "Gagal tolak pembayaran");
        set.status = 500;
        return { code: "REJECT_FAILED" };
      }
    },
    {
      permission: "orders.manage",
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({ reason: t.String({ minLength: 1, maxLength: 500 }) }),
    },
  );
