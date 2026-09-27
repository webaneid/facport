// Next.js 16 rename dari `middleware.ts` — perilaku sama, cuma nama file &
// fungsi berubah (§ architecture-domain-routing.md, diverifikasi Fase 00
// dari node_modules/next/dist/docs/). VERIFIKASI ULANG ke docs itu kalau
// versi Next.js berubah, jangan asumsikan `middleware.ts` otomatis benar.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { getSurface } from "./lib/get-surface";

// § HOTFIX 2026-09-28, audit-temuan-2026-09-27.md Batch 4 — header
// keamanan/CSP SEBELUMNYA di `next.config.ts` `headers()`. Ditemukan
// SETELAH deploy v2.15.0 ke production: Next.js meng-EVALUASI `headers()`
// next.config SAAT `next build` (bukan dibaca ulang saat `next start` boot
// seperti asumsi awal saat menulis Batch 4) — nilainya literal DIBEKUKAN
// ke `.next/routes-manifest.json`. `docker build` (§ `.github/workflows/
// deploy.yml`) TIDAK PERNAH set `NEXT_PUBLIC_API_URL`/`MINIO_PUBLIC_URL`
// sebagai build-arg (cuma `APP_VERSION`) — jadi CSP yang ter-deploy PERMANEN
// punya `connect-src`/`img-src` KOSONG untuk origin api/media, apa pun isi
// `.env.production` di server. Diverifikasi lokal: build production TANPA
// env var lalu baca `.next/routes-manifest.json` — string CSP-nya SAMA
// PERSIS dengan yang muncul di `curl -I` production (logo/favicon company
// pecah, kemungkinan panggilan API browser ikut terblokir). § detail
// lengkap insiden di docs/lessons-learned.md.
//
// Fix: pindah ke SINI (proxy.ts/middleware) — kode ini genuinely jalan PER
// REQUEST di server Node (bukan di-resolve `next.config` saat build,
// § dikonfirmasi resmi juga oleh contoh nonce di node_modules/next/dist/
// docs/.../content-security-policy.md yang men-generate nonce "every time
// a page is viewed"). Origin api/media diturunkan dari HOST HEADER REQUEST
// ITU SENDIRI (pola SAMA `lib/get-prod-api-origin.ts` — ganti label pertama
// hostname, mis. "app.facinstitute.id" -> "api.facinstitute.id"), BUKAN
// dari env var yang rawan kosong saat image Docker dipakai ulang lintas
// environment (prod/staging) tanpa rebuild.
function buildSecurityHeaders(hostHeader: string | null): Headers {
  const isDev = process.env.NODE_ENV !== "production";
  const hostname = (hostHeader ?? "").replace(/:\d+$/, "").toLowerCase();
  const parts = hostname.split(".");
  const withFirstLabel = (label: string) => [label, ...parts.slice(1)].join(".");

  // Dev: API & MinIO selalu localhost (§ apps/api/.env.example default).
  // Prod/staging: subdomain sibling dari host yang SEDANG diakses browser
  // SEKARANG — benar untuk domain apa pun tanpa perlu tahu domainnya di
  // build time (persis alasan lib/get-prod-api-origin.ts ada).
  const apiOrigin = isDev ? "http://localhost:3001" : `https://${withFirstLabel("api")}`;
  const mediaOrigin = isDev ? "http://localhost:9000" : `https://${withFirstLabel("media")}`;
  // § phase-47-landing-page-redesign.md — ilustrasi landing SENGAJA hosted
  // WordPress `facinstitute.id` (bukan MinIO kita, bukan per-environment) —
  // hardcode literal SAMA PERSIS dengan HERO_ILLUSTRATION/CLOSING_ILLUSTRATION
  // di app/landing/page.tsx.
  const landingIllustrationOrigin = "https://facinstitute.id";

  // 'unsafe-inline' (script-src & style-src) + 'unsafe-eval' (dev only) —
  // keputusan sadar, bukan kelonggaran ceroboh: CSP nonce-based (§ guide di
  // node_modules/next/dist/docs/ di atas) MEMAKSA SEMUA halaman jadi dynamic
  // rendering (matikan static optimization landing publik) DAN tetap tidak
  // menolong Radix UI (dasar shadcn/ui) yang set inline `style` attribute
  // lewat JS langsung untuk positioning popover/dropdown/tooltip — bukan
  // lewat React `style` prop yang bisa di-nonce otomatis Next.
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: ${mediaOrigin} ${landingIllustrationOrigin}`,
    "font-src 'self' data:",
    `connect-src 'self' ${apiOrigin}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  const headers = new Headers();
  headers.set("Content-Security-Policy", csp);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // Sama seperti apps/api (app.ts `.onAfterHandle`): HSTS cuma production.
  if (!isDev) headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  return headers;
}

// Tempel header keamanan ke response APA PUN yang mau dikembalikan proxy
// (next/redirect/rewrite semua NextResponse, semua bisa ditempeli header).
function withSecurityHeaders<T extends NextResponse>(response: T, host: string | null): T {
  buildSecurityHeaders(host).forEach((value, key) => response.headers.set(key, value));
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host");

  // Halaman verifikasi dev Fase 00 — sengaja TIDAK di-rewrite per surface,
  // biar tetap reachable dari host mana pun tanpa perlu didup di 3 surface.
  // Dihapus begitu tidak dibutuhkan lagi (§ phase-00 Known Limitations).
  if (pathname.startsWith("/dev")) {
    return withSecurityHeaders(NextResponse.next(), host);
  }

  // § next.config.ts rewrites(), lessons-learned.md 2026-08-19 — proxy dev
  // ke apps/api (biar browser tidak pernah lihat request lintas-situs).
  // WAJIB skip guard login DI SINI — panggilan sign-in ITU SENDIRI lewat
  // jalur ini (belum ada cookie sama sekali saat login), kalau ikut digate
  // jadi chicken-and-egg (tidak bisa login karena login butuh sudah login).
  // Auth REAL untuk endpoint API tetap di apps/api (`auth:true`/`permission`
  // macro), bukan di sini. TANPA header keamanan di sini SENGAJA — respons
  // asli `apps/api` yang di-proxy sudah bawa header yang sama (§ app.ts
  // `.onAfterHandle`, diverifikasi `route.ts` forward SEMUA header
  // verbatim) — dobel di sini cuma bikin duplikasi, bukan gap.
  if (pathname.startsWith("/api-proxy")) {
    return NextResponse.next();
  }

  const surface = getSurface(host ?? "");
  // § diminta user 2026-09-05 — halaman lupa/reset password WAJIB
  // reachable TANPA sesi (persis alasan /login/register) — user yang
  // lupa password by definition tidak punya sesi aktif.
  const isAuthPage = pathname === "/login" || pathname === "/register" || pathname === "/forgot-password" || pathname === "/reset-password";

  if ((surface === "admin" || surface === "app") && !isAuthPage) {
    // getSessionCookie() CUMA cek keberadaan cookie (bukan validasi/DB) —
    // ini UX gate (redirect ke login lebih awal), BUKAN lapisan keamanan.
    // Permission/subscription check REAL tetap di apps/api (lib/permission.ts,
    // lib/subscription-gate.ts) — dicek ulang di server, tidak pernah
    // dipercaya dari sini.
    if (!getSessionCookie(request)) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return withSecurityHeaders(NextResponse.redirect(loginUrl), host);
    }
  }

  return withSecurityHeaders(NextResponse.rewrite(new URL(`/${surface}${pathname}`, request.url)), host);
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};
