# apps/api/Dockerfile
#
# Stage "builder" punya akses ke SELURUH repo (termasuk docs/, CLAUDE.md,
# .claude/) karena butuh workspace root buat resolve dependency monorepo.
# Stage "production" cuma copy HASIL BUILD — secara fisik file .md/docs
# TIDAK PERNAH ada di image final, bukan cuma "disembunyikan".

FROM oven/bun:1 AS builder
WORKDIR /repo

# Copy manifest dulu buat cache layer install (lebih cepat rebuild)
COPY package.json bun.lockb ./
COPY apps/api/package.json ./apps/api/
RUN bun install --frozen-lockfile

# Baru copy source code apps/api (bukan seluruh repo — .dockerignore
# juga bantu exclude docs/.claude di level ini)
COPY apps/api ./apps/api
RUN cd apps/api && bun run build

# ---- Stage production: image final yang jalan di server ----
FROM oven/bun:1-slim AS production
WORKDIR /app

COPY --from=builder /repo/apps/api/dist ./dist
COPY --from=builder /repo/apps/api/node_modules ./node_modules
COPY --from=builder /repo/apps/api/package.json ./package.json

ENV NODE_ENV=production
EXPOSE 3001
CMD ["bun", "run", "dist/index.js"]

# Verifikasi manual kalau ragu: docker run --rm -it <image> ls -la
# Nggak akan ketemu file .md, folder docs/, atau .claude/ sama sekali.
