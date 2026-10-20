import { eq, and, ne } from "drizzle-orm";
import { db } from "./db";
import { importBatches, importBatchRows } from "../db/schema";
import { JOBS } from "./queue";
import { logger } from "./logger";
import { getStagedConfig } from "./staged-group";
import { computeStagedPlan, groupsByNumber, classifyGroup, type StagedPlan } from "./staged-plan";
import { isStagedModule, type StagedConfig } from "./staged-send";
import type { ImportRowRecord } from "./import-mapping/sales-receipt.mapping";

// § Fase 205 — bagian yang menyentuh DB: rencana kirim-bertahap sebuah batch, dan keputusan MELANJUTKAN job yang terputus (worker restart/deploy) tanpa menggagalkan baris.

type BatchRowLite = { id: string; rawData: Record<string, unknown>; status: string };

async function loadBatch(batchId: string) {
  const [batch] = await db
    .select({ id: importBatches.id, module: importBatches.module, status: importBatches.status, columnMapping: importBatches.columnMapping, totalRows: importBatches.totalRows })
    .from(importBatches)
    .where(eq(importBatches.id, batchId));
  return batch ?? null;
}

async function loadRows(batchId: string): Promise<BatchRowLite[]> {
  const rows = await db
    .select({ id: importBatchRows.id, rawData: importBatchRows.rawData, status: importBatchRows.status })
    .from(importBatchRows)
    .where(and(eq(importBatchRows.batchId, batchId), ne(importBatchRows.status, "cancelled")))
    .orderBy(importBatchRows.rowNumber);
  return rows.map((r) => ({ id: r.id, rawData: r.rawData as Record<string, unknown>, status: r.status }));
}

/** Rencana batch (kosong bila modul tidak bersaklar atau tidak ada dokumen di atas ambang). Menghitung dari SEMUA baris batch. */
export async function loadStagedPlanForBatch(
  batchId: string,
  config: StagedConfig = getStagedConfig(),
  columnMappingOverride?: Record<string, string>,
): Promise<StagedPlan | null> {
  const batch = await loadBatch(batchId);
  if (!batch || !isStagedModule(config, batch.module) || batch.totalRows <= config.thresholdRows) return null;
  const rows = await loadRows(batchId);
  const records = rows.map((r): ImportRowRecord => ({ id: r.id, rawData: r.rawData }));
  return computeStagedPlan(batch.module, records, columnMappingOverride ?? ((batch.columnMapping ?? {}) as Record<string, string>), config);
}

export type ResumeDecision = "resume" | "not-eligible" | "limit";

/**
 * Job impor terputus (worker mati). Batch layak DILANJUTKAN (job baru, baris tidak diubah) hanya bila SEMUA baris `pending` milik dokumen yang dikirim bertahap —
 * karena langkah bertahap membaca kenyataan di Accurate, mengulangnya aman. Bila ada baris pending lain (dokumen biasa yang mungkin sedang dikirim saat mati,
 * keadaannya tak pasti) → `not-eligible` dan pemulih lama (gagalkan + pesan "periksa dulu") yang bekerja. Melewati `maxResumes` → `limit`. Tidak menulis apa pun.
 */
export async function decideResumeStagedBatch(batchId: string, resumeCount: number, config: StagedConfig = getStagedConfig()): Promise<ResumeDecision> {
  const batch = await loadBatch(batchId);
  if (!batch || batch.status !== "processing" || !isStagedModule(config, batch.module)) return "not-eligible";
  const rows = await loadRows(batchId);
  const columnMapping = (batch.columnMapping ?? {}) as Record<string, string>;
  const records = rows.map((r): ImportRowRecord => ({ id: r.id, rawData: r.rawData }));
  const statusById = new Map(rows.map((r) => [r.id, r.status]));
  const pendingIds = new Set(rows.filter((r) => r.status === "pending").map((r) => r.id));
  if (pendingIds.size === 0) return "not-eligible";
  const stagedPending = new Set<string>();
  for (const g of groupsByNumber(batch.module, records, columnMapping)) {
    if (classifyGroup(batch.module, g, columnMapping, config).kind === "staged") for (const r of g.rows) if (statusById.get(r.id) === "pending") stagedPending.add(r.id);
  }
  for (const id of pendingIds) if (!stagedPending.has(id)) return "not-eligible";
  if (resumeCount >= config.maxResumes) return "limit";
  return "resume";
}

/** Job baru untuk melanjutkan batch (resumeCount naik 1). Dipanggil SETELAH job lama digagalkan. */
export async function enqueueResumeStagedBatch(batchId: string, resumeCount: number): Promise<void> {
  const { enqueueAccurateJob } = await import("./accurate-job-dispatch"); // impor dinamis: memutus siklus dengan accurate-job-dispatch
  await enqueueAccurateJob(JOBS.IMPORT_TO_ACCURATE, { batchId, resumeCount: resumeCount + 1 });
  logger.warn({ event: "staged_import_resumed", batchId, resumeCount: resumeCount + 1 }, "Job kirim-bertahap yang terputus dilanjutkan otomatis");
}
