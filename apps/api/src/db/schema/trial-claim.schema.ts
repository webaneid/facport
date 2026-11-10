import { pgTable, uuid, varchar, text, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// § Fase 217, ADR-0054, architecture-trial-database-ledger.md — buku besar PERMANEN trial per (database Accurate, modul).
// Kolom rujukan (subscription/user/data_usaha) SENGAJA tanpa FK: jejak trial tidak boleh ikut terhapus saat akun/Data Usaha
// dihapus. Klaim yang dilepas admin ditandai `released_at` (baris tidak dihapus) dan keluar dari indeks unik parsial.
export const trialClaims = pgTable(
  "trial_claims",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accurateDbId: varchar("accurate_db_id", { length: 100 }).notNull(),
    module: varchar("module", { length: 50 }).notNull(),
    subscriptionId: uuid("subscription_id").notNull(),
    userId: text("user_id").notNull(),
    dataUsahaId: uuid("data_usaha_id"),
    // Counter permanen baris sukses (tidak bergantung pada purge `import_batch_rows`). Hanya naik (GREATEST).
    rowsUsed: integer("rows_used").notNull().default(0),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).defaultNow().notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    releasedBy: text("released_by"),
    releaseReason: text("release_reason"),
  },
  (t) => [
    uniqueIndex("trial_claims_active_db_module_uidx").on(t.accurateDbId, t.module).where(sql`${t.releasedAt} IS NULL`),
    index("trial_claims_subscription_idx").on(t.subscriptionId),
  ],
);
