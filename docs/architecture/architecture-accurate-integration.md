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

### Aturan Bisnis — 1 Subscription (Sub-Modul) = 1 Akun Accurate, Koneksi Reusable Lintas Subscription
> **⚠️ Direvisi Fase 14, ADR-0020** (supersede poin 3 ADR-0009 di bawah
> ini — dibiarkan tercatat sebagai histori keputusan, BUKAN dihapus,
> tapi TIDAK berlaku lagi apa adanya). Detail rasional lengkap →
> `docs/decisions/adr-0020-accurate-connection-reusable-lintas-subscription.md`,
> `docs/architecture/architecture-subscription.md` § "Koneksi Accurate —
> Reusable Lintas Subscription".

**Satu subscription (= 1 sub-modul sejak Fase 14) cuma bisa terhubung ke
SATU Data Usaha Accurate** — aturan dasarnya TIDAK berubah, konsisten
dengan cara Accurate sendiri bekerja (1 Data Usaha = 1 company/database).
Yang BERUBAH: kalau customer punya BEBERAPA subscription (beli SI+PI
sekaligus, mis.) untuk **Data Usaha yang SAMA**, dia TIDAK WAJIB re-OAuth
per subscription — koneksi (`accurate_connections`) SEKARANG milik
**user** (bukan 1:1 ke 1 subscription lagi), bisa dipakai ulang lintas
subscription. Alasan bisnis: Accurate men-charge per "aplikasi
terkoneksi" — connect berkali-kali ke company yang sama akan dianggap
Accurate sebagai beberapa aplikasi terpisah, customer di-charge lebih
dari seharusnya.
- User yang kelola company Accurate BERBEDA per modul TETAP bisa —
  connect Data Usaha baru per company, cuma sekarang PILIHAN
  (`accurateConnectionId` per subscription), bukan dipaksa skema.
- `accurate_connections` di-relasikan ke `users` (bukan ke `subscriptions`
  lagi), TANPA unique constraint — 1 user boleh punya banyak connection
  (1 per Data Usaha berbeda yang pernah dia hubungkan).
  `subscriptions.accurateConnectionId` (nullable FK) yang jadi pointer
  "subscription/modul ini pakai koneksi yang mana".

### Alur (Terverifikasi — Authorization Code Grant)
```
User (di app.facport.com, dalam konteks subscription tertentu) klik
"Hubungkan Accurate Online"
      ↓
apps/api generate state token unik → simpan sementara (state → subscriptionId)
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
Simpan access_token + refresh_token TERENKRIPSI, relasikan ke subscriptionId
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
3. Simpan token terenkripsi, relasikan ke `subscriptionId` dari state.
4. `redirect()` browser ke halaman app.facport.com yang sesuai (BUKAN
   return JSON — user-nya browser, bukan API client).

### Scope Sesuai Paket Langganan
Scope yang diminta (`item_view`, `item_save`, `item_category_delete`, dst —
granular per resource+aksi) **WAJIB disesuaikan dengan modul yang termasuk
di paket (`plans.modules`) milik subscription tersebut** (§
`architecture-subscription.md`) — jangan minta scope lebih luas dari yang
sebenarnya dibutuhkan modul yang di-subscribe user (prinsip least privilege,
juga mengurangi permukaan kalau token bocor).

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
// § Fase 14, ADR-0020 — userId ganti subscriptionId, TANPA unique (1 user
// boleh punya banyak connection, 1 per Data Usaha berbeda). Pointer
// "subscription/modul mana pakai koneksi ini" sekarang di
// `subscriptions.accurateConnectionId` (§ architecture-subscription.md),
// BUKAN lagi di tabel ini.
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
