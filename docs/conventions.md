# Conventions

## Naming
- Tabel DB: snake_case plural (`posts`, `post_targets`)
- TypeScript variable/function: camelCase
- TypeScript type/interface/class: PascalCase
- File route: `{resource}.route.ts`, service: `{resource}.service.ts`

## Branch & PR
- `main` — production, protected, cuma nerima merge dari `develop` (atau
  hotfix branch untuk bug urgent, lihat pengecualian di `docs/SOP.md`).
- `develop` — staging, auto-deploy tiap push (lihat
  `docs/decisions/adr-0003-staging-environment.md`).
- Feature branch: `feat/{nama-fitur}`, `fix/{nama-bug}` — PR ke `develop`,
  bukan langsung ke `main`.
- Commit message WAJIB conventional commits (lihat bagian di bawah) — ini
  yang dibaca semantic-release untuk nentuin versi, bukan cuma gaya penulisan.

## Commit Message
`type(scope): deskripsi singkat`
Contoh: `feat(api): tambah endpoint upload gambar via presigned URL`
Type: feat, fix, refactor, docs, chore, test

## TypeScript
- Strict mode wajib
- Hindari `any` — kalau terpaksa, kasih komentar alasan
- Share types antara apps/api dan apps/web lewat package internal kalau memungkinkan
  (monorepo type-sharing), supaya kontrak API selalu sinkron.

## Environment Variables
- Semua env didefinisikan di `.env.example` per app, JANGAN commit `.env` asli
- Prefix `NEXT_PUBLIC_` di apps/web hanya untuk yang memang boleh exposed ke client
