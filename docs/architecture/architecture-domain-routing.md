# Architecture — Domain Routing (Landing / Admin / App)

> Rasional keputusan → `docs/decisions/adr-0007-multi-surface-domain-routing.md`.
> File ini pelengkap teknis (proxy, guard, contoh kode).

## Tiga Surface

| Surface | Domain (production) | Domain (local dev) | Siapa | Auth |
|---|---|---|---|---|
| Landing (publik) | `facport.com` | `localhost:6209` | Pengunjung umum | Tidak ada |
| Admin | `admin.facport.com` | `admin.localhost:6209` | Tim internal FAC Institute | Better Auth, role `admin`/`staff` |
| App (dashboard pelanggan) | `app.facport.com` | `app.localhost:6209` | Pelanggan berlangganan | Better Auth, role `customer` + subscription aktif |

> Domain production (`facport.com`) masih **contoh/belum final** — sampai
> domain asli dikonfirmasi & dibeli, ini placeholder yang dipakai konsisten
> di seluruh dokumentasi. Ganti semua kemunculan begitu domain final.

## Port Konvensi (Baku, Local Dev)
`apps/web` dev server jalan di **port 6209** (bukan default 3000) —
`bun run dev` (di `apps/web`) WAJIB start di port ini:
```json
// apps/web/package.json
{ "scripts": { "dev": "next dev -p 6209" } }
```
`*.localhost` di-resolve otomatis oleh browser modern & OS ke `127.0.0.1`
tanpa perlu edit `/etc/hosts` — cukup ketik `http://app.localhost:6209` dst
langsung di browser.

> **6209 itu khusus local dev**, bukan port container production. Di Docker
> (`docker-compose.prod.yml`/`docker-compose.staging.yml`), `web` tetap
> listen di port 3000 default Next.js — Caddy yang reverse-proxy tiga host
> (`facport.com`, `admin.facport.com`, `app.facport.com`) ke container
> `web:3000` yang SAMA (lihat `Caddyfile`). Port 6209 tidak perlu disentuh
> di konfigurasi Docker/Caddy sama sekali.

## `getSurface()` — Satu Sumber Kebenaran

```ts
// apps/web/lib/get-surface.ts
export type Surface = "landing" | "admin" | "app";

export function getSurface(host: string): Surface {
  const h = host.replace(/:\d+$/, "").toLowerCase(); // buang port kalau ada (local dev)
  if (h.startsWith("admin.")) return "admin";
  if (h.startsWith("app.")) return "app";
  return "landing"; // root domain, subdomain lain (mis. landing/frontend.*), www, atau localhost polos
}
```
**WAJIB dipanggil dari SATU fungsi ini**, jangan hitung ulang host-matching
di banyak file (sama prinsipnya dengan kelas bug duplikasi logic host-check
yang didokumentasikan di pola tenancy sebelumnya — walau di sini jauh lebih
sederhana karena cuma 3 host tetap, bukan slug tenant dinamis).

## Proxy (Next.js)

> **Next.js 16 mengganti nama `middleware.ts`/`middleware()` jadi
> `proxy.ts`/`proxy()`** (file convention lama dihapus/deprecated, bukan
> cuma alias) — perilaku & posisi eksekusinya sama persis, cuma nama file
> & fungsi yang berubah. Kalau ternyata versi Next.js yang benar-benar
> ke-install nanti sudah lebih baru lagi dan konvensinya berubah lagi,
> verifikasi ulang ke `node_modules/next/dist/docs/` sebelum implementasi
> — JANGAN asumsikan `middleware.ts` otomatis benar.

> ⚠️ **Proxy CUMA cek keberadaan session cookie** (`getSessionCookie()`,
> existence-only — TANPA query DB), bukan role. Ini SENGAJA (rekomendasi
> resmi Better Auth: proxy/middleware bukan tempat query DB berat) — di
> **production**, ini berarti customer dengan session valid TETAP lolos
> guard proxy ke surface `admin` (cookie session sama valid di semua
> subdomain karena `crossSubDomainCookies`, aktif di production). **Role
> check SEBENARNYA terjadi di layout**, lihat § "Role Check Admin —
> Layout, Bukan Proxy" di bawah — ini ketemu sebagai Medium finding di
> security review Fase 01 & sudah diperbaiki, JANGAN kembalikan ke asumsi
> "proxy sudah cukup mem-verifikasi role". Catatan: skenario INI TIDAK
> BISA direplikasi di dev `.localhost` (lihat poin berikut — cross-subdomain
> cookie sharing dimatikan di dev), jadi verifikasi ulang temuan ini WAJIB
> lewat staging/production dengan domain asli, bukan dev lokal.
>
> ⚠️ **Dev pakai proxy Route Handler (`/api-proxy/[...path]`) + cross-subdomain
> cookie DIMATIKAN di dev** — dua bug TERPISAH ditemukan lewat evaluasi UI
> browser sungguhan, dua-duanya WAJIB diperbaiki:
> 1. `app.localhost:6209` dan `localhost:3001` (apps/api) dianggap browser
>    sebagai SITUS BERBEDA (`.localhost` bukan domain terdaftar asli) —
>    semua panggilan `apps/web`→`apps/api` langsung dari browser jadi
>    "lintas-situs". Fix: `apps/web/app/api-proxy/[...path]/route.ts`
>    (Route Handler manual — BUKAN `next.config.ts` `rewrites()`, yang
>    terbukti tidak meneruskan `Set-Cookie`) proxy semua panggilan lewat
>    origin `apps/web` sendiri saat dev. `lib/api-client.ts`/`lib/auth-client.ts`
>    pakai base URL `${window.location.origin}/api-proxy` (Eden) di browser
>    dev, absolute `NEXT_PUBLIC_API_URL` di SSR/production.
> 2. `Domain=.localhost` (atribut broadening `crossSubDomainCookies`)
>    DITOLAK DIAM-DIAM oleh browser — `localhost` diperlakukan mirip
>    "public suffix" (sama seperti `Domain=.com` juga ditolak). Fix:
>    `apps/api/src/lib/auth.ts` — `crossSubDomainCookies.enabled` jadi
>    `process.env.NODE_ENV === "production"` (mati total di dev).
>    **Konsekuensi**: sesi TIDAK share otomatis antar
>    `app.localhost`/`admin.localhost` di dev (beda dari production) — login
>    terpisah per surface kalau testing manual lintas-surface di dev.
>
> Detail lengkap (termasuk 3 percobaan fix yang salah arah sebelum ketemu
> ini) → `docs/lessons-learned.md` 2026-08-19.

```ts
// apps/web/proxy.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { getSurface } from "./lib/get-surface";

export function proxy(request: NextRequest) {
  const surface = getSurface(request.headers.get("host") ?? "");
  const { pathname } = request.nextUrl;
  const isAuthPage = pathname === "/login" || pathname === "/register";

  if ((surface === "admin" || surface === "app") && !isAuthPage) {
    if (!getSessionCookie(request)) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.rewrite(new URL(`/${surface}${pathname}`, request.url));
}

export const config = { matcher: ["/((?!_next|favicon.ico).*)"] };
```
Struktur route Next.js App Router mengikuti rewrite di atas — `admin/`
dipecah jadi route group `(protected)` supaya `/admin/login` TIDAK ikut
kena role-check layout (cegah redirect loop):
```
apps/web/app/
  landing/     ← halaman publik (beranda, harga paket, daftar, login)
  admin/
    login/       ← DI LUAR (protected), tidak kena role-check
    (protected)/
      layout.tsx   ← role check (§ di bawah)
      page.tsx      ← dashboard admin (kelola paket, kelola user, monitor)
  app/         ← dashboard pelanggan (upload Excel, koneksi Accurate, dst)
```

## Role Check Admin — Layout, Bukan Proxy
```ts
// apps/web/app/admin/(protected)/layout.tsx — Server Component
import { redirect } from "next/navigation";
import { headers } from "next/headers";

export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const cookie = (await headers()).get("cookie") ?? "";

  const res = await fetch(`${apiUrl}/me`, { headers: { cookie }, cache: "no-store" });
  if (!res.ok) redirect("/login");

  const me = (await res.json()) as { roles: string[] };
  if (!me.roles.includes("admin")) redirect("/login");

  return <>{children}</>;
}
```
`GET /me` (`apps/api`) return `{ id, email, name, roles: string[] }` — query
DB beneran (role user via `user_roles`/`roles`), aman dipanggil dari Server
Component (jalan tiap request, sekali per navigasi ke halaman admin, BUKAN
tiap request proxy). Diverifikasi manual: customer dengan cookie session
valid tetap di-redirect ke `/login` walau lolos proxy.

## Guard Admin ↔ App — Boleh Saling Akses?
**Keputusan default**: admin (role `admin`/`staff`) BOLEH login ke
`app.facport.com` juga (untuk keperluan support/debug langsung dari sisi
pelanggan), tapi **TIDAK sebaliknya** — customer biasa TIDAK BOLEH akses
`admin.facport.com` sama sekali, walau ke halaman login-nya sendiri boleh
tampil (tapi gagal auth kalau role bukan admin/staff). Ini dicek di service
layer (bukan cuma proxy) — sejalan dengan prinsip defense-in-depth §
`architecture-security.md`.

## Kenapa TIDAK Perlu Dua Sistem Auth Terpisah (Beda dari Pola Multi-Tenant)
Pola multi-tenant klasik (yang sempat ada di template ini sebagai
`architecture-tenancy-domain-routing.md`, dihapus karena Facport bukan
multi-tenant) mewajibkan dua sistem auth/cookie TERPISAH total untuk admin
platform vs admin tenant — supaya "admin tenant A" tidak pernah bisa
eskalasi jadi "admin tenant B" atau "admin platform" lewat celah flag
boolean yang lupa dicek satu tempat.

**Facport tidak punya risiko itu** — cuma ada SATU tim admin (bukan admin
per-tenant), jadi satu sistem Better Auth + RBAC role (`admin`/`staff` vs
`customer`) sudah cukup aman, selama guard permission dicek konsisten di
proxy DAN service layer (§ `architecture-auth.md`).

## Referensi
- Rasional keputusan → `docs/decisions/adr-0007-multi-surface-domain-routing.md`
- Auth & RBAC → `docs/architecture/architecture-auth.md`
- Deploy (Caddyfile 3 host block) → `docs/architecture/architecture-deployment.md`
- Gating akses modul via subscription → `docs/architecture/architecture-subscription.md`
