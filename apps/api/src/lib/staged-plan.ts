import { groupSalesReceiptRows, salesReceiptEntryKeys, extractTaxIdsFromRows as extractReceiptTaxIds, type ImportRowRecord } from "./import-mapping/sales-receipt.mapping";
import { groupPurchasePaymentRows, purchasePaymentEntryKeys, extractTaxIdsFromRows as extractPaymentTaxIds } from "./import-mapping/purchase-payment.mapping";
import { estimateTotalSeconds, isStagedModule, rowEntryIndexes, type StagedConfig } from "./staged-send";

// § Fase 205, architecture-staged-send.md — RENCANA kirim bertahap untuk satu batch (murni): dokumen mana yang akan dicicil, berapa entri/langkah, perkiraan waktu.
// Dipakai (1) popup persetujuan di `confirm`, (2) kedaluwarsa & jalur antrean job, (3) keputusan melanjutkan job yang terputus.
export type StagedPlanItem = { number: string; rows: number; entries: number; steps: number; estimatedSeconds: number };
export type StagedPlan = {
  module: string;
  items: StagedPlanItem[];
  estimatedSeconds: number;
  thresholdRows: number;
  chunkEntries: number;
  /** Dokumen besar yang memuat PPh (`detailTax`) — TIDAK dicicil (perilaku update `detailTax` belum terbukti di trial, salah = akuntansi keliru); dikirim sekali kirim seperti biasa. */
  skippedForTax: string[];
  /** Perkiraan waktu melampaui `maxEstimateSeconds` — tidak dicicil (akan menahan slot worker berhari-hari); tetap kirim-sekali. */
  skippedTooLarge: { number: string; rows: number; estimatedSeconds: number }[];
};

export type NumberedGroup = { number: string | null; rows: ImportRowRecord[]; hasTax: boolean };

export function groupsByNumber(module: string, rows: ImportRowRecord[], columnMapping: Record<string, string>): NumberedGroup[] {
  if (module === "sales_receipt") {
    return groupSalesReceiptRows(rows, columnMapping).map((g) => ({ number: g.receiptNumber, rows: g.rows, hasTax: extractReceiptTaxIds(g.rows.map((r) => r.rawData), columnMapping).length > 0 }));
  }
  if (module === "purchase_payment") {
    return groupPurchasePaymentRows(rows, columnMapping).map((g) => ({ number: g.paymentNumber, rows: g.rows, hasTax: extractPaymentTaxIds(g.rows.map((r) => r.rawData), columnMapping).length > 0 }));
  }
  return [];
}

export function entryKeysFor(module: string, rawRows: Record<string, unknown>[], columnMapping: Record<string, string>): string[] {
  return module === "sales_receipt" ? salesReceiptEntryKeys(rawRows, columnMapping) : purchasePaymentEntryKeys(rawRows, columnMapping);
}

export type GroupClass = "staged" | "small" | "tax" | "too-large";

/** SATU-SATUNYA definisi "dokumen ini dikirim bertahap?" — dipakai rencana, worker, dan pemulihan: bernomor, di atas ambang, tanpa PPh, dan perkiraan waktunya wajar. */
export function classifyGroup(module: string, g: NumberedGroup, columnMapping: Record<string, string>, config: StagedConfig): { kind: GroupClass; entries: number; estimatedSeconds: number } {
  if (g.number === null || g.rows.length <= config.thresholdRows) return { kind: "small", entries: 0, estimatedSeconds: 0 };
  if (g.hasTax) return { kind: "tax", entries: 0, estimatedSeconds: 0 };
  const { entryCount } = rowEntryIndexes(entryKeysFor(module, g.rows.map((r) => r.rawData), columnMapping));
  const estimatedSeconds = estimateTotalSeconds(entryCount, config);
  if (estimatedSeconds > config.maxEstimateSeconds) return { kind: "too-large", entries: entryCount, estimatedSeconds };
  return { kind: "staged", entries: entryCount, estimatedSeconds };
}

export function computeStagedPlan(module: string, rows: ImportRowRecord[], columnMapping: Record<string, string>, config: StagedConfig): StagedPlan {
  const plan: StagedPlan = { module, items: [], estimatedSeconds: 0, thresholdRows: config.thresholdRows, chunkEntries: config.chunkEntries, skippedForTax: [], skippedTooLarge: [] };
  if (!isStagedModule(config, module)) return plan;
  for (const g of groupsByNumber(module, rows, columnMapping)) {
    const c = classifyGroup(module, g, columnMapping, config);
    if (c.kind === "tax") plan.skippedForTax.push(g.number!);
    else if (c.kind === "too-large") plan.skippedTooLarge.push({ number: g.number!, rows: g.rows.length, estimatedSeconds: c.estimatedSeconds });
    else if (c.kind === "staged") {
      plan.items.push({ number: g.number!, rows: g.rows.length, entries: c.entries, steps: Math.ceil(c.entries / config.chunkEntries), estimatedSeconds: c.estimatedSeconds });
      plan.estimatedSeconds += c.estimatedSeconds;
    }
  }
  return plan;
}

/** Jumlah entri ≤ satu cicilan → tidak ada gunanya dicicil; tetap dikirim lewat jalur bertahap (aman, 1 langkah). Fungsi ini hanya informasi tampilan. */
export function formatEstimate(seconds: number): string {
  if (seconds < 90) return `sekitar ${Math.max(1, Math.round(seconds))} detik`;
  const minutes = seconds / 60;
  if (minutes < 90) return `sekitar ${Math.round(minutes)} menit`;
  const hours = minutes / 60;
  return `sekitar ${hours < 10 ? hours.toFixed(1).replace(".", ",") : Math.round(hours)} jam`;
}
