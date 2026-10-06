// § Fase 170 — aturan "baris retur-faktur boleh mengosongkan Unit Price" dipakai ulang dari sumber tunggal di API (pola `module-options.ts`):
// UI (dialog edit, grid edit massal) dan server (`missingRequiredFieldsForRow`) memakai fungsi yang SAMA, jadi tidak bisa berbeda.
export { isInvoiceReturnRow } from "../../api/src/lib/import-mapping/return-from-invoice";
