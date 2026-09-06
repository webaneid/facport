import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { orders } from "../db/schema";
import { permissionPlugin } from "../lib/permission";
import { logger } from "../lib/logger";
import {
  ALLOWED_PROOF_MIME,
  MAX_PROOF_SIZE_MB,
  getOrderById,
  getPaymentSettings,
  toOrderDetailResponse,
  buildQrisResult,
  processProofImage,
  saveProofAndMarkSubmitted,
} from "../lib/order-payment";

// § Fase 16, ADR-0022 — ownership dicek lewat invoice (invoice.userId),
// BUKAN kolom userId langsung di `orders` (order tidak punya kolom itu —
// 1 order SELALU nempel ke 1 invoice, ownership invoice = ownership order).
// § Fase 27 — versi TANPA login (link publik) ada di
// `routes/public/orders.route.ts`, pakai `lib/order-payment.ts` yang SAMA
// (cuma beda cara menemukan order: ownership vs sekadar ID).
async function getOwnedOrder(userId: string, orderId: string) {
  const owned = await getOrderById(orderId);
  if (!owned || owned.invoice.userId !== userId) return null;
  return owned;
}

export const ordersRoute = new Elysia()
  .use(permissionPlugin)
  .get(
    "/orders/:id",
    async ({ user, params, set }) => {
      const owned = await getOwnedOrder(user.id, params.id);
      if (!owned) {
        set.status = 404;
        return { code: "ORDER_NOT_FOUND" };
      }
      const { bankAccounts, qrisAccounts } = await getPaymentSettings();
      return toOrderDetailResponse(owned, bankAccounts, qrisAccounts);
    },
    { auth: true, params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  .patch(
    "/orders/:id/method",
    async ({ user, params, body, set }) => {
      const owned = await getOwnedOrder(user.id, params.id);
      if (!owned) {
        set.status = 404;
        return { code: "ORDER_NOT_FOUND" };
      }
      if (owned.order.status !== "pending" && owned.order.status !== "rejected") {
        set.status = 400;
        return { code: "ORDER_NOT_EDITABLE" };
      }

      const { bankAccounts, qrisAccounts } = await getPaymentSettings();
      if (body.method === "bank_transfer") {
        if (!bankAccounts.some((a) => a.id === body.accountRef)) {
          set.status = 400;
          return { code: "ACCOUNT_NOT_FOUND" };
        }
        await db
          .update(orders)
          .set({ method: "bank_transfer", bankAccountRef: body.accountRef, qrisAccountRef: null, updatedAt: new Date() })
          .where(eq(orders.id, params.id));
      } else {
        if (!qrisAccounts.some((a) => a.id === body.accountRef)) {
          set.status = 400;
          return { code: "ACCOUNT_NOT_FOUND" };
        }
        await db
          .update(orders)
          .set({ method: "qris", qrisAccountRef: body.accountRef, bankAccountRef: null, updatedAt: new Date() })
          .where(eq(orders.id, params.id));
      }
      return { ok: true };
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({ method: t.Union([t.Literal("bank_transfer"), t.Literal("qris")]), accountRef: t.String({ minLength: 1 }) }),
    },
  )
  .get(
    "/orders/:id/qris",
    async ({ user, params, set }) => {
      const owned = await getOwnedOrder(user.id, params.id);
      if (!owned) {
        set.status = 404;
        return { code: "ORDER_NOT_FOUND" };
      }
      const result = await buildQrisResult(owned);
      if (!result.ok) {
        set.status = result.status;
        return { code: result.code };
      }
      return result.body;
    },
    { auth: true, params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  .patch(
    "/orders/:id/proof",
    async ({ user, params, body, set }) => {
      const owned = await getOwnedOrder(user.id, params.id);
      if (!owned) {
        set.status = 404;
        return { code: "ORDER_NOT_FOUND" };
      }
      if (!owned.order.method) {
        set.status = 400;
        return { code: "METHOD_NOT_SELECTED" };
      }
      if (owned.order.status !== "pending" && owned.order.status !== "rejected") {
        set.status = 400;
        return { code: "ORDER_NOT_EDITABLE" };
      }

      let webpBuffer: Buffer;
      try {
        webpBuffer = await processProofImage(body.file);
      } catch (err) {
        logger.error({ err, orderId: params.id }, "Gagal proses foto bukti transfer");
        set.status = 400;
        return { code: "INVALID_IMAGE_FILE" };
      }

      await saveProofAndMarkSubmitted(params.id, webpBuffer, new Date(body.transferDate), body.payerNote ?? null);
      return { ok: true };
    },
    {
      auth: true,
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        file: t.File({ type: [...ALLOWED_PROOF_MIME], maxSize: `${MAX_PROOF_SIZE_MB}m` }),
        transferDate: t.String({ format: "date-time" }),
        payerNote: t.Optional(t.String({ maxLength: 500 })),
      }),
    },
  );
