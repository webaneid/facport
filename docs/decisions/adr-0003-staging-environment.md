# ADR-0003: Staging Environment & Branching Strategy

**Status:** Accepted
**Tanggal:** 2026-08-18

## Context
Sebelumnya cuma ada satu environment: production, di-deploy otomatis dari
`main` lewat semantic-release (ADR-0002). Kalau ada bug lolos dari
typecheck/test/security-review (langkah 3-4 SOP tidak menjamin 100% bug
tertangkap), bug itu langsung kena user asli — tidak ada tempat untuk
verifikasi manual sebelum production.

## Decision
- Tambah branch `develop` sebagai **integration branch** — tiap push ke
  `develop` otomatis build & deploy ke **staging**.
- Staging **TIDAK pakai semantic-release/versioning** — image di-tag
  `staging` (ditimpa tiap push), bukan versi semver. Alasan: staging itu
  "preview terus-menerus", bukan artifact yang perlu ditelusuri per-versi
  seperti production.
- Alur branch:
  ```
  feature branch → PR ke develop → (ci.yml jalan) → merge ke develop
        → auto-deploy staging → verifikasi manual di staging
        → PR develop ke main → (ci.yml jalan lagi) → merge ke main
        → semantic-release → versi baru → auto-deploy production
  ```
- `main` **tetap protected**, cuma nerima merge dari `develop` (atau
  hotfix branch untuk bug production urgent — lihat pengecualian di
  `docs/SOP.md`).
- Staging jalan di **VPS yang sama** dengan production (bukan VPS terpisah)
  untuk hemat biaya di tahap awal — dipisah lewat subdomain (`staging.
  namadomain.com`) dan Docker Compose project name berbeda, resource limit
  lebih kecil dari production. **Revisit lewat ADR baru** kalau nanti butuh
  isolasi lebih kuat (mis. staging kebanyakan load ganggu production).

## Alternatif yang Dipertimbangkan
- **Preview deployment per-PR** (mis. ala Vercel, tiap PR dapat environment
  sendiri) — lebih canggih tapi lebih kompleks setup & lebih mahal (butuh
  isolasi DB per-PR). Ditolak untuk tahap ini, staging tunggal sudah cukup
  untuk kebutuhan solo/tim kecil. Bisa direvisit kalau tim membesar.
- **Staging di VPS terpisah dari awal** — lebih aman (production benar-benar
  tidak terganggu load staging) tapi 2x biaya VPS. Ditolak untuk tahap awal,
  dicatat sebagai opsi upgrade di atas.

## Konsekuensi
- Butuh workflow CI/CD baru (`deploy-staging.yml`), compose file baru
  (`docker-compose.staging.yml`), env file baru (`.env.staging`), dan
  subdomain baru (`staging.namadomain.com`) — detail lengkap di
  `docs/architecture/architecture-deployment.md` dan
  `docs/deployment-server-setup.md`.
- `docs/SOP.md` diupdate: sebelum fase dianggap benar-benar selesai untuk
  fitur besar/berisiko, verifikasi di staging dulu sebelum PR ke `main`
  (bukan wajib mutlak untuk semua fase — fase kecil boleh langsung ke main
  kalau sudah lolos typecheck+test+security review, lihat SOP).
- Data di staging TIDAK PERNAH data production asli (privasi & supaya tes
  tidak sengaja korupsi data nyata) — pakai data dummy/seed, atau subset
  anonymized kalau memang perlu data realistis.
