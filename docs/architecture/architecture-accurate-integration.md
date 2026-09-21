# Architecture — Integrasi Accurate Online (OAuth & Bulk Import — Infra Bersama)

> Ini komponen INTI Facport — bukan integrasi opsional. Lihat
> `docs/decisions/adr-0006-integrasi-accurate-api.md` untuk rasional
> keputusan di balik pola di file ini.
>
> **Dirapikan 2026-09-05** (audit kematangan dokumentasi per-modul) —
> file ini SEKARANG cuma infra BERSAMA yang dipakai SEMUA modul (OAuth,
> skema `import_batches` generik, rate limit, error handling Accurate).
> Detail modul SPESIFIK (endpoint, field mapping, keputusan per-fase)
> sudah dipindah ke file masing-masing — sebelumnya semua numplek di
> sini (765 baris, ada section yang duplikat 2x & judul fase yang basi
> tidak pernah diupdate setelah selesai):
> - `docs/architecture/architecture-purchase-invoice.md` (Faktur
>   Pembelian — modul PERTAMA, paling matang/banyak iterasi)
> - `docs/architecture/architecture-sales-invoice.md` (Faktur
>   Penjualan)
> - `docs/architecture/architecture-vendor-payable-account.md` (Akun
>   Hutang Pemasok — kategori Data Master, bukan modul transaksi)
>
> Sales Receipt, Purchase Payment, Jurnal Umum **BELUM dikerjakan** (per
> 2026-09-05) — cuma nama di katalog `MODULE_OPTIONS` + scope OAuth
> disiapkan di `accurate-scopes.ts`, 0 route/halaman. Belum ada file
> arsitektur modul untuk ketiganya sampai benar-benar dikerjakan.

## Dokumentasi Resmi
- **https://account.accurate.id/open-api/json.do — SUMBER UTAMA, mulai
  2026-08-19.** OpenAPI 3.0.1 spec LENGKAP (325 path, 222 scope resmi di
  `security[0].default`), **PUBLIK, TIDAK login-gated, bisa di-`curl`
  langsung** oleh Claude kapan saja (ditemukan lewat referensi dari
  `aol-integration/accurate-schema-mcp` di GitHub, § di bawah). Ini
  menggantikan kebutuhan snapshot manual/login untuk verifikasi
  **parameter request & daftar scope** modul apa pun — begitu modul lain
  (Sales Invoice, Purchase Order, dst) mulai dikerjakan, cek spec ini
  duluan sebelum minta snapshot manual dari user. **Keterbatasan**: spec
  ini TIDAK punya schema response (semua endpoint cuma `"200": {"description":
  "Success"}`, tanpa body) — untuk contoh response nyata, lihat sumber di
  bawah. Salinan lokal ada di `docs/referencehtml/accurate-openapi.json`
  (gitignored, 2.2MB) — tapi karena publik & gratis di-fetch ulang, TIDAK
  masalah kalau mau `curl` versi terbaru langsung daripada baca salinan lama.
- https://accurate.id/api-integration/oauth/ — halaman publik, sumber
  verifikasi OAuth flow di § 1 file ini (2026-08-19).
- https://accurate.id/api-integration/api-example/ — halaman publik, sumber
  contoh REQUEST+RESPONSE nyata untuk `db-list.do`/`open-db.do` (§ "Sesi
  Data Usaha" di bawah, 2026-08-19) — satu-satunya sumber contoh response
  yang ditemukan sejauh ini (spec OpenAPI di atas tidak punya ini).
- https://github.com/aol-integration/accurate-schema-mcp — implementasi
  MCP server pihak ketiga (open source, MIT) yang dipakai untuk baca
  Accurate API via schema lookup. README-nya jadi sumber 2 fakta penting
  yang tidak ada di spec resmi: **rate limit pasti (8 req/detik, 8
  concurrent)** § 4 di bawah, dan **pola error `{"s": false}` di HTTP 200**
  § 5 di bawah. Juga mendemonstrasikan metode auth ALTERNATIF ("API Token"
  + HMAC, § 6 di bawah) yang BUKAN yang dipakai Facport — jangan tertukar.
- https://account.accurate.id/developer/api-docs.do — dokumentasi interaktif
  versi HTML dari OpenAPI spec di atas (isinya sama, format beda) —
  **login-gated**. Sejak spec JSON publik ditemukan, TIDAK perlu lagi buka
  ini secara manual kecuali butuh tampilan lebih enak dibaca manusia.
- **Snapshot lokal lama (2026-08-19, sebelum spec JSON publik ditemukan)**:
  `docs/referencehtml/Purchase Invoice (Faktur Pembelian).html` dan
  `open-db.do.html` — gitignored. Masih valid sebagai cross-check historis,
  tapi TIDAK PERLU dipakai lagi untuk modul baru — spec JSON di atas lebih
  lengkap & lebih cepat diakses.

> Akun developer testing untuk eksplorasi dokumentasi API TIDAK dicatat di
> repo ini (§ `architecture-security.md` §1). Kalau butuh akses ke
> `api-docs.do`, minta ke pemilik project — Claude tidak bisa login sendiri.

## 1. OAuth — Menghubungkan Akun Accurate Online

> ✅ **Terverifikasi 2026-08-19** lewat https://accurate.id/api-integration/oauth/
> (halaman publik accurate.id — dokumentasi interaktif di
> `account.accurate.id/developer/api-docs.do` login-gated, tidak bisa diakses
> otomatis). Kalau ada detail yang kurang jelas/berubah, cek ulang ke sana
> dulu sebelum asumsi dari file ini — halaman resmi bisa update.

**Accurate mendukung DUA grant type**: Authorization Code (`response_type=code`,
untuk aplikasi server-side) dan Implicit (`response_type=token`, untuk
mobile/client-side). Facport pakai **Authorization Code Grant** — sesuai
prinsip ADR-0009 ("pilih code grant kalau tersedia, lebih aman karena token
tidak pernah lewat browser"). Implicit grant TIDAK dipakai.

### Aturan Bisnis — 1 Koneksi per AKUN Accurate, Dipegang Data Usaha (Fase 143, ADR-0036/ADR-0037)
> **Menggantikan** ADR-0009 poin 3 dan ADR-0020 (koneksi per subscription/modul, endpoint `reuse`). Alasan (TERBUKTI
> Fase 141, bukan asumsi): untuk 1 akun Accurate × 1 aplikasi hanya SATU otorisasi yang hidup — otorisasi baru
> mematikan access+refresh token lama dan mengganti seluruh scope. Model lama (koneksi baru per subscription) membuat
> koneksi modul lain mati diam-diam (akar 401; 20 dari 29 subscription aktif production tertimpa).

- **`accurate_connections` = 1 baris per akun Accurate**, kunci `accurate_user_id` (dari respons token `user.id`, indeks
  unik parsial). 1 akun = 1 pemilik Facport: akun yang sudah dipakai owner lain DITOLAK di callback
  (`accurate_account_in_use`) — kalau tidak, otorisasi B mematikan koneksi A.
- **Data Usaha memegang koneksi**: `data_usaha.accurate_connection_id` (pointer ke koneksi akun, dibagi banyak Data
  Usaha) + `data_usaha.accurate_db_id/alias` (database Accurate yang dipakai; 1 database ↔ 1 Data Usaha, indeks unik
  `(accurate_connection_id, accurate_db_id)`). Subscription/batch menemukan koneksinya LEWAT Data Usaha
  (`lib/accurate-connection.ts` `resolveConnectionForSubscription` — SATU-SATUNYA resolver).
- **Otorisasi SATU pintu**: `POST /accurate/connect {dataUsahaId}` (owner-only) selalu meminta SEMUA scope katalog
  (`ALL_ACCURATE_SCOPES`, § "Scope" di bawah). Callback = upsert atomik (`ON CONFLICT (accurate_user_id) ... WHERE
  userId sama`): akun sama → perbarui baris yang sama, TIDAK PERNAH INSERT kedua. `subscriptions.accurate_connection_id`
  dibekukan; `accurate_connections.accurate_db_id/alias` legacy (tidak ditulis; dihapus Fase 145).
- **Cutover langsung**: koneksi lama (`accurate_user_id` NULL) tidak dibaca lagi; customer "hubungkan ulang" sekali.
- **Database tidak bisa diganti** setelah dipilih (`DATABASE_ALREADY_SELECTED`): riwayat import terikat ke database itu.
  Callback mengosongkan database tersimpan yang TIDAK ada di akun baru (`db-list.do`), supaya pilih ulang.
- **Transfer kepemilikan Data Usaha memutus koneksi** (pointer → NULL; database terakhir dipertahankan): token itu milik
  akun Accurate pemilik lama. Berlaku jalur user, Google auto-complete, dan admin.
- **Data Usaha kedua dari akun yang sama** tidak OAuth ulang: `GET /accurate/accounts` (akun milik user) +
  `POST /accurate/attach {dataUsahaId, connectionId}` menunjuk koneksi yang ada (OAuth ulang mematikan token yang sedang dipakai
  import Data Usaha lain). Database dipilih terpisah per Data Usaha (`DATABASE_ALREADY_USED` bila sudah dipakai Data Usaha lain).
- **Callback terikat ke sesi login** pemulai flow (cookie sesi ikut pada navigasi top-level dari Accurate; production
  cross-subdomain, dev host `localhost`) — diperiksa sebelum tukar kode. State OAuth dibatasi 5 aktif per user; `/accurate/*`
  dikenai rate limit; `openDatabase`/`listDatabases` ber-timeout 15 dtk; worker menandai `expired` hanya untuk HTTP 401.
- **Refresh token aman-rotasi** (`lib/accurate-token.ts`): refresh token sekali-pakai (Fase 141 E4) → kunci baris
  `FOR UPDATE`, baca ulang `expiresAt`, simpan token baru di transaksi yang sama. HANYA `invalid_grant` menandai
  `expired`; galat jaringan/5xx dicoba lagi besok. Job harian melewati koneksi yang sedang dipakai batch
  `processing/cancelling`. Pesan galat token TIDAK memuat body mentah Accurate (memuat nilai token yang ditolak).

### Alur (Terverifikasi — Authorization Code Grant)
```
User (di app.facport.com, dalam konteks subscription tertentu) klik
"Hubungkan Accurate Online"
      ↓
apps/api generate state token unik → simpan sementara (state → {userId, dataUsahaId}; Fase 143)
      ↓
Redirect browser ke:
https://account.accurate.id/oauth/authorize
  ?response_type=code
  &client_id={ACCURATE_CLIENT_ID}
  &redirect_uri={ACCURATE_REDIRECT_URI}
  &scope=item_view item_save sales_invoice_view ...   ← granular per resource+aksi, § "Scope Sesuai Paket" di bawah
  &state={state}
      ↓
User login akun Accurate (kalau belum) & klik "Beri Akses" di halaman consent
      ↓
Accurate redirect balik ke redirect_uri:
{ACCURATE_REDIRECT_URI}?code=2S8F64jJTOJi1vuCxG8G&state={state}
      ↓
apps/api (endpoint redirect_uri ADALAH route apps/api langsung, BUKAN
apps/web — lihat § "Redirect URI" di bawah) validasi state, lalu tukar
code → token SERVER-TO-SERVER:
POST https://account.accurate.id/oauth/token
  Authorization: Basic base64(client_id:client_secret)
  Content-Type: application/x-www-form-urlencoded
  grant_type=authorization_code&code={code}&redirect_uri={ACCURATE_REDIRECT_URI}
      ↓
Response: { access_token, refresh_token, expires_in, token_type: "bearer" }
      ↓
Simpan access_token + refresh_token TERENKRIPSI (upsert per akun Accurate), arahkan Data Usaha (`data_usaha.accurate_connection_id`)
dari state → redirect browser ke app.facport.com (halaman "koneksi berhasil")
```
**Kode `code` dari Accurate cuma dikirim sebagai query param biasa** (bukan
URL fragment) — server (`apps/api`) bisa baca langsung dari request, TIDAK
butuh halaman client-side (`"use client"`) untuk relay dari
`window.location.hash` seperti draf sebelumnya (itu cuma perlu untuk
implicit grant, yang TIDAK dipakai project ini).

### Token Refresh — Bukan Urgensi Tinggi
**Access token expire dalam 15 hari** (bukan hitungan jam seperti kebanyakan
OAuth provider) — jauh lebih longgar. Refresh:
```
POST https://account.accurate.id/oauth/token
  Authorization: Basic base64(client_id:client_secret)
  grant_type=refresh_token&refresh_token={refresh_token}
```
Job terjadwal (§ `architecture-jobs.md`) cukup jalan **harian** (bukan tiap
30 menit seperti draf awal) — cek `accurate_connections.expiresAt` yang
kurang dari mis. 2 hari lagi, refresh proaktif. Kalau refresh gagal (refresh
token juga sudah invalid/di-revoke user dari sisi Accurate) → tandai
`status = "expired"`, kirim notifikasi IN-APP (⚠️ koreksi 2026-09-10 —
paragraf ini sebelumnya salah sebut "notifikasi email", implementasi
NYATA pakai `createNotification` in-app, bukan email) minta re-koneksi
manual.

### Deteksi Token Mati Lebih Dini + "Hubungkan Ulang" (Fase 91, 2026-09-10)
**Gap ditemukan** (dicatat sejak Fase 01/04, baru ditutup sekarang):
token bisa di-**revoke Accurate SEBELUM `expiresAt` alami** (mis. user
login manual langsung ke Accurate, atau cabut akses aplikasi dari sisi
Accurate) — job refresh harian di atas CUMA cek koneksi yang
`expiresAt`-nya SUDAH DEKAT (<2 hari), jadi revoke dini seperti ini
BARU ketahuan job itu berhari-hari kemudian, ATAU baru ketahuan kalau
ada import yang gagal memakainya. Sebelum Fase 91: bahkan setelah
ketahuan (`status = "expired"`), TIDAK ADA cara memperbaikinya dari UI
sama sekali — `POST /accurate/connect` SELALU tolak 409
`ALREADY_CONNECTED` kalau subscription sudah punya `accurateConnectionId`,
apa pun status koneksinya.

**Diperbaiki 2 sisi:**
1. **Deteksi lebih cepat** — `markConnectionExpired()` (`workers/index.ts`)
   sekarang DIPANGGIL JUGA setiap kali `openAccurateSession()` gagal
   SAAT IMPORT (bukan cuma di job refresh terjadwal) — kegagalan buka
   sesi HAMPIR SELALU berarti token sudah tidak valid. Guard
   `status === "expired"` cegah notifikasi dobel kalau import gagal
   berulang sebelum user sempat reconnect.
2. **Tombol "Hubungkan Ulang"** — `POST /accurate/connect` terima
   `reconnect: true` (opsional) yang MELEWATI guard 409 SECARA EKSPLISIT
   (ownership check via `getActiveSubscriptionsWithPlans(user.id)` TETAP
   berlaku, tidak dilonggarkan). Callback OAuth (`/accurate/oauth/callback`)
   TIDAK berubah — sudah dari awal menimpa `accurateConnectionId`
   subscription tanpa syarat, jadi reconnect otomatis bekerja begitu
   guard 409 dilewati. Ditambahkan di halaman `/app/accurate`: tombol
   kecil "Hubungkan Ulang" di kartu yang SEHAT (jaga-jaga), dan tombol
   besar + badge peringatan di kartu yang BERMASALAH
   (`connectionStatus !== "active"` tapi `accurateDbId` pernah terisi).

**Bug terkait, ikut diperbaiki**: `GET /accurate/subscriptions` field
`connected` sebelumnya `!!connection` (cuma cek ADA baris koneksi) —
koneksi yang SUDAH `status: "expired"` tetap dilaporkan `connected: true`,
halaman `/accurate` salah tampilkan badge hijau "✓ Terhubung". Sekarang
`connected: connection?.status === "active"`, field baru
`connectionStatus` (`"active" | "expired" | "revoked" | null`) ikut
dikirim supaya frontend bisa bedakan 3 keadaan (belum ada koneksi sama
sekali / ada tapi bermasalah / sehat), bukan cuma boolean biner.

### Kelola Koneksi dari Admin — "Putuskan Koneksi" (Fase 92, 2026-09-10)
Selagi testing Fase 86/90/91 di sesi yang sama, koneksi customer yang
mati (§ atas) sempat cuma bisa diperbaiki dengan admin (dalam hal ini
Claude Code) edit DATABASE MANUAL — TIDAK ADA cara admin memperbaikinya
dari UI produk sama sekali. Ditambahkan:
- **`GET /admin/users/:id/subscriptions`** (permission `users.view`,
  READ-ONLY, mirror pola `admin/import-batches.route.ts`) — daftar
  SEMUA subscription user (bukan cuma aktif, untuk konteks support
  lengkap) beserta `connected`/`connectionStatus`/`accurateDbAlias`,
  logic SAMA PERSIS `GET /accurate/subscriptions` versi customer (§
  atas) — admin lihat gambaran seakurat yang dilihat customer sendiri.
- **`POST /admin/subscriptions/:id/disconnect-accurate`** (permission
  `subscriptions.manage`, sama gate dengan aksi administratif
  subscription lain) — mengosongkan `accurateConnectionId` MILIK
  SUBSCRIPTION ITU SAJA (bukan hapus baris `accurate_connections`-nya —
  bisa dipakai bareng subscription lain, § ADR-0020 di atas). Tercatat
  ke `audit_logs` (`action: "disconnect_accurate"`, `changes` simpan
  `previousConnectionId`+`previousAccurateDbAlias` untuk jejak), kirim
  notifikasi BARU `accurate_connection_disconnected_by_admin` ke
  PEMILIK subscription (bukan ke admin) — beda pesan dari
  `accurate_connection_expired` supaya customer tidak salah kira ini
  bug/kegagalan sistem, padahal aksi disengaja admin.

Halaman `/admin/users/:id` (Card baru "Langganan & Koneksi Accurate")
— tabel semua subscription user + tombol "Putuskan Koneksi"
(`components/admin/disconnect-accurate-dialog.tsx`, konfirmasi
SEDERHANA — bukan pola "ketik ulang nama" seperti Batal Import, karena
risikonya rendah/gampang dipulihkan tinggal "Hubungkan Ulang" dari sisi
customer, § Fase 91). Setelah ini, customer TIDAK PERLU lagi minta
developer edit database manual kalau koneksinya bermasalah — admin
support bisa putuskan sendiri dari UI, customer tinggal reconnect.

### Redirect URI — Route `apps/api` Langsung
`ACCURATE_REDIRECT_URI` mengarah **langsung ke `apps/api`**
(`/accurate/oauth/callback`), BUKAN ke `apps/web` seperti draf sebelumnya —
karena Authorization Code Grant butuh `client_secret` untuk tukar code→token,
dan itu HARUS di server (`apps/api`), tidak pernah di frontend. Route ini:
1. Validasi `state` (WAJIB digenerate Facport sendiri, CSRF protection
   standar OAuth) cocok dengan yang disimpan sebelum initiate, tolak kalau
   tidak ketemu/sudah dipakai.
2. Tukar `code` → token (POST ke `/oauth/token` di atas).
3. Simpan token terenkripsi, relasikan ke Data Usaha dari state (Fase 143: upsert per akun Accurate).

> **Callback terikat sesi login (Fase 143, audit HIGH).** Callback memeriksa cookie sesi === pemulai flow SEBELUM tukar kode.
> Production: cookie `Domain=.facport.com` ikut terkirim ke `api.*` pada navigasi top-level dari Accurate. **DEV**: browser
> memanggil API lewat proxy web (`/api-proxy`, cookie milik `app.localhost`), jadi `ACCURATE_REDIRECT_URI` dev harus
> `http://app.localhost:6209/api-proxy/accurate/oauth/callback` (dan didaftarkan di portal developer Accurate, di samping URI
> langsung `http://localhost:3001/...` yang tetap boleh untuk uji skrip tanpa sesi). Dengan URI langsung ke `localhost:3001`,
> callback ditolak `invalid_state` karena tidak ada cookie sesi.
4. `redirect()` browser ke halaman app.facport.com yang sesuai (BUKAN
   return JSON — user-nya browser, bukan API client).

### Scope — Diturunkan dari Registri Endpoint, Selalu SEMUA Scope Katalog (Fase 142, ADR-0036)
> **Menggantikan** aturan lama "minta scope sesuai `plans.modules` saja". Terbukti Fase 141
> (E2/E3): otorisasi baru untuk akun Accurate yang sama MEMATIKAN token lama dan MENGGANTI
> seluruh scope, jadi otorisasi "sempit" per modul membuat modul lain kehilangan izin.
- Endpoint yang dipanggil tiap modul dideklarasikan di SATU tempat:
  `apps/api/src/lib/accurate-endpoint-registry.ts`. Scope DITURUNKAN dari sana lewat
  `accurate-scope-snapshot.json` (dibuat `bun run scopes:sync` dari spec publik Accurate),
  BUKAN ditulis tangan. Detail: `architecture-accurate-scope-engine.md`.
- `/accurate/connect` SELALU meminta `ALL_ACCURATE_SCOPES` (gabungan semua modul).
- Scope yang benar-benar diberikan disimpan di `accurate_connections.granted_scopes` (dari respons
  token) dan diverifikasi oleh SATU fungsi `missingScopes`/`checkConnectionScopes`
  (`lib/accurate-scope-check.ts`): `/accurate/attach`, konfirmasi/retry import (409
  `ACCURATE_SCOPE_MISSING`), dan awal worker.
- Scope kurang saat runtime → HTTP 403 body XML `insufficient_scope` → `AccurateScopeError`
  (bukan `markConnectionExpired`: koneksi hidup, hanya kurang izin).

### Sesi Data Usaha (Company Database) — Langkah TAMBAHAN, Baru Ditemukan
> ⚠️ **BARU KETEMU 2026-08-19** — belum ada di draf sebelumnya.
> `access_token` OAuth SAJA **TIDAK CUKUP** untuk panggil endpoint data
> (`/api/purchase-invoice/*`, dst). Accurate punya konsep "Data Usaha"
> (company database) terpisah dari akun login — satu akun bisa punya akses
> ke lebih dari satu Data Usaha, jadi API butuh tahu Data Usaha mana yang
> dipakai lewat sesi terpisah. **✅ Alur ini SEPENUHNYA TERVERIFIKASI**
> (parameter dari `api-docs.do` + contoh response dari
> https://accurate.id/api-integration/api-example/, keduanya 2026-08-19):
>
> 1. `GET https://account.accurate.id/api/db-list.do`
>    Header: `Authorization: Bearer {access_token}`
>    Response:
>    ```json
>    { "s": true, "d": [{ "id": 1156, "alias": "PT Demo Example", "trial": true, "expired": false }] }
>    ```
> 2. `GET https://account.accurate.id/api/open-db.do?id={dbId}` (`dbId` dari
>    `d[].id` di atas)
>    Header: `Authorization: Bearer {access_token}` (sama)
>    Response NYATA (dikoreksi 2026-08-19 lewat test call sungguhan — halaman
>    contoh publik yang dipakai verifikasi awal TIDAK menampilkan field `d`,
>    padahal di response asli ADA dan isinya BUKAN payload, cuma pesan
>    status; `session`/`host`/dst adalah **sibling dari `d`, bukan nested di
>    dalamnya** — beda dari pola `{s, d: T}` yang dipakai endpoint lain
>    seperti `db-list.do`):
>    ```json
>    {
>      "s": true,
>      "d": ["Proses Berhasil Dilakukan"],
>      "session": "312e5621-c366-4091-b310-ce1845dcaf63",
>      "host": "https://zeus.accurate.id",
>      "dataVersion": 20260611103014,
>      "licenseEnd": "23/08/2026",
>      "admin": true,
>      "accessibleUntil": "28/08/2026",
>      "trial": false
>    }
>    ```
>    **Jangan pakai parser envelope generik (`parseAccurateEnvelope`) untuk
>    endpoint ini** — `lib/accurate.ts`'s `openDatabase()` sudah diperbaiki
>    untuk baca `session`/`host` langsung dari top-level body, bukan dari
>    `body.d`.
> 3. Semua panggilan endpoint data (`save.do`, `list.do`, `bulk-save.do`,
>    dst) dikirim ke **host dinamis dari `open-db.do` response** (`host` +
>    `/accurate/api/...`, BUKAN `account.accurate.id`), dengan **DUA header
>    sekaligus**:
>    ```
>    Authorization: Bearer {access_token}
>    X-Session-ID: {session}
>    ```
>    Contoh nyata dari dokumentasi: `https://public.accurate.id/accurate/api/item/save.do`.
>    Untuk Purchase Invoice: `{host}/accurate/api/purchase-invoice/bulk-save.do`.
> 4. Sesi ini (`session`) bisa expire independen dari `access_token` OAuth —
>    `db-check-session.do` (param `session`) dan `db-refresh-session.do`
>    (param `id` + `session`) dipakai cek ulang/perpanjang, bukan buka sesi
>    baru dari nol tiap kali (lebih murah).
>
> **`accurateDbId` di skema di bawah = `id` dari `db-list.do`/`open-db.do`**
> (dulu cuma "ID database/company", sekarang jelas maksudnya) — kolom ini
> SUDAH CUKUP, tidak perlu kolom baru (lihat lifecycle di bawah, kenapa
> `session`/`host` tidak masuk DB).
>
> **Desain lifecycle sesi**: `session` + `host` dari `open-db.do` TIDAK
> disimpan permanen kayak access/refresh token (beda sifat — token OAuth
> tahan 15 hari, sesi Data Usaha lebih pendek dan `host` bisa saja berubah
> antar buka-sesi). Pola yang dipakai: **buka sesi di awal tiap job
> `IMPORT_TO_ACCURATE`** (§ `architecture-jobs.md`, bukan Fase 02 — ini
> desain untuk worker import), cache `session`+`host` di memory selama job
> itu jalan (tidak perlu tabel DB terpisah, cukup passing di scope job),
> refresh kalau `db-check-session.do` bilang tidak valid lagi di tengah job
> panjang. `accurateDbId` (di DB, permanen) adalah satu-satunya bagian yang
> perlu disimpan lintas-request — `session`/`host` murni ephemeral.

### Skema DB
```ts
// apps/api/src/db/schema.ts
// § Fase 143, ADR-0037 — 1 baris = 1 AKUN Accurate (indeks unik parsial pada accurate_user_id). Pointer koneksi &
// database ada di `data_usaha` (accurate_connection_id, accurate_db_id/alias). Kolom accurate_db_id/alias di bawah
// LEGACY (tidak ditulis lagi; hapus Fase 145). Kolom skema di bawah lebih tua; sumber kebenaran: db/schema/accurate.schema.ts.
export const accurateConnections = pgTable("accurate_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(), // TIDAK unique — reusable lintas subscription
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  refreshTokenEncrypted: text("refresh_token_encrypted").notNull(), // Authorization Code Grant SELALU terbitkan ini (terverifikasi)
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), // access_token, ~15 hari dari connectedAt/refresh terakhir
  accurateDbId: varchar("accurate_db_id", { length: 100 }), // ID database/company Accurate yang terhubung
  accurateDbAlias: varchar("accurate_db_alias", { length: 255 }), // nama Data Usaha, buat ditampilkan di dropdown "pakai koneksi yang sudah ada"
  status: varchar("status", { length: 20 }).notNull().default("active"), // "active" | "expired" | "revoked"
  connectedAt: timestamp("connected_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
```
**Token WAJIB dienkripsi at-rest** (bukan disimpan sebagai plaintext) — ini
kredensial akses penuh ke data keuangan Accurate Online milik user. Detail
refresh → § "Token Refresh" di atas.

## 2. Bulk Import — Excel → Accurate Online

```
User upload file Excel → apps/api validasi format & ukuran (§ architecture-security.md §8)
      ↓
Parse Excel (baris demi baris) → simpan sebagai import_batch + import_batch_rows (status "pending")
      ↓
Enqueue job IMPORT_TO_ACCURATE (§ architecture-jobs.md) — TIDAK sinkron di request handler
      ↓
Worker: loop tiap row pending → map kolom Excel ke field Accurate (§ 3 di bawah)
      → panggil endpoint Accurate sesuai modul (Sales Invoice, Purchase Order, dst)
      → update status row: "success" (simpan ID transaksi Accurate) atau "failed" (simpan error message)
      ↓
User lihat progress & hasil akhir (berapa sukses/gagal) di halaman import batch
```

### Skema DB
```ts
export const importBatches = pgTable("import_batches", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(), // siapa yang upload
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id).notNull(), // menentukan accurate_connections mana yang dipakai (§ 1 subscription = 1 akun Accurate)
  module: varchar("module", { length: 50 }).notNull(), // "sales_order" | "purchase_invoice" | "journal_entry" | dst
  fileName: varchar("file_name", { length: 255 }).notNull(),
  totalRows: integer("total_rows").notNull(),
  status: varchar("status", { length: 20 }).notNull().default("processing"), // "processing" | "completed" | "completed_with_errors"
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const importBatchRows = pgTable("import_batch_rows", {
  id: uuid("id").defaultRandom().primaryKey(),
  batchId: uuid("batch_id").references(() => importBatches.id).notNull(),
  rowNumber: integer("row_number").notNull(), // baris ke-berapa di Excel asli, untuk user trace balik
  rawData: jsonb("raw_data").notNull(), // isi baris Excel asli, sebelum mapping
  status: varchar("status", { length: 20 }).notNull().default("pending"), // "pending" | "success" | "failed"
  accurateTransactionId: varchar("accurate_transaction_id", { length: 100 }), // ID hasil create di Accurate, kalau sukses
  errorMessage: text("error_message"), // pesan error Accurate/validasi, kalau gagal
  processedAt: timestamp("processed_at"),
});
```
**Kenapa per-row, bukan per-batch**: satu file Excel bisa berisi ribuan baris
— kalau gagal di tengah (baris ke-500 dari 2000), user harus tahu PERSIS
baris mana yang gagal dan kenapa, tanpa harus re-import ulang baris yang
sudah sukses. Ini juga yang bikin retry batch idempotent (cuma proses ulang
row berstatus `failed`/`pending`, skip yang sudah `success`).

## 3. Import Mapping — Kolom Excel → Field Accurate (Prinsip Umum)

Tiap modul (Sales Invoice, Purchase Invoice, dst) punya field wajib
yang beda-beda di API Accurate. **JANGAN asumsikan nama kolom Excel
user selalu sama persis dengan nama field Accurate** — user upload
Excel dengan format mereka sendiri (nama kolom bisa "Tanggal", "Tgl
Transaksi", dst).

UI upload WAJIB kasih langkah "cocokkan kolom" (preview kolom Excel vs
field Accurate yang dibutuhkan) sebelum eksekusi import — bukan
langsung tebak-tebakan otomatis tanpa konfirmasi user, supaya salah
mapping ketahuan SEBELUM data masuk ke Accurate (data yang sudah masuk
Accurate lebih susah di-rollback daripada dibatalkan sebelum submit).

**Detail field mapping per modul** (endpoint, field wajib, keputusan
teknis per-fase) → file arsitektur modul masing-masing, § catatan di
awal dokumen ini.

> **⚠️ Fase 102 (2026-09-11)** — BUG DITEMUKAN & DIPERBAIKI di
> `parseExcelBuffer` (`apps/api/src/lib/excel.ts`, dipakai SEMUA modul
> import): key object baris hasil parsing Excel TIDAK di-trim, padahal
> `headers` (yang ditampilkan di UI "Cocokkan Kolom" & disimpan sebagai
> `columnMapping`) SUDAH di-trim sejak lama. Kalau header Excel client
> punya spasi nyempil (mis. `" Payment "` — kejadian nyata, ditemukan
> lewat laporan client Purchase Payment: nominal pembayaran jadi `0`,
> Accurate menolak "Nilai Pembayaran tidak mencukupi"), lookup
> `rawRow[trimmedName]` di SEMUA builder payload gagal diam-diam (balik
> `undefined`, default ke 0/kosong) — TANPA error yang jelas sampai
> validasi downstream (di Accurate) baru ketahuan. Fix: key baris
> di-trim juga, konsisten dengan `headers`. Detail →
> `docs/phases/phase-102-fix-trim-header-excel.md`.

## 3b. Checklist WAJIB — Titik Registrasi Modul Import Baru

> **Kenapa ini ada**: gap yang SAMA ketemu 2× — pertama 2026-09-06 (3
> modul, § `docs/lessons-learned.md` "Audit konsistensi 6 modul: shared
> admin view TIDAK ikut update saat modul baru ditambah"), lagi
> 2026-09-15/16 (5 modul Fase 120-124 kelewat, ketemu pas Fase 128).
> Kedua kali root cause SAMA: checklist cuma hidup di prosa/memori,
> tidak ada cara SISTEMATIS memverifikasi "semua titik sudah disentuh".
> Daftar di bawah + trik verifikasi di paling akhir dirancang supaya
> TIDAK bisa kelewat lagi — JALANKAN trik verifikasi itu SEBELUM
> menganggap modul baru selesai (Langkah 3 SOP, sebelum security review).

Modul import baru (`{module}` = snake_case, mis. `other_deposit`) WAJIB
menyentuh SEMUA file berikut, bukan cuma route/worker/mapping/sidebar
sendiri:

**File BARU** (per modul):
1. `apps/api/src/lib/import-mapping/{module}.mapping.ts` (+ `.test.ts`)
2. `apps/api/src/lib/accurate-{module}.ts` (client `save.do`)
3. `apps/api/src/routes/{module}-import.route.ts` (+ `.test.ts`)
4. `apps/web/app/app/(protected)/{module}/import/page.tsx` (upload + cocokkan kolom)
5. `apps/web/app/app/(protected)/{module}/import/[batchId]/page.tsx` (progress customer)
6. `apps/web/app/app/(protected)/{module}/import/riwayat/page.tsx` (arsip per-modul)
7. `apps/web/components/{module}/delete-import-dialog.tsx`
8. `apps/web/components/{module}/edit-row-dialog.tsx` (kalau modul punya alur edit baris gagal)

**File EXISTING yang WAJIB dapat 1 entri baru** (9 titik — lupa SATU
pun = fitur modul itu setengah jalan, biasanya baru ketahuan pas
customer/admin buka fitur yang kelewat itu):
1. `apps/api/src/lib/accurate-scopes.ts` — `MODULE_ACCURATE_SCOPES[module]`
2. `apps/api/src/lib/import-mapping/template-guide.ts` — `{module}TemplateGuide`
3. `apps/api/src/lib/module-catalog.ts` — entri `MODULE_CATALOG` (productLine+category)
4. `apps/api/src/routes/admin/plans.route.ts` — `t.Literal("{module}")` di union `modules`
5. `apps/api/src/app.ts` — import + `.use({module}ImportRoute)`
6. `apps/api/src/workers/index.ts` — dispatch case di job loop (+ `ensure*DataClassifications`/`process*Group` kalau modul pakai Kategori Keuangan/grouping)
7. `apps/web/lib/landing-content.ts` — `LANDING_MODULE_ICON`/`LANDING_MODULE_TAGLINE`
8. `apps/web/components/app-shell/sidebar.tsx` — 1 baris `NavItem` di grup Produk
9. `apps/web/lib/module-import-routes.ts` — `MODULE_IMPORT_BASE_PATH[module]`
10. `apps/web/components/import-archive/import-batch-table.tsx` — import `DeleteImportDialog as {Module}DeleteImportDialog` + 1 baris dispatch `{canDelete && batch.module === "{module}" && ...}`
11. `apps/web/app/admin/(protected)/import-batches/[batchId]/page.tsx` — 1 fungsi `{Module}View` (read-only, mirror `VendorPayableAccountView` kalau modul tidak butuh grouping kolom khusus) + entri `MODULE_TITLE` + 1 baris dispatch

12. `apps/api/src/lib/accurate-endpoint-registry.ts` — **deklarasikan SEMUA endpoint Accurate yang dipanggil modul** (termasuk helper `findOrCreate*`: vendor/customer/item/data-classification/tax) sebagai `"METHOD resource/aksi.do"`. Scope diturunkan otomatis; endpoint yang belum ada di `accurate-scope-snapshot.json` → jalankan `bun run scopes:sync`. `bun test src/lib/accurate-scopes.test.ts` HARUS hijau: pemindai sumber di sana GAGAL kalau ada literal `/accurate/api/*.do` di kode yang belum terdaftar (kelas bug Fase 78/98). DILARANG membuat alur otorisasi/reconnect baru — otorisasi tetap SATU pintu (`/accurate/connect`, semua scope).
13. Route import modul baru: pasang `checkSubscriptionScopes(subscription.id, "{module}")` sebelum `checkTrialRowBudget` di handler confirm DAN retry (pola sama 18 route yang ada; tes `*-import.route.test.ts` memverifikasi).

Opsional tapi disarankan: root `CLAUDE.md` § Peta Dokumen (baris baru
ke `architecture-{module}.md`).

### Trik Verifikasi — WAJIB Dijalankan, Bukan Cuma Baca Daftar
Diff 2 hasil grep modul BARU vs 1 modul LAMA yang SUDAH lengkap (pola
paling mirip) — kalau hasilnya BUKAN cuma file route masing-masing yang
beda, berarti ada titik yang kelewat:
```bash
grep -rln "old_module_key" apps/web apps/api/src --include="*.ts" --include="*.tsx" | grep -v ".test." | sort > /tmp/old.txt
grep -rln "new_module_key" apps/web apps/api/src --include="*.ts" --include="*.tsx" | grep -v ".test." | sort > /tmp/new.txt
diff /tmp/old.txt /tmp/new.txt
# Hasil YANG BENAR: cuma 1 baris beda tiap sisi (nama file route
# masing-masing modul) — kalau ada file yang MUNCUL di /tmp/old.txt
# TAPI TIDAK ADA padanannya di /tmp/new.txt, itu titik yang kelewat.
```

## 4. Rate Limiting Sisi Client
✅ **Angka pasti TERVERIFIKASI 2026-08-19**: **maksimal 8 request/detik DAN
maksimal 8 request bersamaan (concurrent)** — dikonfirmasi dari
implementasi rate limiter pihak ketiga yang eksplisit mengutip "Accurate's
published limits" (`aol-integration/accurate-schema-mcp`, § "Dokumentasi
Resmi" di atas untuk cara verifikasi lanjut kalau angka ini berubah).

Worker import (`IMPORT_TO_ACCURATE`, § `architecture-jobs.md`) WAJIB
throttle sesuai angka ini — pola yang disarankan: sliding-window limiter
(hitung request dalam 1 detik terakhir, tunda kalau sudah 8) DIGABUNG
semaphore concurrency (maks 8 request "in-flight" bersamaan) — BUKAN cuma
jeda antar-request tanpa cap concurrency, karena dua batasan itu independen.
Kalau tetap kena rate limit (HTTP 429 atau setara), job WAJIB retry dengan
backoff (pg-boss sudah handle ini secara umum), bukan dianggap gagal
permanen.

## 5. Error Handling dari Sisi Accurate
> ⚠️ **PENTING, TERVERIFIKASI 2026-08-19**: Accurate **TIDAK selalu pakai
> HTTP status code untuk sinyal gagal** — banyak endpoint mengembalikan
> **HTTP 200 dengan body `{"s": false, "d": [...pesan error...]}`** untuk
> kegagalan logis (validasi field, data tidak ditemukan, kredensial
> ditolak, dst). **JANGAN cuma cek `response.ok`/status code di
> `lib/accurate.ts`** — WAJIB selalu parse body dan cek field `s` (boolean)
> juga, appliable ke SEMUA panggilan Accurate (OAuth token exchange,
> `open-db.do`, `db-list.do`, DAN endpoint data seperti
> `purchase-invoice/bulk-save.do`). Pola: `s: true` → sukses, payload di
> `d`; `s: false` → gagal, pesan error di `d` (biasanya array string).

Response error Accurate (baik dari HTTP error code maupun `s: false`) WAJIB
diteruskan ke `import_batch_rows.errorMessage` dalam bentuk yang bisa
dipahami user (bukan raw JSON error API) — terjemahkan kode/pesan error
umum Accurate ke bahasa yang actionable ("Nomor pelanggan XYZ tidak
ditemukan di Accurate" lebih berguna daripada "400 Bad Request").

> ⚠️ **Bug ditemukan & diperbaiki 2026-09-08 (Fase 56)** — aturan di
> atas TERNYATA cuma ditegakkan untuk kegagalan DI DALAM loop per-baris
> (per modul). Batch yang gagal SEBELUM loop mulai sama sekali (koneksi
> Accurate belum ada, atau `openAccurateSession()` gagal) cuma nge-set
> `importBatches.status = "failed"` — baris-barisnya dibiarkan
> `"pending"` TANPA `errorMessage`, admin lihat tabel kosong total tanpa
> tahu penyebabnya (ketemu nyata dari batch production
> `379b65d8-90e4-4f29-8abb-70af74ddff74`). Fix: helper
> `failAllPendingRows()` di `workers/index.ts`, dipanggil di kedua titik
> gagal-dini itu, SEBELUM percabangan per modul — otomatis berlaku ke
> SEMUA modul import. **Pelajaran untuk kode baru**: kalau nambah titik
> gagal-dini serupa (early-return SEBELUM loop per-baris), WAJIB ikut
> panggil `failAllPendingRows()` juga, jangan cuma update
> `importBatches.status`. Detail lengkap →
> `docs/phases/phase-56-fix-error-message-batch-gagal-dini.md`.

> ⚠️ **Bug ditemukan & diperbaiki 2026-09-10 (Fase 82)** — pola `s:false`
> HTTP 200 di atas TERBUKTI LAGI di kasus baru: `detail.do` pada id
> transaksi yang SUDAH DIHAPUS langsung di Accurate (bukan lewat
> Facport) balas **HTTP 200** dengan `{"s":false,"d":["Faktur Penjualan
> tidak tepat"]}` — DIKONFIRMASI test call nyata, bukan tebakan. Guard
> "append ke faktur existing" (ADR-0012, `appendToExistingPurchaseInvoice`/
> `appendToExistingSalesInvoice` di `workers/index.ts`) sebelumnya
> menentukan "faktur masih ada" HANYA dari catatan DB lokal (status
> "sukses" di `import_batch_rows`), TANPA verifikasi ulang ke Accurate —
> begitu faktur dihapus manual di Accurate, retry upload dengan Trans No
> yang sama SELALU gagal. Fix: fungsi baru `isAccurateRecordNotFound(err)`
> (`lib/accurate.ts`, cek pesan mengandung "tidak tepat") — kalau
> `getPurchaseInvoiceDetail`/`getSalesInvoiceDetail` kena error ini,
> fallback ke jalur CREATE biasa. **Pelajaran untuk kode baru**: DB lokal
> Facport adalah CACHE riwayat transaksi, BUKAN sumber kebenaran soal
> state Accurate SAAT INI — kapan pun kode berasumsi sesuatu "masih
> berlaku" di Accurate dari catatan lokal, WAJIB verifikasi ulang ke
> Accurate sungguhan sebelum bertindak. Detail lengkap →
> `docs/phases/phase-82-fix-guard-idempotent-faktur-dihapus.md`,
> `docs/lessons-learned.md` 2026-09-10.

## 6. Metode Otorisasi Alternatif — "API Token" (TIDAK Dipakai Facport)
Selain OAuth2 Authorization Code Grant (§ 1, yang dipakai Facport), Accurate
juga punya metode auth lain bernama **"API Token"**: token+secret statis
diambil manual dari menu Accurate (Setup > API Token), request ditandatangani
pakai HMAC-SHA256 (`X-Api-Timestamp` + `X-Api-Signature`), tanpa alur
consent/redirect OAuth sama sekali — cocok untuk integrasi personal/internal
satu perusahaan-satu integrasi (bukan SaaS multi-customer). **Facport TIDAK
memakai metode ini** — OAuth tetap pilihan yang benar karena tiap customer
Facport perlu memberi consent eksplisit ke akun Accurate MEREKA SENDIRI
(model 1 subscription = 1 akun Accurate, § 1 di atas), bukan satu token
statis milik Facport sendiri. Dicatat di sini supaya tidak tertukar kalau
nanti baca dokumentasi/contoh kode yang pakai metode "API Token" ini
(mis. `aol-integration/accurate-schema-mcp`) — pola auth-nya BEDA, jangan
dicampur dengan implementasi OAuth Facport.

## Referensi
- Kenapa pola ini dipilih → `docs/decisions/adr-0006-integrasi-accurate-api.md`
- Background job & retry → `docs/architecture/architecture-jobs.md`
- Enkripsi token & validasi upload → `docs/architecture/architecture-security.md`
- Istilah "import mapping", "modul" → `docs/glossary.md`
- **Detail per modul** (endpoint, field mapping, keputusan per-fase):
  - `docs/architecture/architecture-purchase-invoice.md` (Faktur Pembelian)
  - `docs/architecture/architecture-sales-invoice.md` (Faktur Penjualan)
  - `docs/architecture/architecture-vendor-payable-account.md` (Akun Hutang Pemasok, Data Master)
  - Sales Receipt, Purchase Payment, Jurnal Umum: belum dikerjakan, belum ada file
