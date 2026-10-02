// § architecture-accurate-scope-engine.md, ADR-0036 #4/#7 — SATU-SATUNYA tempat modul
// mendeklarasikan endpoint Accurate yang dipanggil. Scope OAuth DITURUNKAN dari sini
// (lewat `accurate-scope-snapshot.json`, bukan ditulis tangan) — supaya "fungsi/field baru,
// scope lupa" tidak terulang (Fase 78: vendor_*, Fase 98: data_classification_*).
//
// Format endpoint: "METHOD resource/aksi.do" (tanpa awalan /accurate/api/), METHOD sesuai
// yang dipakai kode (list/detail = GET, save = POST, delete = DELETE).
//
// ATURAN modul baru: deklarasikan SEMUA endpoint yang dipanggil kodenya (termasuk helper
// findOrCreate*), lalu `bun run scopes:sync` bila endpoint belum ada di snapshot. Tes
// `accurate-scopes.test.ts` memindai sumber dan gagal kalau ada endpoint yang belum terdaftar.

export type ScopeReason = { scope: string; reason: string };

export type ModuleEndpoints = {
  endpoints: string[];
  // Scope yang perlu tapi tak terlihat sebagai endpoint langsung. WAJIB beralasan.
  extraScopes?: ScopeReason[];
};

// Baseline: data referensi item hampir selalu dibutuhkan (dulu `item_view` di scopesForModules).
export const BASELINE_ENDPOINTS = ["GET item/list.do"];

// Helper bersama (findOrCreate*) — dipakai modul yang memanggilnya.
const ITEM = ["POST item/save.do"]; // + GET item/list.do lewat baseline
const CLASSIFICATION = ["GET data-classification/list.do", "POST data-classification/save.do"]; // Kategori Keuangan (attribut/RM_CLS)
const VENDOR = ["GET vendor/list.do", "POST vendor/save.do"];
const CUSTOMER = ["GET customer/list.do", "POST customer/save.do"];
const TAX = ["GET tax/list.do"];

// Warisan katalog tulis-tangan (sebelum Fase 142): scope ini dipesan sejak fase-fase lama walau
// belum ada endpoint yang memanggilnya. DIPERTAHANKAN (tes regresi melarang scope hilang diam-diam);
// tinjau apakah bisa dibuang saat model koneksi 1-otorisasi (Fase 143).
// § `glaccount_view` SUDAH DIBUANG (2026-09-22): diminta 8 modul tapi tidak ada kode yang memanggil glaccount/*.do (akun dikirim apa adanya,
// Accurate yang validasi). Kalau kelak ada lookup akun, daftarkan `GET glaccount/list.do` di modul terkait — scope turun otomatis.
const legacy = (scope: string): ScopeReason => ({ scope, reason: "warisan katalog tulis-tangan pra-Fase 142; belum ada endpoint yang memanggil" });

export const ACCURATE_ENDPOINT_REGISTRY: Record<string, ModuleEndpoints> = {
  // § Fase 78 — vendor_* WAJIB di sini (findOrCreateVendor dipanggil UNCONDITIONAL tiap import).
  purchase_invoice: {
    endpoints: [
      "POST purchase-invoice/save.do",
      "GET purchase-invoice/detail.do", // append ke faktur existing (Fase 08)
      "DELETE purchase-invoice/delete.do", // Batal Import (Fase 09) — spec: purchase_invoice_delete
      ...ITEM,
      ...CLASSIFICATION,
      ...VENDOR,
    ],
  },
  vendor_payable_account: { endpoints: [...VENDOR] },
  sales_invoice: {
    endpoints: [
      "POST sales-invoice/save.do",
      "GET sales-invoice/detail.do",
      "DELETE sales-invoice/delete.do", // spec: sales_invoice_save (bukan _delete)
      ...CUSTOMER,
      ...ITEM,
      ...CLASSIFICATION,
    ],
  },
  // § Fase 165 — DELETE *-delete.do ditambah ke 19 modul "sederhana" (1
  // batch = 1 dokumen Accurate, tanpa merge lintas-batch) supaya "Batal
  // Import" generalisasi dari purchase_invoice/sales_invoice. Koneksi yang
  // SUDAH terhubung sebelum rilis ini belum punya scope baru ini — route
  // cancel cek `checkSubscriptionScopes` dulu, user tinggal reconnect.
  sales_receipt: {
    endpoints: ["POST sales-receipt/save.do", "DELETE sales-receipt/delete.do", ...TAX],
    extraScopes: [legacy("sales_receipt_view")],
  },
  purchase_payment: {
    endpoints: ["POST purchase-payment/save.do", "DELETE purchase-payment/delete.do", ...TAX],
    extraScopes: [legacy("purchase_payment_view")],
  },
  // § Fase 98 — data_classification_* WAJIB (attribut1..10 → findOrCreateDataClassification).
  journal_voucher: {
    endpoints: ["POST journal-voucher/save.do", "DELETE journal-voucher/delete.do", ...CLASSIFICATION],
    extraScopes: [legacy("journal_voucher_view")],
  },
  other_payment: {
    endpoints: ["POST other-payment/save.do", "DELETE other-payment/delete.do", ...CLASSIFICATION],
    extraScopes: [legacy("other_payment_view")],
  },
  other_deposit: {
    endpoints: ["POST other-deposit/save.do", "DELETE other-deposit/delete.do", ...CLASSIFICATION],
    extraScopes: [legacy("other_deposit_view")],
  },
  purchase_order: { endpoints: ["POST purchase-order/save.do", "DELETE purchase-order/delete.do", ...VENDOR, ...ITEM, ...CLASSIFICATION] },
  receive_item: { endpoints: ["POST receive-item/save.do", "DELETE receive-item/delete.do", ...CLASSIFICATION] },
  purchase_return: { endpoints: ["POST purchase-return/save.do", "DELETE purchase-return/delete.do", ...CLASSIFICATION] },
  sales_quotation: { endpoints: ["POST sales-quotation/save.do", "DELETE sales-quotation/delete.do", ...CUSTOMER, ...ITEM, ...CLASSIFICATION] },
  sales_order: { endpoints: ["POST sales-order/save.do", "DELETE sales-order/delete.do", ...CUSTOMER, ...ITEM, ...CLASSIFICATION] },
  sales_return: { endpoints: ["POST sales-return/save.do", "DELETE sales-return/delete.do", ...CLASSIFICATION] },
  // § Fase 157 — Delivery Order: TIDAK auto-create customer/item (mirror `receive_item`,
  // dokumen fulfillment lanjutan — customerNo/itemNo dikirim apa adanya).
  // § Fase 158 — `GET sales-order/detail.do` ditambah untuk auto-resolve `salesOrderDetailId`
  // (§ `resolveSalesOrderDetailIds`, workers/index.ts) saat `itemNo` duplikat dalam 1 Sales Order.
  delivery_order: { endpoints: ["POST delivery-order/save.do", "DELETE delivery-order/delete.do", "GET sales-order/detail.do", ...CLASSIFICATION] },
  item_transfer: { endpoints: ["POST item-transfer/save.do", "DELETE item-transfer/delete.do", ...CLASSIFICATION] },
  // § Fase 164 — REBUILD TOTAL: dulu berbagi endpoint item-transfer.do dengan modul
  // di atas (Fase 134-135), sekarang endpoint SENDIRI (draft client sebelumnya salah).
  item_requisition: { endpoints: ["POST purchase-requisition/save.do", "DELETE purchase-requisition/delete.do", ...CLASSIFICATION] },
  inventory_adjustment: { endpoints: ["POST item-adjustment/save.do", "DELETE item-adjustment/delete.do"] },
  // § Fase 159 — AutoProduksi reuse ENDPOINT YANG SAMA dengan Inventory Adjustment di atas (bukan integrasi
  // baru, § architecture-autoproduksi.md). `adjustmentAccountNo`/`branchName`/`warehouseName`/itemNo dikirim
  // apa adanya (TIDAK ada lookup/GET glaccount|branch|warehouse — konsisten filosofi "Accurate validasi saat
  // save", § komentar `glaccount_view` di atas baris 34-35 — masih berlaku, sengaja tidak ditambah lookup).
  // § Fase 163, ADR-0039 — GET item/list.do sudah baseline (semua modul).
  // GET glaccount/list.do BARU: live-search Akun Perantara di form Formula
  // (dulu tidak ada — glaccount_view dibuang 2026-09-22 karena waktu itu
  // belum ada kode yang memanggilnya, sekarang ADA).
  // § HOTFIX 2026-09-30 (evaluasi client) — GET warehouse/list.do BARU:
  // live-search Gudang Barang Jadi & Gudang Bahan Baku di form Formula
  // (`warehouse_view` sudah ada precedent, § `finished_good_slip` di
  // bawah — bukan scope baru, cuma dipakai modul lain juga sekarang).
  autoproduksi_production: { endpoints: ["POST item-adjustment/save.do", "GET glaccount/list.do", "GET warehouse/list.do"] },
  // § Fase 146 — Roll Over: 1 endpoint. TIDAK auto-create item & TIDAK ada lookup akun (Excel tidak punya nama barang; Fase 138/139),
  // jadi hanya Kategori Keuangan (10 slot) yang butuh scope tambahan. Tidak ada `glaccount_view` warisan di entry ini.
  roll_over: { endpoints: ["POST roll-over/save.do", "DELETE roll-over/delete.do", ...CLASSIFICATION] },
  // § Fase 147 — Work Order: save + lookup cabang (`branchId` REQUIRED, tidak auto-create) + PIC (find-or-create). Tanpa item_save (tidak auto-create item).
  work_order: {
    endpoints: [
      "POST work-order/save.do",
      "DELETE work-order/delete.do",
      "GET branch/list.do",
      "GET wo-pic/list.do",
      "POST wo-pic/save.do",
      ...CLASSIFICATION,
    ],
  },
  // § Fase 148 — Material Slip. Cabang/gudang TIDAK di-lookup (§ architecture-material-slip.md "Quirk").
  material_slip: { endpoints: ["POST material-slip/save.do", "DELETE material-slip/delete.do", ...CLASSIFICATION] },
  // § Fase 149 — Finished Good Slip. Cabang & gudang KEDUANYA di-lookup (§ architecture-finished-good-slip.md "Quirk").
  finished_good_slip: {
    endpoints: [
      "POST finished-good-slip/save.do",
      "DELETE finished-good-slip/delete.do",
      "GET branch/list.do",
      "GET warehouse/list.do",
      ...CLASSIFICATION,
    ],
  },
  // § Fase 139 — 2 endpoint berurutan. RM item_save: scope disiapkan walau belum auto-create.
  job_costing: {
    endpoints: ["POST job-order/save.do", "POST material-adjustment/save.do", ...ITEM, ...CLASSIFICATION],
  },
};
