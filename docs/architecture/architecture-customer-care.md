# Architecture — Customer Care (Profil CS + WhatsApp Rotator + Analitik)

> Fase 46. Widget floating di laman app pelanggan yang menampilkan profil
> Customer Care (foto, nama, posisi) dan menghubungkan ke WhatsApp lewat
> **rotasi otomatis** (adil antar-CS, berdasar jumlah klik hari ini),
> dibatasi **jam kerja** (timezone-aware, § ADR-0028), dengan analitik
> jumlah customer unik yang dilayani per periode.

## Skema Database
```ts
// apps/api/src/db/schema/customer-care.schema.ts
export const customerCareAgents = pgTable("customer_care_agents", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  position: varchar("position", { length: 100 }).notNull(),
  photoUrl: text("photo_url"), // URL publik bucket, pola sama company.logo (ADR-0017)
  whatsappNumber: varchar("whatsapp_number", { length: 20 }).notNull(), // "628xxx", TANPA "+"
  isActive: boolean("is_active").notNull().default(true), // arsip PERMANEN (CS resign)
  manuallyOfflineUntil: timestamp("manually_offline_until", { withTimezone: true }), // "off hari ini", NULL = normal
  createdAt/updatedAt,
});

export const customerCareClicks = pgTable("customer_care_clicks", {
  id: uuid("id").defaultRandom().primaryKey(),
  agentId: uuid("agent_id").notNull().references(() => customerCareAgents.id),
  userId: text("user_id").notNull().references(() => user.id), // customer yang klik
  clickedAt: timestamp("clicked_at", { withTimezone: true }).defaultNow().notNull(),
});
```
Jam kerja GLOBAL (1 jadwal untuk semua agent) di `settings` (group
`"customer_care"`): `customerCare.workStartMinutes`/`workEndMinutes`
(integer, menit dari tengah malam — BUKAN string "HH:MM"),
`customerCare.workDays` (array 0-6, 0=Minggu, default Senin-Sabtu).

## "Online" Dihitung, Bukan Disimpan
Tidak ada kolom `isOnline` — status online DIHITUNG tiap request dari
kombinasi (§ `apps/api/src/lib/customer-care.ts`):
```ts
function isAgentOnline(agent, now, timezone, schedule): boolean {
  if (!agent.isActive) return false; // arsip permanen
  if (agent.manuallyOfflineUntil && agent.manuallyOfflineUntil > now) return false; // off hari ini, belum lewat
  return isWithinWorkHours(now, timezone, schedule); // di luar jam kerja
}
```
**SEMUA pengecekan jam WAJIB pakai `getCompanyTimezone()`** (§
`lib/company-timezone.ts`, Fase 44/ADR-0028) — **TIDAK PERNAH**
`new Date().getHours()` server. Ini persis kelas bug yang sudah
diperbaiki 2x sebelumnya di project ini (endAt subscription, transDate
Accurate) — hampir terulang lagi di fase ini kalau tidak diperhatikan.

**"Off hari ini"** (`manuallyOfflineUntil`) diisi
`endOfTodayInTimezone(now, timezone)` (§ `company-timezone.ts`, fungsi
umum yang SAMA dipakai `lib/timezone.ts` versi frontend Fase 44) saat
admin toggle — **auto-online lagi besok TANPA job/cron**, tinggal
dibandingkan `> now()`.

## Rotasi WhatsApp
`pickNextAgent(onlineAgents, clickCountTodayByAgentId)` — pilih agent
ONLINE dengan klik PALING SEDIKIT **hari ini** (dihitung dari
`customerCareClicks` sejak `startOfTodayInTimezone`), tie-break stabil
by `id`. TIDAK ada state rotasi terpisah yang disimpan — dihitung ulang
tiap request dari log klik, sederhana dan self-healing (kalau ada
downtime, rotasi tetap benar begitu sistem jalan lagi).

**Alur klik** (`apps/api/src/routes/customer-care.route.ts`):
1. `GET /me/customer-care/next` — pure read, balikin agent yang
   SEHARUSNYA dipilih SEKARANG (nama/posisi/foto, **TANPA nomor WA
   mentah** — kurangi permukaan scraping nomor).
2. `POST /me/customer-care/click` (body `{agentId}`) — **re-validasi
   PENUH server-side** (agent itu masih online SEKARANG, bukan percaya
   `agentId` dari client — cegah customer pilih agent offline lewat
   DevTools), insert `customerCareClicks`, balikin `{waLink}`.

## Analitik
"Sudah melayani berapa orang" = `COUNT(DISTINCT userId)` dari
`customerCareClicks` dalam periode (today/week/month), **BUKAN** raw
click count — 1 customer klik 2x hari yang sama TETAP dihitung 1 orang.
Batas awal periode juga DIHITUNG di timezone perusahaan (`GET
/admin/customer-care/analytics?period=`).

## Upload Foto
Mirror PERSIS `admin/branding.route.ts` `POST /logo` (Fase 12,
ADR-0017): validasi via `sharp(buffer).metadata()`, resize
`256×256 cover` + webp quality 82, simpan ke bucket PUBLIK
(`PUBLIC_MEDIA_BUCKET`/`ensurePublicBucket()`, `lib/minio.ts`). SENGAJA
BUKAN Media Library modal — foto CS 1-per-agent, tidak butuh
reuse/cari lintas fitur.

## Frontend
- `CustomerCareWidget` (`components/customer-care/customer-care-widget.tsx`)
  — floating button bottom-right, dipasang di `app/app/(protected)/layout.tsx`
  (SEMUA halaman app, dikonfirmasi user via AskUserQuestion — bukan cuma
  dashboard). Fetch `/next` cuma saat popover DIBUKA (bukan tiap page
  load) — hindari request sia-sia kalau widget tidak pernah diklik.
- Admin `app/admin/(protected)/customer-care/page.tsx` — CRUD agent,
  dialog "Jam Kerja" (popup, BUKAN halaman settings penuh — sesuai
  permintaan user), tombol "Off Hari Ini"/"Aktifkan", `StatCard`
  analitik agregat + kolom per-agent di tabel.

## Permission
`customer_care.manage` (baru, seed) — RBAC dinamis (§ ADR-0027), staff
otomatis dapat lewat mekanisme EXCLUDE-list, BUKAN hardcode role admin.

## Known Limitations
- `POST /me/customer-care/click` tidak rate-limited/de-duplicated —
  customer yang klik berkali-kali (sengaja atau tidak sengaja, mis.
  refresh cepat) menambah RAW click count agent itu, sedikit
  mempengaruhi keadilan rotasi HARI ITU (analitik "customer unik"
  TIDAK terpengaruh, karena itu `COUNT DISTINCT`). Risiko rendah
  (butuh customer yang sengaja iseng, dampaknya cuma pergeseran
  rotasi sementara, bukan kebocoran data) — diterima untuk sekarang.

## Referensi
- Timezone-aware helpers → `docs/decisions/adr-0028-timezone-aware-date-handling.md`
- Detail eksekusi fase → `docs/phases/phase-46-customer-care.md`
