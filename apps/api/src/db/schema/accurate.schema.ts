import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { subscriptions } from "./subscription.schema";

// § architecture-accurate-integration.md § 1 — Authorization Code Grant
// terverifikasi (2026-08-19): refresh_token SELALU diterbitkan, access
// token expire 15 hari. 1 subscription = 1 akun Accurate (unique).
export const accurateConnections = pgTable("accurate_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  subscriptionId: uuid("subscription_id")
    .notNull()
    .unique()
    .references(() => subscriptions.id),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  accurateDbId: varchar("accurate_db_id", { length: 100 }),
  accurateDbAlias: varchar("accurate_db_alias", { length: 255 }), // nama Data Usaha, buat ditampilkan di UI status koneksi
  status: varchar("status", { length: 20 }).notNull().default("active"), // "active" | "expired" | "revoked"
  connectedAt: timestamp("connected_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
