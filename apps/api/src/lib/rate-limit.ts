// § architecture-security.md §7 — WAJIB untuk endpoint sensitif (login,
// register, dst). In-memory sliding window per IP — cukup untuk single
// instance (lihat catatan di architecture-security.md soal scaling ke
// Redis-based kalau nanti multi-instance). Package `elysia-rate-limit`
// TIDAK dipakai — versi yang ada di npm mensyaratkan peer dependency
// `elysia >= 2.0.0`, sedangkan project ini pin ke Elysia 1.4.x stable
// (2.0 masih beta) — install-nya bikin mismatch, jadi ditulis manual.
import { Elysia } from "elysia";
import { logger } from "./logger";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

// § security review Fase 27, ADR-0025 (High) — SEBELUMNYA pakai
// `x-forwarded-for` mentah sebagai kunci bucket: header itu BISA DI-SET
// BEBAS oleh client (browser/curl manapun), dan nginx (§
// docs/deployment-new-domain-onboarding.md) cuma MENAMBAHKAN IP asli ke
// header itu (append, bukan replace) — penyerang cukup kirim nilai acak
// beda tiap request supaya SELALU dapat bucket baru, rate limit jadi
// tidak pernah kena. `x-real-ip` yang benar: nginx config yang sama
// SELALU set `proxy_set_header X-Real-IP $remote_addr` — nilai ini
// DITIMPA nginx tiap request (client TIDAK BISA override), jadi aman
// dipakai sebagai identitas rate-limit. `x-forwarded-for` dipertahankan
// SEBAGAI FALLBACK untuk dev lokal (tidak ada nginx di depan, header
// keduanya kosong) — production HARUS selalu punya `x-real-ip` terisi.
function getClientIp(request: Request): string {
  return request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for") ?? "unknown";
}

export function rateLimitPlugin({
  windowMs,
  max,
  pathPrefix,
}: {
  windowMs: number;
  max: number;
  pathPrefix: string;
}) {
  return new Elysia({ name: `rate-limit-${pathPrefix}` }).onRequest(({ request, set }) => {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(pathPrefix)) return;

    const ip = getClientIp(request);
    const key = `${pathPrefix}:${ip}`;
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt < now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }

    bucket.count += 1;
    if (bucket.count > max) {
      logger.warn({ ip, pathPrefix }, "Rate limit exceeded");
      set.status = 429;
      return { code: "TOO_MANY_REQUESTS" }; // bare, § ADR-0010
    }
  });
}

// § Low finding security review Fase 01 (pola sama juga dipakai di
// lib/oauth-state.ts) — bucket yang sudah lewat resetAt tapi IP-nya tidak
// pernah request lagi numpuk selamanya. Bersihkan tiap 5 menit.
setInterval(
  () => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt < now) buckets.delete(key);
    }
  },
  5 * 60 * 1000,
).unref();
