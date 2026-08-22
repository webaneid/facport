# CLAUDE.md — apps/api (Elysia + Bun)

> File ini cuma ke-load Claude Code kalau lagi kerja di dalam apps/api/.
> Nggak perlu ulang info global (stack, rules umum) — itu sudah ada di root CLAUDE.md.

## Tanggung Jawab Folder Ini
Backend API — REST, auth, business logic, koneksi ke PostgreSQL (via Drizzle)
dan MinIO. Termasuk integrasi ke API Accurate Online (OAuth token, bulk
import transaksi dari hasil parsing Excel) — lihat
`docs/architecture/architecture-accurate-integration.md`.

## Struktur Folder
```
apps/api/
  src/
    routes/           ← 1 file per resource, contoh: settings.route.ts, media.route.ts
      admin/            ← endpoint admin-only (permission khusus admin), contoh: plans.route.ts, users.route.ts
    db/
      schema/           ← Drizzle schema, DIPECAH per domain (bukan 1 file
                           tunggal) karena Better Auth CLI (`npx auth generate`)
                           generate file terpisah — auth.schema.ts, core.schema.ts
                           (settings/media/audit_logs), rbac.schema.ts,
                           subscription.schema.ts (plans/subscriptions),
                           payment.schema.ts (orders), accurate.schema.ts
                           (accurate_connections), import.schema.ts
        index.ts          ← re-export semua schema/*.ts
      seed.ts             ← seed role/permission dasar (bun run db:seed)
      migrations/ (drizzle/) ← generated, jangan edit manual
    services/          ← business logic, dipanggil dari routes
    workers/            ← job worker, proses TERPISAH dari index.ts — lihat architecture-jobs.md
    emails/              ← template React Email — lihat architecture-notifications.md (belum dipakai, lib/email.ts masih {to,subject,html} langsung)
    lib/
      env.ts             ← validasi & parse process.env, WAJIB di-import paling awal
      logger.ts          ← Pino structured logger — pakai ini, JANGAN console.log langsung
      sentry.ts           ← init Sentry, ditangkap di .onError() app.ts
      auth.ts              ← Better Auth instance (+ crossSubDomainCookies) — lihat architecture-auth.md, architecture-domain-routing.md
      permission.ts        ← plugin Elysia `.macro({ auth, permission })`, pakai `.resolve()` — lihat architecture-auth.md
      subscription-gate.ts  ← plugin Elysia `.macro({ moduleAccess })` — gating akses modul per-subscription, lihat architecture-subscription.md
      queue.ts              ← pg-boss instance & definisi JOBS — lihat architecture-jobs.md
      email.ts                ← wrapper Resend — lihat architecture-notifications.md
      accurate.ts               ← client OAuth Accurate Online (authorize URL, exchange/refresh token) — lihat architecture-accurate-integration.md
      accurate-scopes.ts         ← mapping modul→scope Accurate (✅ diverifikasi ke OpenAPI spec resmi publik, 2026-08-19)
      oauth-state.ts               ← state CSRF OAuth, in-memory TTL — pola sama dengan rate-limit.ts
      encryption.ts                 ← AES-256-GCM, enkripsi token Accurate at-rest
      rate-limit.ts          ← rate limiter custom in-memory (elysia-rate-limit butuh Elysia≥2.0, project pin 1.4.x)
      minio.ts          ← client MinIO
      db.ts              ← koneksi Drizzle
    app.ts              ← Elysia instance TANPA .listen() — dipakai app.handle() di test (app.test.ts)
    index.ts             ← entry point ASLI: import app.ts, panggil .listen()
```
> Project ini TIDAK pakai WhatsApp notification (checklist Kebutuhan
> Komponen = Tidak) — tidak ada `lib/whatsapp.ts`.

## Response Format
**Return payload BARE, JANGAN wrap manual `{data, error}`** — Eden Treaty
di client sudah jadi wrapper itu sendiri. Detail & rasional (ADR-0010) →
`docs/architecture/architecture-api.md` § "Response Format".

## Validasi Environment Variables (fail-fast)
JANGAN akses `process.env.X!` tersebar di banyak file (non-null assertion
nyembunyiin bug — baru ketahuan pas runtime, seringnya pas request pertama
masuk, bukan pas boot). Definisikan sekali di `lib/env.ts`, validasi saat
startup, dan import `env` yang sudah divalidasi di tempat lain:

```ts
// apps/api/src/lib/env.ts
import { t } from "elysia";
import { Value } from "@sinclair/typebox/value"; // sudah jadi dependency Elysia, tidak perlu tambah package

const envSchema = t.Object({
  DATABASE_URL: t.String({ minLength: 1 }),
  JWT_SECRET: t.String({ minLength: 32 }), // tolak secret yang terlalu pendek/default
  MINIO_ENDPOINT: t.String({ minLength: 1 }),
  MINIO_PORT: t.String({ minLength: 1 }),
  MINIO_ACCESS_KEY: t.String({ minLength: 1 }),
  MINIO_SECRET_KEY: t.String({ minLength: 1 }),
  PORT: t.String({ minLength: 1 }),
});

if (!Value.Check(envSchema, process.env)) {
  const errors = [...Value.Errors(envSchema, process.env)];
  console.error("❌ Environment variable tidak valid:");
  for (const e of errors) console.error(`  - ${e.path}: ${e.message}`);
  process.exit(1); // gagal SEBELUM server listen, bukan error acak nanti
}

export const env = process.env as unknown as typeof envSchema.static;
```

```ts
// apps/api/src/index.ts — import env.ts PALING AWAL, sebelum apa pun yang butuh env
import "./lib/env";
// ... sisanya seperti biasa
```

> Konsisten dengan `docs/architecture/architecture-security.md` — ini bukan
> soal secret bocor, tapi soal gagal cepat & jelas kalau config production
> salah/kosong, dibanding error samar di tengah request user.

## Konvensi Elysia
- Validasi request pakai skema Elysia (TypeBox) langsung di definisi route, JANGAN validasi manual di dalam handler.
- Tiap route group didaftarkan via `.group()`, prefix sesuai resource (`/api/posts`, `/api/auth`, dst).
- Error handling terpusat lewat `.onError()` di `app.ts` — jangan try/catch manual berulang di tiap handler kecuali kasus khusus.
- **Return payload BARE, JANGAN wrap manual `{data, error}`** (ADR-0010,
  koreksi dari draf awal) — Eden Treaty di client SUDAH jadi wrapper
  `{data,error}` berdasar HTTP status, wrap manual di server bikin
  double-wrap. Sukses: `return payload;`. Gagal:
  `set.status = N; return { code: "X" };`. Detail →
  `docs/architecture/architecture-api.md` § "Response Format".

## Database
- Semua akses DB lewat Drizzle query builder, jangan raw SQL kecuali untuk query kompleks yang didokumentasikan alasannya.
- Migration: `bun run db:generate` lalu `bun run db:migrate`. Jangan pernah edit file migration yang sudah ke-apply.
- Detail skema lengkap → `docs/architecture/architecture-database.md`

## Auth
Better Auth + RBAC dinamis (role baku + custom role, permission per-role) —
detail lengkap & contoh kode → `docs/architecture/architecture-auth.md`.
JANGAN implementasi JWT manual dari nol.

## Command Khusus API
```bash
cd apps/api
bun run dev          # dev server dengan hot reload
bun run dev:worker    # worker (queue) proses terpisah, hot reload
bun run test          # test suite (bun:test, lihat app.test.ts — pakai app.handle(), bukan port TCP nyata)
bun run db:generate   # generate migration dari db/schema/*.ts
bun run db:migrate    # apply migration
bun run db:seed       # seed role/permission dasar
```

## Testing
Pakai `app.handle(new Request(...))` (pola resmi Elysia, lihat
`src/app.test.ts`) — BUKAN spin up server TCP nyata di test. Ini kenapa
`app.ts` (Elysia instance, tanpa `.listen()`) dipisah dari `index.ts` (entry
point asli yang panggil `.listen()`) — import `app` dari `app.ts` di test,
`index.ts` cuma dipakai `bun run dev`/`bun run start`.

## Hal yang Sering Salah (isi seiring waktu)
- [contoh: lupa invalidate cache setelah update, dst — pindahkan ke docs/lessons-learned.md kalau sudah general]
