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

export const MODULE_CATALOG = [
  { key: "sales_invoice", label: "Sales Invoice", productLine: "facport", category: "Penjualan" },
  { key: "sales_receipt", label: "Sales Receipt (Customer Receipt)", productLine: "facport", category: "Penjualan" },
  { key: "purchase_invoice", label: "Purchase Invoice", productLine: "facport", category: "Pembelian" },
  { key: "purchase_payment", label: "Purchase Payment", productLine: "facport", category: "Pembelian" },
  { key: "journal_voucher", label: "Jurnal Umum", productLine: "facport", category: "Buku Besar" },
  { key: "vendor_payable_account", label: "Akun Hutang Pemasok", productLine: "facport", category: "Data Master" },
  { key: "other_payment", label: "Other Payment (Pembayaran Bank/Kas)", productLine: "facport", category: "Kas & Bank" },
  // § Fase 120 — Purchase Order, modul pertama dari 5 sub-modul baru
  // yang direncanakan Fase 119 (architecture-purchase-order.md).
  { key: "purchase_order", label: "Purchase Order", productLine: "facport", category: "Pembelian" },
  // § Fase 121 — Receive Item, modul ke-2 dari 5 sub-modul baru
  // (architecture-receive-item.md).
  { key: "receive_item", label: "Receive Item", productLine: "facport", category: "Pembelian" },
  // § Fase 122 — Purchase Return, modul ke-3 dari 5 sub-modul baru
  // (architecture-purchase-return.md).
  { key: "purchase_return", label: "Purchase Return", productLine: "facport", category: "Pembelian" },
  // § Fase 123 — Sales Quotation, modul ke-4 dari 5 sub-modul baru
  // (architecture-sales-quotation.md).
  { key: "sales_quotation", label: "Sales Quotation", productLine: "facport", category: "Penjualan" },
  // § Fase 124 — Sales Return, modul TERAKHIR dari 5 sub-modul baru
  // (architecture-sales-return.md).
  { key: "sales_return", label: "Sales Return", productLine: "facport", category: "Penjualan" },
] as const satisfies { key: string; label: string; productLine: ProductLineKey; category: string }[];

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
