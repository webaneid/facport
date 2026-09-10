// § Fase 14, ADR-0019 — katalog per SUB-MODUL (bukan grup top-level):
// "1 plan = 1 SKU per sub-modul". Cocok persis `SUB_MODULE_KEYS` di
// `apps/api/src/routes/admin/plans.route.ts` — diubah di 2 tempat kalau
// berubah. Diekstrak ke sini Fase 17 — dipakai 3 tempat (admin plans,
// landing, subscribe), cukup alasan untuk di-share.
export const MODULE_OPTIONS = [
  { key: "sales_invoice", label: "Sales Invoice", group: "Penjualan" },
  { key: "sales_receipt", label: "Sales Receipt (Customer Receipt)", group: "Penjualan" },
  { key: "purchase_invoice", label: "Purchase Invoice", group: "Pembelian" },
  { key: "purchase_payment", label: "Purchase Payment", group: "Pembelian" },
  { key: "journal_voucher", label: "Jurnal Umum", group: "Buku Besar" },
  // § ADR-0026 — dulu bundel gratis ke Purchase Invoice (Fase 04),
  // sekarang SKU sendiri. Grup "Data Master" (bukan "Pembelian") —
  // konsepnya beda dari 5 modul transaksi di atas.
  { key: "vendor_payable_account", label: "Akun Hutang Pemasok", group: "Data Master" },
  // § Fase 96 (2026-09-10) — modul baru, grup "Kas & Bank" BARU (pengeluaran
  // kas/bank LANGSUNG tanpa faktur/vendor, beda konsep dari Pembelian/Buku Besar).
  { key: "other_payment", label: "Other Payment (Pembayaran Bank/Kas)", group: "Kas & Bank" },
] as const;

export const MODULE_GROUPS = [...new Set(MODULE_OPTIONS.map((m) => m.group))];

export type ModuleKey = (typeof MODULE_OPTIONS)[number]["key"];

export function moduleLabel(key: string): string {
  return MODULE_OPTIONS.find((m) => m.key === key)?.label ?? key;
}
