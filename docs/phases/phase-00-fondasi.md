# Fase 00 — Fondasi Teknis

**Status:** Done
**Mulai:** 2026-08-19
**Selesai:** 2026-08-19

## Tujuan
Setup fondasi TEKNIS yang WAJIB ada sebelum fitur produk apa pun dikerjakan
(lihat CLAUDE.md root bagian "Rules Non-Negotiable" dan
`docs/architecture/architecture-components.md`) — supaya fase-fase
berikutnya tidak masing-masing bikin pola auth/settings/upload/queue
sendiri-sendiri. Fase ini FOKUS infra dasar; routing 3-surface (landing/
admin/app) dan model langganan (plans/subscriptions) sengaja dipisah ke
**Fase 01 (Fondasi Produk)** karena itu keputusan level produk, bukan
infra murni — lihat `docs/phases/phase-01-fondasi-produk.md`.

Scope di bawah SUDAH disesuaikan dengan Checklist Kebutuhan Komponen project
ini (lihat `PROJECT-INIT-PROMPT.md`) — item yang checklist-nya "Tidak"
(Multi-tenant, Alamat, UU PDP, i18n, SEO/Sitemap) TIDAK di-setup sama sekali.

## Scope
- [x] Skema `settings` (key-value, group `general`) — lihat `docs/architecture/architecture-settings.md`
- [x] Isi field wajib `settings` group `general`: `company.name` = "FAC Institute",
      `company.timezone` = "Asia/Jakarta" (terverifikasi lewat `PUT /settings`
      nyata, bukan cuma migration) — `company.address`/`logo`/`favicon` masih
      kosong, nunggu Media Library (Milestone 5) & diisi manual nanti
- [x] Skema `media` — lihat `docs/architecture/components/architecture-component-media-library.md`
- [x] Skema `audit_logs` — lihat `docs/architecture/architecture-security.md` §11
- [x] Better Auth + skema `roles`, `permissions`, `role_permissions`, `user_roles`
      — seed minimal role `admin` (izin penuh) dan role `customer` (lihat
      `docs/architecture/architecture-auth.md`, `docs/decisions/adr-0005-auth-strategy.md`).
      Diverifikasi end-to-end: register → login → 401 tanpa auth, 403 auth
      tanpa permission, 200 auth + permission (role admin)
- [x] Komponen frontend `Combobox` dasar — lihat `docs/architecture/components/architecture-component-autocomplete.md`.
      Server-rendered diverifikasi (`curl localhost:6209/dev/components-test`
      200 + markup benar) — interaksi klien (buka dropdown, dst) BELUM
      diverifikasi lewat browser nyata, cuma lewat kode & server-render
- [x] `MediaLibraryModal` dasar (upload + pilih, belum perlu semua fitur
      WordPress-like) — lihat `docs/architecture/components/architecture-component-media-library.md`.
      Backend upload sudah diverifikasi end-to-end (§ item image processing
      di atas); UI dialog/upload flow BELUM diklik manual di browser nyata —
      lihat Known Limitations
- [x] Image processing dasar (`sharp`, variant thumbnail/medium/large) — lihat
      `docs/architecture/components/architecture-component-image-processing.md`.
      Backend (`POST /media/upload`) diverifikasi end-to-end: validasi MIME
      (400 kalau bukan gambar), validasi permission (`media.upload`, 403
      kalau tidak ada), upload asli+3 variant ke MinIO nyata (dicek lewat
      `mc ls`), row `media` tersimpan dengan width/height/variants benar
- [x] `pg-boss` queue dasar + worker skeleton (proses terpisah dari `index.ts`)
      + scheduled job skeleton (`boss.schedule()`) — lihat
      `docs/architecture/architecture-jobs.md`. Diverifikasi end-to-end:
      enqueue `SEND_EMAIL` dari luar worker process → worker pickup & proses
      → log "Email job processed" (no-op karena `RESEND_API_KEY` kosong,
      sesuai desain dev-friendly)
- [x] Skema `import_batches` + `import_batch_rows` dasar (struktur tabel saja,
      minus kolom `subscriptionId` yang ditambah di Fase 01 — belum perlu
      endpoint/worker lengkap, itu bagian Fase 02) — lihat
      `docs/architecture/architecture-accurate-integration.md`
- [x] `apps/web/package.json` — pastikan `dev` script start di port **6209**
      (baku, lihat `docs/architecture/architecture-domain-routing.md`).
      Diverifikasi: `bun run dev` di apps/web benar-benar listen di 6209,
      halaman `/` dan `/dev/components-test` return 200

## Referensi
- Architecture doc: `docs/architecture/architecture-components.md`,
  `docs/architecture/architecture-settings.md`,
  `docs/architecture/architecture-auth.md`,
  `docs/architecture/architecture-jobs.md`,
  `docs/architecture/architecture-accurate-integration.md`
- ADR terkait: `docs/decisions/adr-0005-auth-strategy.md`,
  `docs/decisions/adr-0006-integrasi-accurate-api.md`

## Keputusan Kecil Selama Eksekusi
(hal yang diputuskan di tengah jalan, nggak cukup besar buat ADR tapi tetap
perlu diingat kenapa dipilih begitu)
- Docker tidak tersedia di environment eksekusi ini — verifikasi lokal pakai
  Postgres 16 & MinIO dari Homebrew langsung (bukan `docker-compose.dev.yml`)
  dengan kredensial yang SAMA (`postgres`/`postgres`/`dbname_dev`,
  `minioadmin`/`minioadmin`) supaya tidak ada divergensi konvensi. Tim yang
  punya Docker tetap pakai `docker-compose.dev.yml` seperti biasa — ini
  murni keterbatasan mesin eksekusi, bukan perubahan workflow project.
- Ditemukan instance MinIO lain (bukan punya Facport) sudah jalan permanen
  di mesin ini di port 9000/9001 (punya project/keperluan lain milik user)
  — MinIO dev Facport dipindah ke port **9002/9003** supaya tidak bentrok
  atau mengganggu instance yang sudah ada. `docker-compose.dev.yml` (kalau
  dipakai via Docker beneran) TETAP pakai 9000/9001 seperti biasa — ini
  cuma penyesuaian environment verifikasi lokal, dicatat di `apps/api/.env`
  (`MINIO_PORT=9002`), BUKAN perubahan port default project.
- `.mount(auth.handler)` di Elysia **TIDAK kena bug elysiajs/elysia#1806** di
  kombinasi versi yang ke-install (`elysia@1.4.29` + `better-auth@1.7.1`) —
  smoke test manual (`POST /api/auth/sign-up/email`, `/sign-in/email`) sukses
  200 langsung, tidak perlu fallback ke route manual.
- Skema Better Auth (`auth.schema.ts`) ditulis manual lalu **dicross-check
  via `npx auth generate`** — ada 1 kolom (`account.issuer`) dan beberapa
  index yang kelewat di tulisan manual awal, sudah disesuaikan. SATU deviasi
  disengaja dari hasil generate: semua timestamp Better Auth dipaksa
  `withTimezone: true` (bukan default `timestamp` polos dari generator),
  ikut aturan non-negotiable CLAUDE.md root.
- Permission middleware pakai `.resolve()` di dalam `.macro()` (bukan
  `.derive()`) — sesuai rekomendasi resmi Elysia terkini untuk auth context
  (jalan di tahap `beforeHandle`, setelah validasi schema).
- **Next.js 16 mengganti `middleware.ts`→`proxy.ts`** (deprecated bukan cuma
  alias) — ketemu pas `bun run dev` apps/web pertama kali (dev server print
  peringatan eksplisit "This is NOT the Next.js you know"). Fase 00 sendiri
  belum butuh file ini (routing 3-surface itu scope Fase 01), tapi
  `docs/architecture/architecture-domain-routing.md`,
  `docs/decisions/adr-0007-multi-surface-domain-routing.md`, dan
  `docs/phases/phase-01-fondasi-produk.md` sudah diupdate ke `proxy.ts`
  SEBELUM Fase 01 mulai, supaya tidak ketahuan pas eksekusi.
- `apps/api/src/index.ts` dipecah jadi `app.ts` (Elysia instance tanpa
  `.listen()`) + `index.ts` (entry point asli) — supaya test (`app.test.ts`)
  bisa pakai `app.handle()` langsung tanpa bind port TCP nyata (pola resmi
  testing Elysia).
- ~~Eden Treaty (`@elysia/eden`) gagal narrow union `{data,error}` dengan
  benar khusus untuk route upload multipart~~ — **KOREKSI (Fase 01 M6)**:
  diagnosis ini SALAH. Root cause sebenarnya route `apps/api` manual wrap
  `{data, error}` di return value, BENTROK dengan wrapper `{data,error}`
  Eden sendiri di client → double-wrap. Sudah diperbaiki total (§
  `docs/decisions/adr-0010-response-format-eden.md`) — route sekarang
  return payload bare. Satu limitasi Eden yang SUNGGUHAN tetap ada, sempit:
  khusus route `t.File()` (multipart), lihat ADR-0010 § Konsekuensi.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — apps/api & apps/web
      keduanya bersih, plus `bun run lint` (apps/web) & `bun run test`
      (apps/api, 7/7 pass setelah nambah test regresi security review)
- [x] Security review dijalankan (subagent `security-auditor`, 2026-08-19 —
      dipilih subagent karena file yang diubah lintas modul & banyak, § `docs/WORKFLOW-MODES.md`)
- [x] Temuan Critical/High sudah diperbaiki — 1 Critical (`GET /settings`
      tanpa guard) + 3 High (rate limiting auth endpoint, guard opt-in per
      route, ditambah 1 bug tambahan ketemu sendiri: `onError` maksa 500
      untuk VALIDATION error) semua sudah di-fix & ada test regresi. Detail
      lengkap → `docs/lessons-learned.md` (entri 2026-08-19)
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda —
      4 dari 5 Medium/Low langsung diperbaiki juga (t.Any→t.Unknown, t.File
      maxSize/type di schema, HTTP security headers, JWT_SECRET dead config
      dihapus, console.log→logger); yang genuinely ditunda: mekanisme
      enforcement guard otomatis, kebijakan serving MinIO (presigned vs
      public), scrypt-vs-Argon2id (didokumentasikan sebagai deviasi diterima,
      bukan ditunda)
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
(hal yang sengaja belum ditangani di fase ini, biar jelas dan disengaja —
bukan kelupaan)
- Routing 3-surface (landing/admin/app), model langganan/plans/checkout, DAN
  koneksi OAuth Accurate (`accurate_connections`) BELUM ada di fase ini —
  semua dipindah ke Fase 01 (Fondasi Produk) karena `accurate_connections`
  sekarang berelasi ke `subscriptions` (1 subscription = 1 akun Accurate,
  lihat `docs/decisions/adr-0009-detail-oauth-accurate.md`), bukan lagi
  berdiri sendiri.
- Worker `IMPORT_TO_ACCURATE` belum diimplementasi penuh — itu scope Fase 02.
- **Interaksi client-side (Combobox, MediaLibraryModal) BELUM diklik di
  browser nyata** — cuma diverifikasi lewat server-rendered HTML (`curl`) +
  backend endpoint yang dipanggilnya (upload nyata sudah diverifikasi
  end-to-end). Tidak ada tool browser otomatis yang tersedia di environment
  eksekusi ini. Rekomendasi: buka `http://app.localhost:6209/dev/components-test`
  manual sebelum fase ini benar-benar dianggap "Done" oleh user, ATAU
  verifikasi ulang pas Fase 01 begitu komponen ini dipakai di halaman nyata.
- Belum ada test untuk `apps/web` (komponen React) — cuma `apps/api`
  (`app.test.ts`, 5 test: health check, auth+permission gate 401/403/200,
  validasi MIME upload). Sesuai `architecture-testing.md`, komponen React
  murni presentational (Button, dst) boleh skip test formal; `Combobox`/
  `MediaLibraryModal` punya logic tapi test-nya ditunda ke Fase 01 saat
  dipakai di alur nyata (halaman login/register), bukan di halaman dev-test
  sementara ini.

## Ringkasan Hasil
Monorepo Facport bootstrap dari nol (belum ada git repo/kode sama sekali
sebelum fase ini) jadi backend + frontend yang benar-benar jalan dan
tervalidasi end-to-end, bukan cuma "typecheck lolos":

- **apps/api** (Elysia 1.4.29 + Bun): env validation fail-fast, koneksi
  Drizzle/Postgres, Better Auth (email+password) + RBAC custom
  (`roles`/`permissions`/`role_permissions`/`user_roles`) dengan dua macro
  guard (`auth`, `permission`), pg-boss v12 queue + worker + scheduled job,
  MinIO + `sharp` image processing (upload real image → 3 variant webp),
  rate limiting custom di endpoint auth, HTTP security headers.
- **apps/web** (Next.js 16.3.1): scaffold App Router, Tailwind v4, Eden
  Treaty type-safe client, komponen `Combobox` + `MediaLibraryModal` dasar,
  dev server di port 6209 baku.
- **13 tabel** ter-migrate ke Postgres dev: user/session/account/verification
  (Better Auth), settings/media/audit_logs, roles/permissions/role_permissions/
  user_roles, import_batches/import_batch_rows.
- **Test otomatis**: `apps/api/src/app.test.ts`, 7 test (health check, auth
  gate GET+PUT /settings, permission gate 403/200, upload validation +
  auth gate) — semua pass, dipakai `app.handle()` Elysia bukan port TCP.
- **Security review** (subagent `security-auditor`): 1 Critical + 3 High
  ditemukan dan SEMUA diperbaiki dengan test regresi; 4 dari 5 Medium/Low
  juga langsung diperbaiki. Detail lengkap → `docs/lessons-learned.md`.
- **2 gotcha ekosistem ketemu & didokumentasikan SEBELUM jadi masalah di
  fase berikutnya**: Better Auth Drizzle adapter pindah package, dan yang
  lebih penting — **Next.js 16 me-rename `middleware.ts`→`proxy.ts`**,
  langsung diupdate ke `architecture-domain-routing.md`/ADR-0007/
  `phase-01-fondasi-produk.md` sebelum Fase 01 mulai coding routing.

**Gap yang jujur dicatat** (lihat Known Limitations): interaksi client-side
komponen React belum diklik di browser nyata (tidak ada tool browser di
environment eksekusi ini) — cuma diverifikasi server-render + backend
endpoint. Docker tidak tersedia, verifikasi lokal pakai Postgres/MinIO
Homebrew langsung (kredensial sama, port MinIO beda karena ada instance lain
punya user di 9000/9001).
