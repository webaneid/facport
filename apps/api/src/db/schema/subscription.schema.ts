import { pgTable, uuid, varchar, integer, jsonb, boolean, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";
import { orders } from "./payment.schema";
import { accurateConnections } from "./accurate.schema";
import { invoiceItems } from "./invoice.schema";

// § architecture-subscription.md — model langganan. § Fase 14, ADR-0019 —
// 1 row = 1 SKU per SATU sub-modul (sales_invoice/purchase_invoice/dst),
// bukan lagi bundel bebas banyak modul.
export const plans = pgTable("plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  // § Fase 14, ADR-0019 — WAJIB lagi (supersede ADR-0015 "tanpa harga
  // sementara" — premis itu sudah tidak berlaku, Facport jual per-modul
  // dengan harga nyata).
  price: integer("price").notNull(), // Rupiah, integer
  durationDays: integer("duration_days").notNull(),
  // § konvensi Fase 14: cuma 1 elemen per plan (1 SKU = 1 sub-modul).
  // Tipe TETAP array (hindari migration breaking untuk data lama).
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
  // § Fase 14, ADR-0020 — pointer ke koneksi Accurate yang dipakai
  // SUBSCRIPTION/MODUL INI. Nullable — diisi belakangan (customer pilih
  // reuse koneksi existing ATAU connect Data Usaha baru), bukan saat
  // checkout. `accurate_connections` SEKARANG milik user (bukan 1:1 ke
  // subscription lagi) — banyak subscription BOLEH share 1 connection
  // kalau Data Usaha-nya sama (§ architecture-subscription.md § "Koneksi
  // Accurate — Reusable Lintas Subscription").
  accurateConnectionId: uuid("accurate_connection_id").references(() => accurateConnections.id),
  // § Fase 15, ADR-0021 — pointer BALIK ke baris invoice yang membuat
  // subscription ini. Nullable — subscription BOLEH dibuat TANPA invoice
  // (jalur admin "Tandai Sudah Dibayar Manual", Fase 18, atau subscription
  // lama pra-Fase 15). Lihat architecture-invoice.md.
  invoiceItemId: uuid("invoice_item_id").references(() => invoiceItems.id),
  // § Fase 10 — override retensi data import PER SUBSCRIPTION (nullable,
  // NULL = pakai default admin, § architecture-subscription.md §
  // "Retensi Data Import"). Endpoint buat customer isi field ini sendiri
  // SENGAJA belum dibangun (ditunda ke fase customer-settings terpisah)
  // — job `PURGE_OLD_IMPORTS` sudah baca kolom ini dari sekarang.
  importRetentionDaysOverride: integer("import_retention_days_override"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
