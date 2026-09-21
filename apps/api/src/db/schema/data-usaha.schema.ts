import { sql } from "drizzle-orm";
import { pgTable, uuid, varchar, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
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
  // § Fase 143, ADR-0037 — pointer ke KONEKSI AKUN Accurate yang DIBAGI: banyak Data Usaha milik akun Accurate
  // yang sama menunjuk baris yang sama (UNIQUE dilepas). NULL = belum terhubung / diputus (transfer
  // kepemilikan, admin). Koneksi lama (accurate_user_id NULL) TIDAK pernah ditunjuk (cutover).
  accurateConnectionId: uuid("accurate_connection_id").references(() => accurateConnections.id),
  // § Fase 143 — database Accurate yang dipakai Data Usaha ini (dulu di `accurate_connections.accurateDbId`,
  // yang salah tempat: 1 koneksi = 1 akun bisa punya banyak database). Backfill migrasi 0028 mengisi "database
  // terakhir diketahui" dari koneksi lama TANPA pointer koneksi — UI wajib minta konfirmasi saat hubungkan ulang.
  accurateDbId: varchar("accurate_db_id", { length: 100 }),
  accurateDbAlias: varchar("accurate_db_alias", { length: 255 }),
  // § Fase 144 — kapan pemilik memilih/MENGONFIRMASI database ini. NULL = "database terakhir diketahui" hasil backfill 0028
  // (belum diverifikasi manusia) → gerbang koneksi meminta konfirmasi (`confirm_database`). Diisi `databases/select` & `confirm`.
  accurateDbConfirmedAt: timestamp("accurate_db_confirmed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  // 1 database Accurate ↔ 1 Data Usaha (ADR-0036 #1, ADR-0037 #3). Parsial: baris yang belum/tidak terhubung bebas.
  uniqueIndex("data_usaha_connection_db_uidx")
    .on(t.accurateConnectionId, t.accurateDbId)
    .where(sql`${t.accurateConnectionId} IS NOT NULL AND ${t.accurateDbId} IS NOT NULL`),
]);
