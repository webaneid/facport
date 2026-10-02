import { pgTable, uuid, varchar, integer, numeric, text, timestamp, index } from "drizzle-orm/pg-core";
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
    branchName: varchar("branch_name", { length: 100 }).notNull(),
    warehouseName: varchar("warehouse_name", { length: 100 }), // opsional, gudang barang jadi
    // § Import Formula (Excel) — "Nomor Project"/"Departemen" pada baris
    // Barang Jadi di file client. Field API resmi `detailItem.projectNo`/
    // `detailItem.departmentName` (dikonfirmasi ada di accurate-openapi.json),
    // belum pernah dipetakan sebelumnya di form manual — opsional, aditif.
    finishedGoodProjectNo: varchar("finished_good_project_no", { length: 50 }),
    finishedGoodDepartmentName: varchar("finished_good_department_name", { length: 100 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("autoproduksi_formulas_subscription_idx").on(t.subscriptionId)],
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
    // § Catatan #1 client sendiri di simulasi: "seharusnya bisa input
    // gudang pada setiap barang" — field API `detailItem.warehouseName`
    // SUDAH ada di spec resmi, langsung diakomodasi di Fase 1 (bukan
    // ditunda, biayanya murah).
    warehouseName: varchar("warehouse_name", { length: 100 }),
    // § Import Formula (Excel) — "Nomor Project"/"Departemen" per baris
    // Bahan Baku, sama alasan dengan `autoproduksiFormulas.finishedGood*`
    // di atas (field `detailItem.projectNo`/`departmentName` resmi).
    projectNo: varchar("project_no", { length: 50 }),
    departmentName: varchar("department_name", { length: 100 }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("autoproduksi_formula_items_formula_idx").on(t.formulaId)],
);

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
    status: varchar("status", { length: 20 }).notNull().default("pending"), // pending -> processing -> success | failed
    accurateTransactionId: varchar("accurate_transaction_id", { length: 100 }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("autoproduksi_production_entries_subscription_idx").on(t.subscriptionId),
    index("autoproduksi_production_entries_formula_idx").on(t.formulaId),
  ],
);
