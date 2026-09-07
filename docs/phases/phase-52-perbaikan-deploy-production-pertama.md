# Fase 52 — Perbaikan Deploy Production Pertama (facinstitute.id)

**Status:** Done
**Mulai:** 2026-09-06
**Selesai:** 2026-09-07

## Tujuan
Deploy production PERTAMA KALI Facport ke domain asli (`admin.facinstitute.id`,
`app.facinstitute.id`, `facport.facinstitute.id`, `api.facinstitute.id`,
`media.facinstitute.id`, server `wasugi@76.13.18.136`, instance baru `/opt/facport`,
terpisah dari instance demo lama `ane.web.id`) mengungkap 3 bug infrastruktur
nyata yang tidak pernah ketahuan sebelumnya — semuanya baru "diuji" pertama
kali saat proses deploy production sungguhan (CI/redeploy rutin sebelumnya
tidak pernah exercise jalur-jalur ini). Fase ini mendokumentasikan
perbaikannya + prosedur yang sebelumnya tidak tertulis (bootstrap admin
pertama di instance baru).

## Scope
- [x] Fix CI: MinIO tidak pernah ada di `ci.yml`/`release.yml`/`deploy-staging.yml`
- [x] Fix Docker `apps/api`: `pdfkit` gagal resolve subpath import di production build
- [x] Fix Docker `apps/api`: image production tidak bisa `db:migrate`/`db:seed`
- [x] Fix `.env.production.example`: `PORT` hilang dari awal (variable wajib)
- [x] Dokumentasi: prosedur bootstrap admin pertama di instance baru (belum pernah ada)
- [x] Provisioning server production `facinstitute.id` end-to-end (verifikasi manual)

## Referensi
- Runbook onboarding domain baru: `docs/deployment-new-domain-onboarding.md`
- `docs/architecture/architecture-deployment.md`

## Kronologi Temuan & Fix

### 1. MinIO hilang di CI (`ci.yml`, `release.yml`, `deploy-staging.yml`)
Ketiga workflow set env var `MINIO_ENDPOINT=localhost` dkk seolah ada
server MinIO jalan, tapi TIDAK ADA service/container MinIO sama sekali —
3 test upload bukti transfer selalu gagal (500) begitu benar-benar
dijalankan (baru ketahuan sekarang karena test itu baru di-unskip
beberapa hari sebelumnya, § `lessons-learned.md` entri terkait). Fix:
`docker run` manual (BUKAN `services:` GitHub Actions — image resmi
`minio/minio` wajib command `server /data` yang tidak bisa di-override
lewat `services:`) di step terpisah sebelum test, di ketiga file.
Commit: `3b267c6`, `8c7ae9a`, `8ee0656`.

### 2. `pdfkit` gagal resolve di production build (v1.13.1)
Fitur invoice PDF (Fase 15, `@react-pdf/renderer`) BARU pertama kali
di-build jadi Docker image production di rilis v1.13.0 — `bun build`
mem-bundle `pdfkit` (yang pakai Node subpath imports `#standard-fonts/*`
di package.json-nya sendiri) ke satu file `dist/index.js`, subpath
import itu cuma resolve benar relatif ke package.json ASLI pdfkit,
bukan setelah dibundle. Container crash-loop terus-menerus begitu
online. Fix 2 bagian: `--external pdfkit` di build script (pola sama
`sharp`) + `pdfkit` ditambah jadi DIRECT dependency `apps/api` (sebelumnya
cuma transitif via `@react-pdf/renderer` — tanpa ini `--external` gagal
resolve total karena bun isolated store cuma bikin symlink node_modules
top-level untuk dependency langsung). Commit: `17ea1c7` → rilis `v1.13.1`.

### 3. Image production tidak bisa `db:migrate`/`db:seed` (v1.13.2)
Dockerfile stage production cuma copy `dist/`+`node_modules`+`package.json`
— TIDAK PERNAH menyertakan `drizzle.config.ts`, folder migration `drizzle/`,
atau `src/` asli (dibutuhkan `db:seed` yang jalan `bun run src/db/seed.ts`,
bukan dari dist/ yang sudah dibundle). Baru ketahuan sekarang karena baru
kali ini ada yang benar-benar migrate DB KOSONG dari dalam image production
(instance lama `ane.web.id` kemungkinan besar di-migrate lewat jalur lain
yang tidak terdokumentasi — TIDAK diselidiki lebih jauh, di luar scope).
Fix: tambah 3 baris `COPY` di stage production Dockerfile. Commit:
`4717717` → rilis `v1.13.2`.

### 4. `.env.production.example` tidak pernah punya `PORT`
Gap kecil ditemukan bersamaan dengan bug #1 — `apps/api/src/lib/env.ts`
mewajibkan `PORT`, tapi contoh env file tidak pernah mencantumkannya.
Diperbaiki di commit yang sama dengan fix #1.

### 5. Bootstrap admin pertama di instance baru — prosedur BARU (tidak pernah ada)
Panel admin TIDAK punya halaman self-register (by design — staff/admin
dibuat oleh admin lain via `POST /admin/staff`/`POST /admin/users`), jadi
instance BARU dengan DB kosong tidak punya cara bikin admin pertama lewat
UI sama sekali (chicken-and-egg). `db:seed` cuma bikin ROLE (`admin`=
"Super Admin", `staff`="Admin", `customer`), bukan akun user. Prosedur
yang dipakai (jalan sekali per instance baru): `docker exec` masuk
container `api`, tulis script sementara yang panggil
`auth.api.signUpEmail()` (jalur resmi Better Auth, SAMA PERSIS pola
`admin/staff.route.ts`) lalu assign role `admin` manual + **WAJIB**
`UPDATE "user" SET email_verified = true` (admin-provisioned dikecualikan
dari `requireEmailVerification`, § komentar `admin/users.route.ts:163-165`
— lupa langkah ini bikin akun tidak bisa login sama sekali, "Email atau
password salah" 403 `ACCOUNT_DISABLED`-lookalike tapi sebenarnya soal
verifikasi, ketemu nyata di fase ini). Script dihapus lagi setelah
dipakai (`docker exec ... rm`), tidak persist di image.

## Investigasi yang TIDAK Berujung Bug (dicatat biar tidak diulang)
Auto-login-setelah-verifikasi (Fase 48) SEMPAT dicurigai gagal di
production (user klik link verifikasi, mendarat di halaman login, bukan
auto-login) — diinvestigasi lewat reproduksi `curl -v` langsung ke
`GET /api/auth/verify-email` dengan token baru: response `302` + `Set-Cookie`
session (`Domain=.facinstitute.id`) + payload `emailVerified:true` SEMUA
benar. **Kesimpulan: fitur bekerja normal**, kejadian awal kemungkinan
besar token sudah expired (window 1 jam) saat benar-benar diklik. TIDAK
ADA perubahan kode untuk ini.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck` — dijalankan tiap fix)
- [x] Verifikasi end-to-end di server production sungguhan (bukan cuma test lokal) — login admin, 5 paket tampil di landing, semua subdomain HTTPS aktif
- [ ] Upload logo/favicon (media/MinIO, `media.facinstitute.id`) — BELUM dikonfirmasi manual oleh user, minta di Known Limitations
- [x] Security review — tidak ada perubahan permission/auth baru (fix murni infrastruktur build/CI), tidak perlu review terpisah
- [x] `docs/PROGRESS.md` diupdate
- [x] `docs/lessons-learned.md` — akan ditambah entri terpisah (5 temuan di atas)

## Known Limitations
- Upload logo/favicon company (`media.facinstitute.id`, MinIO) BELUM
  dikonfirmasi manual — subdomain + SSL sudah aktif dan `MINIO_PUBLIC_URL`
  sudah benar di `.env.production`, tapi belum ada verifikasi end-to-end
  nyata (klik upload di Settings, cek gambar tampil).
- ~~`RESEND_API_KEY` masih kosong~~ **RESOLVED 2026-09-07** — domain
  `facinstitute.id` diverifikasi di Resend, API key dibuat & diisi ke
  `.env.production`, `api`+`worker` di-restart. Diverifikasi end-to-end
  nyata: trigger forgot-password dari `app.facinstitute.id`, email
  benar-benar masuk ke inbox (bukan cuma log no-op lagi).
- Deploy otomatis ke server (`deploy-to-server` di `deploy.yml`/
  `deploy-staging.yml`) masih gagal by design — secret SSH GitHub Actions
  belum diisi, provisioning production ini SEMUA manual via runbook.
- Prosedur bootstrap admin pertama (§5) belum ditulis jadi dokumen
  tersendiri yang bisa di-referensi ulang — cuma tercatat di phase doc ini.
  Pertimbangkan naikkan jadi command/script resmi
  (`bun run db:bootstrap-admin` di `apps/api/package.json`) kalau instance
  baru diperkirakan akan sering dibuat lagi.

## Ringkasan Hasil
Facport production PERTAMA KALI online di domain asli (5 subdomain
`facinstitute.id`, SSL aktif, instance baru terpisah dari demo
`ane.web.id`). 3 bug infrastruktur nyata ditemukan & diperbaiki dalam
proses (MinIO hilang di 3 workflow CI, `pdfkit` gagal resolve di
production build, image tidak bisa migrate/seed) — ketiganya baru
"teruji" sekarang karena ini pertama kalinya jalur-jalur itu benar-benar
dieksekusi (test upload bukti transfer baru di-unskip, fitur PDF invoice
baru pertama di-build ke image, DB kosong baru pertama di-migrate dari
dalam container). Rilis `v1.13.0` → `v1.13.1` → `v1.13.2` (2 hotfix
beruntun). Prosedur bootstrap admin pertama didokumentasikan (belum
pernah ada sebelumnya). Auto-login-setelah-verifikasi diinvestigasi dan
dikonfirmasi BEKERJA NORMAL (bukan bug, kejadian awal kemungkinan token
expired).
