import type { SalesQuotationDetail, SalesQuotationLine } from "../accurate-sales-quotation";

// § Fase 198 (lanjutan) — aturan "informasi tambahan dari dokumen sumber" yang SAMA untuk Sales Invoice (`source-expansion.ts`) dan Sales Order ← Sales
// Quotation (`sales-order.mapping.ts`). Semuanya hanya mengisi yang KOSONG di payload (Excel menang); nilai yang tidak terbaca dari respons tidak ditarik.

// Header yang memengaruhi ANGKA/dokumen: `inclusiveTax` (tanpanya harga sumber yang sudah termasuk pajak ditambah PPN lagi), `taxable`, pengiriman, cabang.
const HEADER_PULL_KEYS = ["inclusiveTax", "taxable", "shipmentName", "shipDate", "branchName"] as const;

export type ExtrasOptions = {
  /** Atribut custom karakter/angka (`charFieldN`/`numericFieldN`) — hanya modul yang memetakannya (Sales Invoice). */
  includeCustomFields: boolean;
};

const isCustomField = (key: string) => key.startsWith("charField") || key.startsWith("numericField");

/** Header tambahan dari dokumen sumber PERTAMA yang diperluas. Kurs (`rate`) hanya ikut bila mata uang payload SAMA dengan mata uang sumber. */
export function applySourceHeaderExtras(payload: Record<string, unknown>, source: SalesQuotationDetail, options: ExtrasOptions): void {
  for (const key of HEADER_PULL_KEYS) {
    if (payload[key] === undefined && source.header[key] !== undefined) payload[key] = source.header[key];
  }
  // Mata uang Excel ≠ mata uang sumber (atau sumber tanpa mata uang terbaca) → kurs sumber salah, jangan dipakai.
  const sourceCurrency = source.header.currencyCode;
  if (payload.rate === undefined && source.header.rate !== undefined && sourceCurrency !== undefined && payload.currencyCode === sourceCurrency) {
    payload.rate = source.header.rate;
  }
  for (const [key, value] of Object.entries(source.headerExtra ?? {})) {
    if (isCustomField(key) && !options.includeCustomFields) continue;
    if (payload[key] === undefined) payload[key] = value;
  }
}

/** Atribut tambahan satu baris sumber (Kategori Keuangan, PPnBM, custom) → entri `detailItem` hasil perluasan, hanya yang kosong. */
export function applySourceLineExtras(entry: Record<string, unknown>, line: SalesQuotationLine, options: ExtrasOptions): void {
  for (const [key, value] of Object.entries(line.extra ?? {})) {
    if (isCustomField(key) && !options.includeCustomFields) continue;
    if (entry[key] === undefined) entry[key] = value;
  }
}
