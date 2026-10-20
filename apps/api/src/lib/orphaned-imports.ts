import { eq, sql } from "drizzle-orm";
import { db } from "./db";
import { importBatches, importBatchRows } from "../db/schema";
import { boss, JOBS } from "./queue";
import { logger } from "./logger";

// § Insiden 2026-10-20 (architecture-deployment.md SOP 2c) — import yang dimulai pelanggan DI SELA langkah deploy dibunuh saat container worker diganti: `pgboss.job` tetap
// `active` (sampai kedaluwarsa), batch tetap `processing`, baris `pending`, tidak ada proses yang mengerjakannya ("job hantu"), dan pelanggan melihat "sedang diproses" tanpa kemajuan.
// Saat worker MULAI (sebelum mendaftarkan handler apa pun) tidak ada handler berjalan di proses ini, jadi SETIAP job impor `active` pada saat itu pasti milik proses lama yang
// sudah mati. Fungsi ini memulihkannya persis seperti pemulihan manual: baris `pending` → `failed` dengan pesan jelas, batch → `completed_with_errors` (atau `completed` bila tak ada
// yang gagal), job pg-boss digagalkan. Hanya menyentuh batch berstatus `processing`; yang lain dibiarkan.

export const ORPHANED_IMPORT_MESSAGE =
  "Import terputus saat pembaruan sistem sebelum selesai. Periksa dulu di Accurate apakah transaksi file ini sudah ada, lalu tekan Retry.";

export type OrphanedJob = { id: string; queue: string; batchId: string | null };
export type RecoverResult = "recovered" | "skipped" | "missing";

/**
 * Pulihkan SATU batch hantu dalam transaksi. `skipped` = batch tidak berstatus `processing` (tidak disentuh), `missing` = batch tidak ada.
 * Baris yang sudah `success`/`failed` TIDAK diubah; hanya `pending` yang digagalkan dengan pesan.
 */
export async function recoverOrphanedBatch(batchId: string, message: string = ORPHANED_IMPORT_MESSAGE): Promise<RecoverResult> {
  return db.transaction(async (tx) => {
    const [batch] = await tx.select({ id: importBatches.id, status: importBatches.status }).from(importBatches).where(eq(importBatches.id, batchId)).for("update");
    if (!batch) return "missing";
    if (batch.status !== "processing") return "skipped";
    await tx
      .update(importBatchRows)
      .set({ status: "failed", errorMessage: message, processedAt: new Date() })
      .where(sql`${importBatchRows.batchId} = ${batchId} and ${importBatchRows.status} = 'pending'`);
    const [failed] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(importBatchRows)
      .where(sql`${importBatchRows.batchId} = ${batchId} and ${importBatchRows.status} = 'failed'`);
    await tx
      .update(importBatches)
      .set({ status: (failed?.n ?? 0) > 0 ? "completed_with_errors" : "completed", completedAt: new Date() })
      .where(eq(importBatches.id, batchId));
    return "recovered";
  });
}

export type OrphanDeps = {
  listActiveJobs: (queues: string[], startedBefore: Date) => Promise<OrphanedJob[]>;
  recoverBatch: (batchId: string, message: string) => Promise<RecoverResult>;
  failJob: (queue: string, id: string) => Promise<void>;
  now: () => Date;
};

const IMPORT_QUEUES = [JOBS.IMPORT_TO_ACCURATE, JOBS.IMPORT_TO_ACCURATE_LARGE] as string[];

export const defaultOrphanDeps: OrphanDeps = {
  listActiveJobs: async (queues, before) => {
    const names = sql.join(queues.map((q) => sql`${q}`), sql`, `);
    const raw = (await db.execute(
      sql`select id::text as id, name, data->>'batchId' as batch_id from pgboss.job where name in (${names}) and state = 'active' and started_on < ${before.toISOString()}::timestamptz`,
    )) as unknown;
    // driver-agnostik: array langsung (postgres-js) atau { rows } (node-postgres)
    const rows = (Array.isArray(raw) ? raw : ((raw as { rows?: unknown[] }).rows ?? [])) as { id: string; name: string; batch_id: string | null }[];
    return rows.map((r) => ({ id: r.id, queue: r.name, batchId: r.batch_id }));
  },
  recoverBatch: recoverOrphanedBatch,
  failJob: async (queue, id) => {
    await boss.fail(queue, id, { reason: "orphaned-after-worker-restart" });
  },
  now: () => new Date(),
};

export type OrphanSummary = { jobs: number; recovered: number; skipped: number; missing: number; errors: number };

/** Panggil SAAT worker mulai, SEBELUM `boss.work(...)` apa pun. Galat per job dicatat dan tidak menghentikan job lain maupun start worker. */
export async function recoverOrphanedImportJobs(deps: OrphanDeps = defaultOrphanDeps): Promise<OrphanSummary> {
  const summary: OrphanSummary = { jobs: 0, recovered: 0, skipped: 0, missing: 0, errors: 0 };
  const jobs = await deps.listActiveJobs(IMPORT_QUEUES, deps.now());
  summary.jobs = jobs.length;
  for (const job of jobs) {
    try {
      const result = job.batchId ? await deps.recoverBatch(job.batchId, ORPHANED_IMPORT_MESSAGE) : "missing";
      summary[result] += 1;
      logger.warn({ event: "orphaned_import_recovered", jobId: job.id, queue: job.queue, batchId: job.batchId, result }, "Job impor hantu (worker lama mati) dipulihkan");
      await deps.failJob(job.queue, job.id);
    } catch (err) {
      summary.errors += 1;
      logger.error({ err, jobId: job.id, queue: job.queue, batchId: job.batchId }, "Gagal memulihkan job impor hantu");
    }
  }
  return summary;
}
