import { and, eq, lt, sql } from "drizzle-orm";
import { db } from "./db";
import { orders, invoices, auditLogs } from "../db/schema";
import { createNotification, NOTIFICATION_TYPES } from "./notifications";
import { logger } from "./logger";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// § Fase 178 — membatalkan invoice/pesanan yang BELUM lunas. 1 invoice = 1 order = 1 Data Usaha → pembatalan selalu untuk SELURUH invoice (tidak ada batal
// sebagian). Order `cancelled` + invoice `void`; membuka blokir pembelian/perpanjangan modul yang sama (`inFlightModuleKeys` hanya menghitung pending/submitted).
// Invoice yang SUDAH lunas TIDAK bisa dibatalkan di sini (refund/pembalikan langganan di luar scope).
export const ADMIN_CANCELLABLE_STATUSES = ["pending", "submitted", "rejected"] as const;
// Customer hanya boleh membatalkan sebelum ada bukti yang menunggu admin (submitted = sedang diverifikasi, tidak dibatalkan sepihak).
export const CUSTOMER_CANCELLABLE_STATUSES = ["pending", "rejected"] as const;

export type CancelOrderParams = {
  orderId: string;
  actorId: string;
  reason: string;
  allowedStatuses: readonly string[];
  /** Customer: pembatal harus pemilik invoice. Admin: tidak dibatasi. */
  requireOwnerId?: string;
  /** Admin yang membatalkan → customer diberi tahu; customer yang membatalkan sendiri tidak perlu notifikasi. */
  notifyCustomer: boolean;
};

export async function cancelOrder(tx: Tx, params: CancelOrderParams): Promise<{ orderId: string; invoiceId: string; customerId: string }> {
  const [order] = await tx.select().from(orders).where(sql`${orders.id} = ${params.orderId} FOR UPDATE`).limit(1);
  if (!order) throw new Error("ORDER_NOT_FOUND");
  const [invoice] = await tx.select().from(invoices).where(sql`${invoices.id} = ${order.invoiceId} FOR UPDATE`).limit(1);
  if (!invoice) throw new Error("INVOICE_NOT_FOUND");
  if (params.requireOwnerId && invoice.userId !== params.requireOwnerId) throw new Error("ORDER_NOT_FOUND"); // jangan bocorkan keberadaan order orang lain
  if (invoice.status === "paid" || order.status === "paid") throw new Error("INVOICE_ALREADY_PAID");
  if (!params.allowedStatuses.includes(order.status)) throw new Error("ORDER_NOT_CANCELLABLE");

  const now = new Date();
  await tx.update(orders).set({ status: "cancelled", cancelledBy: params.actorId, cancelledAt: now, cancelReason: params.reason, updatedAt: now }).where(eq(orders.id, order.id));
  await tx.update(invoices).set({ status: "void" }).where(eq(invoices.id, invoice.id));
  await tx.insert(auditLogs).values({
    entityType: "order",
    entityId: order.id,
    action: "update",
    changes: { status: { from: order.status, to: "cancelled" }, invoiceStatus: "void", reason: params.reason },
    actorId: params.actorId,
  });
  if (params.notifyCustomer) {
    await createNotification(
      {
        userId: invoice.userId,
        type: NOTIFICATION_TYPES.ORDER_CANCELLED,
        title: "Invoice dibatalkan",
        body: `Invoice ${invoice.invoiceNumber} dibatalkan. Alasan: ${params.reason}`,
        entityType: "order",
        entityId: order.id,
      },
      tx,
    );
  }
  return { orderId: order.id, invoiceId: invoice.id, customerId: invoice.userId };
}

// § Kedaluwarsa otomatis: HANYA order `pending` (belum ada bukti transfer) dengan invoice `unpaid` yang `due_date`-nya lewat. Satu transaksi per order (kegagalan satu
// tidak menggagalkan yang lain); status dicek ULANG setelah dikunci (customer bisa saja baru mengunggah bukti di detik yang sama → tidak dikedaluwarsakan).
export async function expireOverdueOrders(now: Date = new Date()): Promise<number> {
  const overdue = await db
    .select({ orderId: orders.id })
    .from(orders)
    .innerJoin(invoices, eq(invoices.id, orders.invoiceId))
    .where(and(eq(orders.status, "pending"), eq(invoices.status, "unpaid"), lt(invoices.dueDate, now)));

  let expired = 0;
  for (const { orderId } of overdue) {
    try {
      const done = await db.transaction(async (tx) => {
        const [order] = await tx.select().from(orders).where(sql`${orders.id} = ${orderId} FOR UPDATE`).limit(1);
        if (!order || order.status !== "pending") return false;
        const [invoice] = await tx.select().from(invoices).where(sql`${invoices.id} = ${order.invoiceId} FOR UPDATE`).limit(1);
        if (!invoice || invoice.status !== "unpaid" || !invoice.dueDate || invoice.dueDate.getTime() >= now.getTime()) return false;
        await tx.update(orders).set({ status: "expired", updatedAt: now }).where(eq(orders.id, order.id));
        await tx.update(invoices).set({ status: "expired" }).where(eq(invoices.id, invoice.id));
        await tx.insert(auditLogs).values({ entityType: "order", entityId: order.id, action: "update", changes: { status: { from: "pending", to: "expired" }, invoiceStatus: "expired", reason: "jatuh tempo terlewati tanpa pembayaran" } });
        await createNotification(
          {
            userId: invoice.userId,
            type: NOTIFICATION_TYPES.ORDER_EXPIRED,
            title: "Invoice kedaluwarsa",
            body: `Invoice ${invoice.invoiceNumber} kedaluwarsa karena melewati jatuh tempo tanpa pembayaran. Silakan buat pesanan baru bila masih ingin berlangganan.`,
            entityType: "order",
            entityId: order.id,
          },
          tx,
        );
        return true;
      });
      if (done) expired += 1;
    } catch (err) {
      logger.error({ err, orderId }, "Gagal mengedaluwarsakan order");
    }
  }
  return expired;
}
