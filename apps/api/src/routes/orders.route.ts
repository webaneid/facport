import { Elysia, t } from "elysia";
import { eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { randomUUID } from "crypto";
import { db } from "../lib/db";
import { orders, invoices, settings } from "../db/schema";
import { permissionPlugin } from "../lib/permission";
import { minioClient, PAYMENT_PROOF_BUCKET, ensurePaymentProofBucket } from "../lib/minio";
import { buildDynamicQris } from "../lib/qris-emv";
import { generateQrDataUrl } from "../lib/qr-code";
import { logger } from "../lib/logger";

type BankAccount = { id: string; bankName: string; accountNumber: string; accountName: string };
type QrisAccount = { id: string; name: string; imageUrl: string; isDynamic: boolean; emvPayload?: string };

const ALLOWED_PROOF_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
const MAX_PROOF_SIZE_MB = 8;

// § security review 2026-09-04 (Medium) — defense-in-depth: `PUT
// /settings` (settings.route.ts) SEKARANG validasi bentuk value ini saat
// SIMPAN, tapi tetap `Array.isArray` di sini juga — cegah 500 ke
// CUSTOMER yang sedang bayar kalau row lama/dari sumber lain somehow
// bukan array (fail-safe, bukan cuma percaya penulis satu-satunya).
async function getPaymentSettings() {
  const rows = await db
    .select()
    .from(settings)
    .where(inArray(settings.key, ["company.bankAccounts", "company.qrisAccounts"]));
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const rawBankAccounts = map["company.bankAccounts"];
  const rawQrisAccounts = map["company.qrisAccounts"];
  return {
    bankAccounts: Array.isArray(rawBankAccounts) ? (rawBankAccounts as BankAccount[]) : [],
    qrisAccounts: Array.isArray(rawQrisAccounts) ? (rawQrisAccounts as QrisAccount[]) : [],
  };
}

// § Fase 16, ADR-0022 — ownership dicek lewat invoice (invoice.userId),
// BUKAN kolom userId langsung di `orders` (order tidak punya kolom itu —
// 1 order SELALU nempel ke 1 invoice, ownership invoice = ownership order).
async function getOwnedOrder(userId: string, orderId: string) {
  const [row] = await db
    .select({ order: orders, invoice: invoices })
    .from(orders)
    .innerJoin(invoices, eq(invoices.id, orders.invoiceId))
    .where(eq(orders.id, orderId));
  if (!row || row.invoice.userId !== userId) return null;
  return row;
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
      // § security review 2026-09-04 (Medium) — JANGAN spread seluruh
      // row `orders`/`invoices` ke customer: `proofUrl` (MinIO object
      // key privat) dan `confirmedBy`/`rejectedBy` (user ID admin) TIDAK
      // ada gunanya di client, murni info disclosure kalau ikut
      // ke-serialize ke response JSON (§ ADR-0022 § "Bucket Bukti
      // Pembayaran" — proofUrl HANYA boleh ditukar presigned URL
      // server-side admin-only, bukan bocor sebagai field biasa).
      return {
        order: {
          id: owned.order.id,
          method: owned.order.method,
          status: owned.order.status,
          uniqueCode: owned.order.uniqueCode,
          bankAccountRef: owned.order.bankAccountRef,
          qrisAccountRef: owned.order.qrisAccountRef,
          transferDate: owned.order.transferDate,
          payerNote: owned.order.payerNote,
          submittedAt: owned.order.submittedAt,
          rejectionNote: owned.order.rejectionNote,
        },
        invoice: {
          invoiceNumber: owned.invoice.invoiceNumber,
          billToName: owned.invoice.billToName,
          status: owned.invoice.status,
          total: owned.invoice.total,
          dueDate: owned.invoice.dueDate,
        },
        amountDue: owned.invoice.total + owned.order.uniqueCode,
        bankAccounts,
        qrisAccounts: qrisAccounts.map((q) => ({ id: q.id, name: q.name, imageUrl: q.imageUrl })), // emvPayload TIDAK di-expose ke client
      };
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
      if (owned.order.method !== "qris" || !owned.order.qrisAccountRef) {
        set.status = 400;
        return { code: "QRIS_NOT_SELECTED" };
      }

      const { qrisAccounts } = await getPaymentSettings();
      const qris = qrisAccounts.find((a) => a.id === owned.order.qrisAccountRef);
      if (!qris) {
        set.status = 404;
        return { code: "QRIS_ACCOUNT_NOT_FOUND" };
      }

      const amountDue = owned.invoice.total + owned.order.uniqueCode;
      if (!qris.isDynamic || !qris.emvPayload) {
        // § Statis — customer scan lalu KETIK MANUAL nominal (termasuk
        // kode unik) di aplikasi e-wallet/m-banking mereka (§
        // architecture-payment.md § "QRIS Dinamis" — fallback yang
        // didokumentasikan sadar, bukan kelupaan).
        return { type: "static" as const, imageUrl: qris.imageUrl, amountDue };
      }

      try {
        const dynamicPayload = buildDynamicQris(qris.emvPayload, amountDue, owned.invoice.invoiceNumber);
        const qrDataUrl = await generateQrDataUrl(dynamicPayload);
        return { type: "dynamic" as const, qrDataUrl, amountDue };
      } catch (err) {
        logger.error({ err, orderId: params.id }, "Gagal generate QRIS dinamis");
        set.status = 502;
        return { code: "QRIS_GENERATION_FAILED" };
      }
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

      const inputBuffer = Buffer.from(await body.file.arrayBuffer());
      let webpBuffer: Buffer;
      try {
        // § auto-orient EXIF (foto HP) + convert ke WebP di SERVER —
        // JANGAN percaya file.type dari browser (kosong untuk HEIC dari
        // galeri iPhone), Sharp deteksi format dari ISI file (§ referensi
        // jalajogja `proof-upload/route.ts`, ketemu masalah sama).
        webpBuffer = await sharp(inputBuffer).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
      } catch (err) {
        logger.error({ err, orderId: params.id }, "Gagal proses foto bukti transfer");
        set.status = 400;
        return { code: "INVALID_IMAGE_FILE" };
      }

      await ensurePaymentProofBucket();
      const key = `orders/${params.id}/${randomUUID()}.webp`;
      await minioClient.putObject(PAYMENT_PROOF_BUCKET, key, webpBuffer);

      await db
        .update(orders)
        .set({
          proofUrl: key,
          transferDate: new Date(body.transferDate),
          payerNote: body.payerNote ?? null,
          submittedAt: new Date(),
          status: "submitted",
          // § reset audit reject lama kalau ini resubmit setelah ditolak
          rejectedBy: null,
          rejectedAt: null,
          rejectionNote: null,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, params.id));

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
