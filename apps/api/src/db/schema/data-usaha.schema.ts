import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";
import { accurateConnections } from "./accurate.schema";

// § Fase 107, architecture-user-tambahan.md § Fase B0 — entity BARU,
// TERPISAH dari `accurate_connections` (yang tetap menyimpan token OAuth
// terenkripsi). 1 Data Usaha = 1 "workspace" yang dipilih user setelah
// login (gerbang "Pilih Data Usaha", § Fase 109), opsional terhubung ke 1
// `accurate_connections` — koneksi TIDAK WAJIB ada saat Data Usaha dibuat
// (§ Keputusan Desain #6, hybrid: connect langsung ATAU lewati dulu untuk
// trial/eksplorasi).
export const dataUsaha = pgTable("data_usaha", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id),
  // § Keputusan Desain #10 — INI POINTER KEPEMILIKAN YANG BISA DIPINDAH
  // (transfer "super user", § Fase 110), BUKAN sekadar "siapa yang bikin
  // dulu". Hak kelola (tambah fitur, kelola user tambahan) SELALU ikut
  // nilai kolom ini SAAT DICEK (bukan siapa yang mengisi saat Data Usaha
  // ini pertama dibuat). Riwayat pembayaran (`subscriptions.userId`/
  // `invoices.userId`) SENGAJA TIDAK ikut berubah saat transfer — itu
  // catatan akuntansi historis, tidak boleh ditulis ulang.
  name: varchar("name", { length: 200 }).notNull(),
  // nama bebas user, mis. "PT Maju Jaya" — TIDAK harus sama dengan
  // `accurateDbAlias` (yang baru terisi begitu benar-benar connect).
  accurateConnectionId: uuid("accurate_connection_id").unique().references(() => accurateConnections.id),
  // NULLABLE — diisi begitu Data Usaha ini terhubung ke Accurate (kapan
  // pun terjadi). UNIQUE — 1 Data Usaha lokal = maksimal 1 koneksi
  // Accurate PERMANEN, tidak pernah ganti-ganti diam-diam (§ Keputusan #6).
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
