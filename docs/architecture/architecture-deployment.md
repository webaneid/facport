# Architecture — Deployment & Versioning

> **✅ Status 2026-08-22: `release.yml` TERVERIFIKASI beneran jalan**
> (bukan cuma teori di dokumen ini) — `v1.0.0` dan `v1.0.1` sudah terbit
> nyata di GitHub lewat proses otomatis penuh (push → CI → semantic-release
> → GitHub Release), setelah 5 bug infrastruktur diperbaiki di commit
> pertama project ini. Detail lengkap tiap bug + cara diagnosanya →
> `docs/lessons-learned.md` entri "Push pertama project — 5 bug CI/CD...".
>
> **⚠️ Status di atas CUMA soal `release.yml`, BUKAN `deploy.yml`** —
> ketauan 2026-08-27 kalau `deploy.yml` (build+push image ke GHCR, trigger
> via `release: published`) nol kali pernah jalan dari v1.0.0 s/d v1.0.2,
> karena event dari `GITHUB_TOKEN` bawaan tidak memicu workflow lain
> (anti-loop GitHub Actions). **✅ Status 2026-08-27: `deploy.yml`
> TERVERIFIKASI jalan sampai `build-and-push` sukses** (image `api`+`web`
> nyata ada di GHCR, tag `v1.0.10`) setelah 6 bug lagi diperbaiki (trigger
> workflow_run, lockfile, build script, tsconfig, cross-workspace type
> import, runtime Node vs Bun). `deploy-to-server` (SSH ke VPS) BELUM
> terverifikasi otomatis — masih nunggu secrets `SERVER_HOST`/
> `SERVER_USER`/`SERVER_SSH_KEY` diisi + first deploy manual (§
> `docs/deployment-server-setup.md`). Detail lengkap 6 bug →
> `docs/lessons-learned.md` entri "deploy.yml belum pernah jalan...".
> Baca dua entri itu SEBELUM ubah `ci.yml`/`release.yml`/`deploy.yml`/
> Dockerfile lagi, supaya tidak menemukan ulang masalah yang sama.

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

## Syarat Supaya `ci.yml`/`release.yml` Beneran Bisa Jalan
Ditemukan lewat push pertama project ini (2026-08-22) — bukan sekadar
teori, ini SYARAT NYATA yang kalau kelewat bikin workflow gagal:

1. **Migration Drizzle (`apps/api/drizzle/`) WAJIB ikut commit** — jangan
   di-`.gitignore`. Tanpa ini, CI/deploy tidak punya cara bikin skema
   database dari checkout fresh.
2. **Test suite butuh Postgres SUNGGUHAN** (bukan mock) — job `ci.yml`
   dan `release.yml` WAJIB punya `services: postgres:` (image resmi,
   health check `pg_isready`), plus env var `DATABASE_URL` yang nunjuk ke
   service itu.
3. **Urutan wajib SEBELUM `bun run test`**: migrate (`bun run db:migrate`)
   → **seed** (`bun run --cwd apps/api db:seed`) — banyak test bergantung
   ke role `admin`/`customer` yang di-seed, migration doang cuma bikin
   tabel kosong.
4. **Semua field required di `apps/api/src/lib/env.ts` butuh nilai** di
   job env — boleh dummy (Postgres service-nya fresh tiap run, tidak
   pernah persist data sungguhan), TAPI harus lolos validasi format
   (`BETTER_AUTH_SECRET`/`ACCURATE_TOKEN_ENCRYPTION_KEY` minimal 32
   karakter).
5. **Plugin `semantic-release`** yang disebut di `.releaserc.json`
   (`@semantic-release/changelog`, `git`, `github`, `commit-analyzer`,
   `release-notes-generator`) **WAJIB jadi devDependency project**, bukan
   cuma nama string di config — `bunx semantic-release` TIDAK
   auto-install plugin-nya.
6. **`conventional-changelog-conventionalcommits` PIN ke `^7`**, JANGAN
   pakai `latest` (v10+) — versi terbaru butuh `conventional-changelog-writer@9+`
   yang bentrok sama versi lama yang di-bawa `@semantic-release/release-notes-generator`.

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

## Deploy Manual ke Server (status saat ini — CI SSH belum aktif)
> Selama secret `SERVER_HOST`/`SERVER_USER`/`SERVER_SSH_KEY` belum diisi di
> GitHub Actions (`gh secret list` kosong, diverifikasi lagi 2026-08-31 —
> lihat `docs/lessons-learned.md` entri 2026-08-28), job `deploy-to-server`
> di `deploy.yml` SELALU gagal (`error: missing server host`). Ini
> **expected**, bukan bug baru tiap kali kejadian — `release` +
> `build-and-push` tetap jalan otomatis penuh (image `vX.Y.Z` sampai ke
> GHCR), cuma langkah SSH ke VPS yang harus manual. Runbook ini SATU-SATUNYA
> referensi dipakai supaya tiap sesi kasih tutorial yang sama persis —
> jangan improvisasi ulang dari nol tiap ditanya.

**Pembagian tugas baku:**
1. **Claude Code** — commit, push ke `main`, pantau run `Release` (gate
   typecheck+test → semantic-release tag versi baru) lalu run `Deploy`
   (`build-and-push` image ke GHCR; job `deploy-to-server` dibiarkan gagal,
   itu memang belum dipakai). Ambil `IMAGE_TAG` (versi baru) dari situ.
2. **User** — jalankan salah satu runbook di bawah via SSH ke VPS
   (`wasugi@76.13.18.136`, path `/opt/app`).

### Minimal — fix kecil, tanpa migration DB, tanpa ubah worker/queue
Cocok untuk: fix UI, pesan error/teks, perubahan 1 route tanpa skema baru.
```bash
ssh wasugi@76.13.18.136
cd /opt/app
export GITHUB_REPO="webaneid/facport"
export IMAGE_TAG="vX.Y.Z"   # ganti sesuai versi rilis terbaru
echo "GITHUB_REPO=$GITHUB_REPO" > .env.deploy
echo "IMAGE_TAG=$IMAGE_TAG" >> .env.deploy

docker compose -f docker-compose.prod.yml --env-file .env.production --env-file .env.deploy pull api web
docker compose -f docker-compose.prod.yml -f docker-compose.override.yml --env-file .env.production --env-file .env.deploy up -d api web
```

### Full — default kalau ragu; WAJIB kalau ada migration DB, perubahan worker/job, atau rilis besar
```bash
ssh wasugi@76.13.18.136
cd /opt/app
export GITHUB_REPO="webaneid/facport"
export IMAGE_TAG="vX.Y.Z"
echo "GITHUB_REPO=$GITHUB_REPO" > .env.deploy
echo "IMAGE_TAG=$IMAGE_TAG" >> .env.deploy

docker compose -f docker-compose.prod.yml --env-file .env.production --env-file .env.deploy pull
docker compose -f docker-compose.prod.yml -f docker-compose.override.yml --env-file .env.production --env-file .env.deploy up -d api web worker minio postgres
docker image prune -f
docker ps --format "table {{.Names}}\t{{.Status}}"
```

**Aturan wajib (§ `docs/lessons-learned.md` 2026-08-28 & 2026-08-31), berlaku kedua varian:**
- **SELALU** sebut KEDUA `-f` (`docker-compose.prod.yml` DAN
  `docker-compose.override.yml`) di command `up -d` — Compose cuma
  auto-merge override kalau file utama namanya default
  (`docker-compose.yml`); begitu `-f` dipakai eksplisit, override HARUS
  ikut disebut eksplisit juga. Kelewat → container naik TANPA port mapping
  ke nginx, 502 diam-diam sampai ketahuan.
- **JANGAN** `up -d` tanpa daftar service eksplisit — VPS ini pakai nginx
  existing (bukan `caddy`), network eksternal `edge` yang dibutuhkan
  service `caddy` sengaja tidak pernah dibuat di sini, jadi bare `up -d`
  SELALU gagal validasi network sampai kapan pun. Sebut service eksplisit,
  skip `caddy`.

### Verifikasi setelah deploy (WAJIB, jangan skip)
1. `docker ps --format "table {{.Names}}\t{{.Status}}"` — service yang
   di-deploy harus `healthy`/`Up` dengan waktu restart baru saja.
2. Buka domain publik (`https://app.ane.web.id` dst) dan tes LANGSUNG fitur
   yang baru di-deploy — jangan cuma percaya status container (healthcheck
   internal container bisa OK walau port EXTERNAL tidak ke-mapping sama
   sekali).

## Rollback
Manual (sama seperti di atas), ganti `IMAGE_TAG` ke versi sebelumnya (lihat
`git tag` untuk daftar versi), lalu ulangi runbook **Full** di atas.
```bash
# Di server, langsung ganti ke versi sebelumnya
docker pull ghcr.io/[repo]/api:v0.2.9
docker compose up -d
```
Karena tiap versi punya image sendiri (bukan cuma `latest` yang ketimpa),
rollback tinggal ganti tag, tidak perlu rebuild ulang dari source.
