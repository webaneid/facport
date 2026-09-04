import { t } from "elysia";
import { Value } from "@sinclair/typebox/value";

const envSchema = t.Object({
  DATABASE_URL: t.String({ minLength: 1 }),
  // JWT_SECRET SENGAJA tidak ada di sini — auth pakai session Better Auth
  // (BETTER_AUTH_SECRET), bukan JWT manual. Kalau nanti butuh JWT beneran
  // (mis. service-to-service token), tambah lagi DENGAN komentar jelas
  // dipakai untuk apa (§ Low finding security review Fase 00: sebelumnya
  // required tapi tidak dipakai sama sekali di kode manapun).
  MINIO_ENDPOINT: t.String({ minLength: 1 }),
  MINIO_PORT: t.String({ minLength: 1 }),
  MINIO_USE_SSL: t.String({ minLength: 1 }),
  MINIO_ACCESS_KEY: t.String({ minLength: 1 }),
  MINIO_SECRET_KEY: t.String({ minLength: 1 }),
  // § Fase 12, ADR-0017 — base URL yang bisa diakses BROWSER untuk bucket
  // public (facport-public), BEDA dari MINIO_ENDPOINT (host internal Docker
  // network, cuma bisa diakses server). Dev: "http://localhost:9000".
  // Prod: "https://media.<domain>" (host baru di Caddyfile, reverse_proxy
  // ke minio:9000 — MinIO sendiri TETAP tidak diekspos langsung).
  MINIO_PUBLIC_URL: t.String({ minLength: 1 }),
  PORT: t.String({ minLength: 1 }),
  BETTER_AUTH_SECRET: t.String({ minLength: 32 }),
  BETTER_AUTH_URL: t.String({ minLength: 1 }),
  SENTRY_DSN_API: t.Optional(t.String()),
  LOG_LEVEL: t.Optional(t.String()),
  RESEND_API_KEY: t.Optional(t.String()),
  EMAIL_FROM: t.Optional(t.String()),
  // Origin frontend production, DIPISAH KOMA — WAJIB ketiga surface
  // (landing, admin, app), bukan cuma satu (§ Low finding security review
  // Fase 01: WEB_ORIGIN_PROD singular sebelumnya cuma cover 1 dari 3
  // subdomain, bikin CORS/trustedOrigins nolak 2 surface lain kalau isi
  // cuma satu). Contoh: "https://facport.com,https://admin.facport.com,https://app.facport.com"
  WEB_ORIGINS_PROD: t.Optional(t.String()),
  // Origin surface "app" SATU-SATUNYA (bukan list) — dipakai sebagai target
  // redirect setelah OAuth callback Accurate (routes/accurate.route.ts),
  // beda kebutuhan dari WEB_ORIGINS_PROD (list, buat CORS/trustedOrigins).
  APP_ORIGIN_PROD: t.Optional(t.String()),
  // Cross-subdomain session cookie (§ architecture-domain-routing.md,
  // Fase 01 M5) — ".localhost" dev, ".facport.com" prod (contoh).
  COOKIE_DOMAIN: t.String({ minLength: 1 }),
  // Accurate Online OAuth — CLIENT_ID/SECRET kosong sampai user kasih
  // kredensial asli (§ architecture-accurate-integration.md § 1), app
  // WAJIB tetap bisa boot tanpanya (Optional), endpoint /accurate/connect
  // yang nolak kalau kosong, bukan env validation di boot time.
  ACCURATE_CLIENT_ID: t.Optional(t.String()),
  ACCURATE_CLIENT_SECRET: t.Optional(t.String()),
  ACCURATE_REDIRECT_URI: t.String({ minLength: 1 }),
  // minLength 32 (naik dari 16, § Low finding security review Fase 01) —
  // key derivation scrypt lebih kuat dengan secret masukan lebih panjang.
  // Generate dev/prod: `openssl rand -base64 32`.
  ACCURATE_TOKEN_ENCRYPTION_KEY: t.String({ minLength: 32 }),
});

if (!Value.Check(envSchema, process.env)) {
  const errors = [...Value.Errors(envSchema, process.env)];
  console.error("❌ Environment variable tidak valid:");
  for (const e of errors) console.error(`  - ${e.path}: ${e.message}`);
  process.exit(1);
}

export const env = process.env as unknown as typeof envSchema.static;

// Dipakai app.ts (CORS) & auth.ts (trustedOrigins) — SATU sumber parsing,
// jangan split string ini ulang di banyak file.
export const webOriginsProd: string[] = env.WEB_ORIGINS_PROD
  ? env.WEB_ORIGINS_PROD.split(",").map((s) => s.trim()).filter(Boolean)
  : [];
