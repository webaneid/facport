import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";

// § architecture-accurate-integration.md § 1 — Authorization Code Grant
// terverifikasi (2026-08-19): refresh_token SELALU diterbitkan, access
// token expire 15 hari.
// § Fase 14, ADR-0020 — supersede: koneksi SEKARANG milik `user`, TANPA
// unique (1 user boleh punya banyak connection, 1 per Data Usaha
// berbeda). Reusable lintas subscription — hindari Accurate men-charge
// customer sebagai "aplikasi terpisah" kalau 2 subscription/modul
// sebenarnya connect ke company yang sama. Pointer "subscription mana
// pakai koneksi ini" ada di `subscriptions.accurateConnectionId`
// (subscription.schema.ts), BUKAN di tabel ini lagi.
export const accurateConnections = pgTable("accurate_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  accurateDbId: varchar("accurate_db_id", { length: 100 }),
  accurateDbAlias: varchar("accurate_db_alias", { length: 255 }), // nama Data Usaha, buat ditampilkan di UI status koneksi
  status: varchar("status", { length: 20 }).notNull().default("active"), // "active" | "expired" | "revoked"
  connectedAt: timestamp("connected_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
