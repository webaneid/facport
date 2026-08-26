# apps/api/Dockerfile
#
# Stage "builder" punya akses ke SELURUH repo (termasuk docs/, CLAUDE.md,
# .claude/) karena butuh workspace root buat resolve dependency monorepo.
# Stage "production" cuma copy HASIL BUILD — secara fisik file .md/docs
# TIDAK PERNAH ada di image final, bukan cuma "disembunyikan".

FROM oven/bun:1 AS builder
WORKDIR /repo

# Copy manifest dulu buat cache layer install (lebih cepat rebuild)
COPY package.json bun.lock tsconfig.json ./
COPY apps/api/package.json ./apps/api/
RUN bun install --frozen-lockfile

# Baru copy source code apps/api (bukan seluruh repo — .dockerignore
# juga bantu exclude docs/.claude di level ini)
COPY apps/api ./apps/api
RUN cd apps/api && bun run build

# ---- Stage production: image final yang jalan di server ----
# CATATAN PENTING (ditemukan 2026-08-27, deploy nyata pertama kali): WORKDIR
# TETAP "/repo" dengan apps/api DI-NESTED PERSIS seperti builder, BUKAN
# di-flatten ke /app langsung. `bun install` di monorepo ini pakai isolated
# store (node_modules/.bun/...) — package seperti "sharp" di
# apps/api/node_modules cuma SYMLINK relatif ("../../../node_modules/.bun/...").
# Kalau di-flatten, symlink itu patah (ENOENT) karena target relatifnya
# nunjuk ke luar struktur yang ke-copy. Root node_modules (isi store asli)
# WAJIB ikut di-copy juga, bukan cuma apps/api/node_modules sendiri.
FROM oven/bun:1-slim AS production
WORKDIR /repo

COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /repo/apps/api/dist ./apps/api/dist
COPY --from=builder /repo/apps/api/package.json ./apps/api/package.json

ENV NODE_ENV=production
EXPOSE 3001
WORKDIR /repo/apps/api
CMD ["bun", "run", "dist/index.js"]

# Verifikasi manual kalau ragu: docker run --rm -it <image> ls -la
# Nggak akan ketemu file .md, folder docs/, atau .claude/ sama sekali.
