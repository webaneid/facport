# Architecture — Subscription & Plans (Model Langganan)

> Rasional keputusan → `docs/decisions/adr-0008-model-langganan.md`.
> File ini pelengkap teknis (skema, flow, gating akses modul).

## Skema Database

```ts
// apps/api/src/db/schema.ts
export const plans = pgTable("plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(), // "Starter", "Pro", "Semua Modul", dst
  // § Fase 10, ADR-0015 — NULLABLE (dulu notNull). Facport SEMENTARA
  // tanpa harga (supporting app, bukan produk mandiri) — kolom TETAP
  // ada (reversibel), form admin TIDAK punya field ini sama sekali
  // selama ADR-0015 berlaku.
  price: integer("price"), // Rupiah, integer (hindari float untuk uang)
  durationDays: integer("duration_days").notNull(), // 30 = bulanan, 365 = tahunan, dst
  modules: jsonb("modules").notNull(), // string[] — subset dari daftar modul di docs/glossary.md, mis. ["penjualan", "pembelian"]
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
  // § Fase 10 — override retensi data import PER PELANGGAN (nullable,
  // NULL = pakai default admin). Kolomnya sudah ada dari Fase 10, TAPI
  // endpoint buat customer isi field ini sendiri SENGAJA belum dibangun
  // (ditunda ke fase customer-settings terpisah) — lihat § "Retensi Data
  // Import" di bawah.
  importRetentionDaysOverride: integer("import_retention_days_override"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

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

> **1 subscription = 1 akun Accurate Online** (lihat
> `docs/decisions/adr-0009-detail-oauth-accurate.md`) — `accurate_connections`
> berelasi 1:1 ke `subscriptions`, BUKAN ke `users` langsung. User yang
> kelola beberapa company Accurate butuh subscription terpisah per company.

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
export const requireModuleAccess = (moduleKey: string) =>
  new Elysia().derive(async ({ user }) => {
    const sub = await getActiveSubscription(user.id);
    if (!sub || sub.status !== "active") {
      throw new Error("SUBSCRIPTION_INACTIVE");
    }
    const plan = await getPlan(sub.planId);
    if (!plan.modules.includes(moduleKey)) {
      throw new Error("MODULE_NOT_IN_PLAN");
    }
    return { subscription: sub };
  });

// Pemakaian di route import (Fase 01 dst):
app.group("/import/sales", (app) =>
  app
    .use(requirePermission("import.create"))
    .use(requireModuleAccess("penjualan"))
    .post("/", uploadHandler)
);
```
**Kedua guard WAJIB lolos** — permission check dulu (role secara umum boleh
akses fitur import), baru subscription gate (paket spesifiknya cover modul
ini atau tidak).

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
GET  /plans                          → daftar paket aktif (publik, untuk landing page pricing)
POST /subscriptions/checkout         → body: { planId } — buat order + return payment URL
GET  /me/subscription                → status langganan user saat ini
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
