import { pgTable, uuid, varchar, integer, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";
import { invoices } from "./invoice.schema";

// § Fase 16, ADR-0022 — DIROMBAK TOTAL dari bentuk lama (era rencana
// payment gateway otomatis: externalId/rawWebhookPayload). Sekarang
// representasi pembayaran MANUAL (transfer bank + QRIS, verifikasi
// admin) — 1 invoice = 1 order, dibuat BARENG invoice saat checkout.
// TIDAK polimorfik (beda dari referensi jalajogja yang punya sourceType
// generik) — Facport cuma punya 1 jenis transaksi (bayar invoice
// langganan). Lihat architecture-payment.md § Skema Database.
export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
  method: varchar("method", { length: 20 }), // "bank_transfer" | "qris" — nullable, dipilih customer belakangan
  // § kode unik ditambahkan ke invoice.total agar admin bisa cocokkan
  // mutasi bank ke invoice yang tepat TANPA API cek-mutasi otomatis.
  // amountDue = invoice.total + uniqueCode (dihitung, TIDAK disimpan redundan).
  uniqueCode: integer("unique_code").notNull().default(0),
  bankAccountRef: varchar("bank_account_ref", { length: 50 }), // id dari settings.company.bankAccounts[]
  qrisAccountRef: varchar("qris_account_ref", { length: 50 }), // id dari settings.company.qrisAccounts[]
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  // "pending" (baru dibuat) | "submitted" (bukti sudah diupload) |
  // "paid" (admin verifikasi) | "rejected" (admin tolak, bisa retry) |
  // "cancelled" | "expired"
  transferDate: timestamp("transfer_date", { withTimezone: true }),
  proofUrl: text("proof_url"), // MinIO object key di bucket PRIVAT facport-payment-proofs, BUKAN URL publik
  payerNote: text("payer_note"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  confirmedBy: text("confirmed_by").references(() => user.id),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  rejectedBy: text("rejected_by").references(() => user.id),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  rejectionNote: text("rejection_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
