import { pgTable, uuid, varchar, integer, text, timestamp, smallint, unique } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";
import { plans } from "./subscription.schema";

// § Fase 15, ADR-0021 — dokumen BISNIS (invoice), terpisah dari `orders`
// (payment.schema.ts — catatan TRANSAKSI pembayaran, Fase 16). Invoice
// BOLEH ada tanpa order sama sekali (jalur admin "Tandai Sudah Dibayar
// Manual", Fase 18) — lihat architecture-invoice.md.
export const invoices = pgTable("invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceNumber: varchar("invoice_number", { length: 30 }).notNull().unique(), // "INV/2026/09/0001"
  userId: text("user_id").notNull().references(() => user.id),
  status: varchar("status", { length: 20 }).notNull().default("unpaid"), // "unpaid" | "paid" | "void" | "expired"
  billToName: varchar("bill_to_name", { length: 200 }).notNull(), // SNAPSHOT nama user saat invoice dibuat
  billToAddress: text("bill_to_address"),
  subtotal: integer("subtotal").notNull(), // Rupiah, integer
  total: integer("total").notNull(), // = subtotal fase ini, kolom disiapkan utk pajak/diskon nanti
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// § SEMUA field di bawah (label, price) WAJIB snapshot dari `plans` saat
// invoice dibuat, BUKAN join live — perubahan harga plan di masa depan
// TIDAK BOLEH mengubah invoice yang sudah diterbitkan (architecture-invoice.md
// § "Kenapa Semua Field Penting Snapshot").
export const invoiceItems = pgTable("invoice_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  planId: uuid("plan_id").notNull().references(() => plans.id), // 1 baris = 1 SKU sub-modul yang dibeli
  moduleKey: varchar("module_key", { length: 50 }).notNull(), // denormalisasi dari plan.modules[0] saat invoice dibuat
  label: varchar("label", { length: 200 }).notNull(), // SNAPSHOT plan.name
  price: integer("price").notNull(), // SNAPSHOT plan.price
});

// § Fase 16, ADR-0022 — ganti pola `COUNT(*) LIKE 'INV/...%'` (Fase 15,
// rawan race condition di checkout concurrent) dengan sequence ATOMIK
// per (year, month) — adaptasi pola `financial_sequences` yang TERBUKTI
// production (jalajogja). `generateInvoiceNumber()` (lib/invoice-number.ts)
// increment `lastNumber` via `INSERT ... ON CONFLICT DO UPDATE ...
// RETURNING`, 1 statement atomik di level row Postgres — 2 checkout
// bersamaan TIDAK BISA dapat nomor invoice yang sama lagi.
export const invoiceSequences = pgTable(
  "invoice_sequences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    year: smallint("year").notNull(),
    month: smallint("month").notNull(), // 1-12
    lastNumber: integer("last_number").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique().on(t.year, t.month)],
);
