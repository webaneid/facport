# Lessons Learned

> Format tiap entri: tanggal, masalah, root cause, fix, pencegahan.
> Wajib diisi di akhir sesi debugging signifikan — minta Claude nulis di sini
> sebelum menutup sesi.

---

## 2026-08-28 — CI auto-deploy (`deploy-to-server`) TIDAK PERNAH benar-benar jalan sejak awal — secret SSH kosong
**Masalah:** Ketemu saat verifikasi nyata Fase 08 — push ke `main` selalu
menghasilkan Release sukses + `build-and-push` sukses (image ke GHCR), tapi
job `deploy-to-server` (SSH ke VPS, `docker compose pull && up -d`) SELALU
gagal dengan `error: missing server host` dari `appleboy/ssh-action`.
Karena `build-and-push` selalu sukses dan overall run summary GitHub
kadang tampil ambigu, ini tidak ketahuan sampai sengaja dicek satu-satu
step-nya. Setiap "deploy" yang benar-benar sampai ke server `ane.web.id`
sepanjang project ini (Fase 02 s.d. 08) **dilakukan MANUAL lewat SSH
langsung**, BUKAN lewat pipeline CI — pipeline-nya cuma push image ke GHCR
lalu berhenti.

**Root cause:** `gh secret list` di repo `webaneid/facport` mengembalikan
KOSONG — secret `SERVER_HOST`/`SERVER_USER`/`SERVER_SSH_KEY` yang dibaca
`.github/workflows/deploy.yml` job `deploy-to-server` tidak pernah diisi
sejak repo dibuat. Komentar di `deploy.yml` sendiri SUDAH mengantisipasi
ini ("Kalau secrets ... belum diisi ... step ini gagal — TIDAK apa-apa,
image di job sebelumnya tetap sudah ter-push ke GHCR") tapi tidak ada
alert/notifikasi yang bikin ini kepergok lebih awal — kelas bug yang SAMA
dengan 2 temuan sebelumnya (`deploy.yml` tidak ke-trigger 2026-08-26,
service `worker` tidak pernah ada di compose 2026-08-28): sesuatu yang
"ada di kode/config tapi belum pernah benar-benar tervalidasi jalan di
lingkungan nyata" luput karena setiap langkah SEBELUMNYA (release,
build-and-push) selalu sukses dan terlihat cukup meyakinkan.

**Fix (saat ini):** BELUM diisi (butuh keputusan user — isi secret GitHub
Actions perlu private key SSH server, sengaja tidak dilakukan sepihak).
Workaround yang dipakai tiap kali fase baru butuh deploy nyata: manual
`ssh wasugi@76.13.18.136`, `docker compose -f docker-compose.prod.yml -f
docker-compose.override.yml --env-file .env.production --env-file
.env.deploy pull/up -d` dengan `IMAGE_TAG` versi yang baru dirilis (lihat
`git tag`/commit `chore(release): x.x.x`).

**Insiden turunan saat workaround manual (2026-08-28)**: `docker compose
up -d` PERTAMA dijalankan cuma dengan `-f docker-compose.prod.yml` (lupa
`-f docker-compose.override.yml`) — Compose HANYA auto-merge
`docker-compose.override.yml` kalau nama file compose utama default
(`docker-compose.yml`), begitu `-f` dipakai eksplisit, override HARUS
ikut di-`-f` eksplisit juga, TIDAK otomatis. Akibatnya container `web`/`api`
naik TANPA port mapping ke `127.0.0.1:3020`/`3021` sama sekali (`docker
port` kosong), nginx dapat 502 selama beberapa menit sampai ketahuan &
diperbaiki (`ss -tlnp` konfirmasi tidak ada yang listen di port itu).

**Pencegahan:**
1. Isi secret `SERVER_HOST`/`SERVER_USER`/`SERVER_SSH_KEY` di GitHub
   Actions kalau auto-deploy CI memang mau benar-benar dipakai — perlu
   keputusan eksplisit user dulu (generate/pilih SSH key mana yang dipakai
   khusus deploy, idealnya BUKAN key personal yang sama dipakai login
   manual).
2. SELALU pakai kedua `-f` file (`docker-compose.prod.yml` DAN
   `docker-compose.override.yml`) untuk SEMUA operasi `docker compose`
   manual di server ini — pertimbangkan bikin alias/script kecil di server
   (`/opt/app/deploy.sh`) yang membungkus command lengkap supaya tidak
   ketinggalan flag lagi.
3. Setelah deploy manual apa pun, WAJIB curl `127.0.0.1:3020`/`3021` DAN
   domain publik sebelum menganggap deploy selesai — jangan cuma percaya
   `docker ps` status "healthy" (healthcheck internal container bisa OK
   walau port EXTERNAL tidak ke-mapping sama sekali).

---

## 2026-08-28 — Service `worker` (pg-boss) TIDAK PERNAH ada di `docker-compose.prod.yml`/`.staging.yml`
**Masalah:** Batch import Faktur Pembelian permanen nyangkut status
"processing" di server `ane.web.id` — halaman detail batch
(`.../purchase-invoice/import/<batchId>`) "tidak masuk" (user report).
Baris-barisnya juga tidak pernah berubah dari `pending`.

**Root cause:** `apps/api` punya DUA entry point terpisah SENGAJA —
`src/index.ts` (server HTTP, `.listen()`) dan `src/workers/index.ts`
(proses worker pg-boss terpisah, konsumsi job `IMPORT_TO_ACCURATE`/
`SEND_EMAIL`/dst — lihat `apps/api/CLAUDE.md`). `docker-compose.prod.yml`
DAN `docker-compose.staging.yml` dari commit pertama project cuma punya
service `api` (jalanin `dist/index.js`) — **tidak pernah ada service yang
menjalankan `dist/worker.js` sama sekali**. Setiap `boss.send(...)` yang
di-enqueue dari route (upload/confirm/retry) numpuk di tabel
`pgboss.job` selamanya, tidak ada consumer.

Ini KELAS BUG YANG SAMA dengan temuan sebelumnya soal `deploy.yml` tidak
pernah jalan (`docs/lessons-learned.md` entri 2026-08-27) — sesuatu yang
"ada di kode/config tapi belum pernah benar-benar dijalankan di
lingkungan nyata" luput dari deteksi karena tidak ada test/CI yang
menyentuh proses worker sebagai container terpisah (test lokal jalanin
worker langsung via `bun run dev:worker`/`bun run src/workers/index.ts`,
bukan lewat compose file production).

**Fix:**
1. `apps/api/package.json` — script baru `build:worker` (bundle
   `src/workers/index.ts` terpisah dari `src/index.ts`, `--external sharp`
   sama seperti build API server).
2. `apps/api/Dockerfile` — builder stage jalankan `build:worker` juga,
   `dist/worker.js` ikut ke-copy ke image production (image API dan
   worker SAMA, cuma command override).
3. `docker-compose.prod.yml` & `.staging.yml` — service baru `worker`,
   `command: ["bun", "run", "dist/worker.js"]`.
4. **Stopgap darurat** (sebelum image baru selesai build lewat CI):
   `docker cp` source `apps/api/src` ke container `api` yang sudah jalan,
   eksekusi `bun run src/workers/index.ts` langsung (Bun bisa jalankan
   `.ts` tanpa build step) via `docker exec -d` — job yang nyangkut
   langsung ke-proses begitu worker sementara ini nyala (pg-boss job
   persisten di Postgres, worker yang telat nyala tetap kepick-up job
   lama). Diganti proses resmi (container `worker` sungguhan) begitu
   image baru selesai di-deploy.

**Pencegahan:** Kalau project lain dari template ini juga punya proses
worker terpisah (`workers/index.ts` atau sejenis), JANGAN asumsikan
`docker-compose.prod.yml` otomatis include service untuk itu cuma karena
`api`/`web` sudah ada — cek eksplisit `docker compose config --services`
mencakup SEMUA proses yang didefinisikan di `package.json`
(`start`/`start:worker`/dst), bukan cuma yang jelas-jelas terima HTTP
request.

---

## 2026-08-27 — `deploy.yml` belum PERNAH jalan sejak v1.0.0: 6 bug ketemu & diperbaiki berurutan (persiapan demo domain sementara)
**Masalah:** User minta setup subdomain sementara (`ane.web.id`) buat
presentasi besok + panduan `docker pull` di VPS baru. Sebelum kasih
instruksi pull, dicek `gh run list --workflow=deploy.yml` — **NOL run,
dari v1.0.0 sampai v1.0.2** (padahal `architecture-deployment.md` sudah
klaim "pipeline release terverifikasi jalan"). Itu klaim soal
`release.yml` doang (bikin GitHub Release) — `deploy.yml` (build+push
image ke GHCR) ternyata nol kali pernah jalan sejak project mulai. Kalau
ini kelewat, instruksi "pull di server" besok akan gagal total karena
image-nya memang belum pernah ada.

**6 bug, ketemu satu-satu lewat build+run image NYATA (bukan cuma baca
kode) — pola sama seperti entri 2026-08-22, debugging berlapis:**

1. **`deploy.yml` trigger `release: published` TIDAK PERNAH nyala.**
   Root cause: `release.yml` bikin GitHub Release pakai `GITHUB_TOKEN`
   bawaan (`bunx semantic-release`) — GitHub Actions SENGAJA tidak
   memicu workflow lain untuk event yang dibuat `GITHUB_TOKEN` (anti-loop).
   Fix: ganti trigger ke `workflow_run` (dipicu selesainya run
   `release.yml` itu sendiri) + `workflow_dispatch` buat manual.
2. **`resolve-tag` job salah bandingkan SHA, build selalu di-skip.**
   `github.event.workflow_run.head_sha` = commit SEBELUM semantic-release
   nambah commit `chore(release): x.x.x` (yang beneran ditag) — selalu
   mismatch. Fix: checkout tip `main` TERBARU, cek `git describe --tags
   --exact-match HEAD` langsung, bukan bandingkan SHA manual.
3. **Dockerfile (api & web) copy `bun.lockb`** (format binary lama),
   padahal repo pakai `bun.lock` (format teks, default Bun sekarang) —
   `bun install --frozen-lockfile` gagal "not found". Fix: ganti nama
   file di kedua Dockerfile.
4. **`apps/api/package.json` belum pernah punya script `"build"`**
   (selama ini cuma `bun run src/index.ts` langsung, tanpa build step),
   padahal Dockerfile expect `dist/index.js`. Fix: tambah
   `"build": "bun build ./src/index.ts --outdir ./dist --target bun
   --external sharp"` — `sharp` WAJIB `--external`, native binding-nya
   rusak kalau ikut di-bundle jadi satu file (diverifikasi: tanpa itu,
   warm-start throw "Could not load sharp module").
5. **`apps/web/tsconfig.json` (dan `apps/api/tsconfig.json`) extends
   `"../../tsconfig.json"` (root)** tapi Dockerfile keduanya cuma copy
   `package.json`+`bun.lock`, bukan `tsconfig.json` root — Turbopack
   build gagal "extends ... doesn't resolve correctly". Fix: tambahkan
   `tsconfig.json` ke `COPY` di kedua Dockerfile.
6. **`lib/api-client.ts` (Eden Treaty) `import type { App } from
   "../../api/src/index"`** — type-only import lintas-workspace ini
   BUTUH source+dependency `apps/api` ada di builder image supaya
   type-check `next build` bisa resolve, padahal Dockerfile web cuma
   copy `apps/web` sendiri. Fix: copy `apps/api/package.json` (sebelum
   install) DAN source `apps/api` juga ke builder stage — stage
   production tetap TIDAK kebawa (cuma hasil build).
7. **Bug produk (bukan infra CI), ketemu pas `next build` beneran
   jalan pertama kali:** `useSearchParams()` di `LoginForm` (dipakai
   admin/login & app/login) belum di-`Suspense`, bikin `next build`
   GAGAL KERAS saat prerender (`/admin/login`) — beda dari dev server
   yang cuma warning. Fix: bungkus `LoginFormInner` dengan `<Suspense>`
   di `login-form.tsx` sendiri (satu tempat, semua consumer otomatis benar).
8. **Stage production `apps/web/Dockerfile` pakai `output: "standalone"`
   + jalan via `bun run` — DUA masalah sekaligus, ketemu pas image
   di-*run* beneran (bukan cuma build sukses):**
   (a) Next 16 (Turbopack) server bundle CRASH di runtime Bun:
   `"Expected CommonJS module to have a function wrapper... bug in Bun"`.
   (b) `output: "standalone"` nge-trace ulang `node_modules` dari
   struktur isolated-store `bun install` (`node_modules/.bun/...` +
   symlink) dan hasilnya GAK LENGKAP (`MODULE_NOT_FOUND`) — gap yang
   sama baik dijalankan Bun maupun Node. Fix: hapus `output:standalone`,
   base image production ganti ke `node:22-slim`, jalan
   `node node_modules/.bin/next start` pakai `node_modules` ASLI (full,
   bukan hasil trace) — struktur nested `/repo/apps/web` WAJIB
   dipertahankan (symlink `apps/web/node_modules/*` nunjuk relatif ke
   `../../../node_modules/.bun/...`). `apps/web/public/` juga ternyata
   belum pernah ada di repo — ditambah `.gitkeep`.

**Cara verifikasi yang KRITIKAL (beda dari sesi 2026-08-22 — kali ini
sampai run container-nya, bukan cuma build sukses):** build `next build`
lokal dulu tiap kali sebelum push ulang (hemat 3-4 menit round-trip CI
per percobaan), DAN untuk bug #8 — simulasikan PERSIS susunan file yang
di-`COPY` Dockerfile ke direktori terpisah lokal, jalankan
`node node_modules/.bin/next start` dari situ, `curl` beneran ke server-nya
(termasuk `curl -H "Host: admin.localhost"` buat mastiin proxy
surface-detection ikut kepakai) — "image ke-build" TIDAK SAMA DENGAN
"image bisa jalan", baru ketahuan setelah run beneran.

**Hasil akhir:** `v1.0.10` — `build-and-push` sukses penuh (API + web,
image ada di GHCR). `deploy-to-server` gagal (expected — secrets
`SERVER_HOST`/`SERVER_USER`/`SERVER_SSH_KEY` belum diisi, auto-deploy ke
VPS belum di-setup, first deploy tetap manual sesuai
`docs/deployment-server-setup.md`).

**Pencegahan:** `architecture-deployment.md` § status "pipeline
terverifikasi" cuma soal `release.yml` — JANGAN generalisasi ke seluruh
pipeline (`deploy.yml`) tanpa cek `gh run list --workflow=deploy.yml`
punya run sukses beneran. Kalau bikin workflow dua-tahap
(release → deploy via `release: published`) dan release dibuat lewat
`GITHUB_TOKEN` bawaan di workflow LAIN, WAJIB pakai `workflow_run` (atau
PAT), bukan event `release published` — ini bukan kasus spesifik project
ini, semua setup semantic-release + deploy terpisah kena masalah yang
sama. Juga: `bun install` versi sekarang default isolated-store
(`node_modules/.bun/...`), BUKAN hoisted-flat kayak npm/yarn classic —
kalau nanti coba `output: "standalone"` Next.js lagi di monorepo Bun,
verifikasi ulang dari nol (mungkin sudah diperbaiki di versi Next/Bun
lebih baru), jangan asumsikan otomatis kompatibel.

---

## 2026-08-22 — Push pertama project: 5 bug CI/CD ketemu & diperbaiki berurutan (release.yml gagal 4x sebelum sukses)
**Masalah:** Repo git baru di-init & push PERTAMA KALI sesi ini (sebelumnya
"No commits yet" sejak awal project walau kode sudah sampai Fase 05).
Begitu di-push ke `main`, workflow `release.yml` (jalan otomatis tiap push
ke `main`) gagal **4 kali berturut-turut**, tiap kali error beda — karena
`ci.yml`/`release.yml` memang belum PERNAH benar-benar dijalankan sejak
project-init bikin file-nya (cuma ada sebagai config, tidak pernah dites).

**5 bug yang ketemu, satu per satu, tiap kali diperbaiki muncul bug
berikutnya (proses debugging BERLAPIS, bukan 1x langsung ketauan semua):**

1. **Migration Drizzle ke-`.gitignore` total sejak awal** (`apps/api/drizzle/`)
   — kontradiksi sama `architecture-database.md` sendiri yang bilang wajib
   ikut commit. CI checkout fresh tidak punya migration sama sekali buat
   bikin skema database. Fix: hapus baris itu dari `.gitignore`, commit
   4 file migration + 5 file `meta/` yang selama ini "hilang".
2. **Test suite gagal — `env.ts` validation error** (banyak field required
   kosong). Root cause: `ci.yml`/`release.yml` belum punya `services:
   postgres:` ATAU env var apa pun buat testnya. Fix: tambah service
   Postgres (image `postgres:16`, health check) + `env:` block isi nilai
   DUMMY (bukan secret production — Postgres service fresh tiap run,
   tidak pernah persist) buat semua field required `env.ts`.
3. **8 test gagal — `TypeError: undefined is not an object (evaluating
   'customerRole.id')`.** Root cause: migration cuma bikin STRUKTUR tabel
   kosong, role `admin`/`customer` (dari `db:seed.ts`) belum pernah
   di-insert di database CI yang fresh — lolos di lokal karena dev DB
   sudah lama di-seed manual. Fix: tambah step `bun run --cwd apps/api
   db:seed` SETELAH migrate, SEBELUM test.
4. **`semantic-release` error `Cannot find module '@semantic-release/changelog'`.**
   Root cause: `.releaserc.json` udah konfigurasi plugin itu (+ `git`,
   `github`, `commit-analyzer`, `release-notes-generator`), tapi package-nya
   SENDIRI tidak pernah di-`bun add` — `bunx semantic-release` cuma
   resolve package inti-nya, bukan plugin yang disebut di config. Fix:
   `bun add -D semantic-release @semantic-release/{commit-analyzer,
   release-notes-generator,changelog,git,github}`.
5. **`generateNotes` gagal: "conventional-changelog-writer@9 or newer"
   diminta, padahal versi lain di tree masih v8.** Root cause: `bun add`
   pertama nginstall `conventional-changelog-conventionalcommits@latest`
   (v10), yang butuh writer v9+ — tapi `@semantic-release/release-notes-generator@14.1.1`
   bawa writer v8 sendiri, bentrok. Fix: pin eksplisit ke `^7`
   (`bun add -D conventional-changelog-conventionalcommits@^7`).

**Cara verifikasi tiap fix** (pola dipakai konsisten tiap iterasi): (a)
`bunx semantic-release --dry-run --no-ci` LOKAL dulu sebelum push ulang
(hemat 1-2 menit round-trip CI per percobaan), (b) `gh run view <id>
--log-failed` buat baca log GitHub Actions LANGSUNG dari terminal (tidak
perlu buka browser), (c) `Monitor` tool (poll `gh run view --json
status,conclusion` tiap 15 detik) buat nunggu hasil run tanpa nge-block
kerjaan lain.

**Hasil akhir:** `v1.0.0` lalu `v1.0.1` (Akun Hutang existing-vendor fix)
sukses terbit otomatis lewat pipeline penuh — bukan cuma "kelihatannya
ada", beneran dibuktikan jalan end-to-end 2x berturut-turut.

**Pencegahan:** Kalau ada project lain yang juga baru pertama kali di-push
(config CI/CD dari template belum pernah dites), JANGAN asumsikan
`ci.yml`/`release.yml` otomatis jalan mulus cuma karena file-nya ada —
selalu treat sebagai "belum diverifikasi" sampai ada run nyata yang
sukses. 5 bug di atas SEMUA kelas masalah generik (test butuh DB nyata,
migration harus ikut commit, semantic-release plugin harus explicit
dependency) — kemungkinan besar muncul lagi di project lain dari template
yang sama kalau tidak dicek dari awal.

---

## 2026-08-20 — 3 "kegagalan" testing Fase 05 yang ternyata bukan bug produk
**Masalah:** Verifikasi browser fitur auto-create vendor/item (Fase 05)
sempat munculkan 3 error yang kelihatan seperti bug: field "Satuan Barang"
dianggap kepanjangan, batch macet di `processing`, `No Faktur # harus diisi`.

**Root cause (SEMUA bug test, BUKAN bug produk):**
1. Skrip test Playwright nyusun Excel pakai 2 array terpisah (`headers`/`row`)
   ditulis manual — nambah 1 kolom di tengah `headers` tapi nilainya cuma
   ditambah di ujung `row` → semua kolom sesudahnya ketuker geser 1 posisi.
2. Worker (`bun run dev:worker`) di-hot-reload SAAT job masih diproses →
   proses restart di tengah jalan, update status batch di akhir loop tidak
   sempat jalan → batch nyangkut permanen di `processing`.
3. Skrip test lupa isi kolom "Bill No" — akun Accurate "Retail Demo" punya
   setting `useBillNumber: true` yang mewajibkannya (field sudah ada sejak
   Fase 02).

**Fix:** Bukan fix kode — dikonfirmasi lewat test terisolasi (panggil fungsi
Accurate langsung, tanpa UI/worker) yang semua sukses, membuktikan logic
benar; baru dicari beda test terisolasi vs test UI.

**Pencegahan:**
- Susun data Excel test pakai 1 OBJECT (`{kolom: nilai}`), bukan 2 array
  paralel — hilangkan kelas bug "kolom bergeser".
- Jangan edit source file yang lagi diproses worker hot-reload saat job
  masih jalan.
- Error Accurate yang terasa aneh (mis. "field kepanjangan" padahal
  pendek) → cek dulu RAW DATA tersimpan (`raw_data`/`column_mapping` di
  `import_batch_rows`) sebelum menyalahkan logic pemetaan.
- `branchName`/`billNumber` gampang lupa disertakan saat susun data test
  manual — sudah ada di mapping sejak Fase 02.

---

## 2026-08-19 — Tombol Upload "tidak berfungsi": validasi react-hook-form gagal diam-diam karena `formState.errors` tidak dirender
**Masalah:** User lapor "tombol import blm bisa digunakan" di halaman
`purchase-invoice/import`. Diverifikasi lewat Playwright: klik "Upload"
TANPA pilih file dulu → tidak ada error yang tampil, tidak ada navigasi,
tombol kelihatan seperti "tidak ngapa-ngapain" dari sudut pandang user.
**Root cause:** Form pakai `useForm` + `zodResolver` dengan validasi
`file` wajib (`.refine(...)`), tapi kode cuma destructure
`formState: { isSubmitting }` — TIDAK destructure `errors`, jadi pesan
error Zod ("Pilih 1 file Excel (.xlsx)") tidak pernah dirender ke DOM.
Submit gagal validasi secara SILENT — user tidak dapat feedback sama
sekali kenapa tombol "tidak jalan".
**Fix:** `apps/web/app/app/(protected)/purchase-invoice/import/page.tsx`
— destructure `errors: uploadErrors` dari `formState`, render
`{uploadErrors.file && <p className="text-sm text-destructive">{uploadErrors.file.message}</p>}`
persis di bawah `<input type="file">`. Diverifikasi ulang via Playwright:
error sekarang tampil, tidak ada navigasi (perilaku benar).
**Pencegahan:** SETIAP form `react-hook-form` di project ini WAJIB
destructure DAN render `formState.errors` untuk field yang punya validasi
(resolver Zod atau `register(...,{required...})`) — kalau tidak, kegagalan
validasi client-side jadi tak terlihat sama sekali oleh user (beda dari
error server yang biasanya sudah ke-catch lewat `setError`/toast). Cek
pola ini juga di form BARU manapun yang ditambah modul berikutnya
(Sales Invoice, dst) — jangan cuma dicontoh dari form yang sudah ada
tanpa dicek errors-nya benar dirender.

---

## 2026-08-19 — Overflow horizontal di mobile: flex item butuh `min-w-0` eksplisit, `overflow-x-auto` di tabel SAJA tidak cukup
**Masalah:** Fase 03 (Dashboard Pelanggan) — verifikasi Playwright di
breakpoint mobile (390px) nemuin `document.documentElement.scrollWidth >
clientWidth` (overflow horizontal SELURUH HALAMAN), padahal komponen
`Table` sudah dibungkus `<div className="overflow-x-auto">`.
**Root cause:** Struktur App Shell: `<div className="flex min-h-screen">`
(sidebar + kolom kanan) → kolom kanan `<div className="flex flex-1
flex-col">` (Topbar + `<main>`) → konten halaman (Card berisi Table dengan
sel `whitespace-nowrap`, lebar intrinsik > viewport mobile). Flex item
DEFAULT-nya `min-width: auto` (BUKAN `0`) — artinya flex item TIDAK BOLEH
menyusut lebih kecil dari lebar konten intrinsiknya, kecuali diberi
`min-width: 0` eksplisit. Karena kolom kanan (`flex flex-1 flex-col`) dan
`<main>` di dalamnya adalah flex item tanpa `min-w-0`, lebar intrinsik
tabel "menular" ke ATAS lewat rantai flex, mendorong SELURUH kolom (dan
akhirnya seluruh halaman) keluar viewport — `overflow-x-auto` pada Table
sendiri jadi tidak relevan karena parent-nya sendiri sudah lebih lebar
dari viewport.
**Fix:** Tambah `min-w-0` di `apps/web/components/app-shell/app-shell.tsx`
pada DUA level: kolom kanan (`flex min-w-0 flex-1 flex-col`) DAN `<main>`
(`min-w-0 flex-1 p-4...`). Diverifikasi ulang lewat Playwright — overflow
hilang di semua breakpoint (desktop/tablet/mobile), tabel tetap bisa
scroll horizontal SENDIRI di dalam card-nya (perilaku yang diinginkan).
**Pencegahan:** Kapan pun ada elemen dengan lebar intrinsik besar (tabel
`whitespace-nowrap`, kode/pre block, dst) diletakkan di DALAM struktur
flex/grid berlapis, WAJIB `min-w-0` di SETIAP level flex/grid ANTARA
elemen lebar itu dan viewport — bukan cuma di elemen yang punya
`overflow-x-auto` itu sendiri. Verifikasi responsive WAJIB pakai
`document.documentElement.scrollWidth <= clientWidth` di browser
sungguhan (Playwright) per breakpoint — server-render/curl tidak bisa
mendeteksi ini sama sekali (murni bug layout CSS, tidak ada bedanya di
HTML mentah).

---

## 2026-08-19 — `open-db.do` response TIDAK ikut pola envelope generik `{s, d: T}` Accurate
**Masalah:** Ditemukan lewat test call NYATA (Fase 02, Milestone 7) — script
ad-hoc panggil `openAccurateSession()` lalu akses `.session` untuk fetch
data vendor, crash `TypeError: undefined is not an object (evaluating
'session.session')`.
**Root cause:** `lib/accurate.ts`'s `openDatabase()` awalnya pakai
`parseAccurateEnvelope<AccurateSession>(res)` (parser generik yang return
`body.d`) — asumsi ini didasarkan pada contoh response publik
(accurate.id/api-integration/api-example/) yang menampilkan
`{s, session, host, dataVersion, licenseEnd}` TANPA field `d` sama sekali.
Response ASLI dari `open-db.do` TERNYATA punya field `d` juga
(`["Proses Berhasil Dilakukan"]` — pesan status, bukan payload), dan
`session`/`host`/`dataVersion`/`licenseEnd` semuanya SIBLING dari `d` di
level atas body, bukan nested di dalamnya — beda dari pola `{s, d: T}` yang
konsisten dipakai endpoint LAIN (`db-list.do` taruh payload beneran di `d`).
Halaman contoh publik yang jadi sumber verifikasi sebelumnya rupanya contoh
yang disederhanakan/tidak lengkap.
**Fix:** `openDatabase()` di `lib/accurate.ts` diubah untuk parse manual
dari body top-level (`body.session`, `body.host`, dst), TIDAK lagi lewat
`parseAccurateEnvelope`. Diverifikasi ulang lewat call nyata — `session`
dan `host` sekarang terbaca benar.
**Pencegahan:** Halaman dokumentasi publik/contoh pihak ketiga itu BAGUS
buat titik awal, tapi TIDAK bisa dianggap 100% merepresentasikan response
asli — WAJIB tetap divalidasi lewat minimal SATU test call sungguhan
sebelum kode yang bergantung pada bentuk response itu dianggap final,
apalagi kalau field seperti `d` (yang polanya konsisten di endpoint lain)
ternyata hilang dari contoh. Ini juga alasan kenapa "Milestone 7 — Validasi
End-to-End Nyata" tetap wajib ada di tiap fase yang integrasi ke API pihak
ketiga, bukan sekadar formalitas checklist.

---

## 2026-08-19 — Login gagal di browser sungguhan: 2 bug cookie independen
**Masalah:** Login "berhasil" (tidak ada error di form) tapi langsung
dilempar balik ke `/login`. Ada 2 root cause TERPISAH, harus diperbaiki
dua-duanya.

**Root cause #1 — panggilan lintas-situs**: `apps/web` (`app.localhost:6209`)
manggil `apps/api` (`localhost:3001`, host beda) langsung dari browser.
`.localhost` bukan domain terdaftar asli — browser modern anggap **tiap
subdomain `*.localhost` situs sendiri-sendiri** (beda dari production,
`app.facport.com`/`api.facport.com` satu situs asli), jadi semua panggilan
`web`→`api` di dev selalu "lintas-situs".

**Root cause #2 — `Domain=.localhost` ditolak diam-diam**: ketemu SETELAH
#1 diperbaiki (login masih gagal walau sudah same-origin lewat proxy).
`advanced.crossSubDomainCookies` set atribut `Domain=.localhost` di cookie
— browser memperlakukan `localhost` sebagai **public suffix** (sama alasan
`Domain=.com` ditolak), jadi cookie tidak pernah tersimpan, TANPA warning
apa pun. Dibuktikan via Playwright: hapus `Domain` attribute → login sukses.

**3 percobaan fix yang salah arah** (semua untuk #1, dicatat supaya tidak
diulang): (a) `sameSite:"none"`+`secure:true` — Firefox/Chrome tetap
mempartisi storage cookie lintas-situs; (b) `partitioned:true` (CHIPS) —
cookie tersimpan tapi TIDAK PERNAH ikut terkirim di navigasi top-level;
(c) `next.config.ts` `rewrites()` untuk proxy — arah benar tapi
`rewrites()` bawaan Next.js TIDAK meneruskan header `Set-Cookie`
lintas-origin.

**Fix final:**
1. `apps/web/app/api-proxy/[...path]/route.ts` — Route Handler manual
   (bukan `rewrites()`) forward request server-to-server, salin SEMUA
   `Set-Cookie` via `backendRes.headers.getSetCookie()` (bukan
   `new Headers()`, itu bisa gabung jadi 1 string tidak valid).
   `apps/web/proxy.ts` WAJIB skip guard-login untuk `/api-proxy/*`.
2. `lib/api-client.ts`/`lib/auth-client.ts` — di browser + bukan
   production, base URL jadi `${window.location.origin}/api-proxy` (Eden)
   dan `.../api-proxy/api/auth` (Better Auth, `/api/auth` wajib manual).
   SSR/production tetap `NEXT_PUBLIC_API_URL` absolute.
3. `apps/api/src/lib/auth.ts` — `crossSubDomainCookies.enabled` jadi
   `NODE_ENV === "production"` saja, `defaultCookieAttributes` override
   dihapus total (balik default Better Auth).

**Konsekuensi:** sesi login di dev TIDAK share antar `app.localhost`/
`admin.localhost` (production bisa, domain asli mendukung `Domain`
attribute) — batasan environment, bukan bug.

**Pencegahan:**
1. Test API lewat `app.handle()`/curl TIDAK CUKUP validasi perilaku cookie
   browser (`SameSite`, public-suffix rejection, partitioning) — semua itu
   cuma ditegakkan browser sungguhan.
2. Debugging masalah browser-spesifik macet setelah 1-2 percobaan manual →
   pakai Playwright (`bunx`, tidak perlu install manual) untuk bukti pasti,
   bisa ungkap root cause kedua yang tersembunyi di balik yang pertama.
3. `*.localhost` punya DUA keterbatasan terpisah dari production: (a) tiap
   subdomain = situs beda (SameSite/cross-site), (b) `Domain=.localhost`
   ditolak public-suffix (cross-subdomain sharing) — gejala cookie/session
   aneh di dev tapi tidak di production, curigai keduanya.
4. Proxy dev yang perlu meneruskan `Set-Cookie` → Route Handler manual
   dengan `response.headers.getSetCookie()`, JANGAN `rewrites()`.

---

## 2026-08-19 — Security review Fase 02: 0 Critical, 1 High (diperbaiki), 2 Medium (diperbaiki), 4 Low (diperbaiki)
**Konteks:** Subagent `security-auditor` diaudit terhadap kode Fase 02
(import Purchase Invoice dari Excel ke Accurate). Semua temuan diperbaiki
SAMA SESI (bukan ditunda), diverifikasi ulang typecheck+test+1 test call
nyata ke Accurate setelah patch.
- **High**: dependency `xlsx@0.18.5` (versi terakhir yang di-publish ke npm
  registry — SheetJS berhenti publish ke npm) punya 2 CVE publik
  (CVE-2023-30533 prototype pollution, CVE-2024-22363 ReDoS), diproses
  langsung terhadap file upload user tidak tepercaya. **Fix**: pindah ke
  build resmi terpatch dari CDN SheetJS sendiri
  (`xlsx@https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, DUA CVE
  sudah fixed di versi ini) — bukan fork pihak ketiga, tetap sumber resmi
  SheetJS, cuma bukan lewat npm registry (mereka memang publish begitu
  sejak versi itu).
- **Medium**: `parseExcelBuffer()` tidak dibungkus try/catch (file corrupt/
  bukan Excel asli lolos ke `onError` generik 500, bukan 400 jelas) — fix:
  try/catch → `400 INVALID_EXCEL_FILE`. Tidak ada batas jumlah baris
  (potensi zip-bomb/resource-exhaustion dari `.xlsx` yang didekompresi) —
  fix: `MAX_ROWS = 5000`.
- **Low** (semua diperbaiki): `batchId` path param tidak divalidasi format
  UUID (fix: `t.String({format:"uuid"})` di 3 endpoint) — `columnMapping`
  value tidak divalidasi terhadap field internal yang valid (fix: tolak
  eksplisit `400 INVALID_MAPPING_FIELD` alih-alih diam-diam diabaikan) —
  tidak ada test regresi ownership cross-subscription (fix: tambah test,
  2 user asli, verifikasi 404 bukan bocor data) — nama file upload tidak
  di-truncate ke batas kolom `varchar(255)` (fix: `.slice(0,255)`).
**Area yang sudah baik** (dicatat biar tidak diverifikasi ulang tanpa
alasan): dual-gate `permission`+`moduleAccess` konsisten di SEMUA endpoint,
ownership check batch konsisten, token Accurate tidak pernah ter-log,
`AccurateApiError` tidak bocorkan detail internal, frontend tidak pakai
`dangerouslySetInnerHTML`.
**Pencegahan**: Kalau nanti nambah dependency parsing file dari user
(image, PDF, CSV, dst), CEK DULU apakah packagenya masih aktif di-publish
ke npm registry — beberapa proyek besar (SheetJS termasuk) pindah
distribusi ke CDN sendiri karena alasan lisensi/monetisasi, dan versi npm
yang "terlihat terbaru" bisa jadi sudah lama tidak dapat patch keamanan.

---

## 2026-08-19 — `boss.send()` gagal "Database not opened" — pg-boss WAJIB `start()` di proses `apps/api` juga, bukan cuma worker
**Masalah:** Test end-to-end pertama `POST /purchase-invoice/import/:batchId/confirm`
(yang manggil `boss.send(JOBS.IMPORT_TO_ACCURATE, ...)`) crash 500
`AssertionError: Database not opened. Call open() before executing SQL.`
dari internal pg-boss.
**Root cause:** `lib/queue.ts` cuma bikin instance `boss` (`new PgBoss(...)`)
— `.start()` + `.createQueue()` (lewat helper `startQueue()`) HANYA
dipanggil di `workers/index.ts`. `apps/api/src/index.ts` (proses HTTP
server) TIDAK PERNAH memanggil `startQueue()` — dia cuma import `boss` dan
langsung pakai `.send()`. Ini gap yang ADA SEJAK Fase 00 (queue infra
dibikin) tapi baru ketahuan sekarang karena Fase 02 adalah FITUR PERTAMA
yang benar-benar `boss.send()` dari route HTTP (Fase 00/01 cuma pakai
`boss.schedule()`+`boss.work()` di sisi worker, tidak ada yang enqueue dari
request handler).
**Fix:** `apps/api/src/index.ts` tambah `await startQueue();` SEBELUM
`app.listen()`. `boss` instance sama (singleton dari `lib/queue.ts`)
dipakai proses `api` DAN `worker`, tapi tiap proses harus `start()`
masing-masing di process-nya sendiri.
**Pencegahan:** Kalau nanti ada fitur baru yang PERTAMA KALI enqueue job
dari route/service (bukan cuma dari worker itu sendiri), WAJIB cek
`index.ts` sudah start queue — jangan asumsikan `boss` instance yang
di-import otomatis siap pakai di proses manapun cuma karena worker sudah
jalan (dua proses terpisah, dua kali `start()` diperlukan).

---

## 2026-08-19 — Excel date input HARUS dinormalisasi ke DD/MM/YYYY sebelum dikirim ke Accurate
**Masalah:** Test end-to-end pertama gagal di worker:
`"Invalid field value for field \"transDate\"."` — padahal test call manual
sebelumnya (dengan tanggal ditulis literal `"19/08/2026"`) sukses.
**Root cause:** File Excel test ditulis dengan tanggal `"2026-08-19"`
(format ISO-ish) — `buildPurchaseInvoicePayload()` meneruskan nilai apa
adanya dari Excel tanpa normalisasi format. Accurate secara ketat cuma
terima `DD/MM/YYYY` untuk field tanggal (`transDate`, `taxDate`,
`shipDate`), TIDAK toleran ke format lain — dan Excel sendiri bisa
menyimpan tanggal dalam berbagai bentuk (serial number, `Date` object,
string berbagai format) tergantung cara user isi cell-nya.
**Fix:** `purchase-invoice.mapping.ts` tambah `toAccurateDate()` — deteksi
& konversi serial number Excel (basis epoch 30 Des 1899), `Date` object,
dan string ISO (`YYYY-MM-DD...`) ke `DD/MM/YYYY`; string yang sudah
`DD/MM/YYYY` dibiarkan. Diterapkan otomatis ke field `transDate`/`taxDate`/
`shipDate` di `buildPurchaseInvoicePayload()`. 3 unit test baru + retest
end-to-end nyata: baris yang tadinya gagal sekarang `success` dengan
`accurateTransactionId` asli.
**Pencegahan:** Field TANGGAL APAPUN yang dikirim ke Accurate (modul
manapun ke depannya) WAJIB lewat normalisasi format serupa — jangan asumsi
Accurate fleksibel soal format tanggal, dan jangan asumsi Excel selalu
kasih string yang sudah rapi.

---

## 2026-08-19 — `save.do` taruh record hasil di field `r`, BUKAN `d` (beda lagi dari pola envelope umum)
**Masalah:** Test call NYATA `purchase-invoice/save.do` (Fase 02, Milestone
7) sukses buat faktur (`"Faktur Pembelian \"PI.2026.08.00003\" berhasil
disimpan"`), tapi `savePurchaseInvoice()` yang pakai `parseAccurateEnvelope`
generik (return `body.d`) mengembalikan array pesan status
(`["Faktur Pembelian ... berhasil disimpan"]`), BUKAN objek
`{id, number}` yang dibutuhkan untuk `accurateTransactionId`.
**Root cause:** Endpoint SAVE/mutasi (beda dari endpoint list/query seperti
`db-list.do`) taruh record hasil di field TERPISAH bernama **`r`**, bukan
`d` — `d` di endpoint save cuma pesan status. Body asli:
`{"r": {...faktur lengkap, id: 102300, number: "PI.2026.08.00003", ...puluhan
field lain...}, "s": true, "d": ["Faktur Pembelian ... berhasil disimpan"]}`.
Ini pola KETIGA yang beda-beda dari Accurate untuk hal yang sama (envelope
`{s,d}` biasa, `open-db.do` dengan session/host di top-level, sekarang
`save.do` dengan hasil di `r`) — TIDAK ADA cara menebak polanya tanpa test
call nyata per jenis endpoint.
**Fix:** Tambah `parseAccurateSaveEnvelope<T>()` di `lib/accurate.ts`
(parse `body.r`, bukan `body.d`) khusus dipakai endpoint save/mutasi.
`accurate-purchase-invoice.ts` diupdate pakai fungsi ini. Diverifikasi
ulang — `result.id`/`result.number` sekarang kebaca benar.
**Pencegahan:** **JANGAN ASUMSIKAN pola envelope Accurate KONSISTEN
lintas-jenis-endpoint** (list vs save vs auth-related seperti
`open-db.do`) — tiap KATEGORI endpoint baru (bukan cuma tiap modul) WAJIB
divalidasi lewat MINIMAL SATU test call nyata sebelum kode yang mem-parse
response-nya dianggap final. ATURAN PRAKTIS untuk modul berikutnya (Sales
Invoice, Purchase Order, dst): endpoint `list.do`/`detail.do`/`db-*.do` →
coba `parseAccurateEnvelope` (pola `d`) dulu; endpoint `save.do`/
`bulk-save.do` → langsung coba `parseAccurateSaveEnvelope` (pola `r`)
duluan, JANGAN asumsikan `d` bekerja untuk endpoint save.

---

## 2026-08-19 — `env.APP_ORIGIN_PROD ?? fallback` gagal fallback karena `.env` isi string kosong, bukan unset
**Masalah:** Ditemukan lewat test OAuth Accurate end-to-end SUNGGUHAN
(kredensial `ACCURATE_CLIENT_ID`/`SECRET` asli, browser real user) — setelah
token exchange sukses, browser di-redirect ke `http://localhost:3001/accurate?connected=true`
(404, salah) padahal seharusnya ke `http://app.localhost:6209/accurate?connected=true`.
**Root cause:** `apps/api/src/routes/accurate.route.ts` pakai
`env.APP_ORIGIN_PROD ?? "http://app.localhost:6209"` untuk fallback origin
dev. `.env` punya baris `APP_ORIGIN_PROD=` (key ada, value string kosong —
pola umum untuk env var opsional yang belum diisi) → `process.env.APP_ORIGIN_PROD`
jadi `""`, BUKAN `undefined`. Operator `??` cuma fallback untuk
`null`/`undefined`, TIDAK untuk string kosong — jadi `"" ?? fallback`
menghasilkan `""`, bukan fallback-nya. Redirect target jadi
`"" + "/accurate?connected=true"` = `/accurate?connected=true` (relatif),
browser resolve relatif ke origin request saat itu (`localhost:3001`,
tempat callback route live) → 404.
**Fix:** Ganti `??` jadi `||` (treat string kosong sebagai falsy juga) —
`env.APP_ORIGIN_PROD || "http://app.localhost:6209"`. Diverifikasi via
`GET /accurate/oauth/callback?error=access_denied` → `Location` header
sekarang benar `http://app.localhost:6209/accurate?error=access_denied`.
**Pencegahan:** Untuk env var opsional dari `.env` yang punya default
runtime, JANGAN pakai `??` kalau ada kemungkinan `.env` set key-nya jadi
string kosong (bukan dihapus/comment-out) — pakai `||`, atau cek eksplisit
`(value && value.length > 0) ? value : fallback`. `lib/env.ts`'s
`webOriginsProd` helper SUDAH pakai pola truthy-check yang benar
(`env.WEB_ORIGINS_PROD ? ... : []`) — jadikan itu acuan, bukan `??`, untuk
kasus serupa ke depannya. Cek juga kalau ada `env.XXX_PROD ??` lain
sebelum menutup fase manapun yang nyentuh env fallback baru.

---

## 2026-08-19 — Security review Fase 01: 0 Critical/High, 3 Medium (semua diperbaiki), 3 Low (semua diperbaiki)
**Konteks:** Subagent `security-auditor` diaudit terhadap kode Fase 01
(fondasi produk: routing 3-surface, langganan, admin, OAuth Accurate).
Fase 01 TIDAK mengulangi kelas bug "route lupa guard" dari Fase 00 — semua
route baru punya guard eksplisit. Ringkasan lengkap ada di
`docs/phases/phase-01-fondasi-produk.md` § "Ringkasan Hasil".

**Semua Medium diperbaiki:**
- `proxy.ts` (apps/web) cuma cek keberadaan session cookie untuk surface
  admin, BUKAN role — karena `crossSubDomainCookies` bikin cookie customer
  biasa juga valid di `admin.facport.com`. Fix: endpoint baru `GET /me`
  (apps/api, return roles) + `app/admin/(protected)/layout.tsx` (Server
  Component) yang cek role SEBENARNYA sebelum render — `/admin/login`
  sengaja di LUAR route group `(protected)` biar tidak kena gate (cegah
  redirect loop). Diverifikasi manual: customer dengan cookie session valid
  TETAP diblokir dari `/admin/*` walau proxy meloloskannya.
- Self-registration tidak mewajibkan verifikasi email (session langsung
  aktif tanpa bukti kepemilikan email), kontradiksi dengan
  `architecture-subscription.md` yang eksplisit sebut alur ini. Fix:
  `requireEmailVerification: true` + `sendVerificationEmail` di
  `lib/auth.ts`. Admin-provisioned user DIKECUALIKAN (`emailVerified: true`
  di-set manual setelah `signUpEmail()`) — admin yang vouch, bukan email.
- Temp password admin-provisioned tidak pernah expire/wajib diganti —
  DITERIMA sebagai known limitation (bukan diperbaiki penuh), dicatat
  eksplisit di phase doc — force-change-di-login-pertama perlu kolom
  `mustChangePassword` + gate tambahan, scope-nya cukup besar untuk
  ditunda ke fase berikutnya, bukan blocker Fase 01.

**Semua Low diperbaiki:**
- `WEB_ORIGIN_PROD` (singular) cuma cover 1 dari 3 subdomain produksi →
  `WEB_ORIGINS_PROD` (dipisah koma, semua surface) + `APP_ORIGIN_PROD`
  (khusus redirect target OAuth callback, kebutuhan beda).
- `oauth-state.ts` DAN `rate-limit.ts` (sama-sama in-memory Map) tidak
  pernah membersihkan entry yang expired tapi tidak pernah dipakai (memory
  leak lambat) → `setInterval` cleanup tiap 5 menit di keduanya, `.unref()`
  supaya tidak menahan proses shutdown.
- `ACCURATE_TOKEN_ENCRYPTION_KEY` minLength 16 → 32 (key derivation scrypt
  lebih kuat dengan secret masukan lebih panjang).

**Ketemu sendiri pas fixing (bukan dari audit)**: `lib/rate-limit.ts` masih
pakai pola lama `{data: null, error: {code}}` (lolos dari sweep ADR-0010
sebelumnya karena bukan di folder `routes/`) — diperbaiki jadi bare `{code}`
sekalian.

**Pencegahan:** Kalau nambah field baru yang mengubah precondition user
lama (mis. `requireEmailVerification` di tengah jalan), CEK user test/seed
yang sudah ada — akun `admin@facport.test`/`customer@facport.test` dari
Fase 00 sempat ke-lock out karena `emailVerified=false` (dibuat sebelum
field ini di-enforce). Fix manual via SQL untuk akun test, tapi di
production butuh strategi migrasi eksplisit (backfill `emailVerified=true`
untuk user existing sebelum enable, ATAU terima bahwa mereka perlu re-verify).

---

## 2026-08-19 — Elysia `onError` memaksa 500 untuk SEMUA error non-NOT_FOUND, termasuk VALIDATION
**Masalah:** `app.ts` awal punya `set.status = code === "NOT_FOUND" ? 404 : 500;`
di `.onError()` — ini menimpa status yang SUDAH benar diset Elysia sendiri
untuk error `VALIDATION`/`PARSE` (seharusnya 422/400), jadi SEMUA request
dengan body/query tidak valid balik 500 alih-alih 400/422, di SETIAP route,
bukan cuma satu tempat.
**Root cause:** Nulis default `set.status = ... : 500` tanpa cek dulu status
apa yang Elysia sudah tetapkan untuk tiap `code` — asumsi "semua error
selain NOT_FOUND itu internal server error" salah, VALIDATION/PARSE itu
client error (400/422), bukan server error.
**Fix:** `onError` sekarang cabang eksplisit: VALIDATION/PARSE return body
tanpa override status (biarkan status Elysia asli), NOT_FOUND→404, sisanya
(genuinely unknown)→500 + Sentry.
**Pencegahan:** Ketemu sendiri pas nulis test negatif untuk
`POST /media/upload` (upload file tipe salah, expect ~400, malah dapat 500).
Kalau nulis `onError` custom di project lain, WAJIB cek dulu `code` apa saja
yang bisa muncul dari Elysia dan status default-nya masing-masing, jangan
kasih 1 angka default untuk semua kecuali satu.

---

## 2026-08-19 — Security review Fase 00: 1 Critical, 3 High ditemukan & diperbaiki; beberapa Medium/Low ditunda
**Konteks:** Subagent `security-auditor` diaudit terhadap kode Fase 00
(fondasi teknis, apps/api + apps/web). Ringkasan lengkap ada di
`docs/phases/phase-00-fondasi.md` § "Ringkasan Hasil".

**Sudah diperbaiki (Critical/High, WAJIB per SOP):**
- **Critical**: `GET /settings` tanpa guard sama sekali — bocorin semua row
  settings ke siapa pun tanpa login. Fix: tambah macro `auth: true` (lihat
  `lib/permission.ts`), plus test regresi.
- **High**: Endpoint Better Auth (`/api/auth/*`) tidak ada rate limiting,
  padahal `architecture-security.md` §7 mewajibkannya. Fix: `lib/rate-limit.ts`
  custom (in-memory sliding window) — package `elysia-rate-limit` di npm
  butuh Elysia ≥2.0 yang belum stabil untuk project ini.
- **High**: Guard permission itu opt-in per route (harus eksplisit dipasang),
  tidak ada mekanisme yang memaksa route baru declare guard-nya. Fix
  langsung: perbaiki route yang kelupaan + tambah test 401 untuk tiap
  endpoint protected. **Belum diimplementasi** (technical debt, lihat di
  bawah): mekanisme enforcement otomatis (lint rule/test yang enumerasi
  semua route dan gagal kalau ada yang tanpa guard eksplisit).

**Ditunda ke technical debt (Medium/Low, dicatat sesuai SOP):**
- Belum ada mekanisme OTOMATIS yang mencegah route baru lupa pasang
  `auth`/`permission` (di atas cuma fix manual + test manual per route yang
  sudah ada) — pertimbangkan lint rule custom atau test yang enumerasi
  `app.routes` dan assert tiap route punya salah satu macro, sebelum jumlah
  route bertambah banyak di Fase 01+.
- Kebijakan serving MinIO (presigned URL vs bucket public-read) belum
  diputuskan — `POST /media/upload` return `storageKey` mentah, frontend
  belum punya cara render gambar dari situ. WAJIB diputuskan sebelum ada
  fitur yang benar-benar render gambar user (§ `architecture-storage.md`
  Opsi A/B masih kosong "[Isi opsi mana yang dipakai]").
- `bun audit`/dependency scanning belum diverifikasi jalan di CI (infra,
  bukan kode — `.github/workflows/ci.yml` sudah ada langkahnya, tinggal
  pastikan benar-benar jalan pas PR pertama nanti).
- Password hashing pakai scrypt (default Better Auth), bukan Argon2id
  seperti disebut `architecture-security.md` §4 — didokumentasikan sebagai
  deviasi yang DITERIMA (bukan bug), lihat update di file itu.

**Catatan tambahan (bukan temuan security, tapi ketemu pas baca file yang
sama)**: subagent audit menandai satu blok teks di `apps/web/CLAUDE.md`
(mulai `<!-- BEGIN:nextjs-agent-rules -->`) sebagai KEMUNGKINAN prompt
injection karena isinya menyuruh baca dokumentasi tertentu. **Ini bukan
injection** — ini fitur asli Next.js 16 (`next dev` otomatis nambah blok
"agent rules" ke file `CLAUDE.md` terdekat, ada opsi `agentRules: false` di
`next.config` buat matiin). Sudah diverifikasi langsung: blok itu muncul
persis saat `bun run dev` pertama kali dijalankan di `apps/web` sesi ini,
bukan disisipkan dari sumber luar. Dicatat di sini supaya sesi berikutnya
tidak kaget/panik kalau lihat blok yang sama lagi setelah `next dev` jalan.

---

## 2026-08-22 — Override breaking-change di `.releaserc.json` MASIH aktif walau sudah rilis v1.0.0
**Masalah:** `semantic-release` otomatis menetapkan rilis PERTAMA sebagai
`v1.0.0` (perilaku default-nya, bukan proses manual "loncat ke 1.0.0" yang
dijelaskan di `adr-0002-versioning-strategy.md`) — jadi override
`releaseRules: [{breaking:true, release:"minor"}]` di `.releaserc.json`
**belum sempat dihapus**, padahal app sekarang sudah `v1.0.1`. Kalau ada
commit `feat!:`/`BREAKING CHANGE:` sekarang, tetap dianggap MINOR bukan
MAJOR — melanggar ekspektasi semver untuk konsumen API.
**Pencegahan:** Sebelum commit breaking change berikutnya, hapus override
`releaseRules` itu dari `.releaserc.json` (lihat langkah 2 di
`docs/decisions/adr-0002-versioning-strategy.md`).

---

<!-- Tambahkan entri baru di atas, urut dari terbaru ke terlama -->
