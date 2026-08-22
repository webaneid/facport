import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  integer,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth.schema";

// --- Settings (key-value, § architecture-settings.md) ---
export const settings = pgTable("settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: jsonb("value").notNull(),
  group: varchar("group", { length: 50 }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedBy: text("updated_by").references(() => user.id),
});

// --- Media (§ components/architecture-component-media-library.md) ---
export const media = pgTable("media", {
  id: uuid("id").defaultRandom().primaryKey(),
  filename: varchar("filename", { length: 255 }).notNull(),
  storageKey: varchar("storage_key", { length: 500 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  width: integer("width"),
  height: integer("height"),
  altText: varchar("alt_text", { length: 255 }),
  variants: jsonb("variants"),
  uploadedBy: text("uploaded_by").references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// --- Audit Logs (§ architecture-security.md §11) ---
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  entityType: varchar("entity_type", { length: 50 }).notNull(),
  entityId: varchar("entity_id", { length: 100 }).notNull(),
  action: varchar("action", { length: 20 }).notNull(), // "create" | "update" | "delete"
  changes: jsonb("changes"),
  actorId: text("actor_id").references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
