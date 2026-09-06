import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { db } from "./db";
import { orders, invoices, settings } from "../db/schema";
import { minioClient, PAYMENT_PROOF_BUCKET, ensurePaymentProofBucket } from "./minio";
import { buildDynamicQris } from "./qris-emv";
import { generateQrDataUrl } from "./qr-code";
import { logger } from "./logger";
import { createNotification, createNotificationsBulk, NOTIFICATION_TYPES } from "./notifications";
import { getUserIdsWithPermission } from "./permission";

// § Fase 27, ADR-0025 — diekstrak dari `routes/orders.route.ts` (customer
// login, Fase 16) supaya `routes/public/orders.route.ts` (link publik
// TANPA login) pakai LOGIC YANG SAMA PERSIS untuk field-filtering,
// pemrosesan gambar, dan generate QRIS — bukan copy-paste yang bisa
// drift (mis. 1 rute dapat fix kebocoran field, yang lain lupa). SATU-
// SATUNYA beda 2 rute itu adalah CARA MEREKA MENEMUKAN order (ownership
// user vs sekadar ID) — logic setelah order ditemukan identik.

export type BankAccount = { id: string; bankName: string; accountNumber: string; accountName: string };
export type QrisAccount = { id: string; name: string; imageUrl: string; isDynamic: boolean; emvPayload?: string };

export const ALLOWED_PROOF_MIME = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
export const MAX_PROOF_SIZE_MB = 8;

// § security review 2026-09-04 (Medium) — defense-in-depth: `PUT
// /settings` (settings.route.ts) validasi bentuk value ini saat SIMPAN,
// tapi tetap `Array.isArray` di sini juga — cegah 500 ke customer/publik
// yang sedang bayar kalau row lama/dari sumber lain somehow bukan array.
export async function getPaymentSettings() {
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

export async function getOrderById(orderId: string) {
  const [row] = await db
    .select({ order: orders, invoice: invoices })
    .from(orders)
    .innerJoin(invoices, eq(invoices.id, orders.invoiceId))
    .where(eq(orders.id, orderId));
  return row ?? null;
}

type OwnedOrder = NonNullable<Awaited<ReturnType<typeof getOrderById>>>;

// § security review 2026-09-04 (Medium), Fase 16 — JANGAN spread seluruh
// row `orders`/`invoices`: `proofUrl` (MinIO object key privat) dan
// `confirmedBy`/`rejectedBy` (user ID admin) TIDAK ada gunanya di
// client, murni info disclosure. Field-list ini SUMBER TUNGGAL untuk
// kedua rute (login & publik) — perbaikan kebocoran cukup di 1 tempat.
export function toOrderDetailResponse(owned: OwnedOrder, bankAccounts: BankAccount[], qrisAccounts: QrisAccount[]) {
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
}

export type QrisResult =
  | { ok: true; body: { type: "static"; imageUrl: string; amountDue: number } | { type: "dynamic"; qrDataUrl: string; amountDue: number } }
  | { ok: false; status: number; code: string };

export async function buildQrisResult(owned: OwnedOrder): Promise<QrisResult> {
  if (owned.order.method !== "qris" || !owned.order.qrisAccountRef) {
    return { ok: false, status: 400, code: "QRIS_NOT_SELECTED" };
  }

  const { qrisAccounts } = await getPaymentSettings();
  const qris = qrisAccounts.find((a) => a.id === owned.order.qrisAccountRef);
  if (!qris) {
    return { ok: false, status: 404, code: "QRIS_ACCOUNT_NOT_FOUND" };
  }

  const amountDue = owned.invoice.total + owned.order.uniqueCode;
  if (!qris.isDynamic || !qris.emvPayload) {
    // § Statis — customer scan lalu KETIK MANUAL nominal (termasuk kode
    // unik) — fallback yang didokumentasikan sadar (§ architecture-payment.md).
    return { ok: true, body: { type: "static", imageUrl: qris.imageUrl, amountDue } };
  }

  try {
    const dynamicPayload = buildDynamicQris(qris.emvPayload, amountDue, owned.invoice.invoiceNumber);
    const qrDataUrl = await generateQrDataUrl(dynamicPayload);
    return { ok: true, body: { type: "dynamic", qrDataUrl, amountDue } };
  } catch (err) {
    logger.error({ err, orderId: owned.order.id }, "Gagal generate QRIS dinamis");
    return { ok: false, status: 502, code: "QRIS_GENERATION_FAILED" };
  }
}

// § auto-orient EXIF (foto HP) + convert ke WebP di SERVER — JANGAN
// percaya file.type dari browser (kosong untuk HEIC dari galeri
// iPhone), Sharp deteksi format dari ISI file (§ referensi jalajogja
// `proof-upload/route.ts`, ketemu masalah sama).
export async function processProofImage(file: File): Promise<Buffer> {
  const inputBuffer = Buffer.from(await file.arrayBuffer());
  return sharp(inputBuffer).rotate().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
}

// § Fase 45 — dipakai dipanggil dari 2 rute (login DAN publik tanpa
// login, § komentar atas file ini), notifikasi disisipkan DI SINI
// (bukan di masing-masing rute) supaya kedua jalur otomatis konsisten,
// tidak drift (pola sama alasan ekstraksi fungsi ini ke `lib/` sejak awal).
export async function saveProofAndMarkSubmitted(orderId: string, webpBuffer: Buffer, transferDate: Date, payerNote: string | null) {
  await ensurePaymentProofBucket();
  const key = `orders/${orderId}/${randomUUID()}.webp`;
  await minioClient.putObject(PAYMENT_PROOF_BUCKET, key, webpBuffer);

  await db
    .update(orders)
    .set({
      proofUrl: key,
      transferDate,
      payerNote,
      submittedAt: new Date(),
      status: "submitted",
      // § reset audit reject lama kalau ini resubmit setelah ditolak
      rejectedBy: null,
      rejectedAt: null,
      rejectionNote: null,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));

  const owned = await getOrderById(orderId);
  if (!owned) return; // tidak seharusnya terjadi (order baru saja di-update), defensif saja

  await createNotification({
    userId: owned.invoice.userId,
    type: NOTIFICATION_TYPES.PAYMENT_PROOF_SUBMITTED,
    title: "Bukti transfer terkirim",
    body: "Bukti transfer kamu sedang direview admin — kami akan kabari begitu pembayaran terverifikasi.",
    entityType: "order",
    entityId: orderId,
  });

  // § admin/staff mana pun yang PUNYA permission `orders.manage` (RBAC
  // dinamis, BUKAN hardcode role "admin", § ADR-0027) — reverse lookup
  // `getUserIdsWithPermission` (§ lib/permission.ts, Fase 45).
  const recipientIds = await getUserIdsWithPermission("orders.manage");
  await createNotificationsBulk(
    recipientIds.map((userId) => ({
      userId,
      type: NOTIFICATION_TYPES.ADMIN_PAYMENT_PROOF_SUBMITTED,
      title: "Bukti transfer baru menunggu verifikasi",
      body: `${owned.invoice.billToName} mengirim bukti transfer untuk invoice ${owned.invoice.invoiceNumber}.`,
      entityType: "order",
      entityId: orderId,
    })),
  );
}
