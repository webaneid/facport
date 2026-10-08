import { pgTable, uuid, varchar, integer, numeric, text, timestamp, index, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";
import { subscriptions } from "./subscription.schema";
import { dataUsaha } from "./data-usaha.schema";

// § Fase 159, architecture-autoproduksi.md — modul PERTAMA Produk
// AutoProduksi (ADR-0033, dikunci Fase 117 tapi 0 kode sampai fase ini).
// Konsep: Formula (BOM) = 1 Barang Jadi terdiri dari N Bahan Baku +
// takaran, disimpan sekali sebagai master data (BEDA dari 23 modul lain
// yang SEMUA Excel-upload — ini form-based, pertama kalinya di Facport).
// Tiap "Input Produksi" (autoproduksiProductionEntries) = 1 job worker = 1
// panggilan `item-adjustment/save.do` (reuse `saveInventoryAdjustment()`,
// § accurate-inventory-adjustment.ts — TIDAK ada integrasi Accurate baru,
// cuma reuse endpoint modul Inventory Adjustment yang sudah ada).
//
// `itemNo`/`adjustmentAccountNo`/`branchName`/`warehouseName` disimpan APA
// ADANYA sebagai string (BUKAN di-lookup/divalidasi saat simpan formula) —
// konsisten filosofi SEMUA modul lain project ini ("kode dikirim apa
// adanya, Accurate yang validasi eksistensi saat SAVE beneran", § komentar
// berulang di tiap *.mapping.ts). Kalau kode salah, gagalnya baru ketahuan
// saat production entry diproses (pesan error jelas, sama pola modul lain)
// — BUKAN saat setup Formula.
// § Fase 163 (ADR-0039, evaluasi client) — kolom `*Name` (BARU, nullable)
// di bawah adalah SNAPSHOT nama hasil live-search Accurate saat user
// MEMILIH (bukan hasil query/cache tersendiri) — search-nya sendiri SELALU
// live ke Accurate tiap keystroke (`GET /accurate/items/search`,
// `GET /accurate/glaccounts/search`), TIDAK pernah baca dari kolom ini.
// Nullable & additive: Formula lama (sebelum Fase 163, kode diketik
// manual) tetap valid, cuma nama-nya kosong sampai admin edit ulang lewat
// Combobox baru.
//
// § Fase 168 (diminta client) — Cabang/Gudang Barang Jadi/Gudang Bahan
// Baku/Nomor Project/Departemen DIHAPUS TOTAL dari Formula (DAN dari
// `autoproduksiFormulaItems` di bawah) — semuanya SEKARANG konteks per
// PRODUKSI, bukan bagian resep (§ `autoproduksiProductionEntries`,
// kolom baru di bawah). Alasan client: customer dengan banyak cabang
// terpaksa bikin Formula terpisah per cabang padahal resepnya identik —
// 1 Formula sekarang dipakai lintas cabang/gudang/proyek.

export const autoproduksiFormulas = pgTable(
  "autoproduksi_formulas",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id), // siapa yang bikin formula
    dataUsahaId: uuid("data_usaha_id")
      .notNull()
      .references(() => dataUsaha.id),
    subscriptionId: uuid("subscription_id")
      .notNull()
      .references(() => subscriptions.id), // menentukan accurate_connections mana yang dipakai saat produksi
    // § Fase 184 — nomor internal otomatis per Data Usaha (tampil "F-007"), pembeda Formula bernama sama. Tidak bisa dikustom, tidak dikirim ke Accurate.
    formulaNumber: integer("formula_number").notNull(),
    name: varchar("name", { length: 255 }).notNull(), // "Bolu Kukus SP (Spesial BGT)"
    finishedGoodItemNo: varchar("finished_good_item_no", { length: 100 }).notNull(),
    finishedGoodItemUnitName: varchar("finished_good_item_unit_name", { length: 50 }).notNull(),
    // § Fase 163 — nama Barang Jadi hasil live-search Accurate, snapshot
    // saat dipilih (lihat komentar atas file). Nullable — Formula lama
    // (kode diketik manual) belum punya nama sampai diedit ulang.
    finishedGoodItemName: varchar("finished_good_item_name", { length: 255 }),
    // § contoh client: "Nilai dimasukan manual" — standard cost DIISI USER
    // (bukan hitung otomatis dari harga beli Accurate, itu enhancement
    // lanjutan di luar scope Fase 1, § komentar atas file ini).
    standardCost: numeric("standard_cost", { precision: 18, scale: 2 }),
    adjustmentAccountNo: varchar("adjustment_account_no", { length: 50 }).notNull(), // "Akun Perantara" / adjustmentAccountNo API
    // § Fase 163 — nama Akun Perantara hasil live-search, sama pola di atas.
    adjustmentAccountName: varchar("adjustment_account_name", { length: 255 }),
    // § Fase 168 (diminta client) — toggle List Formula: nonaktif = tidak
    // bisa dipilih/dicari utk Input Produksi baru (manual maupun Excel),
    // TAPI tetap tampil di List Formula sebagai dokumentasi (tidak
    // dihapus, tetap bisa diedit). Default true — Formula lama & baru
    // otomatis aktif.
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("autoproduksi_formulas_subscription_idx").on(t.subscriptionId), uniqueIndex("autoproduksi_formulas_data_usaha_number_uidx").on(t.dataUsahaId, t.formulaNumber)],
);

// Bahan Baku per formula — 1 formula punya N baris.
export const autoproduksiFormulaItems = pgTable(
  "autoproduksi_formula_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    formulaId: uuid("formula_id")
      .notNull()
      .references(() => autoproduksiFormulas.id, { onDelete: "cascade" }),
    itemNo: varchar("item_no", { length: 100 }).notNull(),
    itemUnitName: varchar("item_unit_name", { length: 50 }).notNull(),
    // § Fase 163 — nama Bahan Baku hasil live-search Accurate, snapshot
    // saat dipilih (sama pola `autoproduksiFormulas.finishedGoodItemName`).
    itemName: varchar("item_name", { length: 255 }),
    // Takaran PER 1 unit barang jadi (dikalikan qty produksi saat entry) —
    // contoh client: Telur 0.5kg untuk 1 Loyang Bolu.
    quantity: numeric("quantity", { precision: 18, scale: 4 }).notNull(),
    // § Fase 168 — Gudang Bahan Baku/Nomor Project/Departemen per-item
    // DIHAPUS (pindah ke `autoproduksiProductionEntries.rawMaterialWarehouseName`/
    // `projectNo`/`departmentName`, SATU nilai berlaku ke SEMUA baris
    // Bahan Baku dalam 1x produksi — bukan per-item lagi, sesuai
    // permintaan client).
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("autoproduksi_formula_items_formula_idx").on(t.formulaId)],
);

// § diminta client 2026-10-02 — Akun Perantara DIUBAH TOTAL dari live-search
// Accurate jadi MASTER DATA LOKAL: bagian produksi yang isi Formula sering
// tidak paham akun (domain akunting), jadi sekarang mereka pelihara daftar
// sendiri di halaman "Settings" AutoProduksi, pilih dari situ (atau buat
// baru langsung) di form Formula — TIDAK PERNAH cari ke Accurate lagi untuk
// field ini. `accountName` WAJIB (beda dari `adjustmentAccountName` di
// `autoproduksiFormulas` yang opsional) — ini record yang SENGAJA dibuat
// user sendiri, bukan snapshot pasif hasil search.
// § `autoproduksiFormulas.adjustmentAccountNo`/`adjustmentAccountName` TETAP
// snapshot string independen (BUKAN foreign key ke sini) — edit/hapus akun
// di sini TIDAK PERNAH mengubah Formula yang sudah pernah pakai nilainya.
export const autoproduksiIntermediaryAccounts = pgTable(
  "autoproduksi_intermediary_accounts",
  {
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
    accountNo: varchar("account_no", { length: 50 }).notNull(),
    accountName: varchar("account_name", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // § diminta user 2026-10-02 (ditanya eksplisit) — kode WAJIB unik per
    // subscription, tolak duplikat (bukan diizinkan) supaya daftar pilihan
    // di form Formula tetap bersih/tidak ambigu.
    uniqueIndex("autoproduksi_intermediary_accounts_subscription_no_uidx").on(t.subscriptionId, t.accountNo),
    index("autoproduksi_intermediary_accounts_subscription_idx").on(t.subscriptionId),
  ],
);

// § diminta client 2026-10-03 — DEFAULT konteks produksi per subscription
// (Data Usaha): dipakai kalau Cabang/Gudang Barang Jadi/Gudang Bahan Baku
// DIKOSONGKAN di Input Produksi (manual maupun Excel). Accurate tidak punya
// "cabang pusat"/"gudang utama" bawaan yang bisa dirujuk lewat API dan nama
// keduanya beda tiap Data Usaha, jadi nilainya diatur sendiri di halaman
// Pengaturan AutoProduksi. Semua kolom nullable (belum diatur = perilaku
// lama: field di-omit dari payload). Nilai yang TERPAKAI disalin ke
// `autoproduksi_production_entries` saat dikirim (Riwayat tetap akurat
// walau default diganti kemudian) — tidak ada FK ke tabel ini.
export const autoproduksiDefaults = pgTable("autoproduksi_defaults", {
  id: uuid("id").defaultRandom().primaryKey(),
  dataUsahaId: uuid("data_usaha_id")
    .notNull()
    .references(() => dataUsaha.id),
  subscriptionId: uuid("subscription_id")
    .notNull()
    .references(() => subscriptions.id)
    .unique(),
  branchName: varchar("branch_name", { length: 100 }),
  warehouseName: varchar("warehouse_name", { length: 100 }),
  rawMaterialWarehouseName: varchar("raw_material_warehouse_name", { length: 100 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Log tiap "Input Produksi" = 1 job worker = 1 transaksi Penyesuaian
// Persediaan di Accurate. TIDAK reuse import_batches/import_batch_rows
// (skema itu untuk Excel-row-based, § ADR-0033 alasan conversion_logs
// Konverter juga ditolak reuse import_batches untuk alasan serupa) — di
// sini 1 baris = 1 dokumen Accurate, bukan banyak baris Excel per batch.
export const autoproduksiProductionEntries = pgTable(
  "autoproduksi_production_entries",
  {
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
    formulaId: uuid("formula_id")
      .notNull()
      .references(() => autoproduksiFormulas.id),
    producedQty: numeric("produced_qty", { precision: 18, scale: 4 }).notNull(),
    transDate: varchar("trans_date", { length: 10 }).notNull(), // "YYYY-MM-DD", dikonversi ke DD/MM/YYYY saat kirim ke Accurate
    // § Fase 168 (diminta client) — Cabang/Gudang Barang Jadi/Gudang Bahan
    // Baku/Nomor Project/Departemen PINDAH KE SINI dari `autoproduksiFormulas`/
    // `autoproduksiFormulaItems` (semuanya konteks per-PRODUKSI, bukan
    // bagian resep — 1 Formula sekarang dipakai lintas cabang/gudang).
    // SEMUA opsional (`branchName` kosong = Accurate pakai default
    // preferensi, dikonfirmasi `accurate-openapi.json` item-adjustment/
    // save.do: `branchName` TIDAK required di top-level).
    // `rawMaterialWarehouseName`/`projectNo`/`departmentName` berlaku
    // SERAGAM ke SEMUA baris Bahan Baku dalam 1x produksi (bukan per-item
    // lagi) — `warehouseName` di sini KHUSUS Gudang Barang Jadi (beda dari
    // `rawMaterialWarehouseName`, karena baris Barang Jadi vs Bahan Baku
    // butuh gudang yang beda). `projectNo`/`departmentName` dipakai ulang
    // sama persis utk baris Barang Jadi MAUPUN Bahan Baku (1 pilihan utk
    // seluruh transaksi, § `buildProductionEntryPayload`).
    branchName: varchar("branch_name", { length: 100 }),
    warehouseName: varchar("warehouse_name", { length: 100 }), // Gudang Barang Jadi
    rawMaterialWarehouseName: varchar("raw_material_warehouse_name", { length: 100 }), // Gudang Bahan Baku
    projectNo: varchar("project_no", { length: 50 }),
    departmentName: varchar("department_name", { length: 100 }),
    status: varchar("status", { length: 20 }).notNull().default("pending"), // pending -> processing -> success | failed
    accurateTransactionId: varchar("accurate_transaction_id", { length: 100 }),
    // § evaluasi client 2026-10-03 — nomor penyesuaian yang terbaca manusia (`number` dari save.do),
    // ditampilkan di Riwayat; `accurateTransactionId` tetap id internal numerik. NULL untuk entry lama.
    accurateTransactionNumber: varchar("accurate_transaction_number", { length: 100 }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("autoproduksi_production_entries_subscription_idx").on(t.subscriptionId),
    index("autoproduksi_production_entries_formula_idx").on(t.formulaId),
  ],
);
