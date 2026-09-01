# CLAUDE.md — facport (root)

> File ini HANYA berisi hal yang berlaku GLOBAL lintas apps/. Detail spesifik
> backend ada di apps/api/CLAUDE.md, detail frontend di apps/web/CLAUDE.md —
> file itu otomatis ke-load Claude Code cuma pas kerja di folder tersebut,
> jadi JANGAN duplikasi isinya ke sini.

> Project baru? Isi `PROJECT-INIT-PROMPT.md` di root repo ini dan paste ke
> sesi Claude Code — itu bakal otomatis sesuaikan semua file di bawah ini.

## Ringkasan Project
Facport — aplikasi cloud dari FAC Institute yang jadi jembatan otomatis untuk
mengimpor ribuan data transaksi dari file Excel ke Accurate Online hanya
dengan satu klik. Menggantikan input manual yang lambat & rentan human error
untuk staf akuntansi/finance dan pemilik bisnis pengguna Accurate Online —
tanpa instalasi tambahan, cukup login dan integrasi data langsung berjalan.
Facport adalah produk **berlangganan** (bukan gratis) — akses modul impor
ditentukan paket langganan aktif (lihat `docs/architecture/architecture-subscription.md`).

Monorepo: frontend (Next.js, 1 aplikasi melayani 3 surface — landing publik,
admin, dan dashboard pelanggan, dibedakan lewat subdomain) + backend API
(Elysia/Bun) terpisah, komunikasi via REST. Detail routing 3 surface →
`docs/architecture/architecture-domain-routing.md`.

**Port dev lokal (baku):** `apps/web` di **6209** (bukan default 3000),
`apps/api` di 3001.

## Stack Global
- Runtime: **Bun**
- Backend API: **Elysia** (native Bun, type-safe end-to-end)
- Frontend: **Next.js** (React, app router)
- Database: **PostgreSQL** + **Drizzle ORM**
- Object storage (gambar/file): **MinIO** (S3-compatible, self-hosted)
- Package manager: `bun install` di root (workspaces) — jangan campur npm/yarn

## Rules Non-Negotiable (berlaku semua apps)
- TypeScript strict mode wajib di semua apps. Jangan pakai `any` tanpa alasan eksplisit di komentar.
- Perubahan skema database WAJIB via Drizzle migration file, jangan edit tabel manual di DB.
- Setiap keputusan arsitektur besar → tulis ADR baru di `docs/decisions/`, jangan cuma didiskusikan di chat.
- Bug besar yang sudah di-fix → wajib dicatat di `docs/lessons-learned.md`.
- Hal yang WAJIB (bukan sekadar disarankan) sudah di-enforce via `.claude/hooks/` —
  lihat file itu kalau mau tahu apa yang otomatis dicek tiap edit/commit.
- Error production WAJIB tertangkap Sentry & log terstruktur (Pino), JANGAN
  cuma `console.log` — detail di `docs/architecture/architecture-observability.md`.
- Backup database WAJIB berjalan otomatis (cron, bukan manual sesekali) sejak
  fase pertama yang nyimpan data user asli — detail di
  `docs/architecture/architecture-backup.md`.
- Komponen reusable (autocomplete, editor, media library), Settings Page,
  **WAJIB di-setup sejak Fase 00**, bukan ditunda — lihat
  `docs/architecture/architecture-components.md` dan skill `project-init`.
  Ini fondasi yang kalau ditunda, tiap fitur bikin pola sendiri-sendiri yang
  tidak konsisten. (Komponen Alamat, SEO Analyzer, Sitemap, dan i18n TIDAK
  dipakai di project ini — lihat Checklist Kebutuhan Komponen di
  `PROJECT-INIT-PROMPT.md`.)
- Semua timestamp di DB WAJIB UTC (`timestamptz`) — detail di
  `docs/architecture/architecture-settings.md`. String UI boleh hardcode
  Bahasa Indonesia langsung (project ini TIDAK pakai i18n/next-intl, lihat
  Checklist Kebutuhan Komponen).
- Authorization (role/permission check) WAJIB lewat middleware terpusat +
  ownership check di service layer, jangan cek manual per-handler — detail
  di `docs/architecture/architecture-auth.md`.
- Tugas berat (email, resize gambar besar, export data) WAJIB lewat job
  queue, JANGAN sinkron di request handler — detail di
  `docs/architecture/architecture-jobs.md`.
- Update dependency proaktif lewat `.github/dependabot.yml` (PR mingguan) —
  pelengkap `bun audit` yang reaktif di `.claude/hooks/dependency-audit.sh`.

## Security — Non-Negotiable (checklist singkat, detail di architecture-security.md)
- JANGAN PERNAH hardcode secret/API key/password di kode. Selalu dari `process.env`,
  dan `.env` WAJIB ada di `.gitignore` sejak commit pertama.
- Semua input dari client WAJIB divalidasi di schema Elysia (`t.Object`) sebelum
  masuk ke service layer — jangan percaya body/query/params mentah.
- Semua query DB lewat Drizzle query builder (parameterized otomatis) — kalau
  terpaksa raw SQL, WAJIB pakai parameter binding, JANGAN string concatenation.
- Password user WAJIB di-hash pakai Argon2/bcrypt, JANGAN pernah disimpan plaintext
  atau di-log.
- Endpoint yang butuh auth WAJIB dicek di level middleware/guard, bukan di
  masing-masing handler secara manual dan bisa lupa.
- File upload ke MinIO WAJIB divalidasi tipe MIME + ukuran maksimal di server,
  JANGAN percaya ekstensi file dari client.
- Detail lengkap (auth, headers, rate limiting, dependency audit) → baca
  `docs/architecture/architecture-security.md`
- Setelah selesai bikin endpoint/fitur baru → jalankan skill `security-review`
  sebelum menganggap task selesai.
- Untuk audit menyeluruh (pre-release, banyak file) → delegasikan ke subagent
  `security-auditor` (read-only, context terisolasi).

## Alur Kerja (SOP)
Fitur/fase baru WAJIB ikuti urutan di `docs/SOP.md`: rencana → architecture doc
→ eksekusi → typecheck → security review → tutup fase → baru lanjut fase berikutnya.
Skill `phase-workflow` meng-orkestrasi ini otomatis — panggil skill itu (atau
Claude akan otomatis pakai kalau user minta fitur baru yang cukup besar).
Cek `docs/PROGRESS.md` untuk tahu fase mana yang aktif sebelum mulai kerja apa pun.

Sebelum eksekusi apa pun, tentukan mode kerja yang tepat (Plan Mode/Auto Mode/
subagent/langsung) sesuai `docs/WORKFLOW-MODES.md` — jangan default ke subagent
untuk task kecil, itu justru lebih mahal token.

## Struktur Monorepo
```
/apps
  /api    → backend Elysia (baca apps/api/CLAUDE.md)
  /web    → frontend Next.js (baca apps/web/CLAUDE.md)
/docs     → architecture, decisions, lessons-learned (baca docs/)
/.claude  → skills & hooks Claude Code
```

## Peta Dokumen
| Kalau task menyangkut...              | Baca file ini                                     |
|-----------------------------------------|-----------------------------------------------------|
| Gambaran sistem end-to-end             | `docs/architecture/architecture-overview.md`        |
| Skema database, migration convention   | `docs/architecture/architecture-database.md`        |
| Struktur route/API, validasi           | `docs/architecture/architecture-api.md`             |
| Upload/serve gambar via MinIO          | `docs/architecture/architecture-storage.md`         |
| Auth, validasi, hardening, secrets     | `docs/architecture/architecture-security.md`        |
| Kenapa suatu keputusan teknis diambil  | `docs/decisions/` (ADR)                             |
| Bug yang pernah terjadi & fix-nya      | `docs/lessons-learned.md`                            |
| Naming, commit style                   | `docs/conventions.md`                                |
| Istilah domain project                 | `docs/glossary.md`                                   |
| Apa yang wajib di-test & seberapa dalam | `docs/architecture/architecture-testing.md`          |
| Backup & restore data                  | `docs/architecture/architecture-backup.md`           |
| Error tracking & structured logging    | `docs/architecture/architecture-observability.md`    |
| Staging environment, branch strategy   | `docs/decisions/adr-0003-staging-environment.md` |
| Komponen reusable (editor, media library, dst) | `docs/architecture/architecture-components.md` (index) |
| Settings page (nama perusahaan, timezone, dst)  | `docs/architecture/architecture-settings.md`  |
| Keputusan tool UI/komponen (icon, editor, dst) | `docs/decisions/adr-0004-ui-component-standards.md` |
| Auth & role/permission (RBAC)          | `docs/architecture/architecture-auth.md`             |
| Background jobs/queue                  | `docs/architecture/architecture-jobs.md` |
| Full-text search                       | `docs/architecture/architecture-search.md` |
| Notifikasi (email)                     | `docs/architecture/architecture-notifications.md` |
| Payment gateway (Ipaymu/Xendit)        | `docs/architecture/architecture-payment.md` |
| Integrasi Accurate Online (OAuth, import data) | `docs/architecture/architecture-accurate-integration.md` |
| Model langganan, paket, gating akses modul | `docs/architecture/architecture-subscription.md` |
| Routing 3 surface (landing/admin/app), subdomain | `docs/architecture/architecture-domain-routing.md` |
| Dashboard pelanggan, App Shell (sidebar/nav modul baru) | `docs/architecture/architecture-app-dashboard.md` |

> **Semua baris "OPSIONAL" di atas ditentukan oleh Checklist Kebutuhan
> Komponen** yang diisi user saat `project-init` (lihat
> `PROJECT-INIT-PROMPT.md`) — kalau file-nya tidak ada di project ini,
> artinya memang sengaja tidak dipakai, bukan lupa dibuat.
| Alur kerja/proses per fase             | `docs/SOP.md`                                        |
| Status fase mana yang sedang jalan     | `docs/PROGRESS.md`                                    |
| Pilih mode kerja & hemat token          | `docs/WORKFLOW-MODES.md`                              |
| Deploy, versioning, release ke server  | `docs/architecture/architecture-deployment.md`         |
| Setup VPS awal (Hostinger/lainnya)     | `docs/deployment-server-setup.md`                       |

## Command Umum (root)
```bash
bun install                # install semua workspace
bun run dev                # jalankan api + web bareng (sesuaikan turbo/concurrently)
bun run typecheck          # cek type error, WAJIB nol sebelum lanjut fase (SOP Langkah 3)
bun run test               # jalankan test suite
bun run lint                # jalankan linter
bun run db:migrate         # jalankan migration Drizzle
bun run db:studio          # buka Drizzle Studio
```
> Release (versioning + build image ke GHCR) otomatis lewat CI setelah push
> ke main. **Deploy ke server VPS saat ini MASIH MANUAL** (secret SSH CI
> belum diisi, § `docs/lessons-learned.md` 2026-08-28) — Claude Code cuma
> commit+push+pantau CI, deploy ke server pakai runbook Minimal/Full di
> `docs/architecture/architecture-deployment.md` § "Deploy Manual ke
> Server".
