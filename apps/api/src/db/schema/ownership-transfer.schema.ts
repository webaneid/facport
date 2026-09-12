import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";
import { dataUsaha } from "./data-usaha.schema";

// § Fase 111, architecture-user-tambahan.md — transfer kepemilikan Data
// Usaha, 2 tahap (initiate → accept) analog pola invite (`member_seats`,
// Fase 110) — mencegah salah ketik email/penerima tidak sadar jadi
// pemilik baru. Tabel TERPISAH dari `member_seats` (bukan menumpang) —
// beda entitas: ini transfer KEPEMILIKAN 1x pakai, bukan slot akses
// berulang. `status`: "pending" | "accepted" | "cancelled" — TIDAK ADA
// "expired" tersendiri, baris `pending` yang lewat `tokenExpiresAt` cukup
// gagal validasi di `findValidTransferByToken`, tidak perlu job harian
// terpisah untuk transisi status (beda dari `subscriptions.status`
// "expired" yang memang dibaca banyak tempat lain).
export const ownershipTransfers = pgTable("ownership_transfers", {
  id: uuid("id").defaultRandom().primaryKey(),
  dataUsahaId: uuid("data_usaha_id")
    .notNull()
    .references(() => dataUsaha.id),
  // § pemilik SAAT transfer diinisiasi — dicek ULANG terhadap
  // `data_usaha.userId` SAAT accept (bukan cuma saat initiate), supaya
  // token yang sudah stale (kepemilikan berubah lewat jalur lain sejak
  // transfer ini dibuat — mis. admin transfer langsung) otomatis ditolak
  // tanpa perlu cancel manual eksplisit.
  fromUserId: text("from_user_id").notNull().references(() => user.id),
  toEmail: varchar("to_email", { length: 255 }).notNull(),
  tokenHash: text("token_hash").notNull(),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  acceptedBy: text("accepted_by").references(() => user.id),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
