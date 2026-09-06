import { pgTable, uuid, varchar, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";

// § Fase 46 — profil agent Customer Care yang ditampilkan ke customer
// (foto, nama, posisi, WhatsApp) lewat widget floating (§ architecture-
// customer-care.md). "Online" DIHITUNG (bukan disimpan) dari kombinasi
// `isActive` + `manuallyOfflineUntil` + jam kerja global (settings, key
// "customerCare.*") — lihat `lib/customer-care.ts` `isAgentOnline()`.
export const customerCareAgents = pgTable("customer_care_agents", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  position: varchar("position", { length: 100 }).notNull(), // free text: "Customer Care", "Supervisor", dst
  photoUrl: text("photo_url"), // nullable — URL publik bucket, pola sama company.logo (§ ADR-0017)
  whatsappNumber: varchar("whatsapp_number", { length: 20 }).notNull(), // format wa.me: "628xxxxxxxxxx", TANPA "+"
  // § arsip permanen (CS resign) — soft delete, pola sama plans.isActive.
  // BEDA dari manuallyOfflineUntil (temporary, 1 hari) — ini PERMANEN
  // sampai admin aktifkan lagi secara eksplisit.
  isActive: boolean("is_active").notNull().default(true),
  // § "off hari ini" (CS berhalangan hadir) — diisi endOfToday(company
  // timezone) saat admin toggle (§ lib/customer-care.ts). NULL = tidak
  // sedang di-off manual. Auto "online lagi" begitu lewat tengah malam
  // TANPA job/cron — tinggal dibandingkan `manuallyOfflineUntil > now()`.
  manuallyOfflineUntil: timestamp("manually_offline_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// § log SETIAP klik "Chat via WhatsApp" dari widget customer — dasar
// ROTASI (hitung klik HARI INI per agent, § pickNextAgent) DAN ANALITIK
// (hitung customer UNIK per hari/minggu/bulan, § GET /admin/customer-care/analytics).
export const customerCareClicks = pgTable("customer_care_clicks", {
  id: uuid("id").defaultRandom().primaryKey(),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => customerCareAgents.id),
  userId: text("user_id")
    .notNull()
    .references(() => user.id), // customer yang klik — endpoint auth:true, selalu ada
  clickedAt: timestamp("clicked_at", { withTimezone: true }).defaultNow().notNull(),
});
