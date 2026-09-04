// § architecture-accurate-integration.md § "Scope Sesuai Paket Langganan".
// ✅ SEMUA scope di bawah VERIFIED 2026-08-19 terhadap daftar scope resmi
// LENGKAP (222 scope) yang diambil dari OpenAPI spec publik Accurate
// (https://account.accurate.id/open-api/json.do, TIDAK login-gated —
// lihat architecture-accurate-integration.md § "Dokumentasi Resmi") —
// bukan tebakan.
// § Fase 14, ADR-0019 — key diganti dari grup top-level
// (pembelian/penjualan/dst) ke SUB-MODUL (persis 5 yang dijual client:
// purchase_invoice, sales_invoice, sales_receipt, purchase_payment,
// journal_voucher). `purchase_order`/`receive_item` (dulu ikut bundel
// "pembelian") DIHAPUS dari sini — bukan salah satu dari 5 sub-modul
// yang dijual sekarang, scope-nya balik lagi kalau/pas sub-modul itu
// benar-benar dibangun (pola sama seperti sebelumnya: scope disiapkan
// SAAT modul itu jadi giliran, bukan mendahului).
export const MODULE_ACCURATE_SCOPES: Record<string, string[]> = {
  purchase_invoice: [
    "purchase_invoice_view",
    "purchase_invoice_save",
    // § Fase 04/05 — Akun Hutang Pemasok & auto-create vendor, melekat ke
    // alur Purchase Invoice (§ architecture-accurate-integration.md §
    // "Vendor (Data Master)").
    "vendor_view",
    "vendor_save",
    "item_save",
  ],
  // § Fase 13 — SEHARUSNYA sudah ditambah saat itu (customer_view/save
  // dipakai `findOrCreateCustomer`, accurate-customer.ts), baru lengkap
  // sekarang di Fase 14 saat file ini dirombak total. Koneksi Accurate
  // existing yang connect SEBELUM scope ini ditambah TETAP perlu
  // re-authorize manual utk dapat scope baru — pola sama seperti Fase 04.
  sales_invoice: ["sales_invoice_view", "sales_invoice_save", "customer_view", "customer_save", "item_save"],
  // § Fase 15+ — belum ada endpoint/service yang memakai, scope-nya
  // disiapkan sekarang (VERIFIED ke OpenAPI spec, § riset Fase 13 §
  // "Feasibility Check — 5 Sub-Modul") supaya siap dipakai begitu
  // giliran modul ini dibangun.
  sales_receipt: ["sales_receipt_view", "sales_receipt_save"],
  purchase_payment: ["purchase_payment_view", "purchase_payment_save", "glaccount_view"],
  journal_voucher: ["journal_voucher_view", "journal_voucher_save", "glaccount_view"],
};

export function scopesForModules(modules: string[]): string[] {
  const scopes = new Set<string>(["item_view"]); // baseline — data referensi item hampir selalu dibutuhkan
  for (const mod of modules) {
    for (const scope of MODULE_ACCURATE_SCOPES[mod] ?? []) scopes.add(scope);
  }
  return [...scopes];
}
