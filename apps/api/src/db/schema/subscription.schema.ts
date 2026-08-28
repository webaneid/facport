import { pgTable, uuid, varchar, integer, jsonb, boolean, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";
import { orders } from "./payment.schema";

// § architecture-subscription.md — model langganan
export const plans = pgTable("plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  // § Fase 10, ADR-0015 — nullable (dulu notNull). Facport SEMENTARA
  // tanpa harga (supporting app) — kolom TETAP ada (reversibel), form
  // admin TIDAK punya field ini selama ADR-0015 berlaku.
  price: integer("price"), // Rupiah, integer
  durationDays: integer("duration_days").notNull(),
  modules: jsonb("modules").$type<string[]>().notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id),
  planId: uuid("plan_id").notNull().references(() => plans.id),
  orderId: uuid("order_id").references(() => orders.id), // nullable — null kalau dibuat admin tanpa payment
  status: varchar("status", { length: 20 }).notNull().default("pending_payment"),
  // enum: "pending_payment" | "active" | "expired" | "cancelled"
  startAt: timestamp("start_at", { withTimezone: true }),
  endAt: timestamp("end_at", { withTimezone: true }),
  // § Fase 10 — override retensi data import PER SUBSCRIPTION (nullable,
  // NULL = pakai default admin, § architecture-subscription.md §
  // "Retensi Data Import"). Endpoint buat customer isi field ini sendiri
  // SENGAJA belum dibangun (ditunda ke fase customer-settings terpisah)
  // — job `PURGE_OLD_IMPORTS` sudah baca kolom ini dari sekarang.
  importRetentionDaysOverride: integer("import_retention_days_override"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
