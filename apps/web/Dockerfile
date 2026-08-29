# apps/web/Dockerfile
# Sama prinsipnya: builder punya akses full repo, production cuma
# punya hasil build Next.js + dependency — bukan source .ts/.tsx + docs.
#
# CATATAN PENTING (ditemukan 2026-08-26, build image nyata pertama kali):
# Stage production JALAN DI NODE, BUKAN BUN, dan TIDAK pakai
# `output: "standalone"` — dua-duanya dicoba dulu dan gagal:
# 1. `bun run` server Next.js (baik "standalone" atau bukan) crash:
#    "Failed to load external module .../app-page-turbo.runtime.prod.js:
#    TypeError: Expected CommonJS module to have a function wrapper" —
#    bug kompatibilitas Bun runtime dengan bundle Turbopack Next 16.
# 2. `output: "standalone"` di monorepo ini nge-trace ulang node_modules
#    dari struktur isolated-store `bun install` (node_modules/.bun/...
#    + symlink) dan hasilnya nggak lengkap (MODULE_NOT_FOUND) — baik
#    dijalankan via Bun maupun Node.
# Yang TERBUKTI jalan (diverifikasi lokal end-to-end sampai HTTP 200):
# `node node_modules/.bin/next start` pakai node_modules ASLI (full, hasil
# `bun install`, BUKAN hasil trace standalone) dengan Node.js sebagai
# runtime. Detail lengkap → docs/lessons-learned.md.

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
# buat type-check, walau ZERO kode/deps apps/api ikut ke image production
# (stage di bawah cuma copy node_modules + .next hasil build apps/web).
COPY apps/web ./apps/web
COPY apps/api ./apps/api
RUN cd apps/web && bun run build

# ---- Stage production: image final yang jalan di server (Node, lihat catatan atas) ----
FROM node:26-slim AS production
WORKDIR /repo

# node_modules ROOT (berisi store `.bun/...` asli) WAJIB ikut — symlink di
# apps/web/node_modules nunjuk relatif ke sini (../../../node_modules/.bun/...),
# jadi struktur nested /repo/apps/web HARUS dipertahankan persis, bukan
# di-flatten ke /app langsung.
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/apps/web/node_modules ./apps/web/node_modules
COPY --from=builder /repo/apps/web/.next ./apps/web/.next
COPY --from=builder /repo/apps/web/public ./apps/web/public
COPY --from=builder /repo/apps/web/package.json ./apps/web/package.json
COPY --from=builder /repo/apps/web/next.config.ts ./apps/web/next.config.ts

ENV NODE_ENV=production
EXPOSE 3000
WORKDIR /repo/apps/web
CMD ["node", "node_modules/.bin/next", "start", "-p", "3000"]
