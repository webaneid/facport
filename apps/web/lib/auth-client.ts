import { createAuthClient } from "better-auth/react";

// Client SDK buat panggil sign-in/sign-up dari komponen React — BEDA dari
// `better-auth/cookies` yang dipakai proxy.ts (itu cuma cek keberadaan
// cookie, ini yang benar-benar panggil endpoint auth di apps/api).
// § lib/api-client.ts, next.config.ts — SELALU dipanggil dari browser (file
// ini tidak pernah dipakai server-side), jadi selalu lewat proxy dev kalau
// bukan production — lihat komentar lengkap di lib/api-client.ts.
// Better Auth client WAJIB base URL absolute (validasi internal, tolak path
// relatif polos) — gabung dengan `window.location.origin` saat runtime,
// BUKAN string relatif langsung seperti Eden (yang delegasikan ke `fetch()`,
// otomatis resolve relatif ke origin halaman tanpa perlu digabung manual).
// ⚠️ Kalau `baseURL` SUDAH punya path (mis. `/api-proxy`), Better Auth
// TIDAK menambahkan default `/api/auth` lagi (asumsinya baseURL sudah
// lengkap) — jadi path `/api/auth` WAJIB disertakan manual di sini, bukan
// dibiarkan default (§ `withPath()` di better-auth/dist/utils/url.mjs).
const isBrowserDev = typeof window !== "undefined" && process.env.NODE_ENV !== "production";
export const authClient = createAuthClient({
  baseURL: isBrowserDev
    ? `${window.location.origin}/api-proxy/api/auth`
    : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"),
});
