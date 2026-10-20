import { env } from "./env";

// § Fase 199 (C4b, architecture-import-capacity.md § 11) — grup (satu dokumen Accurate) dalam SATU job impor diproses berurutan; biaya Accurate ±0,25–0,3 dtk per
// permintaan membuat throughput berurutan ≈ 3 baris/dtk, padahal Accurate mengizinkan 8 paralel & 8 req/dtk per token. Helper ini menjalankan grup paralel sampai
// `parallelism` sekaligus. DEFAULT 1 = perilaku lama persis (loop berurutan). Batas 8 req/dtk & 8 paralel per koneksi TETAP dijaga `withAccurateRateLimit` (per koneksi),
// jadi paralelisme tinggi hanya mengantre, tidak melanggar batas Accurate. Dinyalakan lewat env `IMPORT_GROUP_PARALLELISM` (rollout bertahap, tanpa rilis kode).
export const DEFAULT_GROUP_PARALLELISM = 1;
export const MAX_GROUP_PARALLELISM = 6;

/** Nilai env `IMPORT_GROUP_PARALLELISM` → bilangan bulat 1–6; kosong/tidak valid → 1 (berurutan). */
export function parseGroupParallelism(raw: string | undefined): number {
  const n = Number(raw);
  if (!raw || !Number.isInteger(n) || n < 1) return DEFAULT_GROUP_PARALLELISM;
  return Math.min(n, MAX_GROUP_PARALLELISM);
}

export function configuredGroupParallelism(): number {
  return parseGroupParallelism((env as unknown as Record<string, string | undefined>).IMPORT_GROUP_PARALLELISM);
}

/**
 * Jalankan `fn` untuk tiap item, paling banyak `parallelism` sekaligus, item diambil BERURUTAN. `parallelism <= 1` = loop berurutan biasa (perilaku lama).
 * `fn` menangani galat per-grup sendiri (catch di badan loop); bila tetap ada yang melempar (mis. galat DB), item baru TIDAK dimulai lagi, yang sedang berjalan
 * dituntaskan, lalu galat pertama dilempar — sama dengan loop berurutan yang melempar keluar dari handler.
 */
export async function forEachGroupConcurrent<T>(items: readonly T[], parallelism: number, fn: (item: T) => Promise<void>): Promise<void> {
  if (parallelism <= 1 || items.length <= 1) {
    for (const item of items) await fn(item);
    return;
  }
  let next = 0;
  let failure: { error: unknown } | null = null;
  const worker = async () => {
    while (failure === null) {
      const index = next++;
      if (index >= items.length) return;
      try {
        await fn(items[index]!);
      } catch (error) {
        failure ??= { error };
        return;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallelism, items.length) }, worker));
  if (failure) throw (failure as { error: unknown }).error;
}
