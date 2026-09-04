# ADR-0017: Bucket Publik Terpisah untuk Aset Branding (Logo/Favicon)

**Status:** Accepted
**Tanggal:** 2026-09-04

## Context
Sejak security review Fase 00 (`docs/lessons-learned.md` 2026-08-19), ada gap
terbuka: `POST /media/upload` cuma balikin `storageKey` mentah (path internal
MinIO), bucket `facport-media` **private**, dan tidak ada endpoint yang
menghasilkan URL yang bisa diakses browser (`<img src>`). Dicatat eksplisit
"WAJIB diselesaikan SEBELUM fitur pertama yang benar-benar nampilin gambar
dari MinIO ke user" (§ `architecture-storage.md`).

Logo & favicon company (Known Limitation eksplisit di
`docs/phases/phase-10-admin-dashboard.md`, "ditunda") adalah fitur pertama
itu — dan keduanya secara sifat memang **aset publik**: logo tampil di
landing page (tanpa login), favicon di-fetch browser di SEMUA halaman
termasuk yang belum login, dan favicon secara khusus butuh URL yang STABIL
(browser cache favicon lama, presigned URL yang expire tidak cocok).

Masalah tambahan: MinIO di production **tidak diekspos ke internet sama
sekali** (`docker-compose.prod.yml` — service `minio` cuma `networks:
[internal]`, `docs/deployment-server-setup.md` menegaskan port MinIO tidak
perlu dibuka publik). Jadi bucket public-read saja tidak cukup — perlu jalur
network sampai ke browser.

## Decision
- **Bucket MinIO baru `facport-public`** (public-read policy, `s3:GetObject`
  untuk semua principal PADA BUCKET INI SAJA), terpisah dari `facport-media`
  yang tetap private. Cuma dipakai untuk aset branding (logo, favicon) —
  bukan tempat umum untuk upload media lain.
- **Host baru `media.<domain>`** di Caddy, `reverse_proxy minio:9000` — pola
  identik dengan host `api.<domain>` yang sudah ada. MinIO sendiri tetap di
  network `internal` (tidak ekspos port baru ke host), Caddy yang sudah ada
  di network `internal` + `edge` yang jembatani ke publik.
- **Env var baru `MINIO_PUBLIC_URL`** — base URL yang bisa diakses BROWSER
  (dev: `http://localhost:9000`, prod: `https://media.<domain>`), BEDA dari
  `MINIO_ENDPOINT` (host internal Docker network, cuma bisa diakses server).
- **`settings.company.logo`/`company.favicon` menyimpan URL yang SUDAH
  di-resolve** (server yang construct pakai `MINIO_PUBLIC_URL`), bukan raw
  media ID/storageKey — frontend tinggal pakai langsung, tidak perlu tahu
  detail bucket/key.
- **`GET /settings/public`** (endpoint baru, TANPA guard auth) — expose
  HANYA key yang di-allowlist eksplisit di kode (`company.name`,
  `company.logo`, `company.favicon`), bukan semua row settings (ingat
  Critical finding Fase 00: `GET /settings` pernah bocor semua row tanpa
  guard sama sekali).
- **Favicon pipeline TERPISAH** dari Media Library umum (§
  `architecture-component-image-processing.md`) — generate 4 ukuran PNG
  (16/32/180/512), bukan WebP (demi transparansi & kompatibilitas browser
  lama), disimpan sebagai object `{ "16": url, "32": url, "180": url, "512": url }`
  di `settings.company.favicon` (bukan string tunggal).

## Alternatif yang Dipertimbangkan
- **Endpoint proxy `GET /media/:id` (stream dari bucket private)** — ditolak
  untuk kasus branding: favicon di-request browser di HAMPIR SETIAP page
  load, nambah beban API terus-menerus untuk sesuatu yang sifatnya publik
  dan jarang berubah; juga tidak menyelesaikan masalah "URL stabil untuk
  cache browser jangka panjang" senatural bucket public-read langsung.
- **Presigned URL** — ditolak untuk favicon/logo: presigned URL PUNYA
  expiry, sedangkan browser cache favicon dalam waktu lama — URL yang
  expired bikin favicon "hilang" tanpa peringatan.
- **Selesaikan gap storage secara UMUM sekalian** (proxy/presign untuk
  SEMUA media, bukan cuma branding) — ditolak untuk scope fase ini: belum
  ada fitur nyata lain yang butuh render media privat ke user, menyelesaikan
  gap general sekarang cuma nambah kompleksitas tanpa kebutuhan konkret.
  Tetap dicatat sebagai gap terbuka (§ Konsekuensi).

## Konsekuensi
- Gap "storage serving" di `architecture-storage.md` **RESOLVED khusus
  untuk kategori aset branding publik** — kategori media privat/sensitif
  lain (kalau ada fitur masa depan yang butuh) TETAP harus diputuskan
  terpisah (proxy vs presign), BUKAN otomatis ikut pola bucket public ini.
- Deployment bertambah 1 host baru (`media.<domain>`) yang perlu di-setup
  DNS-nya manual di server (sama seperti `api.<domain>` dkk, § `docs/deployment-server-setup.md`)
  — TIDAK di-deploy otomatis oleh Claude Code, cuma config-nya disiapkan
  (Caddyfile), apply manual oleh user sesuai SOP deploy manual project ini.
- Endpoint `GET /settings/public` WAJIB dijaga ketat allowlist-nya di kode —
  risiko kalau lupa: kebocoran data settings lain yang mungkin sensitif
  (retensi data, dst) ke publik tanpa auth sama sekali.

## Referensi
- Gap awal → `docs/lessons-learned.md` 2026-08-19, `docs/architecture/architecture-storage.md`
- Skema settings → `docs/architecture/architecture-settings.md`
- Favicon pipeline → `docs/architecture/components/architecture-component-image-processing.md`
- Phase doc → `docs/phases/phase-12-logo-favicon-branding.md`
