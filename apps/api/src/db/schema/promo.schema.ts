import { pgTable, uuid, varchar, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";

// § Fase 116, architecture-promo.md — banner promo di gerbang "Pilih Data
// Usaha" (`/app/pilih-usaha`, desktop-only), dikelola admin. `title`/
// `description`/`buttonLabel` NULLABLE tapi ALL-OR-NOTHING (divalidasi di
// route, bukan di schema — TypeBox tidak bisa nyatakan "field X wajib
// tergantung field Y" secara deklaratif, pola sama `validatePlanKindModules`
// di `admin/plans.route.ts`): ketiganya kosong = mode "gambar jadi link
// langsung", ketiganya terisi = mode "kartu + tombol". `url`/`imageUrl`
// SELALU wajib — kedua mode sama-sama butuh gambar+link.
export const promos = pgTable("promos", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 200 }),
  description: text("description"),
  buttonLabel: varchar("button_label", { length: 50 }),
  url: text("url").notNull(),
  // § URL bucket PUBLIK (`facport-public`), BUKAN Media Library privat —
  // lihat architecture-promo.md § Keputusan (gap `storageKey` belum
  // resolved di pola privat, sengaja dihindari fase ini).
  imageUrl: text("image_url").notNull(),
  // § arsip/pause tanpa hapus — TIDAK sama dengan "tampil" (lihat
  // `sortOrder` + LIMIT 5 di endpoint publik, `routes/promos.route.ts`).
  isActive: boolean("is_active").notNull().default(true),
  // § urutan tampil di slider — promo baru default ke urutan TERAKHIR
  // (dihitung di route, `MAX(sortOrder)+1`), admin boleh ubah manual.
  // TIDAK ada preseden kolom ini di tabel lain project ini (dicek saat
  // riset Fase 116) — konvensi BARU, pola integer polos + ORDER BY ASC.
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
