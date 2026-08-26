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
