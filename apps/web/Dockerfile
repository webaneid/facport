# apps/web/Dockerfile
# Sama prinsipnya: builder punya akses full repo, production cuma
# punya hasil build Next.js (.next/standalone) — bukan source + docs.

FROM oven/bun:1 AS builder
WORKDIR /repo

COPY package.json bun.lock tsconfig.json ./
COPY apps/web/package.json ./apps/web/
# apps/api/package.json JUGA WAJIB di-copy sebelum install — lib/api-client.ts
# (Eden Treaty) `import type { App } from "../../api/src/index"` butuh
# dependency apps/api (elysia, drizzle-orm, better-auth, dst) ke-install juga
# supaya type-check next build bisa resolve seluruh graph tipe App tersebut,
# BUKAN cuma dependency apps/web sendiri.
COPY apps/api/package.json ./apps/api/
RUN bun install --frozen-lockfile

# Source apps/api JUGA WAJIB ikut di-copy (bukan cuma package.json) — alasan
# sama: type-only import di atas butuh file .ts asli apps/api ada di disk
# buat type-check, walau ZERO kode apps/api ikut ke bundle .next/standalone
# (stage "production" di bawah cuma copy hasil build, bukan source ini).
COPY apps/web ./apps/web
COPY apps/api ./apps/api
RUN cd apps/web && bun run build
# Next.js dengan output: "standalone" di next.config.js akan hasilin
# folder .next/standalone yang isinya udah minimal (server.js + deps
# yang kepakai), makin kecil image finalnya.

FROM oven/bun:1-slim AS production
WORKDIR /app

COPY --from=builder /repo/apps/web/.next/standalone ./
COPY --from=builder /repo/apps/web/.next/static ./.next/static
COPY --from=builder /repo/apps/web/public ./public

ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "run", "server.js"]
