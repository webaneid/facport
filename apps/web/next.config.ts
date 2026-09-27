import type { NextConfig } from "next";

// § docs/architecture/architecture-security.md, audit-temuan-2026-09-27.md
// Batch 4.1 — apps/api sudah set header keamanan minimal sejak awal
// (X-Content-Type-Options/X-Frame-Options/Referrer-Policy/HSTS, lihat
// apps/api/src/app.ts `.onAfterHandle`), apps/web belum sama sekali.
// Ditambah di sini (bukan Caddyfile) supaya berlaku juga untuk dev lokal
// (`bun run dev`, tanpa Caddy) dan tidak bergantung reverse proxy production
// sudah dikonfigurasi benar atau belum.
//
// Kenapa boleh baca `process.env.NEXT_PUBLIC_API_URL`/`MINIO_PUBLIC_URL`
// LANGSUNG di sini (beda dari lib/get-prod-api-origin.ts yang SENGAJA
// hindari `process.env.NEXT_PUBLIC_*` karena itu di-bake ke bundle CLIENT
// saat build CI, § lessons-learned 2026-08-27 — 1 image dipakai ulang
// lintas domain tanpa rebuild): `headers()` di file ini kode SERVER MURNI,
// dieksekusi langsung oleh proses `next start` saat container boot (baca
// `process.env` container itu SENDIRI, bukan lewat bundle client) — masalah
// "baked saat build, beda saat runtime" itu TIDAK berlaku untuk kode yang
// tidak pernah masuk bundle browser. `MINIO_PUBLIC_URL` sendiri milik
// apps/api tapi ikut terbaca container `web` juga karena `docker-compose.
// prod.yml`/`docker-compose.staging.yml` keduanya set `env_file` yang SAMA
// (.env.production/.env.staging) untuk service `api` maupun `web`.
//
// § bug-class `process.env.NODE_ENV` (dot-notation) di-const-fold Bun SAAT
// BUILD (lihat apps/api/src/app.ts, apps/api/src/lib/auth.ts) — TIDAK
// berlaku di sini (next.config.ts dibaca langsung oleh Next.js CLI, bukan
// di-bundle Bun), tapi tetap pakai notasi bracket biar konsisten & tidak
// perlu mikir ulang tiap baca file ini.
const isDev = process.env["NODE_ENV"] !== "production";

// Dev: API & MinIO selalu localhost (§ apps/api/.env.example default).
// Prod/staging: dari env container ITU SENDIRI, jadi otomatis benar untuk
// domain apa pun tanpa perlu rebuild image (mirror strategi
// lib/get-prod-api-origin.ts, cuma beda layer: itu per-request di browser,
// ini per-container-start di server).
const apiOrigin = isDev ? "http://localhost:3001" : (process.env["NEXT_PUBLIC_API_URL"] ?? "");
const mediaOrigin = isDev ? "http://localhost:9000" : (process.env["MINIO_PUBLIC_URL"] ?? "");

// § phase-47-landing-page-redesign.md — ilustrasi landing SENGAJA hosted
// WordPress `facinstitute.id` (bukan MinIO kita, bukan per-environment) —
// hardcode literal SAMA PERSIS dengan HERO_ILLUSTRATION/CLOSING_ILLUSTRATION
// di app/landing/page.tsx. Kalau URL itu berubah, update DUA tempat ini
// bareng.
const LANDING_ILLUSTRATION_ORIGIN = "https://facinstitute.id";

const cspHeader = [
  "default-src 'self'",
  // 'unsafe-inline' WAJIB untuk script-src (dev) & style-src (dev+prod) —
  // CSP nonce-based (§ node_modules/next/dist/docs/01-app/02-guides/
  // content-security-policy.md, dibaca sebelum nulis kode ini sesuai
  // instruksi apps/web/CLAUDE.md) MEMAKSA SEMUA halaman jadi dynamic
  // rendering (matiin static optimization/ISR di landing publik — regresi
  // performa nyata), DAN tetap tidak menolong Radix UI (dasar shadcn/ui,
  // § adr-0004-ui-component-standards.md) yang set inline `style` attribute
  // lewat JS langsung buat positioning popover/dropdown/tooltip/combobox —
  // bukan lewat React `style` prop yang bisa di-nonce Next otomatis.
  // Didokumentasikan sebagai keputusan sengaja (bukan kelalaian) di
  // docs/lessons-learned.md 2026-09-27 — proteksi CSP di sini fokus ke
  // origin resource (img/connect/frame/object/form), bukan larang semua
  // inline script/style.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: ${mediaOrigin} ${LANDING_ILLUSTRATION_ORIGIN}`.trim(),
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin}`.trim(),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // Kecualikan /api-proxy (Route Handler dev-only, proxy ke
        // apps/api — biarkan header ASLI dari apps/api yang lewat apa
        // adanya, jangan dobel/berpotensi konflik CSP) & path statis Next
        // sendiri, mirror pola matcher resmi di dokumen guide di atas.
        source: "/((?!api-proxy|_next/static|_next/image|favicon.ico).*)",
        headers: [
          { key: "Content-Security-Policy", value: cspHeader },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Sama seperti apps/api: HSTS cuma production (§ apps/api/src/app.ts
          // komentar lengkap kenapa harus digate NODE_ENV, bukan asal pasang
          // biar dev/localhost tidak ikut kena force-HTTPS).
          ...(isDev
            ? []
            : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
        ],
      },
    ];
  },
};

export default nextConfig;
