import { db } from "./db";
import { and, eq, inArray } from "drizzle-orm";
import { invoices, invoiceItems, orders, auditLogs, plans } from "../db/schema";
import { generateInvoiceNumber } from "./invoice-number";
import { moduleProductLine } from "./module-catalog";
import { activateInvoiceItems } from "./order-activation";
import { createNotification, NOTIFICATION_TYPES } from "./notifications";
import { paymentVerifiedBody } from "./subscription-renewal";

const INVOICE_DUE_DAYS = 3;

type PlanRow = { id: string; name: string; price: number; durationDays: number; interval: string; modules: string[]; productLine: string };

// § `tx` (dari `db.transaction(async (tx) => ...)`) TIDAK structurally
// compatible dengan `typeof db` (beda tipe Drizzle — transaction hilang
// property `$client`) — helper ini SELALU dipanggil dari DALAM
// transaction (checkout, admin create-user), jadi parameter-nya
// diturunkan dari tipe `tx` asli, bukan `typeof db`.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// § Fase 18 — diekstrak dari `subscriptions.route.ts` (`POST
// /subscriptions/checkout`, Fase 16) supaya bisa dipakai ULANG di
// `admin/users.route.ts` ("Kirim Invoice" saat admin bikin user baru),
// TANPA duplikasi logic bikin invoice+items+order. Sengaja TIDAK
// menyertakan guard "modul sudah aktif" atau row-lock user di sini —
// itu KONTEKS-SPESIFIK checkout customer (user existing, bisa checkout
// berkali-kali), BUKAN bagian generik pembuatan invoice. Caller yang
// butuh guard itu (checkout) tetap cek SEBELUM manggil helper ini;
// caller yang tidak butuh (admin bikin user BARU, mustahil sudah punya
// subscription apa pun) langsung panggil.
// § Fase 108, architecture-user-tambahan.md § Fase B1 — `dataUsahaId`
// WAJIB, 1 checkout = 1 Data Usaha (tidak bisa campur beberapa Data
// Usaha dalam 1 keranjang). Disimpan di `orders.dataUsahaId` (bukan per
// `invoiceItems`, semua item dalam 1 invoice pasti sama Data Usaha-nya
// — cukup 1 kolom di level order/transaksi).
// § Fase 178 — `paidBy`: invoice LUNAS OTOMATIS oleh admin (mode "Sudah dibayar"): invoice `paid`, order `paid` metode "manual" tanpa kode unik (tidak ada mutasi
// bank untuk dicocokkan), `confirmedBy`/`confirmedAt` = admin. Aktivasi langganannya dikerjakan `createPaidInvoiceAndOrder` di bawah.
export async function createInvoiceAndOrder(
  tx: Tx,
  params: { userId: string; billToName: string; planRows: PlanRow[]; dataUsahaId: string; paidBy?: { actorId: string; at: Date } },
) {
  const { userId, billToName, planRows, dataUsahaId, paidBy } = params;
  const subtotal = planRows.reduce((sum, p) => sum + p.price, 0);
  const invoiceNumber = await generateInvoiceNumber(tx);
  const dueDate = new Date(Date.now() + INVOICE_DUE_DAYS * 24 * 60 * 60 * 1000);

  const [invoice] = await tx
    .insert(invoices)
    .values({
      invoiceNumber,
      userId,
      status: paidBy ? "paid" : "unpaid",
      paidAt: paidBy?.at ?? null,
      billToName,
      subtotal,
      total: subtotal,
      dueDate,
    })
    .returning();

  const insertedItems = await tx.insert(invoiceItems).values(
    planRows.map((p) => ({
      invoiceId: invoice!.id,
      planId: p.id,
      // § Fase 110 — `seat_addon` (`modules: []`) TIDAK punya moduleKey
      // ASLI — `invoiceItems.moduleKey` NOT NULL, jadi sentinel string
      // "seat_addon" dipakai sebagai label denormalisasi (BUKAN moduleKey
      // import beneran, tidak pernah dicocokkan ke `moduleAccess` macro
      // manapun). Tanpa ini, checkout seat_addon CRASH di sini (constraint
      // NOT NULL) — ditemukan saat tulis test regresi, bukan lewat baca
      // kode saja.
      moduleKey: p.modules[0] ?? "seat_addon",
      // § Fase 117, ADR-0033 — denormalisasi dari plan.productLine, pola
      // sama moduleKey di atas.
      // § 2026-10-03 — Produk DITURUNKAN dari modul di katalog (sumber kebenaran tunggal), kolom `plans.product_line`
      // hanya fallback: kolom itu default "facport" dan terbukti bisa tidak sinkron (paket AutoProduksi berlabel Facport
      // di admin & invoice). Tanpa ini snapshot invoice ikut salah label.
      productLine: (p.modules[0] ? moduleProductLine(p.modules[0]) : null) ?? p.productLine,
      label: p.name,
      price: p.price,
      // § Fase 131 — snapshot durasi paket, pola sama label/price di atas.
      durationDays: p.durationDays,
      // § Fase 173, ADR-0041 — snapshot periode ("monthly" | "yearly"), pola sama durationDays.
      interval: p.interval,
    })),
  ).returning();

  // § kode unik 100-999 (§ architecture-payment.md § Skema Database) —
  // ditambahkan ke invoice.total agar admin bisa cocokkan mutasi bank ke
  // invoice yang tepat tanpa API cek-mutasi otomatis.
  // Invoice lunas-admin: kode unik 0 (tidak ada transfer bank untuk dicocokkan).
  const uniqueCode = paidBy ? 0 : Math.floor(Math.random() * 900) + 100;
  const [order] = await tx
    .insert(orders)
    .values({
      invoiceId: invoice!.id,
      uniqueCode,
      dataUsahaId,
      ...(paidBy ? { status: "paid", method: "manual", confirmedBy: paidBy.actorId, confirmedAt: paidBy.at } : {}),
    })
    .returning();

  return { invoiceId: invoice!.id, orderId: order!.id, subtotal, uniqueCode, amountDue: subtotal + uniqueCode, items: insertedItems };
}

// § Fase 178 — mode "Sudah dibayar" (Tambah User & Kelola Langganan): invoice dibuat OTOMATIS LUNAS + langganan langsung aktif & tertaut ke item invoice
// (jadi ada catatan/PDF untuk pembukuan, masa berlaku/perpanjangan tampil di invoice) — beda dari mode "Gratis" (tanpa invoice sama sekali). Aktivasinya
// memakai inti yang SAMA dengan konfirmasi pembayaran customer (`activateInvoiceItems`): modul aktif diperpanjang dari akhir lama, trial digantikan, dst.
// Notifikasi "Pembayaran terverifikasi" ke customer ikut dibuat (menyebut perpanjangan bila ada).
export async function createPaidInvoiceAndOrder(
  tx: Tx,
  params: { userId: string; billToName: string; planRows: PlanRow[]; dataUsahaId: string; actorId: string; now: Date; timeZone: string },
) {
  const { userId, billToName, planRows, dataUsahaId, actorId, now, timeZone } = params;
  const created = await createInvoiceAndOrder(tx, { userId, billToName, planRows, dataUsahaId, paidBy: { actorId, at: now } });

  const planById = new Map(planRows.map((p) => [p.id, p]));
  const items = created.items.map((item) => ({ item, plan: planById.get(item.planId!)! as typeof plans.$inferSelect }));
  const { createdSubscriptionIds, renewals } = await activateInvoiceItems(tx, { userId, orderId: created.orderId, dataUsahaId, items, now, timeZone, actorId });

  await tx.insert(auditLogs).values({
    entityType: "order",
    entityId: created.orderId,
    action: "create",
    changes: { status: "paid", paidByAdmin: true, subscriptionsCreated: createdSubscriptionIds, subscriptionsRenewed: renewals.map((r) => r.subscriptionId) },
    actorId,
  });
  await createNotification(
    {
      userId,
      type: NOTIFICATION_TYPES.PAYMENT_VERIFIED,
      title: "Langganan diaktifkan",
      body: paymentVerifiedBody(createdSubscriptionIds.length, renewals, timeZone),
      entityType: "order",
      entityId: created.orderId,
    },
    tx,
  );

  return { ...created, subscriptionIds: createdSubscriptionIds, renewals };
}

// § Pesanan yang BELUM SELESAI (order pending/submitted) — modul di dalamnya tidak boleh dipesan/diaktifkan lagi di Data Usaha yang sama (cegah dobel &
// perpanjangan ganda). Satu sumber untuk checkout customer (`subscriptions.route.ts`) dan jalur admin (invoice/lunas). Dibatalkan/kedaluwarsa/ditolak
// TIDAK dihitung (§ Fase 178 — membatalkan invoice membuka blokir ini).
export const NON_TERMINAL_ORDER_STATUSES = ["pending", "submitted"] as const;

export async function inFlightModuleKeys(tx: Tx | typeof db, params: { userId: string; dataUsahaId: string }): Promise<Set<string>> {
  const rows = await tx
    .select({ moduleKey: invoiceItems.moduleKey })
    .from(orders)
    .innerJoin(invoices, eq(invoices.id, orders.invoiceId))
    .innerJoin(invoiceItems, eq(invoiceItems.invoiceId, invoices.id))
    .where(and(eq(invoices.userId, params.userId), eq(orders.dataUsahaId, params.dataUsahaId), inArray(orders.status, [...NON_TERMINAL_ORDER_STATUSES])));
  return new Set(rows.map((r) => r.moduleKey));
}
