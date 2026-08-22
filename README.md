# Facport

> Jembatan otomatis impor data transaksi dari Excel ke Accurate Online,
> dikembangkan oleh FAC Institute — dari staf akuntansi/finance sampai
> pemilik bisnis pengguna Accurate Online.

## Untuk Manusia, Bukan untuk Claude
File ini onboarding singkat untuk developer (termasuk kamu sendiri, 6 bulan
dari sekarang, lupa detail project). Instruksi kerja untuk Claude Code ada di
`CLAUDE.md` (root) dan `docs/` — file itu format "instruksi ke AI", bukan
untuk dibaca casual oleh manusia baru.

## Quick Start
```bash
# 1. Install dependency
bun install

# 2. Setup environment
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# isi nilai di kedua file .env tersebut (lihat komentar di masing-masing)

# 3. Jalankan service pendukung (Postgres, MinIO) via Docker
docker compose -f docker-compose.dev.yml up -d   # [buat file ini kalau belum ada — compose khusus dev, beda dari docker-compose.prod.yml]

# 4. Migration database
bun run db:migrate

# 5. Jalankan dev server (api + web + worker)
bun run dev
```
- Web (landing): http://localhost:6209
- Web (admin): http://admin.localhost:6209
- Web (app/dashboard pelanggan): http://app.localhost:6209
- API: http://localhost:3001
- API docs (Swagger, dev only): http://localhost:3001/docs

> Port `6209` untuk `apps/web` itu keputusan tetap project ini (bukan
> default Next.js 3000) — lihat `docs/architecture/architecture-domain-routing.md`.

## Struktur Project
```
/apps
  /api    → backend Elysia/Bun
  /web    → frontend Next.js
/docs     → dokumentasi arsitektur lengkap (lihat di bawah)
/.claude  → konfigurasi Claude Code (skills, hooks, agents)
/scripts  → script operasional (backup, restore)
```

## Dokumentasi Lengkap
Semua keputusan arsitektur & alasannya ada di `docs/` — kalau bingung "kenapa
begini", cek di sana dulu sebelum tanya. Titik masuk yang berguna:
- `docs/architecture/architecture-overview.md` — gambaran sistem end-to-end
- `docs/architecture/architecture-accurate-integration.md` — integrasi inti ke Accurate Online (OAuth, bulk import)
- `docs/architecture/architecture-components.md` — index komponen reusable (editor, media library, dst)
- `docs/decisions/` — ADR (Architecture Decision Records), alasan tiap keputusan besar
- `docs/SOP.md` — alur kerja per fase
- `docs/deployment-server-setup.md` — cara deploy ke server

## Kontribusi
- Branch: `feat/{nama-fitur}`, `fix/{nama-bug}` → PR ke `develop` (bukan
  langsung `main`) — lihat `docs/conventions.md`.
- Commit message: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, dst).
- Sebelum PR: `bun run typecheck && bun run test && bun run lint`.

## Lisensi
Proprietary — FAC Institute. [Sesuaikan kalau ada keputusan lisensi lain.]
