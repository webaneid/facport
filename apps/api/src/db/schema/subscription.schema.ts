import { pgTable, uuid, varchar, integer, jsonb, boolean, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";
import { orders } from "./payment.schema";

// § architecture-subscription.md — model langganan
export const plans = pgTable("plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  price: integer("price").notNull(), // Rupiah, integer
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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
