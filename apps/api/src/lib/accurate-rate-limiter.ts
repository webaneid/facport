// § architecture-accurate-integration.md § 4 — limit RESMI Accurate: 8
// request/detik DAN 8 request bersamaan (concurrent). In-memory,
// single-instance — tradeoff yang sama seperti lib/rate-limit.ts (cukup
// untuk worker single-process; kalau nanti worker di-scale ke banyak
// instance, revisit ke limiter terpusat, mis. lewat tabel/Redis).
import { AsyncLocalStorage } from "node:async_hooks";
import { AccurateApiError } from "./accurate";

const MAX_PER_SECOND = 8;
const MAX_CONCURRENT = 8;

// § bug nyata 2026-09-25 (§ lessons-learned.md) — akar masalahnya sudah
// diperbaiki di `lib/queue.ts` (`retryLimit: 0` + `expireInSeconds` naik,
// mencegah 2 invocation job yang sama jalan bersamaan). Retry di sini
// JAGA-JAGA TAMBAHAN untuk tabrakan yang genuinely dari LUAR kendali kita
// (mis. klien pakai Accurate Desktop/tab lain bersamaan di token yang
// sama) — supaya 1 tabrakan sesaat tidak langsung jadi kegagalan
// PERMANEN per baris (dulu harus di-retry manual lewat "Retry baris
// gagal"). Pesan literal dari Accurate (dikonfirmasi dari screenshot
// client): "Jumlah request API melebihi toleransi yang diperbolehkan.
// Batas maksimum yang diperbolehkan yaitu 8 proses paralel per Token dan
// 8 request/detik."
const RATE_LIMIT_ERROR_SNIPPET = "melebihi toleransi";
const MAX_RATE_LIMIT_RETRIES = 4;
const RATE_LIMIT_RETRY_BASE_MS = 1500;

function isAccurateRateLimitError(err: unknown): boolean {
  return err instanceof AccurateApiError && err.message.includes(RATE_LIMIT_ERROR_SNIPPET);
}

// § Fase 167, ADR-0048 — batas Accurate berlaku PER TOKEN (= per koneksi Accurate), jadi tiap koneksi punya bucket sendiri (in-memory, 1 proses worker).
// Kunci bucket diambil dari `AsyncLocalStorage` yang di-set handler worker (`runWithAccurateConnection`) — 45+ titik panggilan `withAccurateRateLimit`
// tidak perlu diubah. Panggilan tanpa konteks (mis. dari proses API) memakai bucket "global" (perilaku lama).
const GLOBAL_BUCKET_KEY = "global";
const connectionContext = new AsyncLocalStorage<string>();

type Bucket = { inFlight: number; waitingForSlot: Array<() => void>; recentCallTimestamps: number[] };
const buckets = new Map<string, Bucket>();

export function runWithAccurateConnection<T>(connectionKey: string, fn: () => Promise<T>): Promise<T> {
  return connectionContext.run(connectionKey, fn);
}

/** Id koneksi Accurate untuk panggilan yang sedang berjalan (null di luar konteks worker) — dipakai metrik `accurate-http.ts`. */
export function currentAccurateConnectionId(): string | null {
  return connectionContext.getStore() ?? null;
}

/** Hanya untuk tes/diagnostik: jumlah bucket yang masih tersimpan. */
export function accurateLimiterBucketCount(): number {
  return buckets.size;
}

function getBucket(key: string): Bucket {
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { inFlight: 0, waitingForSlot: [], recentCallTimestamps: [] };
    buckets.set(key, bucket);
  }
  return bucket;
}

// Buang bucket yang menganggur (tanpa in-flight, tanpa antrean, tanpa panggilan dalam 1 detik terakhir) supaya Map tidak tumbuh seiring jumlah koneksi.
function sweepIdleBuckets(): void {
  const now = Date.now();
  for (const [key, b] of buckets) {
    if (b.inFlight === 0 && b.waitingForSlot.length === 0 && b.recentCallTimestamps.every((t) => now - t >= 1000)) buckets.delete(key);
  }
}

function acquireConcurrencySlot(bucket: Bucket): Promise<void> {
  if (bucket.inFlight < MAX_CONCURRENT) {
    bucket.inFlight += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => bucket.waitingForSlot.push(resolve));
}

function releaseConcurrencySlot(bucket: Bucket): void {
  const next = bucket.waitingForSlot.shift();
  if (next) {
    next(); // slot langsung dipakai antrean berikutnya, inFlight tidak berubah
  } else {
    bucket.inFlight -= 1;
  }
}

async function waitForRateSlot(bucket: Bucket): Promise<void> {
  for (;;) {
    const now = Date.now();
    while (bucket.recentCallTimestamps.length > 0 && now - bucket.recentCallTimestamps[0]! >= 1000) {
      bucket.recentCallTimestamps.shift();
    }
    if (bucket.recentCallTimestamps.length < MAX_PER_SECOND) {
      bucket.recentCallTimestamps.push(now);
      return;
    }
    const waitMs = 1000 - (now - bucket.recentCallTimestamps[0]!);
    await new Promise((resolve) => setTimeout(resolve, Math.max(waitMs, 10)));
  }
}

// Bungkus tiap panggilan HTTP ke Accurate dengan ini — menjamin tidak
// pernah lebih dari 8/detik atau 8 in-flight bersamaan PER KONEKSI, TANPA
// request ditolak (menunggu giliran, bukan error 429 seperti rate limiter
// inbound). Tetap MENAHAN slot konkurensi selagi retry backoff (§ di atas)
// — supaya tidak melepas slot lalu ikut menambah tekanan request baru
// sementara menunggu Accurate reda.
export async function withAccurateRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  sweepIdleBuckets();
  const bucket = getBucket(connectionContext.getStore() ?? GLOBAL_BUCKET_KEY);
  await acquireConcurrencySlot(bucket);
  try {
    let attempt = 0;
    for (;;) {
      await waitForRateSlot(bucket);
      try {
        return await fn();
      } catch (err) {
        if (!isAccurateRateLimitError(err) || attempt >= MAX_RATE_LIMIT_RETRIES) throw err;
        attempt += 1;
        // Backoff eksponensial + jitter kecil — hindari semua retry menabrak lagi serentak.
        const delayMs = RATE_LIMIT_RETRY_BASE_MS * 2 ** (attempt - 1) + Math.random() * 300;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  } finally {
    releaseConcurrencySlot(bucket);
  }
}
