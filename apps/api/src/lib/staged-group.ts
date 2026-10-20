import { env } from "./env";
import { getStagedDocByNumber } from "./accurate-staged-doc";
import { saveSalesReceipt } from "./accurate-sales-receipt";
import { savePurchasePayment } from "./accurate-purchase-payment";
import type { AccurateSessionContext } from "./accurate-session";
import { parseStagedConfig, rowEntryIndexes, runStagedSend, type StagedConfig, type StagedDeps, type StagedResult } from "./staged-send";
import { describeAccurateFailure } from "./accurate-group-guard";
import { logger } from "./logger";

// § Fase 205, architecture-staged-send.md — perekat antara worker impor dan `runStagedSend` (murni): konfigurasi dari env, baris Excel ↔ entri, penandaan baris
// yang sudah tersimpan, dan pesan gagal. Dipakai Sales Receipt & Purchase Payment (satu-satunya modul yang didukung).

export type StagedModuleCode = "sales_receipt" | "purchase_payment";

export function getStagedConfig(): StagedConfig {
  return parseStagedConfig(env as unknown as Record<string, string | undefined>);
}

export type StagedRow = { id: string; rawData: Record<string, unknown>; status: string };

/** Baris yang BARU terbukti tersimpan: entri-nya < `done`, belum ditandai. Murni. */
export function selectRowsToMark(rowEntryIdx: number[], rows: { id: string }[], done: number, marked: ReadonlySet<string>): string[] {
  const ids: string[] = [];
  rows.forEach((r, i) => {
    if ((rowEntryIdx[i] ?? Number.POSITIVE_INFINITY) < done && !marked.has(r.id)) ids.push(r.id);
  });
  return ids;
}

/** Pesan baris gagal untuk hasil `failed`; menyebut kemajuan agar jelas bahwa Retry MELANJUTKAN (tidak mengulang dari awal). */
export function describeStagedFailure(result: Extract<StagedResult, { state: "failed" }>, entryCount: number): string {
  const base = result.reason === "business" && result.error !== undefined ? describeAccurateFailure(result.error) : result.message;
  if (result.doneEntries <= 0) return base;
  return `${base} [Pengiriman bertahap: ${result.doneEntries} dari ${entryCount} entri faktur sudah tersimpan — dokumen di Accurate saat ini BERISI SEBAGIAN entri (jangan menutup periode atau mengambil laporan sebelum lengkap); Retry melanjutkan dari sana, tidak mengulang dari awal.]`;
}

export type StagedGroupArgs = {
  ctx: AccurateSessionContext;
  module: StagedModuleCode;
  number: string;
  /** SEMUA baris Excel dokumen ini dalam batch (termasuk yang sudah `success`), urut `rowNumber`. */
  rows: StagedRow[];
  /** Kunci entri per baris (sejajar `rows`), dari `salesReceiptEntryKeys`/`purchasePaymentEntryKeys`. */
  entryKeys: string[];
  payload: Record<string, unknown>;
  config: StagedConfig;
  /** Menandai baris `success` (id dokumen Accurate) — dipanggil bertahap. */
  markSuccess: (rowIds: string[], docId: number) => Promise<void>;
  batchId: string;
  deps?: Partial<StagedDeps>;
};

export async function sendGroupStaged(args: StagedGroupArgs): Promise<{ result: StagedResult; entryCount: number; marked: ReadonlySet<string> }> {
  const { ctx, module, number, rows, entryKeys, payload, config, markSuccess, batchId } = args;
  const { indexes, entryCount } = rowEntryIndexes(entryKeys);
  const marked = new Set(rows.filter((r) => r.status === "success").map((r) => r.id));
  const resource = module === "sales_receipt" ? "sales-receipt" : "purchase-payment";
  const save = module === "sales_receipt" ? saveSalesReceipt : savePurchasePayment;
  const deps: StagedDeps = {
    lookup: (n) => getStagedDocByNumber(ctx, resource, n),
    save: async (p) => save(ctx, p),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
    onProgress: async (done, docId) => {
      const ids = selectRowsToMark(indexes, rows, done, marked);
      if (ids.length > 0 && docId !== null) {
        await markSuccess(ids, docId);
        ids.forEach((id) => marked.add(id));
      }
    },
    log: (event, data) => logger.info({ event, module, batchId, ...data }, "Kirim bertahap"),
    ...args.deps,
  };
  const result = await runStagedSend({ number, payload, config, deps, knownProgress: marked.size > 0 });
  return { result, entryCount, marked };
}
