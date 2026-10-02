import {
  pgTable,
  uuid,
  varchar,
  integer,
  jsonb,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { user } from "./auth.schema";
import { subscriptions } from "./subscription.schema";

// § architecture-accurate-integration.md
// status: "mapping_pending" (baru upload, nunggu konfirmasi kolom) ->
// "processing" -> "completed" | "completed_with_errors" | "failed"
// (kegagalan level-batch, mis. koneksi Accurate belum ada accurateDbId).
export const importBatches = pgTable(
  "import_batches",
  {
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
  },
  // § BUG DITEMUKAN & DIPERBAIKI 2026-09-27 (audit menyeluruh) — kolom ini
  // dipakai di 32 tempat (`GET .../import` list per subscription+module di
  // SEMUA 23 modul, job PURGE_OLD_IMPORTS, dst) TANPA index sejak awal —
  // sequential scan begitu jumlah batch bertambah. Composite (bukan
  // tunggal) karena query paling sering filter KEDUANYA sekaligus.
  (t) => [index("import_batches_subscription_module_idx").on(t.subscriptionId, t.module)],
);

export const importBatchRows = pgTable(
  "import_batch_rows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => importBatches.id, { onDelete: "cascade" }),
    rowNumber: integer("row_number").notNull(),
    rawData: jsonb("raw_data").notNull(),
    // status tambahan sejak Fase 09: "cancelled" (9 char, muat varchar(20))
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    accurateTransactionId: varchar("accurate_transaction_id", { length: 100 }), // id FAKTUR Accurate
    // § evaluasi client 2026-10-03 — NOMOR transaksi yang terbaca manusia (mis. "ADJ.2026.10.00001",
    // `number` dari respons save.do), BEDA dari `accurateTransactionId` di atas yang id internal numerik
    // Accurate. Baru diisi modul AutoProduksi (Import Produksi); NULL untuk modul lain & baris lama.
    accurateTransactionNumber: varchar("accurate_transaction_number", { length: 100 }),
    // § Fase 09, ADR-0013 — id detailItem Accurate (BEDA dari id faktur di
    // atas) — WAJIB ada supaya "Batal Import" tahu persis item mana milik
    // baris ini di faktur yang mungkin gabungan lintas-batch (Fase 08).
    // NULL untuk baris yang diproses SEBELUM Fase 09 ada — diblokir dari
    // auto-cancel, bukan ditebak (lihat ADR-0013 Decision #2).
    accurateDetailItemId: varchar("accurate_detail_item_id", { length: 100 }),
    errorMessage: text("error_message"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  // § BUG DITEMUKAN & DIPERBAIKI 2026-09-27 (audit menyeluruh) — `batchId`
  // dipakai di 107 TEMPAT (SETIAP endpoint get-detail/export/retry/
  // edit-row/edit-bulk di SEMUA 23 modul + worker) TANPA index sejak
  // modul pertama dibangun — sequential scan begitu baris terkumpul
  // (10.000/batch × banyak batch aktif). Composite (batch_id, status)
  // karena query PALING SERING (worker fetch pending/failed, summary
  // count per status) filter KEDUANYA sekaligus, bukan batch_id saja.
  (t) => [index("import_batch_rows_batch_status_idx").on(t.batchId, t.status)],
);
