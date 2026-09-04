# Fase 12 — Logo & Favicon Company (Aset Branding Publik)

**Status:** Done
**Mulai:** 2026-09-04
**Selesai:** 2026-09-04

## Tujuan
`docs/phases/phase-10-admin-dashboard.md` sengaja menunda upload logo/favicon
company karena butuh menyelesaikan dulu gap "penyajian gambar dari MinIO ke
browser" yang ditandai sejak security review Fase 00 (`docs/lessons-learned.md`
2026-08-19) sebagai blocker WAJIB diselesaikan sebelum fitur pertama yang
benar-benar menampilkan gambar dari MinIO ke user. Fase ini menyelesaikan
gap tersebut KHUSUS untuk kategori aset branding publik (§ ADR-0017), lalu
membangun fitur upload logo & favicon company yang tampil di dashboard admin,
dashboard pelanggan, dan sebagai favicon di 3 surface.

## Scope
- [x] ADR-0017 (sudah ditulis di Langkah 1)
- [x] `lib/minio.ts`: bucket `facport-public` + `ensurePublicBucket()` (buat
      bucket + set policy public-read)
- [x] `lib/env.ts`: env var `MINIO_PUBLIC_URL`
- [x] `services/image-processing.service.ts`: `generateFaviconSizes()`
- [x] Endpoint `POST /admin/branding/logo`
- [x] Endpoint `POST /admin/branding/favicon`
- [x] Endpoint `GET /settings/public` (tanpa auth, allowlist ketat)
- [x] UI upload Logo & Favicon di `/admin/settings`
- [x] AppShell admin & app dashboard render logo (fallback teks kalau kosong)
- [x] Favicon dinamis di 3 surface (landing/admin/app) via `generateMetadata`
      (1 root layout melayani ketiganya, § `apps/web/app/layout.tsx`)
- [x] `Caddyfile`: host baru `media.<domain>` (prod + staging)
- [x] Cek network `docker-compose.prod.yml`/`docker-compose.staging.yml`
      (Caddy ↔ MinIO reachability) — prod TIDAK perlu perubahan (Caddy &
      MinIO sudah 1 network `internal`), staging PERLU tambah `minio` ke
      network `edge` (alias `minio-staging`)
- [x] Update `architecture-deployment.md` (host baru perlu DNS manual)
- [x] Update `architecture-storage.md`, `architecture-settings.md`,
      `architecture-component-image-processing.md`, `lessons-learned.md`,
      `phase-10-admin-dashboard.md` (sudah dikerjakan Langkah 1)
- [x] Fix Medium finding security review: `PUT /settings` blokir
      `company.logo`/`company.favicon` (§ `lessons-learned.md` 2026-09-04)

## Referensi
- Architecture doc: `docs/architecture/architecture-storage.md`,
  `docs/architecture/architecture-settings.md`
- ADR: `docs/decisions/adr-0017-branding-public-bucket.md`

## Keputusan Kecil Selama Eksekusi
- Favicon disimpan sebagai object `{16,32,180,512}` di `media.variants`
  (kolom yang sudah ada, awalnya buat variant Media Library umum) — dedupe
  daripada bikin kolom/tabel baru untuk "1 upload banyak turunan", pola
  yang sama persis.
- `PUT /settings` generik memblokir TOTAL 2 key branding (bukan validasi
  bentuk parsial) — lebih sederhana & robust daripada duplikasi validasi
  "harus URL/harus object 4 key" di 2 tempat (upload endpoint DAN endpoint
  generik), satu-satunya jalur tulis tetap `branding.route.ts` (§ fix
  Medium finding di atas).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review dijalankan (subagent `security-auditor` — file berubah
      >3-4, sesuai `docs/WORKFLOW-MODES.md`)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — 0
      Critical/High ditemukan
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda —
      1 Medium DIPERBAIKI langsung (bukan ditunda), 1 Low dicatat
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Upload logo/favicon **belum diuji end-to-end lewat browser sungguhan**
  (MinIO dev tidak jalan di lingkungan eksekusi sesi ini — Docker tidak
  tersedia). Sudah diverifikasi: typecheck nol error, `env.ts` menerima
  `MINIO_PUBLIC_URL` dengan benar, security review kode. **BELUM**
  diverifikasi: upload asli sungguhan tersimpan ke bucket, URL hasil
  benar-benar bisa diakses browser, favicon benar-benar tampil di tab
  browser. **Rekomendasi: user coba manual** (`docker compose -f
  docker-compose.dev.yml up -d && bun run dev`, buka `/admin/settings`,
  upload logo/favicon, cek tab browser & sidebar admin/app).
- Host `media.<domain>`/`media-staging.<domain>` di Caddyfile & DNS BELUM
  di-apply ke server manapun (staging/production) — cuma config-nya
  disiapkan di repo, TIDAK di-deploy oleh Claude Code (§ ADR-0017,
  konsisten dengan kebijakan deploy manual project ini). Sebelum branding
  bisa dipakai di staging/production, WAJIB dikerjakan manual sesuai
  `docs/architecture/architecture-deployment.md` § "Host Baru media.<domain>"
  dan `docs/deployment-server-setup.md`.
- Landing page (`apps/web/app/landing/page.tsx`) belum diverifikasi
  benar-benar RENDER `company.logo` (fase ini fokus ke favicon global +
  logo di AppShell admin/app; landing page tidak disebut eksplisit di
  scope awal user, jadi belum disentuh) — kalau user mau logo tampil juga
  di landing, itu perubahan kecil terpisah (pakai `getPublicSettings()`
  yang sudah ada).
- Gap storage untuk media PRIVAT (`facport-media`, `POST /media/upload`)
  TETAP terbuka — di luar scope fase ini (§ ADR-0017 "Alternatif yang
  Dipertimbangkan").
- `settings.update` di data production belum dicek manual cuma di-assign
  ke role admin/super-admin (§ Low finding, `docs/lessons-learned.md`
  2026-09-04) — bukan blocker, tapi disarankan dicek.

## Ringkasan Hasil (isi pas fase Done)
Gap storage MinIO (private bucket tanpa cara serving ke browser, ditandai
sejak security review Fase 00) diselesaikan KHUSUS untuk kategori aset
branding publik lewat bucket kedua `facport-public` (public-read) + host
Caddy baru `media.<domain>` (§ ADR-0017). Admin sekarang bisa upload logo
& favicon company dari `/admin/settings` — logo tampil di sidebar dashboard
admin & pelanggan (fallback wordmark "Facport" kalau belum diisi), favicon
tampil di tab browser di SEMUA surface (landing/admin/app, lewat 1 root
layout yang sama). Favicon di-generate 4 ukuran PNG (16/32/180/512) via
pipeline `generateFaviconSizes()` yang terpisah dari Media Library umum.

Endpoint baru: `POST /admin/branding/logo`, `POST /admin/branding/favicon`,
`GET /settings/public` (publik, allowlist ketat). Security review (subagent
`security-auditor`): 0 Critical/High, 1 Medium (DIPERBAIKI — `PUT /settings`
sekarang blokir override manual `company.logo`/`company.favicon` di luar
pipeline upload), 1 Low (dicatat, perlu cek manual assignment permission
production).

Typecheck nol error. **Belum diverifikasi end-to-end lewat browser**
(lingkungan eksekusi tidak punya Docker/MinIO jalan) — lihat Known
Limitations. **Infra (Caddyfile host baru, DNS, `MINIO_PUBLIC_URL` di
server) belum di-deploy** — sesuai kebijakan deploy manual project ini,
menunggu user apply manual + verifikasi di staging dulu sebelum production
(§ `docs/SOP.md` "Staging — Gerbang Sebelum Production", perubahan
Caddyfile/docker-compose masuk kategori config deployment yang WAJIB
diverifikasi manual di staging dulu, JANGAN langsung PR develop→main).
