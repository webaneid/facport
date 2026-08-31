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

// § ketemu 2026-08-31 — Eden Treaty DEFAULT-nya `parseDate: true`: SEMUA
// string di response JSON yang "kelihatan seperti tanggal" (regex broad —
// cocok juga format DD/MM/YYYY, bukan cuma ISO) otomatis di-`JSON.parse`
// reviver jadi objek `Date`, di SELURUH response, bukan cuma field yang
// route-nya declare `t.Date()`. Row `rawData` (purchase-invoice import,
// { batchId }).rows import) berisi APA ADANYA hasil parse Excel/tanggal
// yang di-normalize dialog Edit ke "DD/MM/YYYY" — keduanya cocok regex
// ini, jadi diam-diam berubah jadi `Date` sebelum kode frontend (mis.
// `edit-row-dialog.tsx` `toDisplayDate()`, yang cuma cek
// `typeof === "string"/"number"`) sempat baca nilainya. Efeknya: field
// tanggal tampil sebagai `Date.toString()` penuh ("Wed Aug 19 2026
// 07:00:00 GMT+0700 (...)"), dan kalau ke-save balik APA ADANYA, format
// itu tidak dikenali `toAccurateDate()` di worker — baris gagal lagi
// terus walau user sudah "berhasil" simpan (toast sukses, PUT 200).
// Nonaktifkan GLOBAL — SATU-SATUNYA tempat kode ini butuh nilai tanggal
// SEBAGAI STRING APA ADANYA dari backend, konversi ke `Date` (kalau perlu
// tampil) dilakukan eksplisit di titik pakainya (`lib/utils.ts`
// `formatDate`, terima `string | Date`), bukan implisit di layer HTTP.
export const api = treaty<App>(baseURL, { fetch: { credentials: "include" }, parseDate: false });
