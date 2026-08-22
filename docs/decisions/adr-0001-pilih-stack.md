# ADR-0001: Pemilihan Stack — Bun + Elysia + Next.js + PostgreSQL + MinIO

**Status:** Accepted
**Tanggal:** 2026-08-17

## Context
Facport (FAC Institute) butuh stack yang type-safe end-to-end dan cepat
dikembangkan — aplikasinya jembatan impor data Excel massal ke Accurate
Online, jadi backend perlu robust untuk proses bulk data + integrasi API
pihak ketiga (lihat ADR-0006), sementara frontend perlu dashboard yang
responsif untuk staf akuntansi. Keputusan stack ini melanjutkan arah yang
sudah terbukti jalan di project-project sebelumnya (Bun + ekosistem JS/TS),
bukan evaluasi dari nol.

## Decision
- **Runtime:** Bun
- **Backend API:** Elysia — dipilih atas Hono karena dioptimalkan native untuk Bun
  (bukan sekadar kompatibel), performa tertinggi, dan type-safety end-to-end lewat
  Eden (client generator dari Elysia routes).
- **Frontend:** Next.js — dipisah dari API (bukan pakai Next API routes), karena
  butuh backend independen yang bisa diakses klien lain di masa depan (mobile app, dll).
- **Database:** PostgreSQL + Drizzle ORM — Postgres untuk robustness relasional +
  dukungan JSONB; Drizzle karena ringan, type-safe, dan query builder-nya dekat SQL asli
  (selaras dengan filosofi performa Bun, dibanding Prisma yang lebih berat).
- **Object storage:** MinIO — S3-compatible, self-hosted, kontrol penuh atas data
  (relevan untuk data milik institusi/komunitas yang sensitif).

## Alternatif yang Dipertimbangkan
- **Hono** untuk backend — portable ke edge runtime, tapi performa mentah di Bun
  sedikit di bawah Elysia; ditolak karena project ini tidak butuh portability ke
  Cloudflare Workers/Deno dalam waktu dekat.
- **Next.js API routes sebagai backend** — ditolak karena menggabungkan frontend
  & backend mempersulit pemisahan concern dan reuse API oleh klien lain.
- **Prisma** sebagai ORM — ditolak karena overhead lebih besar dan codegen step
  tambahan, dibanding Drizzle yang lebih dekat ke SQL dan lebih cepat di runtime Bun.
- **MySQL** — ditolak, Postgres lebih kuat untuk kebutuhan relasional kompleks & JSONB.
- **AWS S3 langsung** — ditolak untuk versi awal karena preferensi self-hosted (MinIO),
  bisa direvisit lewat ADR baru kalau kebutuhan scale berubah.

## Konsekuensi
- Perlu setup monorepo (Bun workspaces) untuk apps/api dan apps/web.
- Tim harus terbiasa dengan TypeScript strict + Drizzle migration workflow.
- MinIO self-hosted berarti tim bertanggung jawab atas backup & availability storage
  sendiri (bukan diserahkan ke provider cloud).

## Supersedes
Menggantikan arah sebelumnya (PHP native / evaluasi Laravel) yang didokumentasikan
di project lama (AneWP) — project ini dianggap fresh start, bukan migrasi kode.
