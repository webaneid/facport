import {
  pgTable,
  uuid,
  varchar,
  integer,
  jsonb,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { user } from "./auth.schema";
import { subscriptions } from "./subscription.schema";

// § architecture-accurate-integration.md
// status: "mapping_pending" (baru upload, nunggu konfirmasi kolom) ->
// "processing" -> "completed" | "completed_with_errors" | "failed"
// (kegagalan level-batch, mis. koneksi Accurate belum ada accurateDbId).
export const importBatches = pgTable("import_batches", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id), // siapa yang upload
  subscriptionId: uuid("subscription_id")
    .notNull()
    .references(() => subscriptions.id), // menentukan accurate_connections mana yang dipakai
  module: varchar("module", { length: 50 }).notNull(), // "purchase_invoice" dst
  fileName: varchar("file_name", { length: 255 }).notNull(),
  totalRows: integer("total_rows").notNull(),
  columnMapping: jsonb("column_mapping"), // excelColumn -> field internal, diisi pas confirm mapping
  status: varchar("status", { length: 20 }).notNull().default("mapping_pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const importBatchRows = pgTable("import_batch_rows", {
  id: uuid("id").defaultRandom().primaryKey(),
  batchId: uuid("batch_id")
    .notNull()
    .references(() => importBatches.id, { onDelete: "cascade" }),
  rowNumber: integer("row_number").notNull(),
  rawData: jsonb("raw_data").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  accurateTransactionId: varchar("accurate_transaction_id", { length: 100 }),
  errorMessage: text("error_message"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});
