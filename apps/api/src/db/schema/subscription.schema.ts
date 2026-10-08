import { pgTable, uuid, varchar, integer, jsonb, boolean, text, timestamp, index } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";
import { orders } from "./payment.schema";
import { accurateConnections } from "./accurate.schema";
import { invoiceItems } from "./invoice.schema";
import { dataUsaha } from "./data-usaha.schema";

// § architecture-subscription.md — model langganan. § Fase 14, ADR-0019 —
// 1 row = 1 SKU per SATU sub-modul (sales_invoice/purchase_invoice/dst),
// bukan lagi bundel bebas banyak modul.
export const plans = pgTable("plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  // § Fase 14, ADR-0019 — WAJIB lagi (supersede ADR-0015 "tanpa harga
  // sementara" — premis itu sudah tidak berlaku, Facport jual per-modul
  // dengan harga nyata).
  price: integer("price").notNull(), // Rupiah, integer
  durationDays: integer("duration_days").notNull(),
  // § Fase 173, ADR-0041 — periode langganan: "monthly" | "yearly" (satu-satunya yang menentukan akhir langganan; `durationDays` tinggal
  // kompatibilitas/tampilan lama, 30/365). Default "monthly" supaya insert lama tanpa kolom ini tetap valid; backfill migrasi 0042.
  interval: varchar("interval", { length: 10 }).notNull().default("monthly"),
  // § konvensi Fase 14: cuma 1 elemen per plan (1 SKU = 1 sub-modul).
  // Tipe TETAP array (hindari migration breaking untuk data lama).
  modules: jsonb("modules").$type<string[]>().notNull(),
  isActive: boolean("is_active").notNull().default(true),
  // § Fase 110, architecture-user-tambahan.md — bedakan plan "module"
  // (SKU sub-modul biasa, default — semua baris lama otomatis ini) dari
  // "seat_addon" (slot User Tambahan, dijual per Data Usaha, TIDAK
  // pernah lewat jalur trial — § subscriptions.route.ts). Dipakai di
  // titik aktivasi (confirm order/manual-subscription) untuk tahu kapan
  // harus sekalian bikin baris `member_seats`.
  kind: varchar("kind", { length: 20 }).notNull().default("module"),
  // § Fase 117, ADR-0033 — dimensi "Produk" (Facport/Konverter/AutoProduksi,
  // architecture-product-lines.md), ORTOGONAL terhadap `modules` (varian di
  // dalam 1 Produk) dan `kind` (mekanisme billing di atas). Nilai valid ada
  // di `PRODUCT_LINES` (apps/api/src/lib/module-catalog.ts). DEFAULT
  // "facport" karena SEMUA plan existing memang Produk Facport.
  productLine: varchar("product_line", { length: 20 }).notNull().default("facport"),
  // § Fase 43 (koreksi) — admin HARUS eksplisit mengaktifkan trial per
  // paket, BUKAN semua paket otomatis bisa trial (kalau otomatis, admin
  // tidak punya otoritas atas paketnya sendiri). Default false — trial
  // baru jalan untuk paket yang admin tandai eksplisit lewat toggle di
  // form buat/edit paket. § architecture-subscription.md § "Trial (Batas
  // Baris)".
  trialEligible: boolean("trial_eligible").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull().references(() => user.id),
    planId: uuid("plan_id").notNull().references(() => plans.id),
    orderId: uuid("order_id").references(() => orders.id), // nullable — null kalau dibuat admin tanpa payment
    status: varchar("status", { length: 20 }).notNull().default("pending_payment"),
    // enum: "pending_payment" | "active" | "expired" | "cancelled"
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    // § Fase 14, ADR-0020 — pointer ke koneksi Accurate yang dipakai
    // SUBSCRIPTION/MODUL INI. Nullable — diisi belakangan (customer pilih
    // reuse koneksi existing ATAU connect Data Usaha baru), bukan saat
    // checkout. `accurate_connections` SEKARANG milik user (bukan 1:1 ke
    // subscription lagi) — banyak subscription BOLEH share 1 connection
    // kalau Data Usaha-nya sama (§ architecture-subscription.md § "Koneksi
    // Accurate — Reusable Lintas Subscription").
    accurateConnectionId: uuid("accurate_connection_id").references(() => accurateConnections.id),
    // § Fase 107, architecture-user-tambahan.md § Fase B0 — diisi SAAT
    // CHECKOUT (user berada di dalam konteks 1 Data Usaha ketika subscribe),
    // BUKAN lewat `accurateConnectionId` (yang bisa masih kosong kalau
    // belum connect Accurate). Ini yang bikin scoping "1 modul aktif per
    // Data Usaha" (bukan per akun) bisa dicek LANGSUNG tanpa join ke
    // Accurate. Sempat NULLABLE (migrasi 2 tahap, § phase doc Fase 107) —
    // sudah dikunci NOT NULL setelah backfill data lama terverifikasi
    // 100% terisi (`scripts/backfill-data-usaha.ts`, 0 baris NULL tersisa).
    dataUsahaId: uuid("data_usaha_id")
      .notNull()
      .references(() => dataUsaha.id),
    // § Fase 15, ADR-0021 — pointer BALIK ke baris invoice yang membuat
    // subscription ini. Nullable — subscription BOLEH dibuat TANPA invoice
    // (jalur admin "Tandai Sudah Dibayar Manual", Fase 18, atau subscription
    // lama pra-Fase 15). Lihat architecture-invoice.md.
    invoiceItemId: uuid("invoice_item_id").references(() => invoiceItems.id),
    // § Fase 10 — override retensi data import PER SUBSCRIPTION (nullable,
    // NULL = pakai default admin, § architecture-subscription.md §
    // "Retensi Data Import"). Endpoint buat customer isi field ini sendiri
    // SENGAJA belum dibangun (ditunda ke fase customer-settings terpisah)
    // — job `PURGE_OLD_IMPORTS` sudah baca kolom ini dari sekarang.
    importRetentionDaysOverride: integer("import_retention_days_override"),
    // § Fase 43 — trial gratis (self-service, 1x seumur hidup per modul per
    // user). Subscription trial dibuat LANGSUNG "active" tanpa order/invoice
    // (orderId/invoiceItemId null), dibatasi jumlah baris berhasil-import
    // (§ architecture-subscription.md § "Trial (Batas Baris)"), BUKAN cuma
    // durasi hari — `endAt` tetap dipakai sebagai backstop kadaluarsa.
    isTrial: boolean("is_trial").notNull().default(false),
    // § Fase 45 — nilai terkecil H-berapa yang SUDAH dikirim notifikasi
    // "akan berakhir"-nya (job `NOTIFY_EXPIRING_SOON`, threshold 7/3/1 utk
    // subscription asli, 3/1 utk trial) — cegah reminder terkirim dobel
    // tiap kali job harian jalan. Nullable — NULL = belum pernah diingatkan.
    lastReminderThresholdDays: integer("last_reminder_threshold_days"),
    // § Fase 173, ADR-0041 — jangkar anti-geser tanggal: `endAt` = `periodAnchorAt` + `periodMonths` bulan kalender (zona perusahaan saat itu).
    // NULL = langganan lama / admin mengubah tanggal manual → perpanjangan berikutnya menetapkan jangkar baru di `endAt` saat itu. Diisi Fase 174.
    periodAnchorAt: timestamp("period_anchor_at", { withTimezone: true }),
    periodMonths: integer("period_months"),
    // § Fase 181, ADR-0042 — perpanjangan TERJADWAL: "monthly" | "yearly" | NULL (tidak terjadwal, default semua langganan yang ada). Job harian menerbitkan invoice perpanjangan
    // 7 hari sebelum `end_at` untuk langganan modul non-trial yang ditandai. `renewal_invoiced_for_end_at` = `end_at` yang SUDAH ditagih (idempoten: satu tagihan per siklus).
    renewalInterval: varchar("renewal_interval", { length: 10 }),
    renewalInvoicedForEndAt: timestamp("renewal_invoiced_for_end_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  // § BUG DITEMUKAN & DIPERBAIKI 2026-09-27 (audit menyeluruh) — 54
  // pemakaian filter kolom-kolom ini TANPA index sejak awal, termasuk
  // `moduleAccess` guard (lib/subscription-gate.ts) yang jalan di HAMPIR
  // SEMUA endpoint aplikasi (bukan cuma modul import) — dampak PALING
  // LUAS di antara semua temuan index audit ini.
  (t) => [
    // § query paling sering (subscription-gate.ts, admin/subscriptions.route.ts) — filter dataUsahaId + status='active' bersamaan.
    index("subscriptions_data_usaha_status_idx").on(t.dataUsahaId, t.status),
    // § dipakai sendirian di banyak tempat (admin/user-subscriptions.route.ts, subscriptions.route.ts, admin/orders.route.ts, dst).
    index("subscriptions_user_id_idx").on(t.userId),
    // § dipakai sendirian (announcements.ts, admin/stats.route.ts, workers/index.ts EXPIRE_SUBSCRIPTIONS/NOTIFY_EXPIRING_SOON).
    index("subscriptions_status_idx").on(t.status),
    // § FK, defensif — belum ada query eksplisit ditemukan tapi index FK tetap wajar untuk JOIN/cascade.
    index("subscriptions_accurate_connection_id_idx").on(t.accurateConnectionId),
  ],
);

// § Fase 176, ADR-0041 poin 4 — riwayat PERPANJANGAN DINI: langganan modul yang masih aktif diperpanjang DI TEMPAT (baris `subscriptions` yang sama,
// `end_at` diperpanjang dari akhir lama), jadi invoice perpanjangan tidak punya baris `subscriptions` sendiri untuk di-link (`subscriptions.invoice_item_id`
// 1:1 ke pembelian awal). Tabel ini mencatat tiap perpanjangan (akhir lama → akhir baru) dan menautkannya ke invoice item/order — dibaca `attachSubscriptionDates`
// supaya invoice perpanjangan tetap menampilkan masa berlakunya.
export const subscriptionRenewals = pgTable(
  "subscription_renewals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id),
    orderId: uuid("order_id").references(() => orders.id), // null kalau diperpanjang admin tanpa order
    invoiceItemId: uuid("invoice_item_id").references(() => invoiceItems.id),
    source: varchar("source", { length: 10 }).notNull(), // "order" | "admin"
    previousEndAt: timestamp("previous_end_at", { withTimezone: true }).notNull(),
    newEndAt: timestamp("new_end_at", { withTimezone: true }).notNull(),
    // periode yang DITAMBAH ("monthly" | "yearly") — snapshot, bukan dihitung ulang dari plan.
    interval: varchar("interval", { length: 10 }).notNull(),
    actorId: text("actor_id").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("subscription_renewals_subscription_id_idx").on(t.subscriptionId),
    index("subscription_renewals_invoice_item_id_idx").on(t.invoiceItemId),
  ],
);
