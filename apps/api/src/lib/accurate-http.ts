import { env } from "./env";
import { logger } from "./logger";
import { currentAccurateConnectionId } from "./accurate-rate-limiter";

// § Fase 199 (evaluasi kapasitas, architecture-import-capacity.md) — SATU pintu untuk semua panggilan HTTP ke host Accurate (`ctx.host`).
// Sebelumnya TIDAK ADA timeout di kode: yang berlaku adalah default `fetch` runtime (Bun 1.4.3 = 360 dtk, Bun 1.3.11 = 300 dtk; image `oven/bun:1`
// mengambang) → batas yang menentukan sukses/gagalnya impor besar bergeser diam-diam dan bukan keputusan kita. Di sini timeout MENJADI KEPUTUSAN KITA:
// - `save.do`: adaptif sesuai jumlah baris detail (biaya Accurate terukur ±0,25–0,28 dtk/baris, linear → 600 ms/baris = faktor ±2×), antara MIN dan MAX.
// - panggilan lain: batas tetap eksplisit (default 360 dtk = perilaku sebelumnya, kini tertulis).
// Semua angka bisa ditala lewat env tanpa rilis kode. Metrik (durasi/ukuran/hasil) dicatat ke log terstruktur untuk kalibrasi.

export type HttpTimeoutConfig = { saveMinMs: number; saveMaxMs: number; saveMsPerLine: number; requestMs: number; stagedSecondsCoeff: number };

function boundedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!raw || !Number.isInteger(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

export function parseHttpTimeoutConfig(source: Record<string, string | undefined>): HttpTimeoutConfig {
  const saveMinMs = boundedInt(source.ACCURATE_SAVE_TIMEOUT_MIN_MS, 360_000, 60_000, 3_600_000);
  const saveMaxMs = Math.max(saveMinMs, boundedInt(source.ACCURATE_SAVE_TIMEOUT_MAX_MS, 3_600_000, 60_000, 7_200_000));
  return {
    saveMinMs,
    saveMaxMs,
    saveMsPerLine: boundedInt(source.ACCURATE_SAVE_MS_PER_LINE, 600, 50, 5_000),
    requestMs: boundedInt(source.ACCURATE_REQUEST_TIMEOUT_MS, 360_000, 10_000, 1_800_000),
    stagedSecondsCoeff: boundedCoeff(source.IMPORT_STAGED_SECONDS_COEFF, 7e-4),
  };
}

// § Fase 206 — koefisien model kuadrat yang SAMA dengan perkiraan kirim bertahap (`IMPORT_STAGED_SECONDS_COEFF`, Fase 205; default & batas = `parseStagedConfig`).
function boundedCoeff(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (raw === undefined || raw === "" || !Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, 1e-6), 1);
}

// § Fase 206 — save.do Sales Receipt / Purchase Payment bersifat KUADRATIK terhadap jumlah baris `detailInvoice` (update dokumen N baris ≈ koefisien × N²), bukan linear:
// log produksi 2026-10-21 mencatat cicilan 16 KB timeout di batas minimum 360 dtk sementara cicilan 25 KB selesai 240 dtk. Timeout = yang LEBIH BESAR antara rumus linear dan model × 1,5.
const QUADRATIC_SAVE_PATHS = ["/sales-receipt/save.do", "/purchase-payment/save.do"];
const QUADRATIC_TIMEOUT_FACTOR = 1.5;

export function isQuadraticSaveUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname;
    return QUADRATIC_SAVE_PATHS.some((p) => pathname.endsWith(p));
  } catch {
    return false;
  }
}

export function computeSaveTimeoutMs(lines: number, cfg: HttpTimeoutConfig): number {
  return Math.min(Math.max(Math.round(lines * cfg.saveMsPerLine), cfg.saveMinMs), cfg.saveMaxMs);
}

// § Fase 206 — dulu 30_000: cicilan Sales Receipt/Purchase Payment 500 baris `detailInvoice` ringkas (±60 B/baris ≈ 30 KB) lolos ambang → tercatat `lines:0`
// padahal 500 baris. Parse JSON ribuan byte itu murah; ambang hanya menghindari parse body yang pasti kecil (di bawah ini timeout = MIN).
const PARSE_THRESHOLD_BYTES = 2_000;

/** Jumlah baris detail pada body `save.do`: jumlah panjang semua array berkunci `detail*` (detailItem, detailInvoice, detailExpense, dst). */
export function countDetailLines(body: unknown): number {
  if (typeof body !== "string" || body.length < PARSE_THRESHOLD_BYTES) return 0;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    let total = 0;
    for (const [key, value] of Object.entries(parsed)) if (key.startsWith("detail") && Array.isArray(value)) total += value.length;
    return total;
  } catch {
    return 0;
  }
}

export function isSaveUrl(url: string): boolean {
  try {
    return new URL(url).pathname.endsWith("/save.do");
  } catch {
    return false;
  }
}

/** Galat timeout kita sendiri — `name` tetap "TimeoutError" dan pesan dasar tetap "The operation timed out." supaya `describeAccurateFailure` mengenalinya. */
export class AccurateTimeoutError extends Error {
  constructor(
    readonly waitedMs: number,
    readonly lines: number,
  ) {
    super("The operation timed out.");
    this.name = "TimeoutError";
  }
}

/** Timeout untuk satu panggilan: save.do adaptif sesuai jumlah baris detail pada body; lainnya batas tetap. Murni (mudah diuji). */
export function resolveRequestTimeout(url: string, body: unknown, cfg: HttpTimeoutConfig): { save: boolean; lines: number; timeoutMs: number } {
  const save = isSaveUrl(url);
  const lines = save ? countDetailLines(body) : 0;
  let timeoutMs = save ? computeSaveTimeoutMs(lines, cfg) : cfg.requestMs;
  if (save && isQuadraticSaveUrl(url)) {
    const quadraticMs = Math.round(cfg.stagedSecondsCoeff * lines * lines * QUADRATIC_TIMEOUT_FACTOR * 1000);
    timeoutMs = Math.min(Math.max(timeoutMs, quadraticMs), cfg.saveMaxMs);
  }
  return { save, lines, timeoutMs };
}

export type AccurateHttpDeps = {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  now: () => number;
  config: () => HttpTimeoutConfig;
};

const defaultDeps: AccurateHttpDeps = {
  fetch: (url, init) => fetch(url, init),
  now: () => Date.now(),
  config: () => parseHttpTimeoutConfig(env as unknown as Record<string, string | undefined>),
};

const SLOW_REQUEST_LOG_MS = 10_000;

/** Pengganti `fetch` untuk SEMUA panggilan ke host Accurate. Timeout eksplisit (adaptif untuk save.do) + metrik. */
export async function accurateFetch(url: string, init: RequestInit = {}, deps: AccurateHttpDeps = defaultDeps): Promise<Response> {
  const { save, lines, timeoutMs } = resolveRequestTimeout(url, init.body, deps.config());
  const started = deps.now();
  let outcome: "ok" | "timeout" | "error" = "ok";
  let status: number | undefined;
  try {
    const res = await deps.fetch(url, { ...init, ...timeoutInit(timeoutMs) });
    status = res.status;
    return res;
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || /operation timed out/i.test(err.message));
    outcome = timedOut ? "timeout" : "error";
    if (timedOut) throw new AccurateTimeoutError(deps.now() - started, lines);
    throw err;
  } finally {
    const durationMs = deps.now() - started;
    if (save || outcome !== "ok" || durationMs >= SLOW_REQUEST_LOG_MS) {
      logger.info(
        {
          event: "accurate_request",
          kind: save ? "save" : "other",
          path: safePath(url),
          lines,
          bodyBytes: typeof init.body === "string" ? init.body.length : 0,
          timeoutMs,
          durationMs,
          outcome,
          status,
          connectionId: currentAccurateConnectionId(),
        },
        "Panggilan Accurate",
      );
    }
  }
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\/accurate\/api\//, "");
  } catch {
    return "?";
  }
}

// MEKANISME override timeout bawaan runtime — DIUJI (Fase 199, Bun 1.3.11, server yang tidak pernah membalas): `AbortSignal.timeout(lebih-panjang)` SAJA dan
// `timeout: <ms>` TIDAK mengalahkan default runtime (tetap terputus di default). Yang bekerja: `timeout: false` (mematikan default bawaan Bun) + `signal`
// milik kita sendiri (terbukti terputus tepat di waktunya). `timeout` adalah opsi khusus Bun (tidak ada di tipe `RequestInit`).
function timeoutInit(ms: number): RequestInit {
  return { timeout: false, signal: AbortSignal.timeout(ms) } as RequestInit;
}
