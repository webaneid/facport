import type { NextConfig } from "next";

// § HOTFIX 2026-09-28 — header keamanan/CSP (audit-temuan-2026-09-27.md
// Batch 4.1) SEMPAT ada di sini via `headers()`, TAPI dipindah ke
// `proxy.ts` (middleware) setelah ditemukan bug production: Next.js
// meng-EVALUASI `headers()` next.config SAAT `next build` (nilai literal
// DIBEKUKAN ke `.next/routes-manifest.json`), BUKAN dibaca ulang tiap
// request/container-boot seperti asumsi semula — `docker build` CI tidak
// pernah kasih `NEXT_PUBLIC_API_URL`/`MINIO_PUBLIC_URL` sebagai build-arg,
// jadi CSP yang ter-deploy permanen punya origin api/media KOSONG. Lihat
// `proxy.ts` untuk implementasi barunya (genuinely per-request) + detail
// insiden lengkap di `docs/lessons-learned.md`.
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
