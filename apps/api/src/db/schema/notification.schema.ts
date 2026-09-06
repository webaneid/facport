import { pgTable, uuid, varchar, text, jsonb, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";

// § Fase 45, ADR-0029 — 1 row = 1 broadcast/pengumuman yang admin buat.
// Konten ASLI disimpan di sini; penerima aktual (fan-out) ada di
// `notifications` (masing-masing salinan title/body sendiri) — lihat
// ADR-0029 untuk rasional fan-out vs shared+read-receipt.
export const announcements = pgTable("announcements", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body").notNull(),
  target: varchar("target", { length: 20 }).notNull(),
  // enum: "all_customers" | "specific_modules" | "specific_users"
  targetModules: jsonb("target_modules").$type<string[]>(), // diisi kalau target="specific_modules"
  targetUserIds: jsonb("target_user_ids").$type<string[]>(), // diisi kalau target="specific_users" — audit/referensi saja, penerima ASLI ada di baris notifications
  // § diisi worker SETELAH fan-out selesai (§ JOBS.SEND_ANNOUNCEMENT) —
  // 0 selagi masih diproses, dipakai admin lihat "dikirim ke berapa customer".
  recipientCount: integer("recipient_count").notNull().default(0),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// § Fase 45, ADR-0029 — 1 row = 1 notifikasi utk 1 penerima (fan-out).
// Dipakai SEKALIGUS untuk customer (mis. "pembayaran terverifikasi") dan
// admin/staff (mis. "ada bukti transfer baru") — dibedakan oleh siapa
// `userId`-nya, BUKAN tabel/endpoint terpisah per surface.
export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  // § lihat architecture-notifications.md § "Katalog Tipe" untuk daftar
  // lengkap nilai yang valid — varchar+comment (pola sama
  // `orders.status`/`import_batches.module`), BUKAN pg enum.
  type: varchar("type", { length: 50 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body").notNull(),
  // § entityType/entityId: referensi ke entity terkait (order/subscription/
  // accurate_connection/announcement) — dipakai frontend (lib/notification-
  // routes.ts) resolve link tujuan saat notifikasi diklik. Nullable —
  // sebagian tipe (mis. broadcast tanpa target spesifik) tidak selalu ada.
  entityType: varchar("entity_type", { length: 50 }),
  entityId: uuid("entity_id"),
  sourceAnnouncementId: uuid("source_announcement_id").references(() => announcements.id),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
