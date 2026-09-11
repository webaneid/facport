import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";
import { dataUsaha } from "./data-usaha.schema";
import { subscriptions } from "./subscription.schema";

// § Fase 110, architecture-user-tambahan.md — "User Tambahan" (seat) yang
// menumpang langganan user utama. Model DIKONFIRMASI client (bukan asumsi):
// 1 seat = terkunci PERMANEN ke 1 Data Usaha (`dataUsahaId`, TIDAK PERNAH
// diubah), akses = SEMUA fitur yang SEDANG aktif di Data Usaha itu (bukan
// granular per-modul) — makanya TIDAK ADA tabel grant terpisah di sini,
// cukup `dataUsahaId` + status. Query akses union-nya ada di
// `lib/subscription-gate.ts` `getAccessibleSubscriptionsWithPlans`.
export const memberSeats = pgTable("member_seats", {
  id: uuid("id").defaultRandom().primaryKey(),
  // § pemilik & pembayar seat ini — SELALU pemilik `dataUsahaId` SAAT SEAT
  // DIBELI. TIDAK ikut berubah otomatis kalau Data Usaha ditransfer nanti
  // (Fase 111) — histori "siapa yang beli slot ini" tetap seperti
  // `subscriptions.userId` (snapshot pembelian, bukan kepemilikan berjalan).
  primaryUserId: text("primary_user_id").notNull().references(() => user.id),
  dataUsahaId: uuid("data_usaha_id")
    .notNull()
    .references(() => dataUsaha.id),
  // § 1:1 ke subscription "seat_addon" yang mengaktifkan slot ini — expiry
  // slot OTOMATIS ikut expiry subscription ini (job EXPIRE_SUBSCRIPTIONS
  // yang sudah ada, tidak perlu job baru khusus seat).
  seatSubscriptionId: uuid("seat_subscription_id")
    .notNull()
    .unique()
    .references(() => subscriptions.id),
  // § NULLABLE — diisi begitu invite di-accept (password ATAU Google).
  memberUserId: text("member_user_id").references(() => user.id),
  invitedEmail: varchar("invited_email", { length: 255 }),
  // § HASH saja (bukan token mentah) — pola sama token verifikasi email,
  // token mentah cuma ada di link yang dikirim lewat email, tidak pernah
  // disimpan di DB.
  inviteTokenHash: text("invite_token_hash"),
  inviteTokenExpiresAt: timestamp("invite_token_expires_at", { withTimezone: true }),
  // enum: "available" | "invited" | "active"
  status: varchar("status", { length: 20 }).notNull().default("available"),
  invitedAt: timestamp("invited_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedBy: text("revoked_by").references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
