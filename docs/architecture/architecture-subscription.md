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
  // banyak modul.
  modules: jsonb("modules").notNull(), // string[], konvensi: 1 elemen
  isActive: boolean("is_active").notNull().default(true), // paket yang di-nonaktifkan tidak hilang dari histori subscriber lama
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

## Cart Multi-Modul & 1 Subscription = 1 Sub-Modul (Fase 14, ADR-0019)
Sejak Fase 14, **1 `subscriptions` row = 1 SUB-MODUL** (Sales Invoice,
Purchase Invoice, Sales Receipt, Purchase Payment, atau Journal Voucher),
BUKAN lagi 1 bundel berisi banyak modul. Customer BOLEH checkout/dibuatkan
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
Admin (admin.facport.com) buat user baru manual (isi nama, email, pilih plan)
      ↓
User langsung berstatus verified (admin bertanggung jawab validitas data —
dicatat di audit_logs siapa admin yang membuat, § architecture-security.md §11)
      ↓
Admin pilih: kirim email undangan set-password KE user, ATAU set password
sementara langsung (dicatat mana yang dipilih, WAJIB paksa ganti password
di login pertama kalau opsi kedua)
      ↓
Admin pilih plan + input TANGGAL EXPIRED (endAt) secara manual — BUKAN
otomatis dihitung dari plan.durationDays seperti jalur self-service (§
ADR-0016). Alasan: kasus admin-provisioned justru sering butuh tanggal
custom (kontrak korporat berakhir sesuai PO, bukan kelipatan durationDays).
      ↓
subscriptions dibuat LANGSUNG berstatus "active" (orderId = null, tidak
lewat payment gateway — dianggap sudah dibayar di luar sistem, mis. invoice
manual/kontrak korporat)
```
Untuk perpanjang/perpendek `endAt` subscription admin-provisioned yang
SUDAH aktif (tanpa bikin baris subscription baru) → `PATCH
/admin/subscriptions/:id`, § "API (Ringkas)" di bawah dan ADR-0016.

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
    .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")));
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
POST /subscriptions/checkout         → body: { planId } — buat order + return payment URL
                                        (Fase 16 rework ke cart: { planIds: uuid[] }, lihat Fase 16 doc)
GET  /me/subscriptions               → § Fase 14 — SEMUA subscription aktif user (PLURAL, ganti
                                        GET /me/subscription singular) — dipakai sidebar/dashboard
                                        buat tahu union modul yang dia langganan
# Admin only:
GET  /admin/plans                    → daftar SEMUA paket (aktif+nonaktif), § Fase 10
POST/PUT/DELETE /admin/plans         → CRUD paket
GET  /admin/users                    → daftar user + role + subscription aktif, § Fase 10
POST /admin/users                    → provisioning user manual (§ Admin-Provisioned di atas)
GET  /admin/subscriptions?userId=    → riwayat subscription 1 user, § Fase 10
POST /admin/subscriptions            → assign plan manual ke user (tanpa payment), body WAJIB
                                        sertakan `endAt` (§ ADR-0016 — TIDAK dihitung otomatis
                                        dari plan.durationDays untuk jalur admin-provisioned)
PATCH /admin/subscriptions/:id       → ubah `endAt` subscription "active" yang sudah ada,
                                        tanpa bikin baris baru (§ Fase 11, ADR-0016)
```

## Referensi
- Rasional keputusan → `docs/decisions/adr-0008-model-langganan.md`
- Expired manual admin-provisioned + edit endAt → `docs/decisions/adr-0016-admin-subscription-expired-manual.md`
- Payment & orders → `docs/architecture/architecture-payment.md`
- RBAC & permission → `docs/architecture/architecture-auth.md`
- Job terjadwal → `docs/architecture/architecture-jobs.md`
- Daftar modul → `docs/glossary.md`
