import { pgTable, uuid, varchar, integer, timestamp, text } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";
import { subscriptions } from "./subscription.schema";
import { dataUsaha } from "./data-usaha.schema";

// § Fase 150, ADR-0038 poin 4-5, architecture-konverter.md — riwayat Produk Konverter (Excel→XML client-side,
// TIDAK ADA `import_batches` untuk Konverter — pipeline-nya bukan async-server-verified seperti Facport).
// `rowCount` BUKAN angka bebas: hasil hitungan otomatis browser dari `summary()` (baris yang LOLOS validasi),
// dikirim SEBELUM tombol download aktif — baris di tabel ini di-INSERT SAAT `POST /me/conversion-logs` LOLOS
// pengecekan kuota trial (§ `lib/trial.ts` `checkAndRecordConversionRowBudget`), bukan self-report pasif setelah
// fakta. Isi Excel TIDAK PERNAH masuk sini (cuma metadata) — prinsip privacy-first app lama dipertahankan.
export const conversionLogs = pgTable("conversion_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  dataUsahaId: uuid("data_usaha_id")
    .notNull()
    .references(() => dataUsaha.id),
  subscriptionId: uuid("subscription_id")
    .notNull()
    .references(() => subscriptions.id),
  moduleKey: varchar("module_key", { length: 50 }).notNull(), // "konverter_sales_invoice", dst
  fileName: varchar("file_name", { length: 255 }).notNull(),
  rowCount: integer("row_count").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
