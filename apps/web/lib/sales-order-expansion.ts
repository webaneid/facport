// § Fase 169 — aturan "baris perluasan Sales Quotation" dipakai ulang dari sumber tunggal di API (pola sama `module-options.ts`):
// UI (dialog edit, grid edit massal) dan server (`missingRequiredFieldsForRow`) memakai fungsi yang SAMA, jadi tidak bisa berbeda.
export { isQuotationExpansionRow, EXPANSION_EXEMPT_REQUIRED } from "../../api/src/lib/import-mapping/sales-order.mapping";
