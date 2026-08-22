# Architecture Overview

## Komponen
```
┌─────────────┐      REST/JSON      ┌──────────────┐
│  apps/web   │ ───────────────────▶│  apps/api     │
│  Next.js    │◀─────────────────── │  Elysia/Bun   │
└─────────────┘                     └──────┬────────┘
                                            │
                ┌───────────────┬───────────┼───────────────┐
                ▼                ▼                           ▼
        ┌───────────────┐ ┌─────────────────┐   ┌─────────────────────┐
        │  PostgreSQL   │ │     MinIO        │   │  Accurate Online API │
        │  (via Drizzle)│ │ (gambar/file)    │   │  (OAuth + bulk import)│
        └───────────────┘ └─────────────────┘   └─────────────────────┘
```
Accurate Online adalah dependency eksternal INTI (bukan integrasi tambahan)
— seluruh fungsi Facport (impor Excel → transaksi Accurate) bergantung
padanya. Detail lengkap → `docs/architecture/architecture-accurate-integration.md`.

## Prinsip
- Frontend TIDAK PERNAH akses database, MinIO, atau Accurate API langsung —
  selalu lewat apps/api.
- API adalah satu-satunya source of truth untuk business logic & validasi.
- Upload file: frontend → API (atau presigned URL dari API langsung ke MinIO, hemat bandwidth server — pilih salah satu, dokumentasikan di architecture-storage.md).

## Environment
| Env         | Web (3 surface)                                                | API URL         | DB                     | MinIO                |
|-------------|-------------------------------------------------------------------|-------------------|--------------------------|------------------------|
| Development | `localhost:6209` (landing), `admin.localhost:6209`, `app.localhost:6209` | `localhost:3001` | local Postgres/Docker    | local MinIO/Docker      |
| Production  | `facport.com`, `admin.facport.com`, `app.facport.com` (contoh, belum final) | `api.facport.com` | [isi]                    | [isi]                   |

> Detail 3 surface (landing/admin/app) & subdomain routing →
> `docs/architecture/architecture-domain-routing.md`. Detail tiap komponen
> lain ada di file architecture-*.md lain di folder ini.
