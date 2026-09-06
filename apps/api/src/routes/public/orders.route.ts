import { Elysia, t } from "elysia";
import { eq } from "drizzle-orm";
import { db } from "../../lib/db";
import { orders } from "../../db/schema";
import { logger } from "../../lib/logger";
import {
  ALLOWED_PROOF_MIME,
  MAX_PROOF_SIZE_MB,
  getOrderById,
  getPaymentSettings,
  toOrderDetailResponse,
  buildQrisResult,
  processProofImage,
  saveProofAndMarkSubmitted,
} from "../../lib/order-payment";

// § Fase 27, ADR-0025 — link pembayaran PUBLIK (tanpa login), dipakai
// invoice yang admin buat untuk user existing (§ architecture-invoice.md
// § "Admin Membuat Invoice") — klien belum tentu mau/sempat bikin akun
// Facport cuma untuk bayar 1 invoice. `order.id` (UUID random) dipakai
// LANGSUNG sebagai identifier — TIDAK ada token terpisah (§ ADR-0025
// Decision 3, presedan production `jalajogja`). Guard di SETIAP endpoint
// di sini adalah KEBERADAAN + STATUS order — BUKAN ownership user, karena
// memang tidak ada sesi login sama sekali. Logic setelah order ditemukan
// SAMA PERSIS dengan `routes/orders.route.ts` (login) lewat
// `lib/order-payment.ts` bersama — TIDAK ada 2 sumber kebenaran field
// yang bisa drift.
//
// Rate limit dipasang di `app.ts` (prefix "/public", § architecture-security.md
// §7) — endpoint publik tanpa auth adalah target abuse paling mudah.
export const publicOrdersRoute = new Elysia({ prefix: "/public/orders" })
  .get(
    "/:id",
    async ({ params, set }) => {
      const owned = await getOrderById(params.id);
      if (!owned) {
        set.status = 404;
        return { code: "ORDER_NOT_FOUND" };
      }
      const { bankAccounts, qrisAccounts } = await getPaymentSettings();
      return toOrderDetailResponse(owned, bankAccounts, qrisAccounts);
    },
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  .patch(
    "/:id/method",
    async ({ params, body, set }) => {
      const owned = await getOrderById(params.id);
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
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({ method: t.Union([t.Literal("bank_transfer"), t.Literal("qris")]), accountRef: t.String({ minLength: 1 }) }),
    },
  )
  .get(
    "/:id/qris",
    async ({ params, set }) => {
      const owned = await getOrderById(params.id);
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
    { params: t.Object({ id: t.String({ format: "uuid" }) }) },
  )
  .patch(
    "/:id/proof",
    async ({ params, body, set }) => {
      const owned = await getOrderById(params.id);
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
        logger.error({ err, orderId: params.id }, "Gagal proses foto bukti transfer (publik)");
        set.status = 400;
        return { code: "INVALID_IMAGE_FILE" };
      }

      await saveProofAndMarkSubmitted(params.id, webpBuffer, new Date(body.transferDate), body.payerNote ?? null);
      return { ok: true };
    },
    {
      params: t.Object({ id: t.String({ format: "uuid" }) }),
      body: t.Object({
        file: t.File({ type: [...ALLOWED_PROOF_MIME], maxSize: `${MAX_PROOF_SIZE_MB}m` }),
        transferDate: t.String({ format: "date-time" }),
        payerNote: t.Optional(t.String({ maxLength: 500 })),
      }),
    },
  );
