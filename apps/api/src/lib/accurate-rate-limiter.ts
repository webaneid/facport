// § architecture-accurate-integration.md § 4 — limit RESMI Accurate: 8
// request/detik DAN 8 request bersamaan (concurrent). In-memory,
// single-instance — tradeoff yang sama seperti lib/rate-limit.ts (cukup
// untuk worker single-process; kalau nanti worker di-scale ke banyak
// instance, revisit ke limiter terpusat, mis. lewat tabel/Redis).
const MAX_PER_SECOND = 8;
const MAX_CONCURRENT = 8;

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
export async function withAccurateRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  await acquireConcurrencySlot();
  try {
    await waitForRateSlot();
    return await fn();
  } finally {
    releaseConcurrencySlot();
  }
}
