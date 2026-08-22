import { randomBytes } from "crypto";

// State CSRF protection standar OAuth (§ architecture-accurate-integration.md § 1)
// — in-memory Map dgn TTL, pola sama dengan lib/rate-limit.ts. Cukup untuk
// single instance; kalau nanti scale multi-instance, pindah ke
// tabel/Redis — dicatat di sini, bukan blocker sekarang.
const TTL_MS = 10 * 60 * 1000; // 10 menit

type StateEntry = { subscriptionId: string; expiresAt: number };
const store = new Map<string, StateEntry>();

export function createState(subscriptionId: string): string {
  const state = randomBytes(24).toString("base64url");
  store.set(state, { subscriptionId, expiresAt: Date.now() + TTL_MS });
  return state;
}

export function consumeState(state: string): string | null {
  const entry = store.get(state);
  store.delete(state); // sekali pakai — tolak replay
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry.subscriptionId;
}

// § Low finding security review Fase 01 — state yang digenerate tapi TIDAK
// PERNAH dipakai (user batal di tengah flow OAuth) sebelumnya numpuk selamanya
// di Map (memory leak lambat). Bersihkan entry expired tiap 5 menit.
setInterval(
  () => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.expiresAt < now) store.delete(key);
    }
  },
  5 * 60 * 1000,
).unref(); // .unref() — jangan sampai timer ini nahan proses tetap hidup pas shutdown
