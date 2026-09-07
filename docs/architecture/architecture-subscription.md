# Architecture — Subscription & Plans (Model Langganan)

> Rasional keputusan → `docs/decisions/adr-0008-model-langganan.md`
> (model dasar), **`docs/decisions/adr-0019-gating-per-sub-modul-dan-katalog-plan.md`**
> (Fase 14 — granularitas per SUB-MODUL, bukan lagi grup Penjualan/
> Pembelian; `price` wajib lagi, supersede ADR-0015). File ini pelengkap
> teknis (skema, flow, gating akses modul). Dokumen invoice/PDF (Fase 15)
> → `docs/architecture/architecture-invoice.md`.

## Skema Database

```ts
// apps/api/src/db/schema.ts
export const plans = pgTable("plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(), // "Sales Invoice — Bulanan", dst — 1 row = 1 SKU per SATU sub-modul
  // § Fase 14, ADR-0019 — WAJIB lagi (dulu nullable sementara, ADR-0015,
  // "Facport tanpa harga" — premis itu sudah tidak berlaku, Facport jual
  // per-sub-modul dengan harga nyata sekarang).
  price: integer("price").notNull(), // Rupiah, integer (hindari float untuk uang)
  durationDays: integer("duration_days").notNull(), // 30 = bulanan, 365 = tahunan, dst
  // § Fase 14, ADR-0019 — isi SUB-MODUL (sales_invoice/purchase_invoice/
  // sales_receipt/purchase_payment/journal_voucher), BUKAN lagi grup
  // top-level (penjualan/pembelian). Tetap array (tipe TIDAK berubah,
  // hindari migration breaking), tapi KONVENSI-nya sekarang cuma 1
  // elemen per plan — bundling lintas-modul terjadi di CART (§ "Cart
  // Multi-Modul" di bawah), bukan didefinisikan sebagai 1 plan berisi
  // banyak modul. § Fase 28, ADR-0026 — tambah `vendor_payable_account`
  // (sub-modul ke-6, kategori "Data Master" bukan transaksi).
  modules: jsonb("modules").notNull(), // string[], konvensi: 1 elemen
  isActive: boolean("is_active").notNull().default(true), // paket yang di-nonaktifkan tidak hilang dari histori subscriber lama
  // § Fase 43 — admin WAJIB tandai eksplisit per paket, default false
  // (lihat § "Trial (Batas Baris)" di bawah untuk rasional per-plan).
  trialEligible: boolean("trial_eligible").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  planId: uuid("plan_id").references(() => plans.id).notNull(),
  orderId: uuid("order_id").references(() => orders.id), // nullable — null kalau dibuat admin tanpa payment (lihat § Provisioning Admin)
  status: varchar("status", { length: 20 }).notNull().default("pending_payment"),
  // enum: "pending_payment" | "active" | "expired" | "cancelled"
  startAt: timestamp("start_at"), // diisi begitu status jadi "active"
  endAt: timestamp("end_at"), // startAt + plan.durationDays, dihitung saat aktivasi
  // § Fase 14, ADR-0020 — pointer ke koneksi Accurate yang dipakai
  // SUBSCRIPTION/MODUL INI. Nullable — diisi BELAKANGAN (customer pilih
  // reuse koneksi existing ATAU connect Data Usaha baru, § "Koneksi
  // Accurate — Reusable Lintas Subscription" di bawah), bukan saat
  // checkout/pembayaran.
  accurateConnectionId: uuid("accurate_connection_id").references(() => accurateConnections.id),
  // § Fase 15, ADR-0021 — pointer BALIK ke baris invoice yang membuat
  // subscription ini. Nullable — subscription BOLEH dibuat TANPA invoice
  // (jalur admin "Tandai Sudah Dibayar Manual", Fase 18, atau subscription
  // lama pra-Fase 15). Lihat `architecture-invoice.md`.
  invoiceItemId: uuid("invoice_item_id").references(() => invoiceItems.id),
  // § Fase 10 — override retensi data import PER PELANGGAN (nullable,
  // NULL = pakai default admin). Kolomnya sudah ada dari Fase 10, TAPI
  // endpoint buat customer isi field ini sendiri SENGAJA belum dibangun
  // (ditunda ke fase customer-settings terpisah) — lihat § "Retensi Data
  // Import" di bawah.
  importRetentionDaysOverride: integer("import_retention_days_override"),
  // § Fase 43 — trial gratis self-service (1x seumur hidup per modul per
  // user). `orderId`/`invoiceItemId` NULL untuk baris trial (dibuat
  // LANGSUNG "active" tanpa order/invoice sama sekali) — lihat § "Trial
  // (Batas Baris)" di bawah.
  isTrial: boolean("is_trial").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

## Cart Multi-Modul & 1 Subscription = 1 Sub-Modul (Fase 14, ADR-0019)
Sejak Fase 14, **1 `subscriptions` row = 1 SUB-MODUL** (Sales Invoice,
Purchase Invoice, Sales Receipt, Purchase Payment, Journal Voucher, atau
Vendor Payable Account — 6 sejak Fase 28/ADR-0026, § catatan skema di
atas), BUKAN lagi 1 bundel berisi banyak modul. Customer BOLEH checkout/dibuatkan
admin **beberapa sub-modul sekaligus dalam 1 transaksi** (cart, § Fase 16
payment) — hasilnya BUKAN 1 subscription gabungan, tapi **BANYAK
subscription row terpisah**, 1 per sub-modul yang dibeli, masing-masing
`endAt`/status/koneksi Accurate independen.

Konsekuensi teknis: **1 user BOLEH punya banyak subscription `status:
"active"` bersamaan** — beda dari sebelum Fase 14 yang asumsi "1 user = 1
plan aktif". `getActiveSubscription()` (singular, ambil 1 baris terbaru)
diganti `getActiveSubscriptions()` (plural, ambil SEMUA baris aktif) —
lihat § "Gating Akses Modul" di bawah.

## Retensi Data Import (Fase 10)
Data Excel yang diimpor (`import_batches`/`import_batch_rows`, § architecture-accurate-integration.md
§ 2) berisi data bisnis sensitif milik client (harga beli, nama vendor,
dst) — Facport SENGAJA tidak menyimpannya lama-lama, supaya tidak bisa
dituduh menahan data rahasia perusahaan client lebih lama dari
seperlunya.

- **Batas sistem TETAP: maksimal 7 hari** (konstanta kode
  `MAX_IMPORT_RETENTION_DAYS`, BUKAN nilai yang bisa diubah admin maupun
  customer).
- **Default admin: 2 hari** — disimpan di `settings` (key-value,
  `data.importRetentionDays`, group `"data"`), diatur dari
  `/admin/settings`.
- **Override per-pelanggan** (`subscriptions.importRetentionDaysOverride`,
  di atas) — kalau terisi, dipakai gantikan default admin UNTUK
  subscription itu saja. UI buat customer mengisi field ini sendiri
  DITUNDA (Fase 10 cuma siapkan kolom + logic baca-nya di job, bukan
  endpoint tulis-nya).
- Job terjadwal harian `PURGE_OLD_IMPORTS` (§ `architecture-jobs.md`)
  hitung retensi EFEKTIF per batch (override kalau ada, else default
  admin), hapus `import_batches` (cascade rows) yang lebih tua dari itu
  dan TIDAK sedang `processing`/`cancelling`. Detail lengkap →
  `docs/phases/phase-10-admin-dashboard.md`.
- Retensi ini **TIDAK menyentuh** `audit_logs`, `media`, atau data user —
  scope-nya cuma riwayat import Excel.
`plans.modules` pakai key modul yang SAMA dengan yang dipakai di
`import_batches.module` (§ `architecture-accurate-integration.md`) — supaya
gating (di bawah) tinggal cek keanggotaan array, bukan mapping nama berbeda.
`plans.modules` juga menentukan **scope OAuth** yang diminta saat user
menghubungkan akun Accurate mereka (§ `architecture-accurate-integration.md` § 1) —
least privilege, jangan minta scope di luar modul yang dilanggan.

## Durasi Fleksibel — Hari/Bulan/Tahun (Fase 43)
`plans.durationDays` di database TETAP integer hari mentah (tidak ada
kolom/skema baru) — fleksibilitas unit (Hari/Bulan/Tahun) murni fitur
UI admin (`apps/web/lib/duration.ts`), dikonversi ke hari SEBELUM
dikirim ke API:

- **1 Bulan = 30 hari, 1 Tahun = 360 hari** (12×30, BUKAN kalender
  asli/365) — konvensi TETAP dipakai konsisten di seluruh sistem
  (termasuk konversi trial di bawah), supaya 1 Tahun selalu persis 12
  Bulan tanpa sisa.
- Form admin (`admin/plans/page.tsx`) input "Jumlah" + pilih unit,
  `toDurationDays(amount, unit)` konversi saat submit. Saat EDIT plan
  existing, `inferDurationUnit(durationDays)` pilih unit TERBESAR yang
  habis dibagi bulat (mis. 360 → "1 Tahun", bukan "360 Hari"), fallback
  "Hari" kalau tidak habis dibagi bulan/tahun (mis. 45 hari).
- API (`POST`/`PUT /admin/plans`) TIDAK berubah sama sekali — tetap
  terima `durationDays` integer, tidak tahu/tidak peduli soal unit.

## Multi-Tier per Sub-Modul (Fase 53)
1 sub-modul BOLEH punya lebih dari 1 baris `plans` (tier durasi/harga
berbeda, mis. "Purchase Invoice" Bulanan Rp X vs Tahunan Rp Y) — **tidak
ada perubahan skema/backend sama sekali** untuk mendukung ini, murni
konsekuensi dari fakta bahwa checkout SUDAH plan-id-based (bukan
module-based) sejak awal:

- `plans.modules` (array 1 elemen, § konvensi Fase 14) TIDAK unique —
  admin bebas bikin 2+ baris dengan `modules` yang SAMA, beda
  `price`/`durationDays`. Endpoint `admin/plans.route.ts` tidak berubah.
- Guard "modul sudah aktif" di checkout (`subscriptions.route.ts`) SUDAH
  keyed by `plan.modules[0]` (module key), BUKAN plan id, sejak Fase 16
  — otomatis benar: customer yang sudah aktif salah satu tier modul X
  tidak bisa checkout tier lain modul X yang sama.
- `endAt` subscription dihitung LIVE dari `plan.durationDays` saat admin
  confirm (bukan snapshot) — otomatis benar per tier yang dibeli.
- `trialEligible` TETAP per baris plan (bukan per modul) — admin
  biasanya nyalakan di 1 tier saja (mis. bulanan). Tombol "Coba Gratis"
  di UI ikut tier yang sedang dipilih customer, BUKAN bug kalau
  hilang/muncul saat customer ganti tier.
  > **Update 2026-09-08** — tier PILL & auto-select default DIBALIK jadi
  > durasi terpanjang dulu (tahunan → bulanan → harian kalau ada), lihat
  > poin di bawah. Konsekuensi: kalau admin cuma nyalakan `trialEligible`
  > di tier bulanan (konvensi lama), tombol "Coba Gratis" TIDAK muncul
  > lagi secara default (customer harus pindah pill ke bulanan dulu) —
  > BUKAN bug, tapi kalau ingin trial tetap terlihat langsung, admin
  > perlu nyalakan `trialEligible` juga di tier tahunan.
- **Urutan tier & auto-select default = durasi TERPANJANG dulu** (diminta
  user 2026-09-08): tahunan → bulanan → harian (kalau ada), BUKAN lagi
  ASC durasi-terpendek-dulu seperti desain awal Fase 53. Diimplementasi
  di SATU tempat (`useGroupedPlans` — sort `durationDays` DESC, default
  tier aktif = `tiers[0]`), otomatis berlaku ke pill DAN auto-select di
  `landing/module-features.tsx` maupun `/subscribe` sekaligus (1 sumber
  kebenaran, konsisten kedua tempat, tidak perlu diubah 2x).
- **Grouping (1 modul → 1 kartu, tier jadi pilihan pill) murni di
  FRONTEND** — `apps/web/lib/use-grouped-plans.ts` (hook shared, dipakai
  `landing/module-features.tsx` DAN `app/(protected)/subscribe/page.tsx`).
  Backend TIDAK tahu konsep "grup" sama sekali, tetap terima `planIds`
  polos di checkout.
- Guard tambahan `DUPLICATE_MODULE_IN_CART` (defense-in-depth,
  `subscriptions.route.ts`) menolak 1 checkout yang mengandung 2+ tier
  modul yang sama — seharusnya mustahil lewat UI resmi (tier-picker
  mutually-exclusive per modul), tapi tetap divalidasi server.

**Implikasi untuk fase berikutnya**: JANGAN asumsikan "1 modul = 1 plan
row" lagi di kode baru — selalu cek lewat `plan.modules[0]` (module key)
untuk logic yang seharusnya per-modul (bukan per-plan-row), sama seperti
guard checkout/trial yang sudah benar sejak awal.

> **Bug ditemukan 2026-09-08 (Fase 57)**: implikasi di atas juga berlaku
> untuk kode LISTING/AGREGASI (bukan cuma checkout/trial) — `GET
> /admin/users` masih asumsi "1 user = maks 1 subscription aktif" (peta
> `Map<userId, subscription>` bukan array), jadi user dengan >1 modul
> aktif sekaligus (normal sejak fase ini) cuma tampil 1 di UI admin. Fix
> & detail lengkap → `docs/phases/phase-57-fix-daftar-langganan-aktif-admin-users.md`,
> `docs/lessons-learned.md` entri tanggal sama. Kalau ada endpoint
> listing/agregasi LAIN yang masih pakai pola serupa (`new Map(rows.map(r
> => [r.userId, r]))` untuk relasi yang sekarang bisa one-to-many),
> waspadai kelas bug yang sama.

## Trial (Batas Baris) (Fase 43)
Semua paket (semua sub-modul) punya jalur coba-gratis **self-service**
— customer klik tombol "Coba Gratis" di `/subscribe`, TANPA approval
admin, TANPA invoice/order/pembayaran sama sekali. Beda mendasar dari
provisioning admin (§ "Dua Jalur Registrasi" di bawah): trial dibuat
LANGSUNG `status: "active"` dengan `orderId`/`invoiceItemId` NULL (mirror
pola `createManualSubscriptions`, § `lib/manual-subscription.ts`, Fase
18) — helper terpisah `createTrialSubscription()` di `lib/trial.ts`.

**Kenapa dibatasi jumlah BARIS, bukan jumlah hari**: batas hari bisa
"dimanfaatkan waktu" tanpa batas nyata (customer tunda import sampai
mendekati kadaluarsa lalu tetap import ribuan baris) — batas baris
mencegah itu, sekali kuota habis customer tidak bisa import lagi APA PUN
sisa hari trialnya.

- **`plans.trialEligible`** (boolean, default `false`) — trial BUKAN
  otomatis untuk semua paket. Admin WAJIB menandai eksplisit per paket
  lewat toggle "Bisa Dicoba Gratis (Trial)" di form buat/edit paket
  (`admin/plans/page.tsx`) — kalau tidak ditandai, tombol "Coba Gratis"
  tidak muncul di `/subscribe` DAN `POST /subscriptions/trial` menolak
  eksplisit (`TRIAL_NOT_AVAILABLE_FOR_PLAN`), bukan cuma disembunyikan
  di UI. Ini SENGAJA per-plan (bukan flag global "trial nyala/mati")
  supaya admin tetap punya otoritas penuh menentukan paket mana yang
  boleh dicoba gratis — koreksi dari desain awal Fase 43 yang sempat
  mengaktifkan trial untuk SEMUA paket tanpa kontrol admin.
- **`trial.maxRows`** (default 100, admin-configurable di
  `/admin/settings`, kartu "Pengaturan Trial") — batas GLOBAL, berlaku
  SAMA untuk semua modul/paket yang `trialEligible` (BUKAN per-plan)
  supaya admin tidak perlu input angka yang sama berkali-kali per paket.
- **`trial.durationDays`** (default 30, TERPISAH dari `trial.maxRows`) —
  backstop kadaluarsa hari, dipakai job `EXPIRE_SUBSCRIPTIONS` yang
  SUDAH ADA (§ `architecture-jobs.md`) — trial yang tidak pernah dipakai
  importnya TETAP kadaluarsa, tidak menggantung aktif selamanya.
- **1x trial seumur hidup per modul per user** — subscription
  `isTrial: true` APA PUN statusnya sekarang (aktif/expired/habis kuota)
  dihitung "sudah pernah trial" modul itu. `GET /me/subscriptions`
  mengembalikan `everTrialedModules: string[]` (union modul dari SEMUA
  subscription trial user ini, apa pun status), dipakai frontend
  men-disable tombol "Coba Gratis" permanen. Guard yang sama dicek ulang
  server-side di `POST /subscriptions/trial` (`TRIAL_ALREADY_USED`) —
  frontend cuma UX, bukan satu-satunya lapis pertahanan.
- **Trial TIDAK memblokir pembelian paket ASLI modul yang sama** — guard
  "modul sudah aktif" di `POST /subscriptions/checkout` SENGAJA
  meng-exclude subscription `isTrial: true` saat membangun
  `activeModules` (§ "API (Ringkas)" di bawah), supaya customer bisa
  upgrade kapan saja tanpa menunggu trial habis/expired.
- **Enforcement baris** — `checkTrialRowBudget(subscriptionId,
  additionalRows)` (`lib/trial.ts`): subscription NON-trial SELALU
  `{ok:true}` (paket asli tidak dibatasi baris). Untuk trial, hitung
  baris `status:"success"` SCOPED ke subscription itu (BUKAN lintas
  modul/subscription lain milik user yang sama), bandingkan dengan
  `additionalRows` yang AKAN diproses terhadap `trial.maxRows`. Disisipkan
  di **12 titik** (`:batchId/confirm` + `:batchId/retry` × 6 modul),
  SEBELUM `boss.send(JOBS.IMPORT_TO_ACCURATE, ...)`:
  - `confirm` — `additionalRows = batch.totalRows` (proses SEMUA baris
    batch pertama kali).
  - `retry` — `additionalRows` = COUNT baris `pending`/`failed` di batch
    itu (yang AKAN diproses ulang).
  - Gagal → 400 `TRIAL_ROW_LIMIT_EXCEEDED` + `{remaining, max}`, **SELURUH
    batch ditolak** (bukan diproses sebagian) — customer memangkas
    jumlah baris di file atau upgrade ke paket berbayar.
- **Known limitation** — pengecekan ini TIDAK di dalam row-lock/transaction
  (beda dari checkout yang row-lock `user` FOR UPDATE): 2 batch DIKONFIRMASI
  BERSAMAAN oleh subscription trial yang sama secara teori bisa
  sama-sama lolos cek kuota lalu gabungan keduanya melebihi
  `trial.maxRows` (TOCTOU, mirror keterbatasan yang SUDAH ADA sebelum
  Fase 43 pada confirm/retry — endpoint ini juga tidak row-lock terhadap
  double-submit biasa). Diterima sebagai risiko RENDAH (kerugian bisnis
  kecil — beberapa baris ekstra trial gratis — bukan celah keamanan/data
  breach), didokumentasikan di sini alih-alih ditutup sekarang.

## Koneksi Accurate — Reusable Lintas Subscription (Fase 14, ADR-0020)
> Supersede poin 3 ADR-0009. `accurate_connections` SEKARANG berelasi ke
> `users` (bukan ke `subscriptions` lagi, dan BUKAN unique — 1 user boleh
> punya banyak connection, 1 per Data Usaha berbeda). `subscriptions.accurateConnectionId`
> (di atas) yang jadi pointer "modul ini pakai koneksi yang mana".

**Kenapa berubah dari ADR-0009**: dulu 1 subscription = seluruh akun
(bundel banyak modul), jadi wajar 1:1 ke 1 Data Usaha. Sejak Fase 14, 1
subscription = 1 sub-modul — kalau tetap 1:1 unique, customer yang beli 2
sub-modul untuk COMPANY ACCURATE YANG SAMA terpaksa OAuth-connect 2x
terpisah, dan **Accurate men-charge per "aplikasi terkoneksi"** — jadi
customer di-charge dua kali untuk sesuatu yang nyatanya 1 koneksi ke 1
company. Sekarang: connect SEKALI per Data Usaha, dipakai ulang
(`accurateConnectionId`) oleh subscription/modul lain yang company-nya
sama — TANPA re-OAuth, TANPA connection baru.

**Alur customer** (`apps/web/app/app/(protected)/accurate/page.tsx`) —
per subscription/modul yang BELUM ada koneksinya, 2 pilihan:
1. **"Pakai koneksi yang sudah ada"** — dropdown Data Usaha dari
   `accurate_connections` milik dia (`status:"active"`) yang sudah
   dihubungkan modul lain → `subscriptions.accurateConnectionId` di-set
   ke situ, SELESAI, tidak ada panggilan OAuth apa pun.
2. **"Hubungkan Data Usaha Baru"** — OAuth flow penuh (§ 1 di bawah,
   ALUR-nya sendiri tidak berubah sejak Fase 01) → bikin
   `accurate_connections` row baru, langsung di-assign ke subscription
   yang menginisiasi.

User yang kelola company Accurate BERBEDA per modul (bukan 1 company yang
sama) tetap bisa — connect Data Usaha baru untuk tiap company, cuma
TIDAK dipaksa kalau company-nya sama.

## Dua Jalur Registrasi

### 1. Self-Service
```
User isi form register (app.facport.com/register)
      ↓
Kirim email verifikasi (§ architecture-notifications.md)
      ↓
User klik link verifikasi → akun aktif, BELUM ada subscription
      ↓
User pilih plan → checkout → bayar (§ architecture-payment.md)
      ↓
Webhook payment sukses → subscriptions.status = "active", startAt/endAt diisi
```

### 2. Admin-Provisioned
```
Admin (admin.facport.com) buat user baru manual (isi nama, email)
      ↓
User langsung berstatus verified (admin bertanggung jawab validitas data —
dicatat di audit_logs siapa admin yang membuat, § architecture-security.md §11)
      ↓
Password sementara DIGENERATE server (randomBytes, § POST /admin/users),
DIKEMBALIKAN sekali di response (admin lihat sekali, JANGAN disimpan
ulang) DAN dikirim otomatis lewat email selamat datang (§ Fase 18, job
queue SEND_EMAIL — TIDAK ADA alur "kirim email undangan set-password"
terpisah, force-change-password-di-login-pertama JUGA belum ada, § Known
Limitations phase-01/phase-18 doc)
      ↓
Admin OPSIONAL sekalian centang 1+ sub-modul (§ Fase 18) — 2 hasil akhir
(§ security review 2026-09-04, High — `markAsPaid` WAJIB dicek permission
`subscriptions.manage` TERPISAH dari `users.manage`, SEBELUM user dibuat
sama sekali: role yang cuma punya `users.manage` — mis. "staf onboarding"
yang cuma boleh bikin akun, bukan urus billing — TIDAK BOLEH aktivasi
subscription bebas-bayar lewat jalur ini, kode error `FORBIDDEN_MARK_AS_PAID`):
  (a) "Kirim Invoice" (default) — bikin invoice+order SAMA PERSIS logic
      checkout customer (`lib/invoice-order.ts`, dipakai bersama), status
      "unpaid"/"pending", customer login lalu bayar sendiri lewat
      `/billing/{orderId}/pay` (Fase 16). TIDAK ADA subscription tercipta
      sampai admin confirm pembayaran (§ admin/orders.route.ts).
  (b) "Tandai Sudah Dibayar" (`markAsPaid: true`) — subscriptions dibuat
      LANGSUNG "active" (`lib/manual-subscription.ts`), orderId = null,
      TIDAK lewat invoice/order sama sekali — endAt DIHITUNG OTOMATIS dari
      plan.durationDays (BEDA dari `POST /admin/subscriptions` di bawah
      yang endAt-nya manual — di alur onboarding cepat ini tidak ada UI
      per-modul buat isi tanggal custom).
```
**`POST /admin/subscriptions`** (assign 1 plan ke user YANG SUDAH ADA,
terpisah dari alur bikin-user-baru di atas) TETAP butuh `endAt` manual (§
ADR-0016) — dipakai kasus kontrak korporat/tanggal custom yang tidak
kelipatan `durationDays`. Untuk perpanjang/perpendek `endAt` subscription
yang SUDAH aktif (tanpa bikin baris baru) → `PATCH
/admin/subscriptions/:id`, § "API (Ringkas)" di bawah dan ADR-0016.

> **§ ADR-0028 (koreksi 2026-09-06)** — `endAt` di sini diinput admin
> lewat `<input type="date">` (tanggal-saja, "berlaku SAMPAI tanggal X").
> Frontend (`admin/users/page.tsx`) WAJIB konversi lewat
> `endOfDayInTimezone(dateStr, companyTimezone)` (§ `apps/web/lib/timezone.ts`)
> SEBELUM kirim ke endpoint ini — versi lama (`new Date(dateStr).toISOString()`)
> mem-parse sebagai UTC midnight, bikin subscription berhenti aktif
> ~7 jam (Asia/Jakarta) LEBIH AWAL dari yang admin maksud. Endpoint ini
> sendiri TIDAK berubah (tetap terima `endAt` ISO datetime string apa
> adanya, tidak tahu soal timezone — konversi WAJIB terjadi di frontend
> SEBELUM submit).

## Gating Akses Modul — Beda dari RBAC Permission

Ini **LAPISAN TERPISAH** dari `requirePermission()` (§ `architecture-auth.md`):
- **RBAC permission** jawab: "role kamu (customer) boleh manggil endpoint
  import sama sekali?" — YA/TIDAK berdasar role.
- **Subscription gate** jawab: "paket langganan kamu AKTIF dan TERMASUK
  modul spesifik ini?" — beda user customer bisa beda jawaban tergantung
  plan masing-masing.

```ts
// apps/api/src/lib/subscription-gate.ts
// § Fase 14, ADR-0019 — getActiveSubscriptionsWithPlans (PLURAL, array)
// ganti getActiveSubscriptionWithPlan (singular) — 1 user bisa punya
// BANYAK subscription aktif bersamaan sekarang (1 per sub-modul dibeli).
// moduleKey dicari di SEMUA subscription aktif user (union), bukan cuma
// 1 baris terbaru. `subscription` yang dikembalikan resolve() adalah
// baris SPESIFIK yang cover moduleKey ini — dipakai route import buat
// resolve `accurateConnectionId`-nya sendiri (tiap sub-modul beda koneksi).
export async function getActiveSubscriptionsWithPlans(userId: string) {
  return db
    .select({ subscription: subscriptions, plan: plans })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")))
    // § security review 2026-09-04 (Low) — urutan WAJIB deterministik.
    // Invariant "1 modul aktif = 1 subscription" TIDAK dijaga unique
    // constraint DB — `.find()` di moduleAccess macro (di bawah) harus
    // konsisten ambil baris yang SAMA tiap request kalau somehow ada 2
    // subscription aktif yang cover modul yang sama.
    .orderBy(desc(subscriptions.createdAt));
  // § endAt > now TIDAK dicek manual di sini — job EXPIRE_SUBSCRIPTIONS
  // (jalan tiap hari) yang jaga `status` selalu konsisten, pola yang
  // SUDAH ada sejak sebelum Fase 14, tidak berubah.
}

export const subscriptionGatePlugin = new Elysia({ name: "subscription-gate" }).macro({
  moduleAccess: (moduleKey: string) => ({
    async resolve({ status, request: { headers } }) {
      const session = await auth.api.getSession({ headers });
      if (!session) return status(401);

      const activeSubs = await getActiveSubscriptionsWithPlans(session.user.id);
      const matching = activeSubs.find((s) => s.plan.modules.includes(moduleKey));
      if (!matching) return status(403, { code: "MODULE_NOT_SUBSCRIBED" });

      return { user: session.user, session: session.session, subscription: matching.subscription };
    },
  }),
});

// Pemakaian di route import (moduleKey sekarang SUB-MODUL, § ADR-0019):
app.group("/sales-invoice", (app) =>
  app
    .use(permissionPlugin)
    .use(subscriptionGatePlugin)
    .post("/import/upload", uploadHandler, { permission: "import.create", moduleAccess: "sales_invoice" })
);
```
**Kedua guard WAJIB lolos** — permission check dulu (role secara umum boleh
akses fitur import), baru subscription gate (ADA subscription aktif yang
cover sub-modul spesifik ini atau tidak). Kode error `SUBSCRIPTION_INACTIVE`/
`MODULE_NOT_IN_PLAN` (2 kode terpisah, dari sebelum Fase 14) digabung jadi
**1 kode**: `MODULE_NOT_SUBSCRIBED` — beda-in "tidak ada subscription sama
sekali" vs "ada subscription tapi bukan modul ini" sudah tidak relevan
begitu 1 user bisa punya banyak subscription independen (kasusnya sama
persis dari sudut pandang customer: "sub-modul ini belum kamu langganan").

## Downgrade Otomatis Saat Expired

Didaftarkan di `apps/api/src/workers/index.ts` bareng SEMUA job lain (bukan
file terpisah per job — § `architecture-jobs.md` § "Worker (Proses
Terpisah, Bukan di Request Handler)"):

```ts
// apps/api/src/workers/index.ts
await boss.schedule(JOBS.EXPIRE_SUBSCRIPTIONS, "0 1 * * *");
await boss.work(JOBS.EXPIRE_SUBSCRIPTIONS, async () => {
  const expired = await db
    .update(subscriptions)
    .set({ status: "expired" })
    .where(and(eq(subscriptions.status, "active"), lt(subscriptions.endAt, new Date())))
    .returning({ id: subscriptions.id });
  logger.info({ count: expired.length }, "Subscriptions expired");
  // Opsional: enqueue email notifikasi "langganan kamu berakhir" per row
});
```
**Kenapa job terjadwal, bukan cuma cek real-time saat request**: status di
DB harus konsisten dan terlihat benar dari admin dashboard kapan saja, tanpa
bergantung ada/tidaknya request aktif dari user yang bersangkutan.

## API (Ringkas)
```
GET  /plans                          → daftar SKU per-sub-modul aktif (publik, landing page pricing)
POST /subscriptions/checkout         → body: { planIds: uuid[] } (cart, § Fase 16/ADR-0022) — buat
                                        1 invoice (N invoiceItems) + 1 order status "pending", return
                                        { invoiceId, orderId, amountDue }. BUKAN payment URL/redirect
                                        gateway — metode bayar (transfer manual/QRIS) dipilih customer
                                        di langkah TERPISAH (`/billing/{orderId}/pay`, § architecture-payment.md).
                                        Subscription BELUM dibuat di sini — baru tercipta saat admin
                                        confirm pembayaran (`POST /admin/orders/:id/confirm`).
GET  /me/subscriptions               → § Fase 14 — SEMUA subscription aktif user (PLURAL, ganti
                                        GET /me/subscription singular) — dipakai sidebar/dashboard
                                        buat tahu union modul yang dia langganan. § Fase 43 — juga
                                        return `everTrialedModules: string[]` (union modul yang
                                        PERNAH ditrial, apa pun status sekarang)
POST /subscriptions/trial            → § Fase 43 — body: { planId: uuid }, self-service "Coba
                                        Gratis". Subscription LANGSUNG "active", isTrial:true,
                                        TANPA order/invoice. Guard: TRIAL_NOT_AVAILABLE_FOR_PLAN
                                        (plan.trialEligible false), TRIAL_ALREADY_USED (modul ini
                                        sudah pernah ditrial), MODULE_ALREADY_SUBSCRIBED (modul
                                        sudah aktif, real atau trial)
# Admin only:
GET  /admin/plans                    → daftar SEMUA paket (aktif+nonaktif), § Fase 10
POST/PUT/DELETE /admin/plans         → CRUD paket. § Fase 43 — body juga terima `trialEligible`
                                        (boolean, opsional — default false kalau tidak diisi)
GET  /admin/users                    → daftar user + role + subscription aktif, § Fase 10
POST /admin/users                    → provisioning user manual, body { name, email, planIds?, markAsPaid? }
                                        (§ Admin-Provisioned di atas, Fase 18)
GET  /admin/subscriptions?userId=    → riwayat subscription 1 user, § Fase 10
POST /admin/subscriptions            → assign plan manual ke user (tanpa payment), body WAJIB
                                        sertakan `endAt` (§ ADR-0016 — TIDAK dihitung otomatis
                                        dari plan.durationDays untuk jalur admin-provisioned)
PATCH /admin/subscriptions/:id       → ubah `endAt` subscription "active" yang sudah ada,
                                        tanpa bikin baris baru (§ Fase 11, ADR-0016)
```

## Referensi
- Rasional keputusan model dasar → `docs/decisions/adr-0008-model-langganan.md`
- Granularitas per sub-modul, katalog plan (Fase 14) → `docs/decisions/adr-0019-gating-per-sub-modul-dan-katalog-plan.md`
- Koneksi Accurate reusable lintas subscription (Fase 14) → `docs/decisions/adr-0020-accurate-connection-reusable-lintas-subscription.md`
- Sub-modul ke-6, Vendor Payable Account (Fase 28) → `docs/decisions/adr-0026-modul-akun-hutang-pemasok-terpisah.md`
- Expired manual admin-provisioned + edit endAt → `docs/decisions/adr-0016-admin-subscription-expired-manual.md`
- Timezone-aware date handling (fix bug endAt UTC-midnight, Fase 43/44) → `docs/decisions/adr-0028-timezone-aware-date-handling.md`
- Payment & orders → `docs/architecture/architecture-payment.md`
- RBAC & permission → `docs/architecture/architecture-auth.md`
- Job terjadwal → `docs/architecture/architecture-jobs.md`
- Daftar modul → `docs/glossary.md`
