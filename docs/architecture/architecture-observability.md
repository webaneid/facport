# Architecture — Observability (Error Tracking & Logging)

> Tanpa ini, bug production cuma ketahuan kalau user lapor manual — dan pas
> itu terjadi, `console.log` yang sudah lama ke-flush/hilang tidak bisa
> dilacak lagi. Ini bukan "nice to have" begitu ada user asli.

## 1. Error Tracking — Sentry

**Kenapa Sentry (bukan self-hosted GlitchTip/dst dulu):** paling cepat setup,
free tier cukup untuk skala awal, tidak nambah beban ops di VPS yang sudah
jalankan Postgres+MinIO+API+Web. Kalau nanti scale besar/butuh full
self-hosted (data residency, dst) → revisit lewat ADR baru, jangan pindah
diam-diam (dampak ke setup di kedua apps).

### apps/api (Elysia/Bun)
```ts
// apps/api/src/lib/sentry.ts
import * as Sentry from "@sentry/bun";

Sentry.init({
  dsn: process.env.SENTRY_DSN_API, // kosong = disabled, aman untuk dev lokal
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
});

export { Sentry };
```

```ts
// apps/api/src/index.ts — tangkap SEMUA error tak tertangani lewat .onError()
import { Sentry } from "./lib/sentry";
import { logger } from "./lib/logger";

app.onError(({ code, error, set }) => {
  logger.error({ err: error, code }, "Unhandled error");
  if (code !== "VALIDATION") Sentry.captureException(error); // error validasi user itu normal, bukan bug
  set.status = code === "NOT_FOUND" ? 404 : 500;
  return { data: null, error: { message: "Internal server error", code } };
});
```

### apps/web (Next.js)
Pakai wizard resmi (generate config otomatis, lebih reliable daripada
copas manual):
```bash
cd apps/web
bunx @sentry/wizard@latest -i nextjs
```
Ini generate `sentry.client.config.ts`, `sentry.server.config.ts`,
`sentry.edge.config.ts` — isi `dsn` dari env `NEXT_PUBLIC_SENTRY_DSN`.

### Env yang dibutuhkan (tambahkan ke `.env.example` masing-masing app)
```
# apps/api/.env.example
SENTRY_DSN_API=

# apps/web/.env.example
NEXT_PUBLIC_SENTRY_DSN=
```

## 2. Structured Logging — Pino

**Kenapa Pino (bukan Winston):** standar de-facto ekosistem Bun/Node saat
ini, lebih cepat, output JSON native (gampang di-parse tool log aggregator
kalau nanti dipasang).

```ts
// apps/api/src/lib/logger.ts
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  // Dev: human-readable. Production: JSON murni (lebih gampang di-ingest
  // tool log aggregator kalau nanti dipasang, mis. Grafana Loki/Axiom).
  transport: process.env.NODE_ENV !== "production"
    ? { target: "pino-pretty", options: { colorize: true } }
    : undefined,
  redact: ["req.headers.authorization", "*.password", "*.token"], // cegah kebocoran ke log walau ke-pass tidak sengaja
});
```

### Aturan Pemakaian
- **JANGAN `console.log` langsung di kode baru** — pakai `logger.info(...)`,
  `logger.error(...)`, dst. Ini supaya semua log konsisten format & level,
  dan bisa di-redirect ke aggregator nanti tanpa ubah kode lagi.
- Request logging: pasang sekali di `index.ts` (mis. plugin `@elysiajs/logger`
  atau middleware manual pakai `logger` di atas), jangan log manual di
  tiap handler satu-satu.
- **Tetap ikuti `docs/architecture/architecture-security.md` §10** — jangan
  log password, token, data pribadi lengkap. `redact` di atas itu lapisan
  kedua (jaga-jaga lupa), bukan pengganti disiplin tidak nge-log data sensitif
  dari awal.

## 3. Kapan Pakai Sentry vs Logger
| Situasi | Pakai |
|---|---|
| Error tak terduga/bug (exception, promise rejection) | Sentry (`captureException`) — perlu notifikasi & stack trace |
| Event normal (request masuk, job selesai, dsb) | Logger (`logger.info`) — bukan bug, cuma jejak audit |
| Validasi user gagal (400, input salah) | Logger saja (`logger.warn`), JANGAN Sentry — ini bukan bug aplikasi, nanti Sentry penuh noise |
| Error yang sudah di-recover otomatis (retry berhasil) | Logger (`logger.warn`) — dicatat tapi tidak perlu alert |

## Referensi
- Checklist logging → `docs/architecture/architecture-security.md` §10
- Env var lengkap → `apps/api/.env.example`, `apps/web/.env.example`,
  `.env.production.example`
