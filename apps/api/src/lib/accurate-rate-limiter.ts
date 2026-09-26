// § architecture-accurate-integration.md § 4 — limit RESMI Accurate: 8
// request/detik DAN 8 request bersamaan (concurrent). In-memory,
// single-instance — tradeoff yang sama seperti lib/rate-limit.ts (cukup
// untuk worker single-process; kalau nanti worker di-scale ke banyak
// instance, revisit ke limiter terpusat, mis. lewat tabel/Redis).
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

let inFlight = 0;
const waitingForSlot: Array<() => void> = [];
const recentCallTimestamps: number[] = [];

function acquireConcurrencySlot(): Promise<void> {
  if (inFlight < MAX_CONCURRENT) {
    inFlight += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => waitingForSlot.push(resolve));
}

function releaseConcurrencySlot(): void {
  const next = waitingForSlot.shift();
  if (next) {
    next(); // slot langsung dipakai antrean berikutnya, inFlight tidak berubah
  } else {
    inFlight -= 1;
  }
}

async function waitForRateSlot(): Promise<void> {
  for (;;) {
    const now = Date.now();
    while (recentCallTimestamps.length > 0 && now - recentCallTimestamps[0]! >= 1000) {
      recentCallTimestamps.shift();
    }
    if (recentCallTimestamps.length < MAX_PER_SECOND) {
      recentCallTimestamps.push(now);
      return;
    }
    const waitMs = 1000 - (now - recentCallTimestamps[0]!);
    await new Promise((resolve) => setTimeout(resolve, Math.max(waitMs, 10)));
  }
}

// Bungkus tiap panggilan HTTP ke Accurate dengan ini — menjamin tidak
// pernah lebih dari 8/detik atau 8 in-flight bersamaan, TANPA request
// ditolak (menunggu giliran, bukan error 429 seperti rate limiter inbound).
// Tetap MENAHAN slot konkurensi selagi retry backoff (§ di atas) — supaya
// tidak melepas slot lalu ikut menambah tekanan request baru sementara
// menunggu Accurate reda.
export async function withAccurateRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  await acquireConcurrencySlot();
  try {
    let attempt = 0;
    for (;;) {
      await waitForRateSlot();
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
    releaseConcurrencySlot();
  }
}
