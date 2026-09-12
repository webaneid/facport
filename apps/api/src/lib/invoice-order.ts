import { db } from "./db";
import { invoices, invoiceItems, orders } from "../db/schema";
import { generateInvoiceNumber } from "./invoice-number";

const INVOICE_DUE_DAYS = 3;

type PlanRow = { id: string; name: string; price: number; modules: string[] };

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
export async function createInvoiceAndOrder(
  tx: Tx,
  params: { userId: string; billToName: string; planRows: PlanRow[]; dataUsahaId: string },
) {
  const { userId, billToName, planRows, dataUsahaId } = params;
  const subtotal = planRows.reduce((sum, p) => sum + p.price, 0);
  const invoiceNumber = await generateInvoiceNumber(tx);
  const dueDate = new Date(Date.now() + INVOICE_DUE_DAYS * 24 * 60 * 60 * 1000);

  const [invoice] = await tx
    .insert(invoices)
    .values({
      invoiceNumber,
      userId,
      status: "unpaid",
      billToName,
      subtotal,
      total: subtotal,
      dueDate,
    })
    .returning();

  await tx.insert(invoiceItems).values(
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
      label: p.name,
      price: p.price,
    })),
  );

  // § kode unik 100-999 (§ architecture-payment.md § Skema Database) —
  // ditambahkan ke invoice.total agar admin bisa cocokkan mutasi bank ke
  // invoice yang tepat tanpa API cek-mutasi otomatis.
  const uniqueCode = Math.floor(Math.random() * 900) + 100;
  const [order] = await tx.insert(orders).values({ invoiceId: invoice!.id, uniqueCode, dataUsahaId }).returning();

  return { invoiceId: invoice!.id, orderId: order!.id, subtotal, uniqueCode, amountDue: subtotal + uniqueCode };
}
