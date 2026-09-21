import { randomBytes } from "crypto";

// State CSRF protection standar OAuth (§ architecture-accurate-integration.md § 1)
// — in-memory Map dgn TTL, pola sama dengan lib/rate-limit.ts. Cukup untuk
// single instance; kalau nanti scale multi-instance, pindah ke
// tabel/Redis — dicatat di sini, bukan blocker sekarang.
const TTL_MS = 10 * 60 * 1000; // 10 menit

// § Fase 143, ADR-0037 — state membawa siapa yang memulai (`userId`) dan Data Usaha MANA yang dihubungkan
// (`dataUsahaId`), bukan lagi `subscriptionId`. Callback OAuth tidak punya sesi login (redirect dari Accurate),
// jadi `userId` dari sini dipakai untuk memverifikasi kepemilikan Data Usaha saat callback.
export type OAuthStateContext = { userId: string; dataUsahaId: string };
type StateEntry = OAuthStateContext & { expiresAt: number };
const store = new Map<string, StateEntry>();

// § security review Fase 143 (Medium) — batasi state aktif per user supaya `POST /accurate/connect` yang dipanggil
// berulang tidak menumbuhkan Map tanpa batas (TTL 10 menit saja tidak cukup). Yang tertua dibuang duluan.
const MAX_ACTIVE_STATES_PER_USER = 5;

export function createState(context: OAuthStateContext): string {
  const state = randomBytes(24).toString("base64url");
  const mine = [...store].filter(([, entry]) => entry.userId === context.userId);
  for (const [key] of mine.slice(0, Math.max(0, mine.length - (MAX_ACTIVE_STATES_PER_USER - 1)))) store.delete(key);
  store.set(state, { ...context, expiresAt: Date.now() + TTL_MS });
  return state;
}

export function consumeState(state: string): OAuthStateContext | null {
  const entry = store.get(state);
  store.delete(state); // sekali pakai — tolak replay
  if (!entry || entry.expiresAt < Date.now()) return null;
  return { userId: entry.userId, dataUsahaId: entry.dataUsahaId };
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
