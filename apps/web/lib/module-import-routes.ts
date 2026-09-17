// § diminta user 2026-09-06 — "Arsip Import" gabungan (dashboard + halaman
// arsip) butuh tahu base path halaman import TIAP modul untuk bikin link
// Detail per baris (batch bisa dari modul MANA PUN). SATU sumber kebenaran
// — kalau ada modul baru, WAJIB tambah entri di sini juga (§ checklist
// modul baru, docs/lessons-learned.md 2026-09-06).
// § Fase 128 — ditemukan sekalian: 5 modul Fase 120-124 (Purchase Order/
// Receive Item/Purchase Return/Sales Quotation/Sales Return) TIDAK PERNAH
// ditambahkan ke sini (checklist di atas kelewat) — "Arsip Import"
// gabungan jadi tidak punya link Detail utk batch modul itu. Diperbaiki
// SEKALIAN di sini (bukan fase terpisah — gap kecil, langsung ketemu
// pas nambah entri other_deposit).
export const MODULE_IMPORT_BASE_PATH: Record<string, string> = {
  purchase_invoice: "/purchase-invoice/import",
  sales_invoice: "/sales-invoice/import",
  vendor_payable_account: "/vendor/payable-account/import",
  purchase_payment: "/purchase-payment/import",
  sales_receipt: "/sales-receipt/import",
  journal_voucher: "/journal-voucher/import",
  other_payment: "/other-payment/import",
  other_deposit: "/other-deposit/import",
  purchase_order: "/purchase-order/import",
  receive_item: "/receive-item/import",
  purchase_return: "/purchase-return/import",
  sales_quotation: "/sales-quotation/import",
  sales_return: "/sales-return/import",
  item_transfer: "/item-transfer/import",
  item_requisition: "/item-requisition/import",
};
