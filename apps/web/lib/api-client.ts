import { treaty } from "@elysia/eden";
import type { App } from "../../api/src/index"; // type-only import lintas app di monorepo
import { getProdApiOrigin } from "./get-prod-api-origin";

// § next.config.ts, lessons-learned.md 2026-08-19 — di BROWSER (dev), pakai
// path relatif `/api-proxy` (di-rewrite Next.js server ke apps/api) supaya
// request TIDAK PERNAH lintas-situs dari sudut pandang browser (cookie sesi
// cross-site ditolak diam-diam di navigasi top-level). Di SERVER (SSR, mis.
// landing/page.tsx) TIDAK ada masalah cross-site sama sekali (server-to-
// server) — pakai NEXT_PUBLIC_API_URL absolute seperti biasa. Production:
// rewrite di next.config.ts di-skip, browser tetap panggil NEXT_PUBLIC_API_URL
// langsung (aman, app.facport.com/api.facport.com satu situs asli).
const isBrowser = typeof window !== "undefined";
const isBrowserDev = isBrowser && process.env.NODE_ENV !== "production";
const baseURL = isBrowserDev
  ? `${window.location.origin}/api-proxy` // absolute — Eden construct URL via `new URL()`, tolak path relatif polos juga
  : isBrowser
    ? getProdApiOrigin() // browser + production — lihat lib/get-prod-api-origin.ts
    : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"); // SSR — process.env dibaca live tiap request, aman

export const api = treaty<App>(baseURL, { fetch: { credentials: "include" } });
