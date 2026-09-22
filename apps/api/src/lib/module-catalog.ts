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
//
// § Nambah Varian (modul import) baru? Entri di sini CUMA 1 dari ~19
// titik yang wajib disentuh — checklist LENGKAP + trik verifikasi ada
// di `docs/architecture/architecture-accurate-integration.md` § "3b.
// Checklist WAJIB — Titik Registrasi Modul Import Baru" (gap ini sudah
// 2× kejadian karena checklist yang cuma dibaca, bukan dijalankan
// verifikasinya).

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
  // § Fase 137 — Sales Order, kelanjutan Sales Quotation.
  { key: "sales_order", label: "Sales Order", productLine: "facport", category: "Sales" },
  { key: "sales_return", label: "Sales Return", productLine: "facport", category: "Sales" },
  { key: "purchase_invoice", label: "Purchase Invoice", productLine: "facport", category: "Purchase" },
  { key: "purchase_payment", label: "Purchase Payment", productLine: "facport", category: "Purchase" },
  { key: "purchase_order", label: "Purchase Order", productLine: "facport", category: "Purchase" },
  { key: "receive_item", label: "Receive Item", productLine: "facport", category: "Purchase" },
  { key: "purchase_return", label: "Purchase Return", productLine: "facport", category: "Purchase" },
  { key: "vendor_payable_account", label: "Vendor Payable Account", productLine: "facport", category: "Purchase" },
  { key: "other_payment", label: "Other Payment (Cash/Bank Payment)", productLine: "facport", category: "Cash & Bank" },
  // § Fase 128 — Other Deposit, kebalikan Other Payment (penerimaan,
  // bukan pengeluaran), kategori sama "Cash & Bank".
  { key: "other_deposit", label: "Other Deposit (Cash/Bank Receipt)", productLine: "facport", category: "Cash & Bank" },
  { key: "journal_voucher", label: "Journal Voucher", productLine: "facport", category: "General Ledger" },
  // § Fase 134-135 — modul PERTAMA kategori "Inventory" (disiapkan sejak
  // Fase 126, sebelumnya 0 modul). 2 modul terpisah walau panggil API
  // Accurate yang SAMA (`item-transfer/save.do`) — keputusan eksplisit
  // user mengikuti 2 sheet Excel client apa adanya, § architecture-item-transfer.md.
  { key: "item_transfer", label: "Item Transfer (Pindah Gudang)", productLine: "facport", category: "Inventory" },
  { key: "item_requisition", label: "Item Requisition (Permintaan Barang)", productLine: "facport", category: "Inventory" },
  // § Fase 138 — architecture-inventory-adjustment.md.
  { key: "inventory_adjustment", label: "Inventory Adjustment (Penyesuaian Persediaan)", productLine: "facport", category: "Inventory" },
  // § Fase 139 — modul PERTAMA kategori "Manufacture" (disiapkan sejak
  // Fase 126, sebelumnya 0 modul). architecture-job-costing.md.
  { key: "job_costing", label: "Job Costing (Pekerjaan Pesanan)", productLine: "facport", category: "Manufacture" },
  // Fase 146 — penutup Job Costing (architecture-roll-over.md).
  { key: "roll_over", label: "Roll Over (Penyelesaian Pesanan)", productLine: "facport", category: "Manufacture" },
  // Fase 147 — produksi berbasis BOM (architecture-work-order.md).
  { key: "work_order", label: "Work Order (Perintah Kerja)", productLine: "facport", category: "Manufacture" },
  // Fase 148 — realisasi bahan baku dari Work Order (architecture-material-slip.md).
  { key: "material_slip", label: "Material Slip (Pengambilan Bahan Baku)", productLine: "facport", category: "Manufacture" },
  // Fase 149 — realisasi barang jadi dari Work Order (architecture-finished-good-slip.md).
  { key: "finished_good_slip", label: "Finished Good Slip (Penyelesaian Barang Jadi)", productLine: "facport", category: "Manufacture" },

  // § Fase 150, ADR-0038, architecture-konverter.md — Produk KONVERTER (Excel→XML client-side untuk Accurate
  // DESKTOP, BEDA dari Facport yang untuk Accurate Online). 16 Varian, diporting dari app lama
  // `/Users/webane/sites/konverter`. Prefix "konverter_" pada key SENGAJA (bukan cuma nama tipe polos) — cegah
  // collision nama lintas Produk (mis. Facport & Konverter dua-duanya punya "Sales Invoice").
  { key: "konverter_sales_invoice", label: "Sales Invoice", productLine: "konverter", category: "Sales" },
  { key: "konverter_sales_order", label: "Sales Order", productLine: "konverter", category: "Sales" },
  { key: "konverter_delivery_order", label: "Delivery Order", productLine: "konverter", category: "Sales" },
  { key: "konverter_sales_return", label: "Sales Return", productLine: "konverter", category: "Sales" },
  { key: "konverter_purchase_invoice", label: "Purchase Invoice", productLine: "konverter", category: "Purchase" },
  { key: "konverter_purchase_order", label: "Purchase Order", productLine: "konverter", category: "Purchase" },
  { key: "konverter_receive_item", label: "Receive Item", productLine: "konverter", category: "Purchase" },
  { key: "konverter_purchase_return", label: "Purchase Return", productLine: "konverter", category: "Purchase" },
  { key: "konverter_other_deposit", label: "Other Deposit", productLine: "konverter", category: "Cash & Bank" },
  { key: "konverter_other_payment", label: "Other Payment", productLine: "konverter", category: "Cash & Bank" },
  { key: "konverter_customer_receipt", label: "Customer Receipt", productLine: "konverter", category: "Cash & Bank" },
  { key: "konverter_vendor_payment", label: "Vendor Payment", productLine: "konverter", category: "Cash & Bank" },
  { key: "konverter_journal_voucher", label: "Journal Voucher", productLine: "konverter", category: "General Ledger" },
  { key: "konverter_item_transfer", label: "Item Transfer", productLine: "konverter", category: "Inventory" },
  { key: "konverter_requisition", label: "Requisition", productLine: "konverter", category: "Inventory" },
  // § "Master Data" — SATU-SATUNYA Varian yang bukan transaksi (update Harga Pokok Standar & Jual), kategori baru.
  { key: "konverter_standard_cost", label: "Standard Cost & Selling Price", productLine: "konverter", category: "Master Data" },
] as const satisfies { key: string; label: string; productLine: ProductLineKey; category: string }[];

// § Fase 126 — urutan tampil kategori di sidebar/form admin (Cash & Bank
// dulu, dst) — SENGAJA daftar terpisah dari MODULE_CATALOG (bukan
// di-infer dari urutan modul) supaya urutan kategori TETAP stabil walau
// urutan modul di atas berubah. Inventory & Manufacture SENGAJA masuk
// daftar ini walau 0 modul hari ini — konsumen (sidebar) yang tanggung
// jawab sembunyikan kategori kosong, bukan file ini yang mengecualikannya.
// § Fase 150 — "Master Data" ditambah (Produk Konverter, `konverter_standard_cost`) — kategori PERTAMA yang
// dipakai LINTAS Produk-nya sendiri sekaligus jadi contoh kaidah "kosong = hilang": Facport/AutoProduksi 0 modul
// di kategori ini, aman (§ komentar di atas soal Inventory/Manufacture dulu, prinsip yang sama berlaku).
export const MODULE_CATEGORIES = ["Cash & Bank", "General Ledger", "Purchase", "Sales", "Inventory", "Manufacture", "Master Data"] as const;

export type ModuleKey = (typeof MODULE_CATALOG)[number]["key"];

// § Fase 150 — `ModuleKey` di atas sekarang lintas SEMUA Produk (Facport+Konverter+...). Konten yang murni
// spesifik 1 Produk (mis. tagline/icon marketing landing page Facport, § `landing-content.ts`) WAJIB pakai tipe
// yang di-filter per Produk ini, BUKAN `ModuleKey` polos — supaya `Record<..., T>` tetap memaksa lengkap PERSIS
// modul Produk itu saja (nambah Varian Produk lain TIDAK memaksa file Produk lain ikut update, tapi nambah Varian
// Produk INI tetap wajib).
export type ModuleKeyForProductLine<P extends ProductLineKey> = Extract<(typeof MODULE_CATALOG)[number], { productLine: P }>["key"];

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

// § Fase 127 — dipakai halaman katalog langganan (`/subscribe`) buat
// split grup modul per Produk sebelum di-render per section (§
// `product-catalog-section.tsx`). Pola sama `moduleCategory`.
export function moduleProductLine(key: string): ProductLineKey | null {
  return MODULE_CATALOG.find((m) => m.key === key)?.productLine ?? null;
}

// § Fase 150 — dipakai sidebar (§ `sidebar.tsx`) untuk gerbang item nav yang relevansinya "user punya SATU PUN
// subscription aktif di Produk ini" (bukan 1 moduleKey spesifik) — mis. "Riwayat Konversi" sebelum Konverter
// punya Varian per-halaman sungguhan. Dihitung dari `MODULE_CATALOG` (bukan daftar manual) supaya OTOMATIS
// ikut lengkap begitu Varian baru ditambah, tidak perlu disinkronkan manual di 2 tempat.
export function modulesForProductLine(productLine: ProductLineKey): ModuleKey[] {
  return MODULE_CATALOG.filter((m) => m.productLine === productLine).map((m) => m.key);
}
