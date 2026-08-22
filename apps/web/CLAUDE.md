# CLAUDE.md — apps/web (Next.js)

> File ini cuma ke-load Claude Code kalau lagi kerja di dalam apps/web/.

## Tanggung Jawab Folder Ini
Frontend — konsumsi API dari apps/api, render UI, tidak boleh akses DB/MinIO
langsung. **Satu aplikasi Next.js ini melayani 3 surface** (landing publik,
admin, dashboard pelanggan) dibedakan lewat subdomain — lihat
`docs/architecture/architecture-domain-routing.md` SEBELUM nambah
route/halaman baru, supaya tahu masuk folder `landing/`, `admin/`, atau `app/`.

## Struktur Folder
```
apps/web/
  proxy.ts              ← resolve Host header → surface (landing/admin/app); Next.js 16 rename dari middleware.ts (nama BEDA, perilaku sama) — lihat architecture-domain-routing.md. Skip guard-login untuk /api-proxy/*.
  lib/
    get-surface.ts      ← SATU sumber kebenaran resolusi surface dari host, jangan duplikasi logic ini
    api-client.ts        ← Eden Treaty client (type-safe, generate dari tipe apps/api), JANGAN fetch langsung di komponen
    auth-client.ts        ← Better Auth React client (sign-in/sign-up) — BEDA dari api-client.ts, tapi base-URL-nya pakai pola sama (lihat § Catatan Integrasi API)
  app/
    api-proxy/[...path]/route.ts  ← Route Handler, DEV SAJA — proxy panggilan browser→apps/api server-to-server (hindari cookie sesi lintas-situs di *.localhost). Lihat architecture-domain-routing.md & lessons-learned.md 2026-08-19.
    landing/             ← halaman publik: beranda, harga paket, daftar, login
    admin/                ← dashboard admin: kelola paket, kelola user, monitor koneksi Accurate semua pelanggan
    app/                   ← dashboard pelanggan: upload Excel, koneksi Accurate sendiri, riwayat import
  components/
  types/                ← type non-API-response (kalau ada), tipe response API IKUT dari Eden, jangan didefinisikan ulang manual
```

## Konvensi
- Semua request ke backend lewat `lib/api-client.ts` (Eden Treaty — lihat
  `docs/architecture/architecture-api.md` bagian "Type-Safety End-to-End"),
  BUKAN `fetch()` manual di komponen. `fetch()` manual kehilangan type-safety
  yang jadi alasan utama ADR-0001 memilih Elysia+Eden, dan gampang typo
  endpoint/response shape tanpa ketahuan sampai runtime.
- Server Components untuk data fetching awal, Client Components hanya untuk interaktivitas.
- Environment variable API base URL: `NEXT_PUBLIC_API_URL` (jangan hardcode URL backend).
- Gambar dari MinIO diakses via URL yang dikembalikan backend (presigned URL atau public bucket URL) — frontend TIDAK pernah bicara langsung ke MinIO.
- **Icon**: `lucide-react` saja — JANGAN icon font (Font Awesome dkk), dan
  jangan campur beberapa icon set berbeda dalam 1 project.
- **Styling**: Tailwind v4 primary. SCSS cuma untuk kasus yang benar-benar
  tidak bisa Tailwind (lihat `docs/decisions/adr-0004-ui-component-standards.md`).
- **Form**: `zod` + `react-hook-form` — standar untuk semua form, bukan
  validasi manual per form.
- **String UI**: project ini TIDAK pakai i18n (`next-intl`) — checklist
  Kebutuhan Komponen = Tidak, boleh hardcode teks Bahasa Indonesia langsung
  di JSX.
- **Dropdown/select**: pakai komponen `Combobox` standar (§
  `docs/architecture/components/architecture-component-autocomplete.md`),
  bukan `<select>` polos untuk pilihan >~10 opsi.
- **Notifikasi**: `sonner`, jangan bikin toast/alert custom per fitur.
- **Listing/tabel data**: `@tanstack/react-table` (shadcn data-table pattern),
  standar untuk semua halaman listing.

## Command Khusus Web
```bash
cd apps/web
bun run dev     # jalan di port 6209 (baku, lihat architecture-domain-routing.md), BUKAN default 3000
bun run build
bun run lint
```
Akses lokal: `http://localhost:6209` (landing), `http://admin.localhost:6209`
(admin), `http://app.localhost:6209` (app) — `*.localhost` otomatis resolve
ke `127.0.0.1` di browser modern, tidak perlu edit `/etc/hosts`.

## Catatan Integrasi API
- Base URL dev: `http://localhost:3001` — TAPI kode BROWSER (`lib/api-client.ts`,
  `lib/auth-client.ts`) TIDAK panggil ini langsung di dev, lewat proxy
  `${window.location.origin}/api-proxy` dulu (lihat `app/api-proxy/[...path]/route.ts`)
  — `.localhost` dianggap browser sebagai situs BERBEDA per subdomain,
  panggilan langsung ke `localhost:3001` bikin cookie sesi ditolak diam-diam
  (§ `docs/lessons-learned.md` 2026-08-19). SSR (Server Component) dan
  production TETAP panggil `NEXT_PUBLIC_API_URL` absolute langsung, TIDAK
  lewat proxy ini.
- Auth token: session cookie httpOnly (Better Auth) — lihat `docs/architecture/architecture-auth.md`.
  **Sesi TIDAK share otomatis antar surface saat dev** (`crossSubDomainCookies`
  dimatikan khusus dev, `Domain=.localhost` ditolak browser) — production
  tidak kena batasan ini.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
