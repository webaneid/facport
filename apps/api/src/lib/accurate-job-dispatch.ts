import { eq } from "drizzle-orm";
import { db } from "./db";
import { importBatches, autoproduksiProductionEntries } from "../db/schema";
import { resolveConnectionForSubscription } from "./accurate-connection";
import { boss, JOBS } from "./queue";
import { logger } from "./logger";
import { env } from "./env";
import { runWithAccurateConnection } from "./accurate-rate-limiter";
import type { Job } from "pg-boss";
import { loadStagedPlanForBatch } from "./staged-batch";

// § Fase 167, ADR-0048 — SATU-SATUNYA jalan mengirim job antrean yang memanggil Accurate. Tiap job diberi `group.id` = id koneksi Accurate (token),
// supaya worker (`localGroupConcurrency: 1`) menjalankan koneksi BERBEDA paralel dan koneksi yang SAMA berurutan (batas 8 request/detik berlaku per token).
// JANGAN panggil `boss.send(JOBS.IMPORT_TO_ACCURATE | CANCEL_IMPORT | PROCESS_AUTOPRODUKSI_ENTRY, ...)` langsung — dijaga tes pagar.

export type AccurateJobName = typeof JOBS.IMPORT_TO_ACCURATE | typeof JOBS.CANCEL_IMPORT | typeof JOBS.PROCESS_AUTOPRODUKSI_ENTRY;

export type AccurateJobDeps = {
  send: (name: string, data: object, options?: { group?: { id: string }; expireInSeconds?: number }) => Promise<string | null>;
  subscriptionIdForJob: (name: string, payload: object) => Promise<string | null>;
  /** Jumlah baris batch untuk job impor (memilih jalur & expire); null = tidak diketahui → jalur biasa. */
  totalRowsForJob: (name: string, payload: object) => Promise<number | null>;
  connectionIdForSubscription: (subscriptionId: string) => Promise<string | null>;
  /** § Fase 205 — perkiraan detik kirim-bertahap untuk batch ini (0/undefined = tidak ada dokumen bertahap). Menentukan kedaluwarsa & jalur BESAR. */
  stagedSecondsForJob?: (name: string, payload: object) => Promise<number>;
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
  totalRowsForJob: async (name, payload) => {
    if (name !== JOBS.IMPORT_TO_ACCURATE) return null;
    const [row] = await db.select({ totalRows: importBatches.totalRows }).from(importBatches).where(eq(importBatches.id, (payload as { batchId: string }).batchId));
    return row?.totalRows ?? null;
  },
  connectionIdForSubscription: async (subscriptionId) => (await resolveConnectionForSubscription(subscriptionId))?.connection?.id ?? null,
  stagedSecondsForJob: async (name, payload) => {
    if (name !== JOBS.IMPORT_TO_ACCURATE) return 0;
    return (await loadStagedPlanForBatch((payload as { batchId: string }).batchId))?.estimatedSeconds ?? 0;
  },
};

// § Fase 199 — pemilihan jalur & batas kedaluwarsa job impor berdasarkan jumlah baris (biaya Accurate ±0,25–0,30 dtk/baris, linear; lihat architecture-import-capacity.md).
export const DEFAULT_IMPORT_LARGE_BATCH_ROWS = 1500;
const EXPIRE_MIN_SECONDS = 7200;
const EXPIRE_MAX_SECONDS = 86_400;
const EXPIRE_SECONDS_PER_ROW = 0.6; // = timeout per baris di `accurate-http.ts` → skenario terburuk (semua timeout) masih tertutup
const EXPIRE_MARGIN_SECONDS = 900;
// § Fase 205 — job yang memuat dokumen kirim-bertahap: perkiraan model (kuadrat) × 1,5 + margin, maksimum 14 hari (batas fisik Accurate; pelanggan sudah diberi tahu di popup).
const STAGED_EXPIRE_FACTOR = 1.5;
const STAGED_EXPIRE_MAX_SECONDS = 14 * 86_400;

/** Kedaluwarsa job yang memuat dokumen kirim-bertahap (selalu ≥ kedaluwarsa dasar `base`). */
export function computeStagedExpireSeconds(stagedSeconds: number, base: number): number {
  if (!(stagedSeconds > 0)) return base;
  return Math.max(base, Math.min(Math.ceil(stagedSeconds * STAGED_EXPIRE_FACTOR) + EXPIRE_MARGIN_SECONDS, STAGED_EXPIRE_MAX_SECONDS));
}

/** Nilai env `IMPORT_LARGE_BATCH_ROWS` → bilangan bulat 100–100.000; kosong/tidak valid → default (1.500). */
export function parseImportLargeBatchRows(raw: string | undefined): number {
  const n = Number(raw);
  if (!raw || !Number.isInteger(n)) return DEFAULT_IMPORT_LARGE_BATCH_ROWS;
  return Math.min(Math.max(n, 100), 100_000);
}

/** Kedaluwarsa job impor: dasar 2 jam (perilaku lama), naik untuk batch sangat besar, maksimum 24 jam. */
export function computeImportExpireSeconds(totalRows: number): number {
  return Math.min(Math.max(Math.ceil(totalRows * EXPIRE_SECONDS_PER_ROW + EXPIRE_MARGIN_SECONDS), EXPIRE_MIN_SECONDS), EXPIRE_MAX_SECONDS);
}

/**
 * Kirim job + group koneksi. Kegagalan MENCARI grup tidak boleh menghilangkan job (tanpa group = antre biasa, bucket "global" di worker); kegagalan `send`
 * dilempar ke pemanggil, sama seperti `boss.send` sebelumnya. § Fase 199 — job `IMPORT_TO_ACCURATE` dengan jumlah baris ≥ ambang dikirim ke jalur BESAR
 * (`IMPORT_TO_ACCURATE_LARGE`) dan diberi `expireInSeconds` sesuai ukuran; pemanggil tetap cukup memakai `JOBS.IMPORT_TO_ACCURATE`.
 */
export async function enqueueAccurateJob(
  name: AccurateJobName,
  payload: object,
  deps: AccurateJobDeps = defaultDeps,
  largeBatchRows: number = parseImportLargeBatchRows(env.IMPORT_LARGE_BATCH_ROWS),
): Promise<string | null> {
  let groupId: string | null = null;
  try {
    const subscriptionId = await deps.subscriptionIdForJob(name, payload);
    if (subscriptionId) groupId = await deps.connectionIdForSubscription(subscriptionId);
  } catch (err) {
    logger.warn({ err: (err as Error).name, job: name }, "Gagal menentukan group koneksi Accurate untuk job — dikirim tanpa group");
  }
  let queue: string = name;
  let expireInSeconds: number | undefined;
  if (name === JOBS.IMPORT_TO_ACCURATE) {
    try {
      const totalRows = await deps.totalRowsForJob(name, payload);
      if (totalRows !== null) {
        expireInSeconds = computeImportExpireSeconds(totalRows);
        if (totalRows >= largeBatchRows) queue = JOBS.IMPORT_TO_ACCURATE_LARGE;
        // § Fase 205 — dokumen kirim-bertahap bisa berjam-jam: jalur BESAR (tidak menghalangi impor kecil pelanggan lain) + kedaluwarsa sesuai model waktu.
        const stagedSeconds = (await deps.stagedSecondsForJob?.(name, payload)) ?? 0;
        if (stagedSeconds > 0) {
          expireInSeconds = computeStagedExpireSeconds(stagedSeconds, expireInSeconds);
          queue = JOBS.IMPORT_TO_ACCURATE_LARGE;
        }
      }
    } catch (err) {
      logger.warn({ err: (err as Error).name, job: name }, "Gagal membaca ukuran batch — dikirim ke jalur biasa");
    }
  }
  const options = { ...(groupId ? { group: { id: groupId } } : {}), ...(expireInSeconds !== undefined ? { expireInSeconds } : {}) };
  return deps.send(queue, payload, Object.keys(options).length > 0 ? options : undefined);
}

export const DEFAULT_IMPORT_WORKER_CONCURRENCY = 2;
export const MAX_IMPORT_WORKER_CONCURRENCY = 8;

/** Nilai env `IMPORT_WORKER_CONCURRENCY` → bilangan bulat 1–8; kosong/tidak valid → default (2). */
export function parseImportWorkerConcurrency(raw: string | undefined): number {
  const n = Number(raw);
  if (!raw || !Number.isInteger(n) || n < 1) return DEFAULT_IMPORT_WORKER_CONCURRENCY;
  return Math.min(n, MAX_IMPORT_WORKER_CONCURRENCY);
}

export const DEFAULT_IMPORT_LARGE_WORKER_CONCURRENCY = 2;
export const MAX_IMPORT_LARGE_WORKER_CONCURRENCY = 4;

/** Nilai env `IMPORT_LARGE_WORKER_CONCURRENCY` → bilangan bulat 1–4; kosong/tidak valid → default (2). */
export function accurateLargeWorkOptions(raw: string | undefined) {
  const n = Number(raw);
  const concurrency = !raw || !Number.isInteger(n) || n < 1 ? DEFAULT_IMPORT_LARGE_WORKER_CONCURRENCY : Math.min(n, MAX_IMPORT_LARGE_WORKER_CONCURRENCY);
  return { localConcurrency: concurrency, localGroupConcurrency: 1 };
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
