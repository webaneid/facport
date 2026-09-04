# Architecture — Integrasi Accurate Online (OAuth & Bulk Import)

> Ini komponen INTI Facport — bukan integrasi opsional. Lihat
> `docs/decisions/adr-0006-integrasi-accurate-api.md` untuk rasional
> keputusan di balik pola di file ini.

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

### Aturan Bisnis — 1 Subscription = 1 Akun Accurate
**Satu langganan Facport cuma bisa terhubung ke SATU akun Accurate Online.**
Ini konsisten dengan cara Accurate sendiri bekerja: satu akun Accurate
mewakili satu company/database (atau satu user internal di company itu) —
bukan multi-company dalam satu koneksi. Implikasi:
- Kalau user (mis. akuntan yang pegang beberapa klien) butuh impor ke lebih
  dari satu company Accurate, dia butuh **subscription terpisah per company**
  — ini juga jadi salah satu pendorong model harga per-`subscription`, bukan
  per-`user` (lihat `docs/architecture/architecture-subscription.md`).
- `accurate_connections` di-relasikan ke `subscriptions` (bukan langsung ke
  `users`), dengan **unique constraint 1:1** — satu subscription maksimal
  satu koneksi Accurate aktif.

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
`status = "expired"`, kirim notifikasi email minta re-koneksi manual.

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
export const accurateConnections = pgTable("accurate_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id).notNull().unique(), // 1 subscription = 1 akun Accurate
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  refreshTokenEncrypted: text("refresh_token_encrypted").notNull(), // Authorization Code Grant SELALU terbitkan ini (terverifikasi)
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(), // access_token, ~15 hari dari connectedAt/refresh terakhir
  accurateDbId: varchar("accurate_db_id", { length: 100 }), // ID database/company Accurate yang terhubung
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

## 3. Import Mapping — Kolom Excel → Field Accurate

Tiap modul (Sales Invoice, Purchase Order, dst — lihat daftar lengkap di
`docs/PROGRESS.md`) punya field wajib yang beda-beda di API Accurate.
**JANGAN asumsikan nama kolom Excel user selalu sama persis dengan nama
field Accurate** — user upload Excel dengan format mereka sendiri (nama
kolom bisa "Tanggal", "Tgl Transaksi", dst).

UI upload WAJIB kasih langkah "cocokkan kolom" (preview kolom Excel vs field
Accurate yang dibutuhkan) sebelum eksekusi import — bukan langsung
tebak-tebakan otomatis tanpa konfirmasi user, supaya salah mapping ketahuan
SEBELUM data masuk ke Accurate (data yang sudah masuk Accurate lebih susah
di-rollback daripada dibatalkan sebelum submit).

### Purchase Invoice — Auto-create Vendor & Item (Fase 05) ✅ VERIFIED 2026-08-20
Kalau `vendorNo`/`itemNo` di baris Excel BELUM ada di Accurate, dibuatkan
otomatis dulu (`vendor/save.do`/`item/save.do` CREATE, bukan cuma error
"tidak ditemukan") sebelum Faktur Pembelian dibuat — pakai field OPSIONAL
tambahan (kategori, telepon, WhatsApp, email, alamat, negara, Akun Hutang
untuk vendor baru). Kalau vendor/item SUDAH ada, field ini diabaikan sama
sekali (tidak pernah update data existing). Detail lengkap (field, fungsi
`findOrCreateVendor`/`findOrCreateItem`, keputusan desain) →
`docs/phases/phase-05-purchase-invoice-auto-create.md`.

### Purchase Invoice — Multi-Item per Faktur (Fase 06) 🆕 DIRENCANAKAN 2026-08-28
Client feedback pasca-presentasi: 1 faktur pembelian nyata sering punya
banyak barang, tapi Fase 02 sengaja di-scope "1 baris Excel = 1 faktur =
TEPAT 1 `detailItem`" (Known Limitation eksplisit). Baris Excel sekarang
dikelompokkan berdasarkan kolom **"Bill No"** (`billNumber`) — baris
dengan Bill No sama digabung jadi 1 payload `save.do` dengan `detailItem[]`
banyak elemen, bukan dikirim sebagai faktur terpisah. Baris dengan Bill No
kosong tetap 1 grup isi 1 baris (non-breaking untuk user existing). Field
header (`transDate`, `vendorNo`, dst) diambil dari baris pertama tiap
grup; semua baris dalam grup WAJIB `vendorNo` sama (validasi sebelum
kirim). Hasil (`accurateTransactionId`/status) di-apply ke semua baris
`import_batch_rows` anggota grup yang sama, tanpa kolom DB baru. Rasional
lengkap (kenapa Bill No, bukan kolom baru/Trans No, dan trade-off retry
per-grup) → `docs/decisions/adr-0011-purchase-invoice-multi-item.md`.
Detail eksekusi → `docs/phases/phase-06-purchase-invoice-multi-item.md`.

### Purchase Invoice — Update Faktur Existing / Retry Cerdas (Fase 08) ✅ VERIFIED 2026-08-28
Batch yang diproses SEBELUM Fase 06 ada bisa punya baris `success` (1
faktur, 1 item) + baris `failed` lain dengan Bill No sama (ditolak
Accurate sebagai duplikat nomor faktur). Retry biasa tidak bisa
memperbaiki ini — mencoba CREATE ulang tetap ditolak dengan alasan sama.
**Dikonfirmasi EMPIRIS** (test call nyata ke faktur `#150`, Data Usaha
"PT Frozen Food"): `purchase-invoice/save.do` MENDUKUNG mode UPDATE kalau
payload menyertakan `id` faktur — bukan cuma create. `detailItem` yang
dikirim REPLACE seluruh array (bukan merge), jadi item lama WAJIB
direferensikan lewat `id`-nya (`{ "id": <id lama> }`, tanpa field lain)
supaya tidak hilang; item baru dikirim tanpa `id`. Field header lain
(`vendorNo`, `transDate`, dst) TIDAK perlu disertakan di payload update —
dipertahankan otomatis oleh Accurate. Ini mengoreksi klaim ADR-0011 yang
bilang `save.do` tidak punya mode append — SALAH, dikoreksi di
`docs/decisions/adr-0012-purchase-invoice-update-existing.md` (ADR-0011
sendiri tidak diedit, sudah Accepted).

Retry sekarang otomatis pilih CREATE vs UPDATE: cari lintas-batch apakah
Bill No grup itu sudah pernah `success` di subscription yang sama — kalau
ketemu, jalur UPDATE (dengan safety check vendor-match + duplicate-guard
per item, lihat ADR-0012); kalau tidak, jalur CREATE seperti biasa (Fase
06, tidak berubah). Tidak ada tombol/endpoint baru — logic ada di worker.
Detail lengkap → ADR-0012 dan `docs/phases/phase-08-purchase-invoice-update-existing.md`.

### Purchase Invoice — Batal Import / Hapus Faktur (Fase 09) ✅ VERIFIED 2026-08-28
"Batal Import" menghapus/melepas transaksi Accurate yang dibuat oleh 1
batch import — BUKAN cuma menyembunyikan record lokal. **Dikonfirmasi
EMPIRIS** (create test invoice → hapus lagi, Data Usaha "PT Frozen
Food"):
- `purchase-invoice/delete.do` (`HTTP DELETE`, scope
  `purchase_invoice_delete`) terima SATU `id` (Long) atau `number`
  (String) per panggilan — BUKAN bulk. Menghapus SELURUH faktur (semua
  `detailItem`), tidak ada mode hapus sebagian. Envelope respons `{s,
  d}` (BUKAN `parseAccurateSaveEnvelope` — tidak ada field `r`, beda dari
  `save.do`). Dikonfirmasi BENAR-BENAR menghapus (bukan soft-delete):
  `detail.do` sesudahnya balas `{s:false, d:["Faktur Pembelian tidak
  tepat"]}`.
- `save.do` respons CREATE (`r`) **mengandung `detailItem[].id`** per
  item (dikonfirmasi test nyata: item baru dapat `id` sendiri, terpisah
  dari `id` faktur) — fondasi tracking per-item yang dipakai fase ini.
- ⚠️ **`save.do` mode update TIDAK BISA menghapus 1 detailItem via omit
  dari array** — DIKONFIRMASI EMPIRIS (buang 1 dari 2 item, tunggu 45
  detik biar bukan isu timing kalkulasi biaya, `save.do` balas `s:true`
  TANPA error, tapi `detail.do` fresh sesudahnya menunjukkan item yang
  di-omit MASIH ADA). `detailItem[]` bersifat **upsert-only** (tambah/
  update via `id`), BUKAN full-replace seperti draf awal ADR-0012/0013
  duga. Koreksi lengkap → ADR-0014.

**Masalah yang diselesaikan**: sejak Fase 08, 1 faktur bisa berisi item
dari BEBERAPA batch (append lintas-batch) — `delete.do` polos bisa
menghapus data batch LAIN yang menumpang di faktur yang sama. **Karena
tidak ada cara aman "menyusutkan" faktur gabungan** (temuan di atas),
solusinya: cek dulu lintas-batch siapa saja pemilik faktur itu — kalau
murni 1 batch → `delete.do` (hapus utuh, SATU-SATUNYA kasus yang aman
di-auto-cancel); kalau gabungan (batch lain juga punya item di faktur
itu) → **DIBLOKIR**, sama seperti baris lama tanpa tracking id-per-item
(`accurateDetailItemId` NULL). Detail lengkap keputusan → ADR-0013 (desain
awal) dan ADR-0014 (koreksi "susutkan" → "blokir"), eksekusi →
`docs/phases/phase-09-batal-import.md`.

## Sales Invoice (Faktur Penjualan) — Fase 13
> Client minta 5 sub-modul aktif (2026-09-04): Sales Invoice (SI),
> Purchase Invoice (PI, sudah ada), Sales Receipt/"Customer Receipt" (CR),
> Purchase Payment (PP), Journal Voucher/"Jurnal Umum" (JU). Fase 13 ini
> Sales Invoice SAJA — PP/CR/JU menyusul fase terpisah (urutan: yang
> paling mirip pola existing dulu). Semua endpoint/scope di bawah
> diverifikasi langsung dari `docs/referencehtml/accurate-openapi.json`
> (OpenAPI spec resmi Accurate, bukan tebakan).

**Prinsip: SI adalah bayangan cermin PI** — `vendorNo`↔`customerNo`,
Vendor↔Customer, semua pola generik yang sudah diputuskan untuk PI
(grouping multi-item per ADR-0011, retry cerdas per ADR-0012, batal
import per ADR-0013/ADR-0014) **diterapkan APA ADANYA ke resource baru
ini**, bukan didesain ulang. Dibangun LANGSUNG lengkap (bukan bertahap
seperti histori PI Fase 02→05→06→08→09) — keputusan eksplisit user
2026-09-04, karena pola-nya sudah terbukti matang di PI.

**Endpoint** (`/api/sales-invoice/*`, host dinamis dari sesi Data Usaha):
| Endpoint | Method | Scope |
|---|---|---|
| `/save.do` | POST | `sales_invoice_save` |
| `/detail.do` | GET | `sales_invoice_view` |
| `/list.do` | GET | `sales_invoice_view` |
| `/delete.do` | DELETE | `sales_invoice_delete` |

Scope `sales_invoice_view`/`sales_invoice_save` **sudah ada** di
`apps/api/src/lib/accurate-scopes.ts` (grup `penjualan`) sejak awal
project — belum pernah dipakai endpoint/service sampai fase ini.

**Field wajib** `save.do`: `detailItem[].itemNo`, `detailItem[].unitPrice`
(persis PI). `customerNo` SECARA TEKNIS opsional di schema Accurate
(beda dari PI yang `vendorNo` juga opsional secara schema tapi WAJIB
secara bisnis) — tetap diperlakukan WAJIB di `requiredFields` mapping
kita, konsisten dengan PI.

**Customer (data master, setara Vendor di PI)** — `apps/api/src/lib/accurate-customer.ts`,
mirror 1:1 `accurate-vendor.ts`:
- `findCustomerByNo` — `customer/list.do` + `filter.no.val`, sama pola
  `findVendorByNo`.
- `findOrCreateCustomer` — auto-create kalau `customerNo` di Excel belum
  ada, field opsional `customerName` (wajib diisi kalau memang mau buat
  baru), kategori/telepon/WA/email/alamat/negara — SEMUA create-only
  (tidak update customer existing), KECUALI:
- **`customerReceivableAccountListNo`** ("Akun Piutang") — setara
  `vendorPayableAccountListNo` di PI (§ Fase 04 & revisi 2026-08-22):
  BOLEH update customer yang SUDAH ADA juga, bukan cuma saat create.
  Field asli Accurate dikonfirmasi ada di `customer/save.do` schema
  (`customerReceivableAccountListNo`, tipe String) — simetris persis
  dengan vendor, TIDAK perlu modul "Import Data Pelanggan" terpisah
  (beda dari PI yang punya Fase 04 sebagai modul mandiri — di sini
  cukup jadi field opsional di Sales Invoice langsung karena tidak ada
  permintaan client spesifik soal itu, gampang ditambah modul terpisah
  nanti kalau ternyata dibutuhkan).

**Multi-item, retry cerdas, batal import** — reuse fungsi generik dari
`workers/index.ts` yang sudah ada untuk PI (`groupPurchaseInvoiceRows`,
dst pola-nya), diterapkan lewat fungsi SI sendiri
(`groupSalesInvoiceRows`, `processSalesInvoiceGroup`,
`appendToExistingSalesInvoice`, `findExistingAccurateSalesInvoiceId`) —
kolom pengelompokan pengganti "Bill No" adalah **"PO Number"**
(`poNumber`, field resmi Accurate di `sales-invoice/save.do` — referensi
nomor PO dari customer, peran sama seperti Bill No vendor di PI: nomor
referensi EKSTERNAL yang dipakai user mengelompokkan baris jadi 1
faktur, BUKAN nomor transaksi Accurate `number`).

**Kolom Excel & UI** — pola 1:1 PI: `sales-invoice.mapping.ts`
(`fieldToAccuratePath`, `defaultColumnMap`, `customerAutoCreateMapping`),
halaman `app/app/(protected)/sales-invoice/import/*`, komponen
`components/sales-invoice/*`. Detail field lengkap → baca kode langsung
(bukan didokumentasikan ulang di sini, sesuai pola PI yang sudah settle
— dokumen ini cukup jadi peta konsep + rujukan ADR, bukan duplikat kode).

**Nav & dashboard difilter oleh langganan** (§ ADR-0018, BARU sejak fase
ini) — menu "Import Faktur Penjualan" di sidebar customer HANYA muncul
kalau plan langganan customer itu mencakup modul `"penjualan"`. Pola ini
BAKU untuk semua modul baru berikutnya (PP, CR, JU), bukan kasus khusus
SI.

Detail eksekusi lengkap → `docs/phases/phase-13-sales-invoice.md`.

### Purchase Invoice — Auto-create Vendor & Item (Fase 05) ✅ VERIFIED 2026-08-20
Kalau `vendorNo`/`itemNo` di baris Excel BELUM ada di Accurate, dibuatkan
otomatis dulu (`vendor/save.do`/`item/save.do` CREATE, bukan cuma error
"tidak ditemukan") sebelum Faktur Pembelian dibuat — pakai field OPSIONAL
tambahan (kategori, telepon, WhatsApp, email, alamat, negara, Akun Hutang
untuk vendor baru). Kalau vendor/item SUDAH ada, field ini diabaikan sama
sekali (tidak pernah update data existing). Detail lengkap (field, fungsi
`findOrCreateVendor`/`findOrCreateItem`, keputusan desain) →
`docs/phases/phase-05-purchase-invoice-auto-create.md`.

### Purchase Invoice (Faktur Pembelian) — ✅ VERIFIED 2026-08-19
Sumber: snapshot lokal `api-docs.do` (§ "Dokumentasi Resmi" di atas), bukan
tebakan. Endpoint tersedia (semua di bawah `/api/purchase-invoice`, host
dinamis dari sesi Data Usaha — § "Sesi Data Usaha" di atas):

| Endpoint | Method | Scope |
|---|---|---|
| `/bulk-save.do` | POST | `purchase_invoice_save` |
| `/save.do` | POST | `purchase_invoice_save` |
| `/create-down-payment.do` | POST | `purchase_invoice_save` |
| `/list.do` | GET | `purchase_invoice_view` |
| `/detail.do` | GET | `purchase_invoice_view` |
| `/delete.do` | DELETE | `purchase_invoice_delete` |

`bulk-save.do` adalah yang dipakai import Excel (max 100 data per request —
untuk file lebih besar, WAJIB dipecah jadi beberapa request oleh worker,
bukan satu request raksasa). Field diprefix `data[n].` per baris (index
mulai 0).

**Field wajib (`required: true`)** untuk tiap baris transaksi:
| Field | Tipe | Keterangan |
|---|---|---|
| `vendorNo` | String | Nomor identitas vendor (header transaksi) |
| `detailItem.itemNo` | String | Kode barang (per baris item) |
| `detailItem.unitPrice` | Money | Harga beli barang (per baris item) |

**Field penting lain (opsional, tapi kemungkinan perlu di-mapping)**:
`transDate` (Date, tanggal transaksi), `number` (String, nomor faktur —
kosongkan untuk auto-number), `description` (String, catatan), `detailItem.quantity`
(Money, jumlah), `detailItem.warehouseName`, `detailItem.itemUnitName`,
`taxable`/`inclusiveTax` (Boolean, status pajak), `currencyCode`,
`branchName`, `paymentTermName`, `detailItem.purchaseOrderNumber` (kalau
faktur ini terhubung ke PO — TIDAK relevan untuk Fase 02 karena Purchase
Order belum dikerjakan). Field lengkap (~90 field termasuk
`detailExpense.*`, `detailDownPayment.*`, klasifikasi keuangan
`dataClassification1Name`..`10Name`) ada di snapshot lokal — jangan
duplikasi semuanya ke sini, cek file itu langsung saat implementasi Fase 02
untuk field yang belum kepakai di atas.

**Header wajib khusus OAuth**: `X-Session-ID` (§ "Sesi Data Usaha" di atas)
— muncul di parameter tiap endpoint `/api/purchase-invoice/*` yang dicek,
bukan cuma sekali di `save.do`.

**Response schema `save.do` — ✅ TERVERIFIKASI 2026-08-19 via test call
nyata** (bukan lagi "belum terverifikasi" seperti draf awal). Record hasil
faktur ADA di field **`r`** (BUKAN `d` — `d` di endpoint save cuma pesan
status `["Faktur Pembelian \"...\" berhasil disimpan"]`). `r` berisi objek
faktur lengkap (puluhan field turunan Accurate: `id`, `number`, `apAccount`,
`vendor`, `detailItem[]` dst) — kode kita cuma ambil `id`+`number` buat
`accurateTransactionId`. **Parse pakai `parseAccurateSaveEnvelope()`**
(`lib/accurate.ts`), BUKAN `parseAccurateEnvelope()` biasa — lihat
`docs/lessons-learned.md` untuk detail & alasan kenapa 2 parser terpisah
dibutuhkan (pola envelope Accurate TIDAK konsisten lintas jenis endpoint).

**Soal "Akun Hutang" (Accounts Payable account)**: field ini BUKAN input
yang bisa diisi manual saat `save.do` — tidak ada di schema request resmi.
Accurate otomatis menentukannya dari **default AP account yang sudah
di-setting di data Pemasok** (`vendor.apAccountId`/`apAccount`, muncul di
field `r` hasil save sebagai output, bukan sebagai parameter input). Kalau
user butuh AP account beda per transaksi, itu di luar cakupan `save.do`
Purchase Invoice — bukan sesuatu yang bisa ditambahkan sebagai kolom
mapping Excel. **Kalau kebutuhan sebenarnya adalah SET Akun Hutang per
pemasok (bukan per transaksi)** → itu didukung, tapi lewat endpoint
Vendor, bukan Purchase Invoice — lihat § "Vendor (Data Master)" di bawah.

```ts
// apps/api/src/lib/import-mapping/purchase-invoice.mapping.ts — draft, sesuaikan pas Fase 02
export const purchaseInvoiceMapping = {
  requiredFields: ["vendorNo", "detailItem.itemNo", "detailItem.unitPrice"] as const,
  defaultColumnMap: {
    "No Pemasok": "vendorNo",
    "Tanggal": "transDate",
    "Kode Barang": "detailItem.itemNo",
    "Harga": "detailItem.unitPrice",
    "Qty": "detailItem.quantity",
  },
};
```

### Vendor (Data Master, disebut "Pemasok" di UI Accurate) — 🆕 DIRENCANAKAN 2026-08-19, BELUM DIEKSEKUSI
> Istilah: API/endpoint pakai nama Inggris "Vendor" (`/api/vendor/*`,
> `vendorNo`, dst — tag resmi `open-api/json.do` untuk `/api/vendor` juga
> literal berlabel **"Pemasok"**). Teks di bawah pakai "Pemasok" untuk
> naratif, "Vendor" untuk nama literal endpoint/field.

Latar belakang: client user (pemilik Facport) minta kolom "Akun Hutang" di
import Faktur Pembelian. Setelah dicek langsung ke `open-api/json.do`
resmi (bukan snapshot lokal — spec ini publik & selalu live, § "Dokumentasi
Resmi"), field itu **tidak ada** di `purchase-invoice/save.do` (35 field,
tidak satupun terkait akun) karena Akun Hutang memang properti Pemasok,
bukan properti transaksi. Field yang dicari **ADA** di `vendor/save.do`:
`vendorPayableAccountListNo` ("Kode Akun Hutang"). Jadi kebutuhan client
sebenarnya adalah **import/update Data Master Pemasok** — modul BARU,
terpisah dari Purchase Invoice, dan di luar 5 modul transaksi yang sudah
di-listing di `docs/PROGRESS.md` (Penjualan/Pembelian/Persediaan/
Manufaktur/Kas&Bank — semua itu modul TRANSAKSI, ini modul DATA MASTER).

**Status:** baru tahap rencana (draf di `docs/phases/phase-04-import-vendor.md`),
BELUM dieksekusi — user (pemilik Facport) masih konfirmasi kebutuhan detail
ke client-nya dulu.

Endpoint tersedia (`/api/vendor/*`, host dinamis dari sesi Data Usaha, sama
pola dengan Purchase Invoice):
| Endpoint | Method | Scope (dugaan, ikut pola `{resource}_{aksi}`) |
|---|---|---|
| `/bulk-save.do` | POST | `vendor_save` |
| `/save.do` | POST | `vendor_save` |
| `/list.do` | GET | `vendor_view` |
| `/detail.do` | GET | `vendor_view` |
| `/delete.do` | DELETE | `vendor_delete` |

**Field wajib (`required: true`)** di schema resmi `save.do`: `name`,
`transDate`.

**✅ TERVERIFIKASI 2026-08-19 — konfirmasi langsung dari tim Support
Accurate ke client user** (bukan asumsi lagi): client menghubungi Support
Accurate perihal kebutuhan Akun Hutang ini, dan tim Support membalas
langsung membenarkan `vendorPayableAccountListNo` adalah parameter yang
tepat, sekaligus mengirim bukti test call nyata (screenshot Postman +
UI Accurate, tersimpan di `docs/referencehtml/vendorPayableAccountListNo.png`
dan `-2.png`):
```json
POST https://zeus.accurate.id/accurate/api/vendor/save.do
{
  "id": 100,
  "name": "FastHauzz",
  "transDate": "06/08/2026",
  "vendorPayableAccountListNo": 210101
}
```
→ `200 OK`, dan field "Akun Utang" di UI vendor tersebut (tab Pembelian →
Akun Pembelian) benar berubah jadi `[210101] Utang Usaha IDR`.

Temuan dari test call ini:
- **`id` (internal numeric ID Accurate) WAJIB untuk update vendor
  existing** — `optLock` di response naik (versi record), menandakan ini
  UPDATE ke vendor yang SUDAH ADA (id: 100), bukan CREATE baru. Konsisten
  dengan dugaan sebelumnya: alur Facport butuh `vendor/list.do` dulu
  (cari `id` berdasarkan `vendorNo` yang di-input user di Excel) → baru
  `save.do` pakai `id` itu untuk update.
- **`vendorPayableAccountListNo` dikirim sebagai ANGKA TUNGGAL**
  (`210101`), BUKAN array (`[210101]`) seperti tertulis di schema resmi
  (`type: array`) — tapi tetap sukses. Kemungkinan API cukup toleran
  (auto-wrap jadi array di belakang layar). Ikuti pola yang TERBUKTI
  jalan ini (angka/string tunggal) saat implementasi.
- **⚠️ Field ini OPSIONAL, bukan "akun hutang utama" tiap vendor** — dari
  catatan resmi di UI Accurate (tab Vendor → Pembelian → Akun Pembelian):
  *"[Opsional] Diisikan JIKA anda ingin MEMBEDAKAN jurnal akun utang/uang
  muka pemasok ini dengan DEFAULT akun utang/uang muka yang ada pada Mata
  Uang..."* — artinya ada **akun hutang default di level pengaturan Mata
  Uang** (Settings perusahaan), dan field vendor ini cuma OVERRIDE kalau
  vendor tertentu butuh beda dari default itu. Kalau vendor pakai akun
  default, field ini boleh dikosongkan. **Ini mengubah framing fitur**:
  bukan "semua vendor WAJIB di-set akun hutangnya", tapi "vendor TERTENTU
  SAJA yang perlu override dari default" — perlu dikonfirmasi ke client
  berapa banyak vendor yang benar-benar butuh field ini.

**Field lain yang relevan** (dari 38 field total `save.do`):
`vendorNo` (String, nomor identitas vendor), `vendorDownPaymentAccountListNo`
(String, "Kode Akun Uang Muka" — kemungkinan relevan juga kalau client
mau sekalian), `categoryName`, `currencyCode`, `termName` (syarat bayar
default), `email`, `mobilePhone`, alamat penagihan (`billStreet`/
`billCity`/`billProvince`/`billCountry`/`billZipCode`), data pajak
(`npwpNo`/`pkpNo`/`wpNumber`/`wpName`).

**Scope MVP yang disarankan** (tunggu konfirmasi user setelah client
dikonfirmasi): cuma 2 kolom wajib — `vendorNo` (untuk cari vendor existing)
+ `vendorPayableAccountListNo` (Akun Hutang) — TIDAK perlu semua 38 field
sekaligus di iterasi pertama, field lain bisa menyusul kalau memang
dibutuhkan.

**⚠️ Jangan tertukar dengan `detailOpenBalance` (Saldo Awal Utang/Piutang)**
— field array TERPISAH di `save.do` yang sama, deskripsi resmi field
`detailOpenBalance[].asOf`: *"Tanggal transaksi saldo awal utang/piutang
perusahaan"*. Ini BUKAN akun (COA), tapi **nilai saldo hutang** (Rupiah)
yang sudah ada sebelum pemasok itu mulai dipakai di Accurate — input
sekali per pemasok, JUGA tidak otomatis terhubung ke transaksi Faktur
Pembelian ke depannya (Accurate menghitung saldo BERJALAN sendiri dari
saldo awal ini + akumulasi Faktur Pembelian − Purchase Payment). Field
utama di dalamnya: `amount` (nilai saldo), `asOf` (tanggal), `currencyCode`.
**WAJIB dikonfirmasi ke client field mana yang sebenarnya dibutuhkan**
(`vendorPayableAccountListNo` = pilih akun COA, ATAU `detailOpenBalance`
= input nilai saldo hutang lama) — sebelum scope Fase 04 difinalisasi,
lihat pertanyaan terbuka di `docs/phases/phase-04-import-vendor.md`.

**✅ TERVERIFIKASI 2026-08-20 — cocok 1:1 dengan UI Accurate.** Tab Vendor
→ "Utang Awal" di UI Accurate punya dialog tambah entry dengan kolom
**Tanggal, Jumlah, Mata Uang, Syarat Pembayaran, Nomor#, Keterangan**
(TANPA field item) — persis field `detailOpenBalance[].{asOf, amount,
currencyCode, paymentTermName, number, description}`. Dicek via API
langsung ke vendor real ("PT. Angin Ribut", Data Usaha "Tes"):
```json
detailOpenBalance: [
  { "id": 50, "amount": 100000000, "asOf": "01/07/2026",
    "number": "PI.2026.07.00001", ... }
]
```
Field `number` di sini HANYA label/kategori referensi (tampil sebagai
dropdown "Faktur Pembelian" di UI, TANPA ikon pencarian 🔍) — bukan link
ke transaksi Faktur Pembelian sungguhan, murni catatan bebas. Juga
dikonfirmasi: entry baru yang ditambah lewat dialog "+" di UI Accurate
TIDAK langsung tersimpan ke server — baru ter-commit (dapat Nomor#
otomatis) setelah tombol "Simpan" di level form Vendor keseluruhan
diklik, bukan cuma menutup dialog kecilnya. Detail eksperimen lengkap →
`docs/phases/phase-04-import-vendor.md` § "Eksperimen Manual 2026-08-20".

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
