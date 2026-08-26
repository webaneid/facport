import { createAuthClient } from "better-auth/react";
import { getProdApiOrigin } from "./get-prod-api-origin";

// Client SDK buat panggil sign-in/sign-up dari komponen React — BEDA dari
// `better-auth/cookies` yang dipakai proxy.ts (itu cuma cek keberadaan
// cookie, ini yang benar-benar panggil endpoint auth di apps/api).
// § lib/api-client.ts, next.config.ts — request beneran SELALU dari browser
// (file ini tidak pernah dipakai server-side buat request), jadi selalu
// lewat proxy dev kalau bukan production — lihat komentar lengkap di
// lib/api-client.ts. TAPI modul ini tetap DIEVALUASI sekali di server saat
// prerender halaman statis (/admin/login, /app/login) — window belum ada
// di situ, jadi WAJIB guard `typeof window === "undefined"` juga, walau
// baseURL hasilnya nggak pernah kepakai bikin request beneran dari prerender.
// Better Auth client WAJIB base URL absolute (validasi internal, tolak path
// relatif polos) — gabung dengan `window.location.origin` saat runtime,
// BUKAN string relatif langsung seperti Eden (yang delegasikan ke `fetch()`,
// otomatis resolve relatif ke origin halaman tanpa perlu digabung manual).
// ⚠️ Kalau `baseURL` SUDAH punya path (mis. `/api-proxy`), Better Auth
// TIDAK menambahkan default `/api/auth` lagi (asumsinya baseURL sudah
// lengkap) — jadi path `/api/auth` WAJIB disertakan manual di sini, bukan
// dibiarkan default (§ `withPath()` di better-auth/dist/utils/url.mjs).
const baseURL =
  typeof window === "undefined"
    ? "http://localhost:3001" // prerender server-side — placeholder, tidak pernah dipakai bikin request beneran
    : process.env.NODE_ENV !== "production"
      ? `${window.location.origin}/api-proxy/api/auth`
      : getProdApiOrigin(); // browser + production — lihat lib/get-prod-api-origin.ts

export const authClient = createAuthClient({ baseURL });
