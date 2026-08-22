// Next.js 16 rename dari `middleware.ts` — perilaku sama, cuma nama file &
// fungsi berubah (§ architecture-domain-routing.md, diverifikasi Fase 00
// dari node_modules/next/dist/docs/). VERIFIKASI ULANG ke docs itu kalau
// versi Next.js berubah, jangan asumsikan `middleware.ts` otomatis benar.
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { getSurface } from "./lib/get-surface";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Halaman verifikasi dev Fase 00 — sengaja TIDAK di-rewrite per surface,
  // biar tetap reachable dari host mana pun tanpa perlu didup di 3 surface.
  // Dihapus begitu tidak dibutuhkan lagi (§ phase-00 Known Limitations).
  if (pathname.startsWith("/dev")) {
    return NextResponse.next();
  }

  // § next.config.ts rewrites(), lessons-learned.md 2026-08-19 — proxy dev
  // ke apps/api (biar browser tidak pernah lihat request lintas-situs).
  // WAJIB skip guard login DI SINI — panggilan sign-in ITU SENDIRI lewat
  // jalur ini (belum ada cookie sama sekali saat login), kalau ikut digate
  // jadi chicken-and-egg (tidak bisa login karena login butuh sudah login).
  // Auth REAL untuk endpoint API tetap di apps/api (`auth:true`/`permission`
  // macro), bukan di sini.
  if (pathname.startsWith("/api-proxy")) {
    return NextResponse.next();
  }

  const surface = getSurface(request.headers.get("host") ?? "");
  const isAuthPage = pathname === "/login" || pathname === "/register";

  if ((surface === "admin" || surface === "app") && !isAuthPage) {
    // getSessionCookie() CUMA cek keberadaan cookie (bukan validasi/DB) —
    // ini UX gate (redirect ke login lebih awal), BUKAN lapisan keamanan.
    // Permission/subscription check REAL tetap di apps/api (lib/permission.ts,
    // lib/subscription-gate.ts) — dicek ulang di server, tidak pernah
    // dipercaya dari sini.
    if (!getSessionCookie(request)) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.rewrite(new URL(`/${surface}${pathname}`, request.url));
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};
