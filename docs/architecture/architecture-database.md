# Architecture — Database (PostgreSQL + Drizzle)

## Konvensi Skema
- Nama tabel: snake_case, plural (mis. `subscriptions`, `import_batches`) —
  kecuali tabel Better Auth (`user`, `session`, `account`, `verification`)
  yang singular, mengikuti konvensi generator resmi Better Auth, JANGAN
  di-rename manual.
- Primary key: `id` UUID (`defaultRandom()`) di semua tabel domain kita
  sendiri — kecuali tabel Better Auth yang pakai `text` id (generate dari
  library-nya sendiri).
- Timestamp wajib `timestamptz` di tabel yang butuh, minimal `created_at` —
  `updated_at` cuma ditambah kalau tabelnya memang di-update setelah dibuat
  (banyak tabel di sini append-only, mis. `import_batch_rows`).
- Soft delete TIDAK dipakai di project ini — semua tabel hard delete
  (`onDelete: "cascade"` dipakai eksplisit di FK yang butuh, mis.
  `import_batch_rows.batch_id`).

## Struktur File Schema
**BEDA dari contoh generik** — skema dipecah per domain
(`apps/api/src/db/schema/*.schema.ts`), BUKAN 1 file `schema.ts` tunggal,
karena Better Auth CLI (`npx auth generate`) generate file terpisah untuk
tabel authnya sendiri. Lihat `apps/api/CLAUDE.md` untuk daftar lengkap
file & alasan pemisahannya. `db/schema/index.ts` re-export semuanya —
import selalu dari situ (`from "../db/schema"`), jangan import langsung
dari file `*.schema.ts` individual.

## Tabel yang Ada Sekarang (ringkasan, per file — bukan skema lengkap)
| File | Tabel | Untuk apa |
|---|---|---|
| `auth.schema.ts` | `user`, `session`, `account`, `verification` | Better Auth, generated — jangan edit manual |
| `rbac.schema.ts` | `roles`, `permissions`, `role_permissions`, `user_roles` | RBAC dinamis, lihat `architecture-auth.md` |
| `core.schema.ts` | `settings`, `media`, `audit_logs` | Settings Page, MinIO media, audit trail |
| `subscription.schema.ts` | `plans`, `subscriptions` | Lihat `architecture-subscription.md` |
| `payment.schema.ts` | `orders` | Lihat `architecture-payment.md` |
| `accurate.schema.ts` | `accurate_connections` | OAuth token Accurate, lihat `architecture-accurate-integration.md` |
| `import.schema.ts` | `import_batches`, `import_batch_rows` | Generik untuk SEMUA modul import (field `module` yang bedain Purchase Invoice vs Vendor Akun Hutang, dst) |

Skema pasti/terbaru selalu ada di kode (`apps/api/src/db/schema/*.ts`) —
tabel di atas cuma peta cepat "cari tabel X ada di file mana", bukan
duplikat definisi kolom (definisi kolom gampang basi, jangan disalin ke
sini).

## ⚠️ Timezone — Aturan Non-Negotiable
**Semua kolom timestamp WAJIB `timestamptz` (menyimpan UTC), TIDAK PERNAH
`timestamp` tanpa timezone atau local time yang sudah di-convert sebelum
disimpan.** Timezone perusahaan (`company.timezone` di
`docs/architecture/architecture-settings.md`) HANYA dipakai saat
**menampilkan** data ke user, bukan saat menyimpan. Detail & contoh kode
lengkap → `docs/architecture/architecture-settings.md` bagian "Aturan
Timezone". Ini dicek juga di `security-review` kalau ada kolom timestamp baru.

## Contoh Schema (Drizzle) — pola nyata dari `import.schema.ts`
```ts
// apps/api/src/db/schema/import.schema.ts
import { pgTable, uuid, varchar, integer, jsonb, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth.schema";
import { subscriptions } from "./subscription.schema";

export const importBatches = pgTable("import_batches", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id), // Better Auth id = text, bukan uuid
  subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id),
  module: varchar("module", { length: 50 }).notNull(), // "purchase_invoice" | "vendor_payable_account" dst
  columnMapping: jsonb("column_mapping"),
  status: varchar("status", { length: 20 }).notNull().default("mapping_pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

## Migration Workflow
1. Edit `schema.ts`
2. `bun run db:generate` → generate file migration di `db/migrations/`
3. Review file migration yang di-generate (JANGAN auto-apply tanpa baca)
4. `bun run db:migrate`
5. Commit schema.ts + file migration bareng dalam 1 PR

## Kenapa PostgreSQL (bukan MySQL)
Lihat `docs/decisions/adr-0001-pilih-stack.md` untuk rasionalnya.

## Catatan Performa
Belum ada query lambat yang butuh index tambahan di luar PK/FK default —
isi bagian ini begitu ketemu kasus nyata (`EXPLAIN ANALYZE` dulu sebelum
optimasi prematur), jangan index spekulatif.
