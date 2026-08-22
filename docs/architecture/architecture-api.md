# Architecture — API (Elysia)

## Struktur Route
Satu file per resource di `apps/api/src/routes/` (atau `routes/admin/*` untuk
endpoint admin-only), didaftarkan lewat `.use()` di `app.ts` (Elysia instance
tanpa `.listen()` — lihat `apps/api/CLAUDE.md`).

```ts
// contoh: routes/posts.route.ts
import { Elysia, t } from "elysia";
import { createPost } from "../services/posts.service";

export const postsRoute = new Elysia({ prefix: "/posts" })
  .post("/", async ({ body }) => createPost(body), {
    body: t.Object({
      title: t.String(),
      content: t.String(),
    }),
  });
```

## Response Format — PENTING, Baca Sebelum Nulis Route Baru
> **ADR-0010** — koreksi dari template awal. JANGAN wrap manual
> `{data, error}` di return value route. Eden Treaty (client) SUDAH jadi
> wrapper `{data,error}` itu sendiri berdasar HTTP status — kalau server
> JUGA wrap, hasilnya double-wrap (`res.data` di client jadi
> `{data: payload, error: null}`, payload asli kepentok di `res.data.data`).
> Ini BUKAN teoretis — kejadian nyata di Fase 01 M6 (`plans.map is not a
> function`), detail lengkap → `docs/decisions/adr-0010-response-format-eden.md`.

**Sukses** — return payload BARE langsung:
```ts
app.get("/plans", async () => {
  return await db.select().from(plans); // BUKAN { data: [...], error: null }
});
```

**Gagal** — return object error BARE (`{code, message?}`), plus `set.status`
atau `status()` helper dari macro:
```ts
app.get("/plans/:id", async ({ params, set }) => {
  const plan = await findPlan(params.id);
  if (!plan) {
    set.status = 404;
    return { code: "PLAN_NOT_FOUND" }; // BUKAN { data: null, error: {...} }
  }
  return plan;
});
```

Body HTTP mentah (curl/Postman) sesuai contoh di atas — payload langsung
untuk sukses, `{code, message?}` langsung untuk gagal. **HTTP status code
itu sendiri** yang jadi penanda sukses/gagal untuk klien non-Eden, bukan
field `error` di body.

## Type-Safety End-to-End (Eden Treaty)
ADR-0001 memilih Elysia salah satunya karena **Eden Treaty** — client generator
yang membaca tipe route Elysia langsung, tanpa codegen step terpisah (beda dari
tRPC/OpenAPI codegen yang butuh build step tambahan).

```ts
// apps/api/src/app.ts — Elysia instance (TANPA .listen(), lihat apps/api/CLAUDE.md)
import { Elysia } from "elysia";
import { postsRoute } from "./routes/posts.route";

export const app = new Elysia().use(postsRoute);
export type App = typeof app; // <-- ini yang di-import apps/web, bukan runtime code
```

```ts
// apps/web/lib/api-client.ts
import { treaty } from "@elysia/eden"; // scope @elysia/*, BUKAN @elysiajs/* (pindah April 2026, § Fase 00)
import type { App } from "../../api/src/app"; // type-only import lintas app di monorepo

export const api = treaty<App>(process.env.NEXT_PUBLIC_API_URL!, {
  fetch: { credentials: "include" }, // WAJIB — session cookie Better Auth
});

// Pemakaian di komponen — fully typed, res.data = payload BARE (bukan
// {data,error} manual), res.error = { status, value } kalau HTTP non-2xx:
// const res = await api.plans.get();
// if (res.error) { res.error.value.code } else { res.data /* payload langsung */ }
```

> Karena ini **type-only import**, tidak ada kode backend yang ikut ke-bundle
> ke frontend — cukup pastikan `tsconfig.json` apps/web bisa resolve path ke
> apps/api (lihat referensi project di monorepo, atau pakai package internal
> `@repo/api-types` kalau mau lebih eksplisit terpisah dari source apps/api).
> JANGAN `fetch()` manual ke endpoint API dari komponen — itu kehilangan
> keuntungan type-safety yang jadi alasan utama ADR-0001 memilih Elysia.

> **Limitasi Eden yang diketahui**: untuk route dengan body `t.File()`
> (multipart upload), Eden gagal infer tipe sukses (`res.data` jadi `{}`
> kosong) walau body-nya sudah bare — SATU-SATUNYA kasus yang butuh type
> assertion (`as`, SETELAH cek `res.error`, verifikasi manual dulu shape
> aslinya lewat curl) — lihat `apps/web/components/media-library/media-library-modal.tsx`.
> Route JSON biasa TIDAK butuh ini.

## Auth Flow
Session cookie httpOnly (Better Auth), BUKAN JWT di header Authorization —
alur lengkap, macro `permission`/`auth`, dan RBAC → `docs/architecture/architecture-auth.md`
(jangan duplikasi ke sini, itu sumber kebenarannya).

## Rate Limiting / Validasi Global
`apps/api/src/lib/rate-limit.ts` — rate limiter custom in-memory (bukan
`elysia-rate-limit`, package itu butuh Elysia ≥2.0 sementara project pin
1.4.x). Dipasang di `app.ts` khusus untuk `/api/auth/*` (login/register,
endpoint paling rawan brute-force), BUKAN global ke semua route. Endpoint
lain yang butuh rate limit spesifik (mis. forgot-password) pasang plugin
yang sama secara eksplisit per-route, belum ada rate limit global
otomatis untuk semua endpoint.

## Health Check Endpoint (WAJIB ada)
`docker-compose.prod.yml` pakai `GET /health` untuk cek container siap sebelum
Caddy/web dianggap boleh terima traffic. Endpoint ini harus:
- Return 200 kalau API + koneksi DB sehat, non-200 kalau tidak.
- TIDAK butuh auth (dipanggil dari dalam Docker network, bukan publik lewat Caddy).
```ts
new Elysia().get("/health", async () => {
  await db.execute(sql`SELECT 1`); // pastikan DB kekoneksi
  return { status: "ok" };
});
```

## Referensi
**⚠️ BELUM diimplementasikan** — tidak ada package swagger/OpenAPI
terinstall di `apps/api` sama sekali sampai saat ini (Fase 00-05 semuanya
tidak butuh docs interaktif, tim internal kecil). Rekomendasi di bawah
ini rencana KALAU nanti dibutuhkan (mis. tim berkembang, atau butuh kasih
API docs ke pihak ketiga), bukan panduan setup yang sudah berjalan:

```ts
// apps/api/src/index.ts — BELUM ada di kode asli, ilustrasi saja
import { swagger } from "@elysia/swagger"; // cek dulu nama package terbaru sebelum install,
                                            // scope @elysiajs/* → @elysia/* pindah April 2026 (§ di atas)

app.use(swagger({
  path: "/docs", // GET /docs → Swagger UI interaktif, /docs/json → raw OpenAPI spec
}));
```

> **Jangan expose `/docs` di production tanpa proteksi** — endpoint ini
> membocorkan seluruh struktur API (termasuk endpoint yang belum
> "diumumkan"). Minimal: aktifkan cuma di dev/staging (`if (process.env.NODE_ENV
> !== "production")`), atau kalau memang perlu di production, taruh di
> belakang basic auth lewat Caddy.
