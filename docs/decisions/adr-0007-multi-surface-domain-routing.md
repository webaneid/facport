# ADR-0007: Arsitektur Multi-Surface (Landing / Admin / App) via Subdomain

**Status:** Accepted
**Tanggal:** 2026-08-19

## Context
Facport punya tiga audiens yang jelas berbeda kebutuhan UI & aksesnya:
1. **Pengunjung publik** — lihat landing page, fitur, harga paket, daftar/login.
2. **Tim internal FAC Institute (admin)** — kelola paket langganan, kelola
   user, monitor status koneksi Accurate semua pelanggan, dst.
3. **Pelanggan yang sudah berlangganan** — dashboard untuk upload Excel,
   kelola koneksi Accurate mereka sendiri, lihat riwayat import.

User menetapkan pola akses: domain utama untuk landing (`facport.com`),
`admin.facport.com` untuk dashboard admin, `app.facport.com` untuk dashboard
pelanggan (lihat `docs/architecture/architecture-domain-routing.md` untuk
detail teknis).

**Beda penting dari `architecture-tenancy-domain-routing.md` (dihapus di
project-init)**: pola itu didesain untuk SaaS multi-tenant (banyak organisasi
klien berbeda, masing-masing butuh isolasi). Facport **bukan** multi-tenant
— cuma ada SATU tim admin (FAC Institute) dan SATU pool pelanggan yang
berbagi instance yang sama (mereka tidak saling melihat data satu sama
lain lewat mekanisme RBAC/ownership biasa, bukan lewat isolasi tenant
terpisah). Jadi pola di ADR ini jauh lebih sederhana — tidak perlu dua
sistem auth terpisah, tidak perlu resolusi slug tenant dari Host header.

## Decision
> Catatan (2026-08-19, saat verifikasi Next.js 16 di Fase 00): file
> convention "middleware" yang disebut di bawah sekarang bernama `proxy.ts`
> (Next.js 16 rename `middleware.ts`→`proxy.ts`, perilaku sama) — detail
> teknis terkini ada di `docs/architecture/architecture-domain-routing.md`,
> ADR ini TIDAK diedit lebih lanjut karena keputusan intinya tidak berubah.
- **Satu aplikasi Next.js** (`apps/web`) melayani ketiga surface, dibedakan
  lewat **Host header di middleware (`proxy.ts` di Next.js 16+)** — bukan
  tiga aplikasi Next.js terpisah.
- **Satu backend auth** (Better Auth, lihat `architecture-auth.md`) untuk
  admin maupun pelanggan — dibedakan lewat **role RBAC** (`admin`/`staff` vs
  `customer`), BUKAN dua sistem auth/cookie terpisah. Ini aman di sini
  (beda dari kasus multi-tenant) karena tidak ada risiko "admin tenant A
  eskalasi jadi admin tenant B" — cuma ada satu tim admin.
- Middleware me-resolve host → tentukan surface mana yang di-render, DAN
  cek guard sesuai: `admin.facport.com` WAJIB role admin/staff,
  `app.facport.com` WAJIB user login + subscription aktif (§
  `architecture-subscription.md`), root domain publik tanpa guard.
- **Local dev**: pakai `*.localhost` (browser modern resolve otomatis ke
  `127.0.0.1` tanpa edit `/etc/hosts`) di port **6209** (baku, lihat §
  "Port Konvensi" di bawah) — `http://localhost:6209` (landing),
  `http://admin.localhost:6209` (admin), `http://app.localhost:6209` (app).

## Port Konvensi (Baku)
Dev server `apps/web` jalan di **port 6209** (bukan default 3000 Next.js) —
ini keputusan tetap project ini, dicatat supaya tidak berubah-ubah antar
sesi. `apps/api` tetap di port 3001 (tidak disebutkan berubah).

## Alternatif yang Dipertimbangkan
- **Tiga aplikasi Next.js terpisah** (landing/admin/app masing-masing deploy
  sendiri) — lebih terisolasi tapi 3x kompleksitas build/deploy/CI untuk
  project skala ini. Ditolak untuk tahap awal, bisa direvisit kalau salah
  satu surface butuh scaling/rilis independen.
- **Path-based** (`/admin`, `/app` bukan subdomain) — ditolak, user secara
  eksplisit mau pemisahan subdomain (UX lebih jelas, dan memudahkan nanti
  kalau admin/app perlu policy cookie/CSP berbeda dari landing publik).
- **Dua sistem auth terpisah** (pola `architecture-tenancy-domain-routing.md`
  yang dihapus) — ditolak, over-engineered untuk kasus single-admin-team,
  cukup RBAC di satu sistem auth (§ `architecture-auth.md`).

## Konsekuensi
- `Caddyfile` butuh 3 blok host (root, `admin.`, `app.`) semua reverse-proxy
  ke container `web` yang sama — detail di `docs/architecture-deployment.md`
  dan `Caddyfile`.
- `apps/web/middleware.ts` WAJIB resolve Host header sebagai satu-satunya
  sumber kebenaran surface mana yang aktif — jangan duplikasi logic ini di
  banyak file (sama prinsipnya dengan `isOwnHost()` di pola tenancy yang
  dihapus, walau lebih sederhana di sini).
- Guard per-surface (admin vs app) WAJIB dicek di middleware DAN dicek ulang
  di service layer (defense in depth, § `architecture-security.md`) — role
  admin yang somehow buka `app.facport.com` tetap harus lolos guard yang
  benar (atau memang boleh, tergantung keputusan produk — default: admin
  BOLEH akses app juga untuk keperluan support, dicatat di
  `architecture-domain-routing.md`).

## Referensi
- Detail teknis (middleware, guard, contoh kode) → `docs/architecture/architecture-domain-routing.md`
- Auth & RBAC → `docs/architecture/architecture-auth.md`
- Gating akses modul berdasar langganan → `docs/architecture/architecture-subscription.md`
