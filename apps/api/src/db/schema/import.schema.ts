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
  // length 30 (naik dari 20) — "completed_with_errors" 21 karakter, dulu
  // overflow varchar(20) dan bikin UPDATE gagal diam-diam di worker
  // (batch permanen nyangkut "processing", ketemu 2026-08-27 demo nyata).
  status: varchar("status", { length: 30 }).notNull().default("mapping_pending"),
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
  // status tambahan sejak Fase 09: "cancelled" (9 char, muat varchar(20))
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  accurateTransactionId: varchar("accurate_transaction_id", { length: 100 }), // id FAKTUR Accurate
  // § Fase 09, ADR-0013 — id detailItem Accurate (BEDA dari id faktur di
  // atas) — WAJIB ada supaya "Batal Import" tahu persis item mana milik
  // baris ini di faktur yang mungkin gabungan lintas-batch (Fase 08).
  // NULL untuk baris yang diproses SEBELUM Fase 09 ada — diblokir dari
  // auto-cancel, bukan ditebak (lihat ADR-0013 Decision #2).
  accurateDetailItemId: varchar("accurate_detail_item_id", { length: 100 }),
  errorMessage: text("error_message"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
});
