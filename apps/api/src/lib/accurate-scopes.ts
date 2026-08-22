// § architecture-accurate-integration.md § "Scope Sesuai Paket Langganan".
// ✅ SEMUA scope di bawah VERIFIED 2026-08-19 terhadap daftar scope resmi
// LENGKAP (222 scope) yang diambil dari OpenAPI spec publik Accurate
// (https://account.accurate.id/open-api/json.do, TIDAK login-gated —
// lihat architecture-accurate-integration.md § "Dokumentasi Resmi") —
// bukan tebakan lagi. Koreksi dari draf tebakan sebelumnya:
// item_receipt_* → receive_item_* (endpoint aslinya /api/receive-item),
// payment_* → other_payment_* ("Pembayaran (OP)" = Other Payment),
// receipt_* → other_deposit_* ("Penerimaan (OD)" = Other Deposit),
// journal_* → journal_voucher_*. Modul-modul selain Purchase Invoice masih
// SENGAJA DI-PENDING untuk implementasi (§ docs/PROGRESS.md) — scope-nya
// sudah benar tapi belum ada endpoint/service yang memakainya.
export const MODULE_ACCURATE_SCOPES: Record<string, string[]> = {
  pembelian: [
    "purchase_order_view",
    "purchase_order_save",
    "purchase_invoice_view",
    "purchase_invoice_save",
    "receive_item_view",
    "receive_item_save",
    // § Fase 04 (Import Data Pemasok — update Akun Hutang). Ditaruh di
    // modul "pembelian" (bukan modul terpisah) karena Akun Hutang Pemasok
    // konsepnya melekat ke alur pembelian — konsisten dengan Purchase
    // Invoice. `vendor_save` WAJIB, `vendor_view` dipakai cari `id`
    // internal vendor by `vendorNo` sebelum update (§ architecture-
    // accurate-integration.md § "Vendor (Data Master)").
    "vendor_view",
    "vendor_save",
    // § Fase 05 (Purchase Invoice — Auto-create Vendor & Item). PERMANEN
    // (bukan eksperimen lagi) — `findOrCreateItem` (lib/accurate-item.ts)
    // beneran panggil `item/save.do` produksi kalau item di Excel belum
    // ada. `item_view` sudah baseline (§ scopesForModules), tidak perlu
    // ditambah lagi.
    "item_save",
  ],
  penjualan: [
    "sales_order_view",
    "sales_order_save",
    "sales_invoice_view",
    "sales_invoice_save",
  ],
  persediaan: ["item_adjustment_view", "item_adjustment_save", "item_transfer_view", "item_transfer_save"],
  manufaktur: ["work_order_view", "work_order_save"],
  "kas-bank": [
    "other_payment_view",
    "other_payment_save",
    "other_deposit_view",
    "other_deposit_save",
    "journal_voucher_view",
    "journal_voucher_save",
  ],
};

export function scopesForModules(modules: string[]): string[] {
  const scopes = new Set<string>(["item_view"]); // baseline — data referensi item hampir selalu dibutuhkan
  for (const mod of modules) {
    for (const scope of MODULE_ACCURATE_SCOPES[mod] ?? []) scopes.add(scope);
  }
  return [...scopes];
}
