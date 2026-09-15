// § Fase 117, ADR-0033, architecture-product-lines.md — SOURCE OF TRUTH
// katalog Produk+Varian. Leaf file MURNI — JANGAN import db.ts/env.ts atau
// apa pun server-only di sini, karena `apps/web/lib/module-options.ts`
// re-export file ini secara RUNTIME (bukan type-only) dan akan ikut
// di-bundle Next.js.
//
// Kerangka: Brand ("Facport", tunggal, di luar file ini) → Produk
// (PRODUCT_LINES di bawah) → Kategori (field `category`, presentasional
// SAJA, JANGAN dipakai gating) → Varian (1 entri MODULE_CATALOG = 1
// sub-modul/tipe-transaksi, field `key`-nya = "moduleKey"/"module" yang
// dipakai `moduleAccess()`, `plans.modules`, `import_batches.module`, dst).
//
// Produk Konverter/AutoProduksi SENGAJA belum py entri Varian apa pun —
// JANGAN tebak nama modul/kategori sebelum fase build masing-masing
// (hindari over-scope, § ADR-0033 "Eksplisit Di Luar Scope").

export const PRODUCT_LINES = [
  { key: "facport", label: "Facport" },
  { key: "konverter", label: "Konverter" },
  { key: "autoproduksi", label: "AutoProduksi" },
] as const;

export type ProductLineKey = (typeof PRODUCT_LINES)[number]["key"];

// § Fase 126 — label `category` diseragamkan ke Bahasa Inggris (diminta
// user 2026-09-15) supaya konsisten dengan nama fitur/modul yang memang
// sudah Inggris (Purchase Order, Sales Invoice, dst — istilah Accurate
// Online sendiri). Set kategori MENGIKUTI taksonomi menu Accurate Online
// (Cash & Bank, Sales, Purchase, General Ledger) + 2 kategori BARU yang
// SENGAJA belum py modul apa pun (Inventory, Manufacture) — disiapkan
// dari sekarang di sidebar (§ sidebar.tsx) supaya begitu modul pertama
// di kategori itu jadi ADA, langsung otomatis muncul tanpa ubah struktur
// nav lagi, TANPA menebak nama modul-nya sekarang (konsisten prinsip
// ADR-0033 "jangan tebak sebelum fase build-nya" — 2 kategori ini
// sengaja kosong, BUKAN lupa diisi).
// `vendor_payable_account` (dulu kategori "Data Master" sendiri) digabung
// ke "Purchase" — data vendor memang sisi pembelian, sama seperti
// penempatannya di menu Accurate Online sendiri.
export const MODULE_CATALOG = [
  { key: "sales_invoice", label: "Sales Invoice", productLine: "facport", category: "Sales" },
  { key: "sales_receipt", label: "Sales Receipt (Customer Receipt)", productLine: "facport", category: "Sales" },
  { key: "sales_quotation", label: "Sales Quotation", productLine: "facport", category: "Sales" },
  { key: "sales_return", label: "Sales Return", productLine: "facport", category: "Sales" },
  { key: "purchase_invoice", label: "Purchase Invoice", productLine: "facport", category: "Purchase" },
  { key: "purchase_payment", label: "Purchase Payment", productLine: "facport", category: "Purchase" },
  { key: "purchase_order", label: "Purchase Order", productLine: "facport", category: "Purchase" },
  { key: "receive_item", label: "Receive Item", productLine: "facport", category: "Purchase" },
  { key: "purchase_return", label: "Purchase Return", productLine: "facport", category: "Purchase" },
  { key: "vendor_payable_account", label: "Vendor Payable Account", productLine: "facport", category: "Purchase" },
  { key: "other_payment", label: "Other Payment (Cash/Bank Payment)", productLine: "facport", category: "Cash & Bank" },
  { key: "journal_voucher", label: "Journal Voucher", productLine: "facport", category: "General Ledger" },
] as const satisfies { key: string; label: string; productLine: ProductLineKey; category: string }[];

// § Fase 126 — urutan tampil kategori di sidebar/form admin (Cash & Bank
// dulu, dst) — SENGAJA daftar terpisah dari MODULE_CATALOG (bukan
// di-infer dari urutan modul) supaya urutan kategori TETAP stabil walau
// urutan modul di atas berubah. Inventory & Manufacture SENGAJA masuk
// daftar ini walau 0 modul hari ini — konsumen (sidebar) yang tanggung
// jawab sembunyikan kategori kosong, bukan file ini yang mengecualikannya.
export const MODULE_CATEGORIES = ["Cash & Bank", "General Ledger", "Purchase", "Sales", "Inventory", "Manufacture"] as const;

export type ModuleKey = (typeof MODULE_CATALOG)[number]["key"];

export function moduleLabel(key: string): string {
  return MODULE_CATALOG.find((m) => m.key === key)?.label ?? key;
}

// § Fase 118 — dipakai keterangan invoice (admin panel + PDF): resolve
// label Produk & Kategori ("Modul") dari 1 moduleKey ("Sub-modul"),
// supaya admin/customer lihat jelas "beli Sub-modul apa, dari Modul apa,
// di Produk mana" tanpa hardcode ulang lookup di tiap tempat yang butuh.
export function productLineLabel(key: string): string {
  return PRODUCT_LINES.find((p) => p.key === key)?.label ?? key;
}

export function moduleCategory(key: string): string | null {
  return MODULE_CATALOG.find((m) => m.key === key)?.category ?? null;
}
