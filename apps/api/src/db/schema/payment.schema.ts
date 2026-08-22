import { pgTable, uuid, varchar, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

// § architecture-payment.md — billing langganan Facport sendiri, BUKAN
// transaksi Accurate. Provider (Ipaymu/Xendit) belum final.
export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  externalId: varchar("external_id", { length: 100 }).notNull().unique(),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // "pending" | "paid" | "failed" | "expired"
  amount: integer("amount").notNull(), // Rupiah, integer
  paymentMethod: varchar("payment_method", { length: 50 }),
  rawWebhookPayload: jsonb("raw_webhook_payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
