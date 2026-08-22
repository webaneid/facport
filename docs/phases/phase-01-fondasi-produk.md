# Fase 01 — Fondasi Produk (Routing 3-Surface & Langganan)

**Status:** Done
**Mulai:** 2026-08-19
**Selesai:** 2026-08-19

## Tujuan
Fase 00 (fondasi teknis) sudah selesai duluan. Fase ini bangun fondasi level
**produk**: tiga surface (landing publik, admin, app pelanggan) lewat
subdomain, plus model langganan (plans/subscriptions) yang jadi gerbang
akses ke semua modul impor di Fase 02 dst. Tanpa fase ini, tidak ada cara
user masuk sistem (register/login), tidak ada cara pilih paket, dan tidak
ada cara bedakan tampilan admin vs pelanggan.

## Scope
### Routing & Surface
- [x] `apps/web/lib/get-surface.ts` + `apps/web/proxy.ts` — resolusi Host
      header → surface (landing/admin/app). `apps/api/src/lib/auth.ts`
      ditambah `advanced.crossSubDomainCookies` + `trustedOrigins` (session
      cookie `Domain=.localhost` dev / `.facport.com` prod, terverifikasi
      via `better-auth/cookies` `getSessionCookie()` — existence-only,
      TANPA query DB di proxy, sesuai riset)
- [x] Struktur folder `app/landing/`, `app/admin/`, `app/app/` sesuai
      rewrite proxy (`/login`, `/register` ada di admin & app, exempt dari
      auth-gate biar tidak redirect loop)
- [x] Halaman landing: beranda, daftar harga paket (dari `GET /plans`,
      diverifikasi render nyata via curl), CTA daftar/login (absolute URL
      lintas surface, § lesson hardcoded-relative-path)
- [x] Halaman login/register (self-service) di surface `app` — form
      `zod`+`react-hook-form`, panggil `authClient.signIn.email`/`signUp.email`
- [x] Layout dasar admin dashboard & app dashboard (shell/nav kosong)

**Verifikasi M5** (curl dengan `Host` header, simulasi 3 subdomain tanpa
browser nyata): landing publik 200 tanpa host khusus; `admin.localhost`/
`app.localhost` TANPA cookie → 307 redirect ke `/login` (BUKAN loop —
`/login` sendiri 200, exempt dari gate); sign-in → `Set-Cookie` konfirmasi
`Domain=.localhost`; cookie yang SAMA dipakai ke `admin.localhost` DAN
`app.localhost` → keduanya 200 (cross-subdomain session sharing benar-benar
jalan, bukan cuma asumsi dari docs); `/dev/components-test` (Fase 00) masih
reachable (exempt dari rewrite proxy).

### Model Langganan
- [x] Skema `plans`, `subscriptions`, `orders` — lihat `docs/architecture/architecture-subscription.md`
- [x] Endpoint `GET /plans` (publik) — diverifikasi curl, 200 + data benar
- [x] Endpoint `POST /subscriptions/checkout` — buat `orders`+`subscriptions`
      row `pending_payment`, return `501 PAYMENT_PROVIDER_NOT_CONFIGURED`
      eksplisit (provider belum final, lihat Known Limitations) — diverifikasi
      401 tanpa auth, row masuk DB dengan benar
- [x] Endpoint `GET /me/subscription` — diverifikasi
- [x] `requireModuleAccess(moduleKey)` (`lib/subscription-gate.ts`) — lihat
      `docs/architecture/architecture-subscription.md` §"Gating Akses Modul".
      3 unit test (403 SUBSCRIPTION_INACTIVE, 403 MODULE_NOT_IN_PLAN, 200
      match) — belum dipakai route manapun (Fase 02 yang pakai)
- [x] Job terjadwal `EXPIRE_SUBSCRIPTIONS` (harian) — diverifikasi: paksa
      subscription `active` dengan `endAt` masa lalu → enqueue manual →
      status berubah `expired`

### Admin — Kelola Paket & User
- [x] Endpoint admin `POST/PUT/DELETE /admin/plans` (CRUD paket) —
      diverifikasi end-to-end (200 admin, 403 customer, delete = soft
      nonaktifkan bukan hard delete)
- [x] Endpoint admin `POST /admin/users` (provisioning user manual — lihat
      `docs/architecture/architecture-subscription.md` §"Admin-Provisioned")
      — via `auth.api.signUpEmail()` server-side + assign role `customer` +
      audit log. Password sementara di-generate & dikembalikan di response
      (force-change-di-login-pertama BELUM diimplementasi, lihat Known Limitations)
- [x] Endpoint admin `POST /admin/subscriptions` (assign plan manual ke
      user tanpa payment, `orderId=null`, status langsung `active`) —
      diverifikasi end-to-end
- [x] Endpoint `GET /me` (§ tambahan security review — role check admin,
      lihat § "Role Check Admin" `architecture-domain-routing.md`)
- [ ] Halaman admin: daftar & form CRUD paket, daftar & form create user —
      **BELUM dikerjakan** (shell `app/admin/(protected)/page.tsx` cuma
      placeholder + role-check layout; endpoint API sudah lengkap &
      teruji, tinggal UI form-nya, dicatat di Known Limitations)

### Koneksi Accurate Online (OAuth)
- [x] **Verifikasi OAuth flow** — SUDAH dilakukan sebelum fase ini eksekusi
      (2026-08-19, via https://accurate.id/api-integration/oauth/, halaman
      publik — `api-docs.do` login-gated tidak bisa diakses otomatis).
      Hasil: Accurate dukung Authorization Code Grant (dipilih, lebih aman)
      DAN Implicit Grant. Code dikirim sebagai query param (bukan fragment),
      refresh_token SELALU diterbitkan, access token expire 15 hari. Detail
      lengkap sudah dituliskan ke `docs/architecture/architecture-accurate-integration.md` § 1
      — TIDAK ada lagi ambiguitas fragment-vs-query atau ada/tidaknya
      refresh token seperti draf awal.
- [x] Skema `accurate_connections` (`subscriptionId` unique, access+refresh
      token terenkripsi, NOT NULL keduanya) — lihat
      `docs/architecture/architecture-accurate-integration.md` § 1
- [x] Endpoint initiate OAuth `POST /accurate/connect` di `apps/api`
      (generate state, scope dari `plan.modules` via
      `lib/accurate-scopes.ts` — ⚠️ mapping modul→scope Accurate DITEBAK
      dari pola penamaan, BELUM diverifikasi ke katalog resmi, WAJIB dicek
      ulang sebelum Fase 02 pakai beneran)
- [x] Callback route `GET /accurate/oauth/callback` di `apps/api` (BUKAN
      `apps/web`): validasi state (in-memory TTL store), tukar code→token
      server-to-server, simpan terenkripsi (AES-256-GCM), `redirect()`
      browser ke app.facport.com
- [x] Job terjadwal `REFRESH_ACCURATE_TOKEN` (harian) — refresh proaktif
      token yang <2 hari lagi expire, tandai `expired` kalau refresh gagal
- [x] Halaman app: "Hubungkan Accurate Online" (`app/app/accurate/page.tsx`,
      panggil `POST /accurate/connect`, redirect ke authorize URL). Status
      koneksi + tombol "Hubungkan Ulang" terpisah dari tombol utama BELUM
      dibedakan (keduanya panggil endpoint sama — cukup untuk Fase 01, lihat
      Known Limitations)

**Verifikasi M4** (tanpa `ACCURATE_CLIENT_ID`/`SECRET` asli, sesuai rencana):
401/400/503/409 pada `POST /accurate/connect` (401 tanpa login, 400 tanpa
subscription aktif, **503 ACCURATE_NOT_CONFIGURED — kondisi real dev
sekarang, kredensial belum diisi user**, 409 kalau sudah connected),
redirect `error=invalid_state` pada callback dengan state palsu, unit test
`exchangeCodeForToken`/`refreshAccessToken` (mock fetch, verifikasi shape
request sesuai § architecture-accurate-integration.md), unit test
enkripsi/dekripsi token (round-trip + tolak payload di-tamper). 6 test baru,
semua pass. **Ketemu & diperbaiki saat nulis test**: `set.redirect =` API
Elysia **deprecated**, ganti pola resmi `redirect()` context function
(return `Response`) — dicatat di Keputusan Kecil.

## Referensi
- Architecture doc: `docs/architecture/architecture-domain-routing.md`,
  `docs/architecture/architecture-subscription.md`,
  `docs/architecture/architecture-payment.md`,
  `docs/architecture/architecture-accurate-integration.md`,
  `docs/architecture/architecture-api.md` (§ Response Format, ADR-0010)
- ADR terkait: `docs/decisions/adr-0007-multi-surface-domain-routing.md`,
  `docs/decisions/adr-0008-model-langganan.md`,
  `docs/decisions/adr-0009-detail-oauth-accurate.md`,
  `docs/decisions/adr-0010-response-format-eden.md`

## Keputusan Kecil Selama Eksekusi
(hal yang diputuskan di tengah jalan, nggak cukup besar buat ADR tapi tetap
perlu diingat kenapa dipilih begitu)
- **KOREKSI BESAR temuan Eden Treaty Fase 00** — diagnosis lama ("Eden gagal
  narrow union") SALAH TOTAL. Ketemu pas `app/landing/page.tsx` crash
  runtime (`plans.map is not a function`) — root cause sebenarnya: route
  `apps/api` manual wrap response jadi `{data,error}` (ikut konvensi lama
  `architecture-api.md`), BENTROK dengan wrapper `{data,error}` Eden Treaty
  sendiri di client (berdasar HTTP status) → double-wrap. Diperbaiki total,
  SEMUA route ditulis ulang return payload bare — didokumentasikan sebagai
  `docs/decisions/adr-0010-response-format-eden.md`. Satu limitasi Eden
  yang SUNGGUHAN & sempit tetap ada (route `t.File()`/multipart infer `{}`
  kosong) — lihat ADR-0010 § Konsekuensi. Entri lama di
  `docs/phases/phase-00-fondasi.md` § Keputusan Kecil juga sudah dikoreksi.
- **`set.redirect = url` Elysia DEPRECATED** — ketemu pas test callback
  OAuth expect redirect tapi dapat 200. API resmi sekarang: destructure
  `redirect` dari context, `return redirect(url, status?)` (return
  `Response`, bukan assignment property). `set.redirect?: string` masih ada
  di type tapi ditandai `@deprecated` di source Elysia.
- **Elysia route-compilation gotcha**: nambah route baru ke instance `app`
  yang SUDAH pernah dipanggil `.handle()` di file test lain (proses
  `bun:test` sama) tidak ke-pickup — dapat 404 padahal route "sudah
  ditambahkan" secara kode. Fix: `subscription-gate.test.ts` bikin instance
  Elysia SENDIRI (`new Elysia().mount(auth.handler).use(...)`), bukan
  extend `app` yang diimpor dari `app.ts`. Berlaku juga kalau nanti nulis
  test lain yang nambah route sementara untuk keperluan test.
- **Security review (M8) nambah scope di luar rencana awal M1-M7** — 3
  Medium + 3 Low, semua diperbaiki (bukan cuma dicatat): `requireEmailVerification`
  di Better Auth (self-service WAJIB verifikasi, admin-provisioned
  dikecualikan manual), `GET /me` + `app/admin/(protected)/layout.tsx`
  (role check SEBENARNYA, proxy cuma existence-check cookie),
  `WEB_ORIGIN_PROD`→`WEB_ORIGINS_PROD`+`APP_ORIGIN_PROD` (cover 3 subdomain,
  bukan 1), cleanup interval di `oauth-state.ts`+`rate-limit.ts`, minLength
  `ACCURATE_TOKEN_ENCRYPTION_KEY` naik ke 32. Detail lengkap →
  `docs/lessons-learned.md` entri "Security review Fase 01".
- Mengaktifkan `requireEmailVerification` di tengah jalan SEMPAT mengunci
  akun test lama (`admin@facport.test`/`customer@facport.test` dari Fase 00,
  `emailVerified=false` karena dibuat sebelum field ini di-enforce) —
  diperbaiki manual via SQL untuk akun test. Kalau ini terjadi di production
  nanti (bukan skenario sekarang, belum ada user asli), butuh strategi
  migrasi eksplisit, bukan asumsi semua user existing otomatis verified.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — apps/api & apps/web
      bersih, plus `bun run lint` & `bun run test` (20/20 pass, setelah
      update test buat email verification)
- [x] Security review dijalankan (subagent `security-auditor`, 2026-08-19)
- [x] Temuan Critical/High sudah diperbaiki — **0 Critical, 0 High**
      ditemukan (Fase 01 tidak mengulangi kelas bug "lupa guard" Fase 00)
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` — 3 Medium + 3
      Low, SEMUA diperbaiki langsung (bukan cuma dicatat untuk ditunda),
      kecuali 1 sub-bagian (force-change password admin-provisioned) yang
      eksplisit diterima sebagai known limitation
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
(hal yang sengaja belum ditangani di fase ini, biar jelas dan disengaja —
bukan kelupaan)
- **Provider payment (Ipaymu/Xendit) belum final** — kalau belum diputuskan
  saat fase ini dikerjakan, `POST /subscriptions/checkout` & webhook boleh
  di-stub/skip dengan catatan eksplisit di sini, DAN buat ADR baru begitu
  provider dipilih (lihat `docs/architecture/architecture-payment.md`).
  Skema `plans`/`subscriptions` tetap bisa selesai penuh tanpa keputusan ini.
- Domain production (`facport.com`, dst) masih placeholder — Caddyfile &
  DNS belum final, tidak menghalangi kerja di local dev (`*.localhost:6209`).
- Modul impor (Penjualan dst) belum ada — itu Fase 02+, cuma butuh
  `requireModuleAccess()` yang sudah siap dipakai dari fase ini.
- **Halaman admin CRUD paket & create-user BELUM ada UI-nya** — endpoint
  API lengkap & teruji end-to-end (curl), tapi `app/admin/(protected)/page.tsx`
  masih placeholder polos. Perlu dikerjakan sebelum admin FAC Institute
  benar-benar bisa pakai tanpa curl manual.
- **Force-change password di login pertama untuk admin-provisioned user
  BELUM diimplementasi** (temp password valid selamanya sampai user ganti
  manual) — diterima sebagai known limitation eksplisit (§ security review
  Fase 01 Medium finding #3), butuh kolom `mustChangePassword` + gate
  tambahan, scope-nya cukup untuk fase terpisah.
- **Mapping modul→scope Accurate (`lib/accurate-scopes.ts`) DITEBAK** dari
  pola penamaan (`item_view`, `sales_invoice_view`, dst), BELUM diverifikasi
  ke katalog scope resmi (perlu akses `api-docs.do` yang login-gated) —
  WAJIB dicek ulang sebelum Fase 02 (Purchase Invoice) benar-benar connect
  ke akun Accurate nyata.
- **OAuth Accurate end-to-end REAL belum bisa ditest** — `ACCURATE_CLIENT_ID`/
  `SECRET` kosong di dev (user belum kasih kredensial asli). Verifikasi
  sebatas: authorize URL ke-generate benar, state CSRF tervalidasi, unit
  test exchange/refresh pakai mock HTTP response sesuai format yang sudah
  diverifikasi ke dokumentasi publik Accurate.
- Rate limit numerik API Accurate (request/detik, dst) belum diketahui —
  halaman publik yang diverifikasi (§ ADR-0009/architecture-accurate-integration.md)
  tidak menyebutkan angka pastinya. Perlu dicek `api-docs.do` sebelum Fase
  02 implementasi worker import beneran (throttling generik untuk sekarang).

## Ringkasan Hasil
Fase 01 membangun fondasi PRODUK Facport di atas fondasi teknis Fase 00:
tiga surface (landing/admin/app) via subdomain dengan session cookie
cross-subdomain (Better Auth `crossSubDomainCookies`, diverifikasi
end-to-end — bukan cuma asumsi dari docs), model langganan (`plans`/
`subscriptions`/`orders`) dengan gating modul (`requireModuleAccess`, siap
dipakai Fase 02), admin provisioning (kelola paket, buat user manual,
assign subscription — semua via API teruji, UI belum ada), dan koneksi
OAuth Accurate Online (Authorization Code Grant, terverifikasi ke
dokumentasi publik Accurate sebelum implementasi, token AES-256-GCM
at-rest, refresh job harian).

**2 riset eksternal dilakukan SEBELUM coding** (bukan asumsi): flow OAuth
Accurate (accurate.id/api-integration/oauth/) dan cross-origin session
sharing Better Auth — keduanya mengubah desain signifikan dari draf awal
(implicit→authorization code grant, callback pindah ke apps/api;
`getSessionCookie()` bukan full DB check di proxy).

**1 bug arsitektur besar ditemukan & diperbaiki mid-fase** (bukan cuma
ditambal): double-wrap `{data,error}` antara konvensi manual server lama
dan wrapper Eden Treaty — mengoreksi diagnosis SALAH dari Fase 00 ("Eden
Treaty gagal narrow union", ternyata bukan itu), didokumentasikan sebagai
ADR-0010, SEMUA route (Fase 00 + Fase 01) ditulis ulang.

**Security review** (subagent, 2026-08-19): 0 Critical, 0 High — Fase 01
TIDAK mengulangi kelas bug "lupa guard" Fase 00. 3 Medium + 3 Low, SEMUA
diperbaiki langsung (email verification wajib, role check admin di layout
bukan proxy, cleanup interval in-memory store, dst) — detail lengkap →
`docs/lessons-learned.md`.

**Test otomatis**: 20 test (7 dari Fase 00 + 13 baru: subscription gate ×3,
Accurate OAuth flow ×4, encryption ×3, token exchange/refresh mock ×2, dst),
semua pass.

**Gap yang jujur dicatat** (lihat Known Limitations di atas): UI admin
belum ada (API-only), force-change password admin-provisioned belum ada,
mapping scope Accurate belum diverifikasi ke katalog resmi, OAuth end-to-end
REAL belum bisa ditest tanpa kredensial Accurate asli dari user.
