import * as Sentry from "@sentry/bun";
import { env } from "./env";

// Notasi bracket ("NODE_ENV") SENGAJA, bukan process.env.NODE_ENV — Bun
// const-fold pola dot-notation itu SAAT BUILD. Lihat lib/auth.ts §
// crossSubDomainCookies buat detail lengkap bug class ini.
Sentry.init({
  dsn: env.SENTRY_DSN_API, // kosong = disabled, aman untuk dev lokal
  environment: process.env["NODE_ENV"],
  tracesSampleRate: process.env["NODE_ENV"] === "production" ? 0.1 : 0,
});

export { Sentry };
