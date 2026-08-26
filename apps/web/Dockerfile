# apps/web/Dockerfile
# Sama prinsipnya: builder punya akses full repo, production cuma
# punya hasil build Next.js (.next/standalone) — bukan source + docs.

FROM oven/bun:1 AS builder
WORKDIR /repo

COPY package.json bun.lock ./
COPY apps/web/package.json ./apps/web/
RUN bun install --frozen-lockfile

COPY apps/web ./apps/web
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
