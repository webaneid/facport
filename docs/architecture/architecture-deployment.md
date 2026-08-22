# Architecture — Deployment & Versioning

## Prinsip Utama
1. **Server production tidak pernah clone git repo mentah.** Server cuma
   `docker pull` image yang sudah jadi dari registry (GHCR). Image itu
   dibangun lewat multi-stage Dockerfile yang secara fisik tidak menyertakan
   `docs/`, `CLAUDE.md`, `.claude/`, atau `.md` lain.
2. **Versi ditentukan otomatis dari commit message**, bukan diketik manual.
   Naik dari `1.0.0` ke `1.0.0` cuma bisa lewat keputusan manual (lihat
   `docs/decisions/adr-0002-versioning-strategy.md`).
3. **Dua jalur deploy terpisah** — staging (`develop`, tanpa versi, preview
   terus-menerus) dan production (`main`, versioned semver). Lihat
   `docs/decisions/adr-0003-staging-environment.md` untuk rasionalnya.

## Dua Jalur — Staging vs Production
```
Feature branch
      │
      ▼ PR (ci.yml jalan: typecheck/lint/test/secret-scan)
   develop ─────────────────────────────┐
      │                                  │
      ▼ push                             │ PR (ci.yml jalan lagi)
deploy-staging.yml                       ▼
      │                                main
      ▼                                  │
  image tag "staging"                    ▼ push
  (ditimpa tiap push)              release.yml (semantic-release)
      │                                  │
      ▼                          ┌───────┴────────┐
  staging.namadomain.com    Tidak ada commit    Versi baru (v0.3.0, dst)
  (verifikasi manual)       layak rilis?              │
                             → berhenti                ▼
                                              deploy.yml → image versioned
                                              → production
```

## Alur End-to-End (Production)
```
Developer commit (feat:/fix:/dst)
        ↓
   push ke main
        ↓
.github/workflows/release.yml jalan
        ↓
semantic-release baca commit sejak tag terakhir
        ↓
  ┌─────────────────────────────────────┐
  │ Ada commit yang layak rilis?          │
  │  Tidak → berhenti, tidak ada apa-apa   │
  │  Ya → tentukan versi baru otomatis     │
  └─────────────────────────────────────┘
        ↓
Git tag dibuat (misal v0.3.0) + CHANGELOG.md diupdate
        ↓
GitHub Release dibuat otomatis (event: release published)
        ↓
.github/workflows/deploy.yml ke-trigger otomatis
        ↓
Docker image di-build (multi-stage, TANPA docs/.md) → push ke GHCR
        ↓
SSH ke server → docker pull versi baru → docker compose up -d
```

## Kenapa Docker Multi-Stage (bukan rsync/git pull langsung)
- **Isolasi total**: image production dibangun dari nol tiap kali, cuma
  berisi apa yang eksplisit di-`COPY --from=builder`. Nggak ada cara
  "kelupaan exclude satu file" seperti risiko di pendekatan rsync/exclude.
- **Reproducible**: image dengan tag versi tertentu (`api:v0.3.0`) selalu
  sama isinya, kapan pun di-pull. Rollback tinggal `docker pull api:v0.2.9`.
- **Verifikasi gampang**: `docker run --rm -it <image> ls -la` — kalau
  `docs/` atau `.md` muncul, berarti ada yang salah di Dockerfile, gampang
  dicek sebelum deploy beneran.

## Registry
Pakai **GHCR (GitHub Container Registry)** di contoh workflow — gratis untuk
public repo, terintegrasi langsung sama GitHub Actions tanpa setup credential
tambahan. Bisa diganti Docker Hub / registry lain kalau perlu.

## Setup Konkret (VPS Hostinger)
File `docker-compose.prod.yml` (production), `docker-compose.staging.yml`
(staging — service yang sama, tag image beda, jalan di VPS yang sama lewat
network `edge` yang di-share), `Caddyfile` (nangani domain production DAN
staging dalam satu proses), dan `.env.production.example`/`.env.staging.example`
sudah dibuat di root repo (services: api, web, postgres, minio, caddy sebagai
reverse proxy + HTTPS otomatis).

Panduan one-time setup VPS (install Docker, buka firewall, arahkan domain,
setup GitHub Secrets) → **`docs/deployment-server-setup.md`** — ini runbook
manual, dikerjakan sekali di awal (atau tiap ganti server), bukan bagian dari
alur otomatis CI/CD.

## Rollback
```bash
# Di server, langsung ganti ke versi sebelumnya
docker pull ghcr.io/[repo]/api:v0.2.9
docker compose up -d
```
Karena tiap versi punya image sendiri (bukan cuma `latest` yang ketimpa),
rollback tinggal ganti tag, tidak perlu rebuild ulang dari source.
