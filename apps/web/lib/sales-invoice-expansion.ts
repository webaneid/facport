// § Fase 198 — aturan "baris perluasan dokumen sumber" Sales Invoice dipakai ulang dari sumber tunggal di API (pola sama
// `sales-order-expansion.ts`): UI (dialog edit, grid edit massal) dan server (`missingRequiredFieldsForRow`) memakai fungsi yang SAMA.
export { isSourceExpansionRow, SOURCE_EXPANSION_EXEMPT_REQUIRED } from "../../api/src/lib/import-mapping/source-expansion";
