## 1.2.0 (2026-08-27)

* feat(import): pakai template-guide.ts — generateTemplateBuffer signature baru ([8e61194](https://github.com/webaneid/facport/commit/8e61194))
* feat(import): tambah panduan pengisian + baris contoh di template Excel ([350256c](https://github.com/webaneid/facport/commit/350256c))

## 1.1.0 (2026-08-26)

* feat(accurate): simpan & tampilkan nama Data Usaha, perbaiki UX pilih Data Usaha ([e51cb0c](https://github.com/webaneid/facport/commit/e51cb0c))

## <small>1.0.17 (2026-08-26)</small>

* fix(web): dashboard 500 — fetchJson() gak tahan body kosong dari /me/subscription ([a0e3c5f](https://github.com/webaneid/facport/commit/a0e3c5f))

## <small>1.0.16 (2026-08-26)</small>

* fix(api): 3 pola process.env.NODE_ENV lain kena const-fold Bun juga ([c190d93](https://github.com/webaneid/facport/commit/c190d93))

## <small>1.0.15 (2026-08-26)</small>

* fix(api): crossSubDomainCookies.enabled ke-const-fold jadi false permanen saat build ([2fe0033](https://github.com/webaneid/facport/commit/2fe0033))

## <small>1.0.14 (2026-08-26)</small>

* fix(web): NEXT_PUBLIC_API_URL di-bake ke bundle client saat build, bukan runtime ([1a96c3e](https://github.com/webaneid/facport/commit/1a96c3e))

## <small>1.0.13 (2026-08-26)</small>

* fix(deploy): healthcheck api/web pakai wget yang gak ada di image slim ([97881b4](https://github.com/webaneid/facport/commit/97881b4))

## <small>1.0.12 (2026-08-26)</small>

* fix(docker): api production stage juga butuh node_modules root (symlink sharp patah) ([7d80172](https://github.com/webaneid/facport/commit/7d80172))

## <small>1.0.11 (2026-08-26)</small>

* fix(deploy): DATABASE_URL di .env.production/staging.example gak boleh pakai \${...} ([58b0108](https://github.com/webaneid/facport/commit/58b0108))
* docs: dokumentasikan 6 bug deploy.yml (deploy.yml belum pernah jalan sejak v1.0.0) ([590c8cf](https://github.com/webaneid/facport/commit/590c8cf))

## <small>1.0.10 (2026-08-26)</small>

* fix(docker): web production stage — jalan di Node, bukan Bun, tanpa output:standalone ([d822d0b](https://github.com/webaneid/facport/commit/d822d0b))

## <small>1.0.9 (2026-08-26)</small>

* fix(web): bungkus LoginForm dengan Suspense — useSearchParams() bikin next build gagal ([6164826](https://github.com/webaneid/facport/commit/6164826))

## <small>1.0.8 (2026-08-26)</small>

* fix(docker): web build butuh source+deps apps/api juga (Eden Treaty type import) ([8d62159](https://github.com/webaneid/facport/commit/8d62159))

## <small>1.0.7 (2026-08-26)</small>

* fix(docker): copy root tsconfig.json — extends "../../tsconfig.json" gagal resolve ([6d3c93c](https://github.com/webaneid/facport/commit/6d3c93c))

## <small>1.0.6 (2026-08-26)</small>

* fix(api): tambah script "build" yang belum ada — Dockerfile butuh dist/index.js ([569381d](https://github.com/webaneid/facport/commit/569381d))

## <small>1.0.5 (2026-08-26)</small>

* fix(docker): Dockerfile copy bun.lockb yang tidak ada, seharusnya bun.lock ([92d2938](https://github.com/webaneid/facport/commit/92d2938))

## <small>1.0.4 (2026-08-26)</small>

* fix(ci): resolve-tag salah bandingkan SHA — build-and-push selalu ke-skip ([174cae8](https://github.com/webaneid/facport/commit/174cae8))

## <small>1.0.3 (2026-08-26)</small>

* fix(ci): deploy.yml tidak pernah jalan — GITHUB_TOKEN gak trigger event release ([ae1fd1f](https://github.com/webaneid/facport/commit/ae1fd1f))

## <small>1.0.2 (2026-08-26)</small>

* fix(web): resolve surface via subdomain prefix instead of hardcoded domain ([5f32fda](https://github.com/webaneid/facport/commit/5f32fda))
* docs: dokumentasikan 5 bug CI/CD dari push pertama + verifikasi pipeline ([bef70a1](https://github.com/webaneid/facport/commit/bef70a1))
* docs: prune irrelevant/stale documentation to save read tokens ([2bf9903](https://github.com/webaneid/facport/commit/2bf9903))

## <small>1.0.1 (2026-08-22)</small>

* fix: Akun Hutang di import Faktur Pembelian juga update vendor existing ([22bfa31](https://github.com/webaneid/facport/commit/22bfa31))

## 1.0.0 (2026-08-22)

* fix: install conventional-changelog-conventionalcommits peer dep ([d54f027](https://github.com/webaneid/facport/commit/d54f027))
* fix: install semantic-release plugins as devDependencies ([f560b7b](https://github.com/webaneid/facport/commit/f560b7b))
* fix: pin conventional-changelog-conventionalcommits to v7 ([83b53d2](https://github.com/webaneid/facport/commit/83b53d2))
* fix: seed role admin/customer in CI before running tests ([7349060](https://github.com/webaneid/facport/commit/7349060))
* fix: setup working CI/CD pipeline ([a7d7673](https://github.com/webaneid/facport/commit/a7d7673))
* Initial commit: Facport Fase 00-05 ([7fb0e98](https://github.com/webaneid/facport/commit/7fb0e98))
