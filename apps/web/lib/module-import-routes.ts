// § diminta user 2026-09-06 — "Arsip Import" gabungan (dashboard + halaman
// arsip) butuh tahu base path halaman import TIAP modul untuk bikin link
// Detail per baris (batch bisa dari modul MANA PUN). SATU sumber kebenaran
// — kalau ada modul baru, WAJIB tambah entri di sini juga (§ checklist
// modul baru, docs/lessons-learned.md 2026-09-06).
export const MODULE_IMPORT_BASE_PATH: Record<string, string> = {
  purchase_invoice: "/purchase-invoice/import",
  sales_invoice: "/sales-invoice/import",
  vendor_payable_account: "/vendor/payable-account/import",
  purchase_payment: "/purchase-payment/import",
  sales_receipt: "/sales-receipt/import",
  journal_voucher: "/journal-voucher/import",
};
