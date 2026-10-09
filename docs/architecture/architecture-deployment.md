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

> **⚠️ Realita production (`facinstitute.id`, sebelumnya `ane.web.id`
> sampai Fase 112 — sudah decommission, § `docs/PROGRESS.md` Update
> 2026-09-12) BEDA dari deskripsi di atas** —
> VPS-nya SHARED (banyak project lain jalan bareng), reverse proxy
> SESUNGGUHNYA nginx yang sudah ada duluan, `caddy` service di
> `docker-compose.prod.yml` **tidak pernah dipakai nyata**. Untuk
> onboarding domain baru ke VPS yang sudah dipakai (skenario nyata kita),
> pakai **`docs/deployment-new-domain-onboarding.md`**, bukan asumsi
> Caddy di bagian ini.

Panduan one-time setup VPS **dari nol/dedicated** (install Docker, buka
firewall, arahkan domain, setup GitHub Secrets) → `docs/deployment-server-setup.md`.
Panduan nambah domain baru ke VPS **shared yang sudah dipakai** (kondisi
nyata kita) → `docs/deployment-new-domain-onboarding.md`. Keduanya runbook
manual, bukan bagian dari alur otomatis CI/CD.

**Host baru `media.<domain>` (Fase 12, ADR-0017)**: reverse proxy Caddy
langsung ke MinIO (`minio:9000`) — akses PUBLIK ke bucket `facport-public`
(logo/favicon company), TIDAK lewat `apps/api`. Bucket `facport-media`
(privat) TETAP aman diekspos lewat host yang sama karena MinIO sendiri yang
enforce akses per-bucket (private tetap butuh signature, Caddy cuma
reverse-proxy transparan). **WAJIB di-setup manual saat deploy** (di luar
alur CI/CD otomatis, sama seperti host lain):
1. DNS A record `media.<domain>` → IP VPS (§ `docs/deployment-server-setup.md`)
2. `Caddyfile` sudah include block-nya (root repo) — restart Caddy production
   setelah DNS resolve: `docker compose -f docker-compose.prod.yml restart caddy`
3. Env var `MINIO_PUBLIC_URL=https://media.<domain>` di `.env.production`
   (staging: `media-staging.<domain>`, § `.env.staging.example`)
4. Staging: service `minio` di `docker-compose.staging.yml` WAJIB ikut
   network `edge` (alias `minio-staging`) — SUDAH ditambahkan, beda dari
   production yang cukup network `internal` (Caddy production sudah satu
   network dengan MinIO production di compose project yang sama).

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
   (`wasugi@76.13.18.136`, path `/opt/facport`).

> ⚠️ **CEK WAJIB SEBELUM `pull` (§ lessons-learned.md 2026-09-12 & 2026-09-27,
> bug KELAS INI terjadi 2x dengan gejala identik sebelum akhirnya masuk
> checklist)**: file `docker-compose*.yml`/`Caddyfile`/config lain yang
> hidup LANGSUNG di server (`/opt/facport/*.yml`) adalah **COPY MANUAL**,
> **TIDAK auto-sync dari git** — beda dari kode `apps/api`/`apps/web` yang
> memang ter-bundle ke image lewat `Deploy` workflow. Kalau rilis ini
> MENGUBAH salah satu file itu (mis. ganti image MinIO, ubah `Caddyfile`,
> tambah service baru), file itu WAJIB di-update di server DULU (scp file
> utuh, atau `sed -i` untuk perubahan 1 baris kecil) SEBELUM
> `docker compose ... pull` — kalau kelewat, `pull`/`up -d` tetap jalan
> dengan config LAMA tanpa error yang jelas (atau, kasus image registry
> mati, error yang MEMBINGUNGKAN karena kelihatan seperti fix belum
> ke-deploy padahal sudah ada di repo).

### ★ STANDAR DEPLOY (divalidasi pada rilis v2.31.0 & v2.32.0, 2026-10-08/09) — langkah demi langkah
> Ini urutan BAKU yang dipakai sekarang. Satu perintah per pesan, user menempel hasil tiap langkah sebelum lanjut. Tidak ada rilis tanpa permintaan eksplisit user.

**Sisi Claude Code (sebelum user SSH)**
1. User minta rilis eksplisit ("rilis"). Pastikan `develop` bersih & ter-push. `git checkout main && git pull --ff-only origin main && git merge --no-ff develop -m "chore: rilis …" && git push origin main && git checkout develop`.
2. Pantau workflow `Release` (gate typecheck+test web & api → semantic-release memberi tag). Gagal di gate → perbaiki di `develop`, merge ulang ke `main` (kasus nyata: `mock.module("next/navigation")` di tes bocor lintas file → lengkapi ekspor mock, mis. `useSearchParams`).
3. Ambil tag baru (`git fetch --tags`), tunggu workflow `Deploy` job **`build-and-push` = success** (job `deploy-to-server` GAGAL = expected, secret SSH belum diisi). Jangan umumkan siap tarik hanya dari `gh release list`.
4. Cek apa yang berubah antar tag: `git diff --stat vLAMA vBARU -- 'docker-compose*' Caddyfile apps/api/src/lib/env.ts` (file ini COPY MANUAL di server — bila berubah, update di server DULU) dan daftar `apps/api/drizzle/*.sql` baru. Ada migrasi / worker berubah / ragu → **Full**.

**Sisi user (SSH ke `wasugi@76.13.18.136`)**
1. `ssh wasugi@76.13.18.136`
2. `cd /opt/facport`
3. Backup: `./scripts/backup-db.sh` → harus ada "Postgres dump … (N M)" + "Upload ke gdrive:backup-app/facport selesai" (peringatan `mc` MinIO diabaikan).
4. `export GITHUB_REPO="webaneid/facport" IMAGE_TAG="vX.Y.Z"`
5. `printf 'GITHUB_REPO=%s\nIMAGE_TAG=%s\n' "$GITHUB_REPO" "$IMAGE_TAG" > .env.deploy && cat .env.deploy` (harus 2 baris benar; `export` harus sudah dijalankan di sesi yang sama).
6. `docker compose -f docker-compose.prod.yml --env-file .env.production --env-file .env.deploy pull` (api & web `vX.Y.Z` ter-pull).
7. `docker compose -f docker-compose.prod.yml -f docker-compose.override.yml --env-file .env.production --env-file .env.deploy up -d api web worker minio postgres` (api Healthy; worker WAJIB ikut — job/mapping dipakai worker).
8. Migrasi: `docker compose -f docker-compose.prod.yml -f docker-compose.override.yml --env-file .env.production --env-file .env.deploy exec api bun run db:migrate` — output sering TERPOTONG; JANGAN percaya "sukses" saja, lanjut langkah 9.
9. **Verifikasi kolom/data hasil migrasi** (bukan cuma pesan sukses). Pola baku — satu `-c` dalam satu pasang tanda kutip ganda, `$` host di-escape: `docker compose -f docker-compose.prod.yml --env-file .env.production exec postgres sh -c "psql -U \$POSTGRES_USER -d \$POSTGRES_DB -c \"select …;\""`. Contoh: cek kolom di `information_schema.columns`, hitung baris backfill yang masih NULL. JANGAN pakai `$$…$$` (dikembang shell host).
10. `docker image prune -f && docker ps --format "table {{.Names}}\t{{.Status}}" && curl -s -o /dev/null -w "api health: %{http_code}\n" http://localhost:3001/health` → api & web `(healthy)`, worker `Up`, health 200. (Dari luar: `https://api.facinstitute.id/health`.)
11. Opsional: `docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail 40 worker` untuk memastikan job baru terdaftar tanpa galat.

**Setelah deploy**: catat versi & nama file backup di memori/dokumen status production; user menguji di browser production; laporan client hanya bila diminta.

**Jebakan yang pernah terjadi** — (a) Minimal dipilih padahal worker ikut berubah (2×, lihat lessons-learned 2026-09-09); (b) migrasi "sukses" tapi kolom tidak ada karena `when` entri `_journal.json` lebih kecil dari migrasi terakhir yang tercatat (lessons-learned 2026-10-09; JANGAN menggeser `when` manual — migrasi 0046 sudah kadung ber-`when` 2026-10-09 02:04 UTC, migrasi baru wajib > nilai 0047); (c) output paste terpotong; (d) heredoc/`sh -c` bersarang rapuh saat di-paste.

### Minimal — fix kecil, tanpa migration DB, tanpa ubah worker/queue
Cocok untuk: fix UI, pesan error/teks, perubahan 1 route tanpa skema baru.
```bash
ssh wasugi@76.13.18.136
cd /opt/facport
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
cd /opt/facport
export GITHUB_REPO="webaneid/facport"
export IMAGE_TAG="vX.Y.Z"
echo "GITHUB_REPO=$GITHUB_REPO" > .env.deploy
echo "IMAGE_TAG=$IMAGE_TAG" >> .env.deploy

docker compose -f docker-compose.prod.yml --env-file .env.production --env-file .env.deploy pull
docker compose -f docker-compose.prod.yml -f docker-compose.override.yml --env-file .env.production --env-file .env.deploy up -d api web worker minio postgres

# § ditemukan re-audit 2026-09-12 — runbook ini sudah lama ditandai "WAJIB
# kalau ada migration DB" TAPI TIDAK PERNAH benar-benar menyertakan
# perintah migrate-nya (cuma pull+up). Kalau rilis ini bawa migration baru
# (skema apps/api/drizzle/), container "api" yang baru naik TETAP jalan
# dengan skema LAMA sampai baris di bawah dijalankan. `docker compose exec`
# (bukan `docker exec <nama-container>`) supaya tidak perlu tahu nama
# container hasil auto-generate Compose.
docker compose -f docker-compose.prod.yml -f docker-compose.override.yml --env-file .env.production --env-file .env.deploy exec api bun run db:migrate

docker image prune -f
docker ps --format "table {{.Names}}\t{{.Status}}"
```
> **Catatan**: ada jeda singkat antara container `api` versi baru naik
> (`up -d`) dan migration selesai dijalankan (`exec ... db:migrate`) — pada
> jeda itu, kode BARU jalan di atas skema LAMA. Untuk migration yang
> menambah kolom/tabel baru (kasus paling umum di project ini) ini AMAN
> (kode lama tetap kompatibel, endpoint yang butuh skema baru simply belum
> dipakai user sampai deploy selesai) — TAPI kalau migration ke depan
> mengubah/menghapus kolom yang MASIH dipakai kode lama, jeda ini bisa
> bikin request gagal singkat. Belum ada kebutuhan zero-downtime migration
> di project ini sejauh sekarang — dicatat sebagai known limitation,
> revisit kalau skala production sudah butuh itu.

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
2. Buka domain publik (`https://app.facinstitute.id` dst) dan tes LANGSUNG fitur
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
