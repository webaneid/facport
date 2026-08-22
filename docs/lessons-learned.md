# Lessons Learned

> Format tiap entri: tanggal, masalah, root cause, fix, pencegahan.
> Wajib diisi di akhir sesi debugging signifikan — minta Claude nulis di sini
> sebelum menutup sesi.

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

## 2026-08-20 — 3 "kegagalan" testing Fase 05 yang ternyata bukan bug produk — pentingnya isolasi root cause sebelum menyalahkan kode
**Masalah:** Saat verifikasi browser fitur auto-create vendor/item (Fase
05), muncul 3 error berturut-turut yang awalnya kelihatan seperti bug:
(1) `Data "Nama" pada "Satuan Barang" terlalu besar. Maksimal 7 karakter`,
(2) batch status macet di `processing` selamanya, (3) `No Faktur # harus
diisi` padahal kolom nomor faktur sudah diisi.

**Root cause masing-masing (SEMUA beda, SEMUA bukan bug di kode produk):**
1. Skrip test Playwright nyusun Excel pakai 2 array terpisah (`headers`
   dan `row`) yang ditulis manual — waktu nambah 1 kolom baru ("Branch
   Name") di tengah `headers`, nilainya cuma ditambah di UJUNG `row`
   (bukan di posisi yang sama) → semua kolom sesudahnya bergeser 1 posisi
   → nilai "Gudang Utama" (nama gudang) ketuker masuk ke field "Satuan
   Barang", yang MEMANG kepanjangan (>7 karakter) — errornya BENAR,
   datanya yang salah.
2. Worker (`bun run dev:worker`) jalan dengan hot-reload — waktu file
   `workers/index.ts` diedit LAGI sementara sebuah job masih diproses,
   proses worker restart di tengah jalan, baris sempat ke-update status
   `failed` tapi update status BATCH di akhir loop tidak sempat jalan
   (proses sudah mati duluan) — batch nyangkut permanen di `processing`.
3. Skrip test tidak menyertakan kolom "Bill No" — akun Accurate "Retail
   Demo" ternyata punya setting `useBillNumber: true`, yang mewajibkan
   `billNumber` diisi (field yang SUDAH ada sejak Fase 02, cuma lupa
   dipakai di Excel test kali ini).

**Fix:** Bukan fix di kode — konfirmasi lewat 4-5 test terisolasi
(memanggil fungsi Accurate langsung tanpa lewat UI/worker) yang SEMUA
sukses dengan payload identik, membuktikan logic-nya benar; baru fokus
cari perbedaan antara test terisolasi vs test UI (ketemu 3 penyebab di
atas satu per satu).

**Pencegahan:**
- Susun data Excel test pakai 1 OBJECT (`{kolom: nilai}`), BUKAN 2 array
  paralel — hilangkan seluruh kelas bug "kolom bergeser" ini, derive
  `headers`/`row` dari `Object.keys()`/`Object.values()` object yang
  sama.
- JANGAN edit source file yang lagi diproses worker (`dev:worker` hot-reload)
  SAAT job masih jalan — tunggu job selesai dulu, atau restart worker
  manual setelah selesai edit, sebelum test batch berikutnya.
- Kalau error dari Accurate kelihatan aneh/tidak masuk akal (misal "field
  X kepanjangan" padahal nilainya pendek) — JANGAN langsung asumsikan bug
  di kode. Cek dulu RAW DATA yang benar-benar tersimpan di DB
  (`raw_data`/`column_mapping` di `import_batch_rows`/`import_batches`)
  sebelum menyalahkan logic pemetaan.
- `branchName` (akun multi-cabang) dan `billNumber` (setting
  `useBillNumber`) adalah 2 field OPSIONAL Purchase Invoice yang gampang
  lupa disertakan saat bikin data test manual — keduanya sudah ada di
  mapping sejak Fase 02, cuma perlu diingat saat susun skenario test baru.

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

## 2026-08-19 — Login gagal di browser sungguhan: 2 bug independen (lintas-situs + `Domain=.localhost` ditolak), 3 percobaan fix salah arah sebelum ketemu yang benar
**Masalah:** User evaluasi UI lewat browser sungguhan (setelah Fase 02
ditutup) — login "berhasil" (tidak ada error di form), tapi langsung
dilempar balik ke `/login`. Firefox awalnya tampilkan pesan eksplisit
("cookie ditolak karena lintas situs, SameSite Lax/Strict"), Chrome diam
saja tanpa pesan tapi perilakunya sama.

**ADA 2 ROOT CAUSE TERPISAH**, ketemu satu-satu, HARUS diperbaiki DUA-duanya
supaya login berhasil:

**Root cause #1 — panggilan lintas-situs**: `apps/web` (`app.localhost:6209`
dst) manggil `apps/api` (host BEDA, `localhost:3001`) langsung dari browser
(Eden Treaty + Better Auth client, `credentials:"include"`). `.localhost`
BUKAN domain terdaftar asli (tidak ada di Public Suffix List) — browser
modern menganggap **tiap subdomain `*.localhost` sebagai SITUS
SENDIRI-SENDIRI** (beda dari production: `app.facport.com`/`api.facport.com`
SATU situs asli). Ini bikin SEMUA panggilan `apps/web`→`apps/api` di dev
selalu "lintas-situs" di mata browser.

**Root cause #2 — `Domain=.localhost` ditolak diam-diam**: TERPISAH dari
#1, ketemu SETELAH #1 diperbaiki (login masih gagal walau sudah same-origin
lewat proxy). `advanced.crossSubDomainCookies` (Fase 01) set atribut
`Domain=.localhost` di cookie supaya kebaca lintas-subdomain — browser
memperlakukan `localhost` mirip **"public suffix"** (sama alasan
`Domain=.com` ditolak: mustahil website manapun boleh set cookie yang
berlaku untuk SELURUH `.com`) — jadi `Domain=.localhost` (¬ subdomain di
depannya) DITOLAK TOTAL, cookie tidak pernah tersimpan, TANPA warning
console apa pun (beda dari kasus #1 yang Firefox eksplisit kasih pesan).
Dibuktikan lewat Playwright: hapus `Domain` attribute (host-only cookie,
`crossSubDomainCookies.enabled: false`) → login langsung sukses.

**3 percobaan fix yang SALAH ARAH** (semua utk root cause #1, dicoba
sebelum ketemu yang benar — dicatat supaya tidak diulang):
1. `sameSite:"none"` + `secure:true` — hilangkan error Firefox pertama
   (cookie berhasil di-*set*), TAPI Firefox (Total Cookie Protection) &
   Chrome SAMA-SAMA mempartisi storage cookie lintas-situs — login tetap
   gagal, Firefox kasih peringatan baru "butuh atribut Partitioned".
2. `partitioned:true` (CHIPS) — hilangkan peringatan, cookie TERBUKTI
   tersimpan (Playwright: `partitionKey` ada), TAPI **cookie Partitioned
   TIDAK PERNAH ikut terkirim di navigasi top-level** (cuma di
   sub-request/fetch) — dibuktikan lewat trace: `GET .../ ` sesudah login
   sukses, `cookie header: (none)`. Redirect loop bertahan.
3. `next.config.ts` `rewrites()` untuk proxy — arah BENAR (hilangkan sifat
   lintas-situs), TAPI implementasinya salah: `rewrites()` bawaan Next.js
   **TIDAK meneruskan header `Set-Cookie`** untuk tujuan lintas-origin
   (diverifikasi: response yang di-proxy sama sekali tidak punya
   `set-cookie`, padahal backend aslinya kirim). Ganti ke Route Handler
   manual (lihat fix final di bawah) — beres.

**Fix FINAL (kedua root cause)**:
1. `apps/web/app/api-proxy/[...path]/route.ts` — Route Handler manual
   (BUKAN `next.config.ts` `rewrites()`) yang forward request ke apps/api
   server-to-server, salin SEMUA header response termasuk **multi**
   `Set-Cookie` (pakai `backendRes.headers.getSetCookie()`, BUKAN
   `new Headers(backendRes.headers)` yang bisa gabung jadi 1 string tidak
   valid). `apps/web/proxy.ts` (middleware) WAJIB skip guard-login untuk
   `/api-proxy/*` (kalau tidak, panggilan sign-in ITU SENDIRI ikut
   ke-redirect ke /login — chicken-and-egg).
2. `lib/api-client.ts`/`lib/auth-client.ts` — di browser + bukan
   production, base URL jadi `${window.location.origin}/api-proxy` (Eden)
   dan `${window.location.origin}/api-proxy/api/auth` (Better Auth — WAJIB
   include `/api/auth` manual, karena Better Auth TIDAK nambahin path
   default lagi begitu `baseURL` sudah punya path sendiri, lihat
   `withPath()` di `better-auth/dist/utils/url.mjs`). SSR/production tetap
   `NEXT_PUBLIC_API_URL` absolute (tidak ada masalah cross-site di situ).
3. `apps/api/src/lib/auth.ts` — `crossSubDomainCookies.enabled` jadi
   `process.env.NODE_ENV === "production"` (nonaktif di dev — tidak bisa
   dipakai sama sekali di `.localhost`, HARUS aktif di production —
   domain asli valid buat `Domain` attribute). `defaultCookieAttributes`
   override DIHAPUS total, balik ke default Better Auth (`sameSite:"lax"`)
   — sudah cukup begitu proxy bikin semuanya same-origin.

**Konsekuensi yang perlu diketahui**: sesi login di dev **TIDAK share**
otomatis antar `app.localhost`/`admin.localhost` (beda dari production,
yang justru BISA karena domain asli mendukung `Domain` attribute) — login
terpisah per surface kalau testing manual lintas-surface di dev. Ini
batasan environment, bukan bug.

**Cara verifikasi yang dipakai** (krusial — laporan manual user macet
setelah 2-3 percobaan tanpa progres): script Playwright ad-hoc (`bunx
playwright install chromium`, browser Chromium beneran headless) — replay
persis alur login user, capture semua request/response/cookie/partitionKey.
Ini yang akhirnya kasih bukti PASTI kenapa tiap percobaan gagal — tanpa
ini kemungkinan besar akan terus menebak-nebak atribut cookie tanpa
progres nyata. Diverifikasi FINAL lewat 3 skenario browser sungguhan:
login → redirect ke "/", login → `/accurate` (tampil "Terhubung"), login →
`/purchase-invoice/import` → upload file `.xlsx` sungguhan lewat form
(bukan curl) → parsing berhasil, UI mapping tampil.

**Pencegahan:**
1. Test API lewat `app.handle()`/curl TIDAK CUKUP untuk memvalidasi
   perilaku cookie browser (`SameSite`, `Domain` public-suffix rejection,
   partitioning) — SEMUA itu cuma ditegakkan BROWSER sungguhan, curl akan
   selalu "berhasil" walau browser akan menolak diam-diam.
2. Kalau debugging masalah browser-spesifik macet setelah 1-2 percobaan
   manual, pertimbangkan otomasi browser (Playwright via `bunx`, tidak
   perlu install manual) — jauh lebih cepat dapat bukti pasti daripada
   bolak-balik minta user screenshot DevTools, DAN bisa mengungkap root
   cause KEDUA yang tersembunyi di balik yang pertama (seperti kasus ini).
3. `*.localhost` multi-subdomain di dev PUNYA DUA keterbatasan terpisah
   dari production (bukan cuma satu): (a) tiap subdomain = situs berbeda
   di mata browser (masalah SameSite/cross-site), DAN (b) `Domain=.localhost`
   ditolak sebagai public-suffix (masalah cross-subdomain sharing) — kalau
   ada gejala aneh terkait cookie/session di dev tapi TIDAK di production,
   curigai keterbatasan ganda ini dulu sebelum ubah kode auth/cookie config.
4. Kalau butuh proxy dev yang meneruskan `Set-Cookie`, JANGAN pakai
   Next.js `rewrites()` — pakai Route Handler manual dengan
   `response.headers.getSetCookie()` eksplisit.

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

## 2026-08-19 — Double-wrap `{data,error}`: server manual-wrap BENTROK dengan wrapper Eden Treaty di client
**Masalah:** `app/landing/page.tsx` (Fase 01 M6) crash runtime
`plans.map is not a function`. `GET /plans` route return
`{ data: [...], error: null }` (manual, ikut konvensi "Response Format"
dari template awal) — tapi Eden Treaty (client) JUGA membungkus response
jadi `{data, error}` berdasar HTTP status (2xx → body masuk `res.data` APA
ADANYA, non-2xx → masuk `res.error` sebagai `{status, value}`). Hasilnya
`res.data` di client = `{data: [...], error: null}` (objek server UTUH),
payload asli kepentok di `res.data.data`.
**Root cause:** Dua konvensi `{data,error}` independen ditumpuk — satu di
level HTTP body (manual di tiap route), satu lagi di level Eden client
(otomatis, berdasar status). Tidak saling tahu satu sama lain.
**Salah diagnosis sebelumnya**: di Fase 00, gejala serupa (waktu itu di
route upload media) sempat dicatat sebagai "Eden Treaty gagal narrow union
type dengan benar" — diagnosis itu SALAH, ditambal pakai `as unknown as`
tanpa cari akar masalah sungguhan. Baru ketahuan akar masalahnya pas
kejadian LAGI di route berbeda (`GET /plans`, bukan upload) dan didebug
sampai tuntas (curl raw body vs Eden client side-by-side).
**Fix:** SEMUA route (`settings`, `media`, `plans`, `subscriptions`,
`admin/*`, `accurate`, `app.ts` onError) diubah return payload BARE untuk
sukses, `{code, message?}` bare untuk gagal — TANPA wrapper `{data,error}`
manual. Didokumentasikan sebagai keputusan resmi:
`docs/decisions/adr-0010-response-format-eden.md`. Konsumen frontend yang
tadinya pakai `as unknown as` buat "nutupin" gejala ini dibersihkan —
kecuali SATU limitasi Eden yang genuinely nyata & sempit (route `t.File()`
multipart, infer tipe sukses jadi `{}` kosong walau body sudah bare).
**Pencegahan:** Kalau nanti nulis route baru DAN gejalanya "Eden/TypeScript
gagal infer tipe dengan benar" — **cek dulu raw HTTP body via curl** SEBELUM
nyalahin Eden/nambah `as unknown as`. Kemungkinan besar itu double-wrap atau
kesalahan bentuk response di server, bukan limitasi library. `as unknown as`
itu tanda "saya belum ngerti kenapa", bukan solusi — SELALU cari akar
masalah dulu, baru putuskan apakah type assertion memang perlu (dan kalau
perlu, verifikasi manual dulu shape aslinya, jangan tebak).

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

## [Preventif, belum terjadi] — Override breaking-change di .releaserc.json
**Masalah potensial:** Kalau app dianggap stabil dan naik ke `v1.0.0`, tapi
lupa hapus override `releaseRules` di `.releaserc.json`, breaking change
setelahnya tetap dianggap MINOR bukan MAJOR — melanggar ekspektasi semver.
**Pencegahan:** Cek `docs/decisions/adr-0002-versioning-strategy.md` bagian
"loncat ke 1.0.0" SETIAP kali mempertimbangkan rilis v1.0.0.

---

## [Tanggal] — [Judul singkat masalah]
**Masalah:**
**Root cause:**
**Fix:**
**Pencegahan:**

---

<!-- Tambahkan entri baru di atas, urut dari terbaru ke terlama -->
