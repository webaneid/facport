# Architecture — Auth & Authorization

> Ironisnya ini komponen yang paling sering dipakai ulang tapi paling lama
> tidak punya dokumen sendiri di template ini — `architecture-security.md`
> cuma bilang prinsip (JWT pendek, httpOnly cookie), file ini isi ALUR
> KONKRET-nya.

## Tool: Better Auth
Dipilih karena: TypeScript-native (cocok stack Bun+Elysia+Drizzle), sudah
punya adapter Drizzle resmi, dukungan session + JWT + social login built-in,
dan **sudah terbukti jalan** di project sebelumnya (Jalajogja) — bukan
pilihan baru yang belum teruji.

```ts
// apps/api/src/lib/auth.ts (ringkas — lihat file asli untuk detail lengkap)
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter"; // BUKAN better-auth/adapters/drizzle
import { db } from "./db";
import { env } from "./env";

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true, requireEmailVerification: true },
  emailVerification: { sendVerificationEmail: async ({ user, url }) => { /* lihat auth.ts asli */ } },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 hari
    cookieCache: { enabled: true, maxAge: 60 * 5 }, // cache 5 menit, kurangi query DB tiap request
  },
  // socialProviders: {} — TIDAK diaktifkan (tidak diminta, hindari kompleksitas scope OAuth tambahan)
  advanced: { crossSubDomainCookies: { /* lihat § "Cookie Lintas-Subdomain" di bawah */ } },
});
```
Konfigurasi cookie lintas-subdomain (`advanced.crossSubDomainCookies`) dan
kenapa dev `.localhost` butuh proxy Route Handler terpisah dari production
→ `docs/architecture/architecture-domain-routing.md` (dokumentasi penuh
pola & alasan sudah ada di sana, jangan duplikasi ke sini).

```ts
// apps/api/src/index.ts — mount Better Auth handler
app.mount(auth.handler); // expose /api/auth/* otomatis
```

## Authentication vs Authorization — Dua Layer Terpisah
- **Authentication** (siapa kamu) — ditangani Better Auth di atas, sudah beres.
- **Authorization** (kamu boleh ngapain) — **BUKAN** tanggung jawab Better
  Auth, ini custom, dan ini yang paling sering "kelupaan dicek per-endpoint".

## RBAC — Role Baku + Custom Role Dinamis
Pola yang sudah terbukti (Jalajogja): role baku (`owner`, `admin`, dst — beda
tiap project, isi sesuai domain) **plus** custom role yang bisa dibuat user
sendiri (mis. "Ketua", "Sekretaris", "Bendahara" untuk organisasi), dengan
permission granular per-role.

```ts
// apps/api/src/db/schema/rbac.schema.ts
export const roles = pgTable("roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 50 }).notNull(),
  isSystem: boolean("is_system").notNull().default(false), // true = role baku, tidak bisa dihapus user
});

export const permissions = pgTable("permissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(), // "import.create", "media.upload", dst
});

export const rolePermissions = pgTable("role_permissions", {
  roleId: uuid("role_id").references(() => roles.id).notNull(),
  permissionId: uuid("permission_id").references(() => permissions.id).notNull(),
}); // composite PK (roleId, permissionId)

export const userRoles = pgTable("user_roles", {
  userId: text("user_id").references(() => user.id).notNull(), // Better Auth id = text, BUKAN uuid
  roleId: uuid("role_id").references(() => roles.id).notNull(),
}); // 1 user bisa >1 role
```

## Permission Check — Elysia Macro Terpusat (Bukan Manual Per-Handler)
**Beda dari pola `.derive()`/wrapper `.use()` di draf awal** — implementasi
nyata pakai `.macro()` Elysia, dipasang sebagai OPSI KONFIG route (bukan
dipanggil sebagai fungsi):
```ts
// apps/api/src/lib/permission.ts
export const permissionPlugin = new Elysia({ name: "permission" }).macro({
  auth: {
    // cuma cek sudah login, tidak peduli permission spesifik — buat GET
    // yang boleh dibaca siapa pun yang login
    async resolve({ status, request: { headers } }) {
      const session = await auth.api.getSession({ headers });
      if (!session) return status(401);
      return { user: session.user, session: session.session };
    },
  },
  permission: (permissionKey: string) => ({
    // login + role harus punya permission key tertentu
    async resolve({ status, request: { headers } }) {
      const session = await auth.api.getSession({ headers });
      if (!session) return status(401);
      const allowed = await userHasPermission(session.user.id, permissionKey);
      if (!allowed) return status(403);
      return { user: session.user, session: session.session };
    },
  }),
});

// Pemakaian di route — `permission` jadi OPSI di config terakhir handler,
// BUKAN `.use(requirePermission(...))`:
new Elysia()
  .use(permissionPlugin)
  .post("/media/upload", handler, { permission: "media.upload" });
```
**WAJIB pasang SALAH SATU** (`auth: true` atau `permission: "..."`) di
tiap route baru — jangan biarkan route tanpa keduanya kalau memang tidak
sengaja publik. Ini persis kelas bug yang ketemu di security review Fase
00 (`GET /settings` kelupaan dikasih guard) — belum ada mekanisme
ENFORCEMENT OTOMATIS (lint rule/test) yang memastikan semua route baru
pasang salah satu macro ini, masih mengandalkan disiplin manual + code
review (dicatat sebagai technical debt terbuka di
`docs/lessons-learned.md`).

## Ownership Check — Beda dari Role Check
Role check ("user ini punya permission `posts.update`") **belum tentu** cukup
— sering juga butuh ownership check ("user ini boleh update post **miliknya
sendiri**, bukan post orang lain", kecuali dia admin). Ini WAJIB dicek
terpisah di service layer, bukan diasumsikan otomatis dari permission role:
```ts
// service layer, BUKAN middleware — karena butuh tahu resource spesifik
if (post.authorId !== user.id && !userHasRole(user, "admin")) {
  throw new Error("FORBIDDEN");
}
```
Ini sudah masuk checklist `security-review` (lihat `architecture-security.md` §4).

## Auth di Frontend (apps/web)
```ts
// apps/web/lib/auth-client.ts
import { createAuthClient } from "better-auth/react";
export const authClient = createAuthClient({ baseURL: process.env.NEXT_PUBLIC_API_URL });
```
Session dicek di Server Component (bukan Client Component) untuk data yang
menentukan apa yang di-render — supaya logic authorization tidak keliatan di
client-side JS (lihat `architecture-security.md` §5).

## Registrasi — Dua Jalur (Self-Service & Admin-Provisioned)
Facport punya dua cara user masuk sistem: daftar sendiri lewat
`app.facport.com/register`, ATAU dibuat langsung oleh admin dari
`admin.facport.com` (mis. onboarding klien korporat). Detail flow lengkap
→ `docs/architecture/architecture-subscription.md` § "Dua Jalur
Registrasi" — role yang di-assign ke user baru selalu `customer` di kedua
jalur, cuma proses verifikasinya beda (self-service verifikasi email,
admin-provisioned dianggap terverifikasi karena admin yang buat).

## Role Admin vs Customer — Bukan Multi-Tenant
Facport punya 2 role yang benar-benar di-seed (`apps/api/src/db/seed.ts`):
`admin` (izin penuh, tim internal FAC Institute, akses `admin.facport.com`)
dan `customer` (pelanggan berlangganan, akses `app.facport.com`) — TIDAK
ada role `staff` terpisah (draf awal dokumen ini menyebutnya, tapi tidak
pernah benar-benar dibuat; kalau nanti dibutuhkan role staf internal
dengan izin lebih terbatas dari admin, tinggal `upsertRole()` baru + grant
permission spesifik, skema RBAC-nya sudah mendukung role custom). Ini
**RBAC biasa di satu sistem auth**, BUKAN dua sistem auth terpisah seperti
pola multi-tenant SaaS — lihat rasional lengkap di
`docs/decisions/adr-0007-multi-surface-domain-routing.md`.

## Dua Lapis Gate untuk Endpoint Import (Permission + Subscription)
Endpoint import (Fase 02 dst) WAJIB lolos **dua guard terpisah**, dipasang
sebagai 2 macro sekaligus di config route yang sama:
```ts
new Elysia()
  .use(permissionPlugin)
  .use(subscriptionGatePlugin)
  .post("/purchase-invoice/import/upload", handler, {
    permission: "import.create",   // role customer secara umum boleh akses fitur import
    moduleAccess: "pembelian",     // paket langganan AKTIF dan TERMASUK modul ini
  });
```
`moduleAccess` (`apps/api/src/lib/subscription-gate.ts`) BUKAN
role/permission, tapi cek business state (subscription) — sengaja
dipisah jadi macro sendiri (`subscriptionGatePlugin`) dari
`permissionPlugin`, dua concern yang beda.

## Referensi
- Prinsip keamanan umum (JWT expiry, cookie httpOnly, dst) → `architecture-security.md` §4
- Model langganan & gating modul → `docs/architecture/architecture-subscription.md`
- Surface admin vs app → `docs/architecture/architecture-domain-routing.md`
