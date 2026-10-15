import { eq } from "drizzle-orm";
import { db } from "./db";
import { importBatches, autoproduksiProductionEntries } from "../db/schema";
import { resolveConnectionForSubscription } from "./accurate-connection";
import { boss, JOBS } from "./queue";
import { logger } from "./logger";
import { runWithAccurateConnection } from "./accurate-rate-limiter";
import type { Job } from "pg-boss";

// § Fase 167, ADR-0048 — SATU-SATUNYA jalan mengirim job antrean yang memanggil Accurate. Tiap job diberi `group.id` = id koneksi Accurate (token),
// supaya worker (`localGroupConcurrency: 1`) menjalankan koneksi BERBEDA paralel dan koneksi yang SAMA berurutan (batas 8 request/detik berlaku per token).
// JANGAN panggil `boss.send(JOBS.IMPORT_TO_ACCURATE | CANCEL_IMPORT | PROCESS_AUTOPRODUKSI_ENTRY, ...)` langsung — dijaga tes pagar.

export type AccurateJobName = typeof JOBS.IMPORT_TO_ACCURATE | typeof JOBS.CANCEL_IMPORT | typeof JOBS.PROCESS_AUTOPRODUKSI_ENTRY;

export type AccurateJobDeps = {
  send: (name: string, data: object, options?: { group: { id: string } }) => Promise<string | null>;
  subscriptionIdForJob: (name: string, payload: object) => Promise<string | null>;
  connectionIdForSubscription: (subscriptionId: string) => Promise<string | null>;
};

const defaultDeps: AccurateJobDeps = {
  send: (name, data, options) => boss.send(name, data, options),
  subscriptionIdForJob: async (name, payload) => {
    if (name === JOBS.PROCESS_AUTOPRODUKSI_ENTRY) {
      const [row] = await db
        .select({ subscriptionId: autoproduksiProductionEntries.subscriptionId })
        .from(autoproduksiProductionEntries)
        .where(eq(autoproduksiProductionEntries.id, (payload as { entryId: string }).entryId));
      return row?.subscriptionId ?? null;
    }
    const [row] = await db.select({ subscriptionId: importBatches.subscriptionId }).from(importBatches).where(eq(importBatches.id, (payload as { batchId: string }).batchId));
    return row?.subscriptionId ?? null;
  },
  connectionIdForSubscription: async (subscriptionId) => (await resolveConnectionForSubscription(subscriptionId))?.connection?.id ?? null,
};

/**
 * Kirim job + group koneksi. Kegagalan MENCARI grup tidak boleh menghilangkan job (tanpa group = antre biasa, bucket "global" di worker); kegagalan `send`
 * dilempar ke pemanggil, sama seperti `boss.send` sebelumnya.
 */
export async function enqueueAccurateJob(name: AccurateJobName, payload: object, deps: AccurateJobDeps = defaultDeps): Promise<string | null> {
  let groupId: string | null = null;
  try {
    const subscriptionId = await deps.subscriptionIdForJob(name, payload);
    if (subscriptionId) groupId = await deps.connectionIdForSubscription(subscriptionId);
  } catch (err) {
    logger.warn({ err: (err as Error).name, job: name }, "Gagal menentukan group koneksi Accurate untuk job — dikirim tanpa group");
  }
  return deps.send(name, payload, groupId ? { group: { id: groupId } } : undefined);
}

export const DEFAULT_IMPORT_WORKER_CONCURRENCY = 2;
export const MAX_IMPORT_WORKER_CONCURRENCY = 8;

/** Nilai env `IMPORT_WORKER_CONCURRENCY` → bilangan bulat 1–8; kosong/tidak valid → default (2). */
export function parseImportWorkerConcurrency(raw: string | undefined): number {
  const n = Number(raw);
  if (!raw || !Number.isInteger(n) || n < 1) return DEFAULT_IMPORT_WORKER_CONCURRENCY;
  return Math.min(n, MAX_IMPORT_WORKER_CONCURRENCY);
}

/** Opsi `boss.work` untuk antrean Accurate: N koneksi paralel, tiap koneksi (group) maksimal 1 job sekaligus (batas 8 req/detik per token). */
export function accurateWorkOptions(raw: string | undefined) {
  return { localConcurrency: parseImportWorkerConcurrency(raw), localGroupConcurrency: 1 };
}

/** Bungkus handler worker supaya `withAccurateRateLimit` memakai bucket koneksi job ini (`group.id`); tanpa group → bucket "global". */
export function withAccurateJobContext<T extends object>(handler: (jobs: Job<T>[]) => Promise<void>): (jobs: Job<T>[]) => Promise<void> {
  return (jobs) => {
    const groupId = jobs[0]?.groupId ?? null;
    return groupId ? runWithAccurateConnection(groupId, () => handler(jobs)) : handler(jobs);
  };
}
