import { env } from "./env";

// § Fase 199 (C2, architecture-import-capacity.md) — setelah `save.do` timeout kita TIDAK tahu apakah Accurate menyimpan transaksinya (bisa masih diproses,
// biaya ±0,25–0,30 dtk/baris). Helper ini bertanya ke Accurate lewat NOMOR transaksi (polling sampai batas) dan mengembalikan keadaan sebenarnya:
// - found: ada di Accurate → baris ditandai SUKSES (bukan "gagal"/"mungkin");
// - absent: Accurate menjawab "tidak ada" pada pengecekan tadi → tetap gagal, dengan pesan pasti tapi hati-hati (bisa saja baru selesai sesudahnya);
// - unknown: pengecekan sendiri gagal terus → perilaku lama ("MUNGKIN sudah tersimpan").
// Murni (lookup/sleep/now disuntikkan) agar mudah diuji. Berlaku untuk modul yang membuat dokumen dengan NOMOR dari Excel (Sales Receipt dulu).

export type VerifyOutcome =
  | { state: "found"; id: number; attempts: number; waitedMs: number }
  | { state: "absent"; attempts: number; waitedMs: number }
  | { state: "unknown"; attempts: number; waitedMs: number; lastError: string | null };

export type VerifyConfig = { maxWaitMs: number; intervalMs: number };

function boundedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (raw === undefined || raw === "" || !Number.isInteger(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

/** `ACCURATE_VERIFY_MAX_WAIT_MS` (default 300000 = 5 menit; 0 = satu kali cek tanpa menunggu) dan `ACCURATE_VERIFY_INTERVAL_MS` (default 30000; 5000–120000). */
export function parseVerifyConfig(source: Record<string, string | undefined>): VerifyConfig {
  return {
    maxWaitMs: boundedInt(source.ACCURATE_VERIFY_MAX_WAIT_MS, 300_000, 0, 1_800_000),
    intervalMs: boundedInt(source.ACCURATE_VERIFY_INTERVAL_MS, 30_000, 5_000, 120_000),
  };
}

export type VerifyDeps = {
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  config: () => VerifyConfig;
};

const defaultDeps: VerifyDeps = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
  config: () => parseVerifyConfig(env as unknown as Record<string, string | undefined>),
};

export async function verifyAfterTimeout(lookup: () => Promise<{ id: number } | null>, deps: VerifyDeps = defaultDeps): Promise<VerifyOutcome> {
  const { maxWaitMs, intervalMs } = deps.config();
  const started = deps.now();
  let attempts = 0;
  let sawAbsent = false;
  let lastError: string | null = null;
  for (;;) {
    attempts += 1;
    try {
      const found = await lookup();
      if (found) return { state: "found", id: found.id, attempts, waitedMs: deps.now() - started };
      sawAbsent = true;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    const elapsed = deps.now() - started;
    if (elapsed + intervalMs > maxWaitMs) break;
    await deps.sleep(intervalMs);
  }
  const waitedMs = deps.now() - started;
  return sawAbsent ? { state: "absent", attempts, waitedMs } : { state: "unknown", attempts, waitedMs, lastError };
}
