// § Fase 214 — aturan "baris hanya-Beban" Purchase Invoice dipakai ulang dari sumber tunggal di API (pola sama `sales-invoice-expansion.ts`): UI (dialog
// edit, grid edit massal) dan server (`missingRequiredValues`) memakai fungsi yang SAMA, sehingga tidak ada selisih aturan "kolom barang wajib".
export { isRequiredFieldExemptForRow } from "../../api/src/lib/import-mapping/purchase-invoice.mapping";
