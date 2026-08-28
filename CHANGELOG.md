## <small>1.7.2 (2026-08-28)</small>

* fix(web): pindah icon Edit ke baris gagal, bukan tabel batch ([df6823f](https://github.com/webaneid/facport/commit/df6823f))

## <small>1.7.1 (2026-08-28)</small>

* fix: dashboard 500 — pisahkan CANCELLABLE_BATCH_STATUS dari file "use client" ([d6cd362](https://github.com/webaneid/facport/commit/d6cd362))

## 1.7.0 (2026-08-28)

* feat(web): icon konsisten Detail/Batal Import di dashboard + arsip ([dfe6a95](https://github.com/webaneid/facport/commit/dfe6a95))
* docs: tutup Fase 09 — diverifikasi ulang nyata pasca-fix ADR-0014 ([26a7e4e](https://github.com/webaneid/facport/commit/26a7e4e))

## <small>1.6.1 (2026-08-28)</small>

* fix: Fase 09 — blokir faktur gabungan, bukan susutkan (ADR-0014) ([0d6503b](https://github.com/webaneid/facport/commit/0d6503b))

## 1.6.0 (2026-08-27)

* feat: Fase 09 — Batal Import (hapus/susutkan faktur di Accurate) ([b8fc5f4](https://github.com/webaneid/facport/commit/b8fc5f4))
* docs: tutup Fase 08 — diverifikasi nyata (6/6 retry sukses) ([0029fe9](https://github.com/webaneid/facport/commit/0029fe9)), closes [200/#250](https://github.com/webaneid/facport/issues/250)

## <small>1.5.1 (2026-08-27)</small>

* fix: field vendor.vendorNo (bukan vendor.no) di getPurchaseInvoiceDetail ([00bb9fb](https://github.com/webaneid/facport/commit/00bb9fb))

## 1.5.0 (2026-08-27)

* feat: Fase 08 — Retry Cerdas, update faktur existing (append item) ([8128049](https://github.com/webaneid/facport/commit/8128049))
* docs: tutup Fase 06 — diverifikasi nyata ke Accurate + lessons-learned worker ([f4a56ab](https://github.com/webaneid/facport/commit/f4a56ab))

## 1.4.0 (2026-08-27)

* docs: update Fase 06 — sisi kode selesai, menunggu verifikasi Accurate nyata ([13a046f](https://github.com/webaneid/facport/commit/13a046f))
* feat(api): grouping Faktur Pembelian multi-item berdasarkan Bill No (Fase 06, 1/3) ([05c5e37](https://github.com/webaneid/facport/commit/05c5e37))
* feat(api): worker proses Faktur Pembelian per-grup, bukan per-baris (Fase 06, 2/3) ([8080505](https://github.com/webaneid/facport/commit/8080505))
* feat(web): catatan info grouping multi-item di UI konfirmasi mapping (Fase 06, 3/3) ([e3ccb36](https://github.com/webaneid/facport/commit/e3ccb36))

## 1.3.0 (2026-08-27)

* feat(web): tampilkan & urutkan Nomor Faktur di detail hasil import (Fase 07) ([376991c](https://github.com/webaneid/facport/commit/376991c))
* docs: rencana Fase 06 (Purchase Invoice multi-item) + ADR-0011 ([34fab0a](https://github.com/webaneid/facport/commit/34fab0a))
* fix(api): import_batches.status varchar(20) overflow untuk "completed_with_errors" ([d49b234](https://github.com/webaneid/facport/commit/d49b234))

## <small>1.2.1 (2026-08-27)</small>

* fix(deploy): tambah service worker — job queue TIDAK PERNAH diproses tanpa ini ([a256df0](https://github.com/webaneid/facport/commit/a256df0))

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
