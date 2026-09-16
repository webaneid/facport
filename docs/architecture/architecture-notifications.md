# Architecture — Notifications (Email + In-App)

> WhatsApp tidak dipakai di project ini (checklist Kebutuhan Komponen =
> Tidak) — section WhatsApp di bawah dihapus, cuma Email yang relevan.

> **Fase 45** — lonceng notifikasi di Topbar (dulu sengaja `disabled`
> sejak ADR-0024) sekarang jadi sistem in-app sungguhan. Lihat § "2.
> In-App Notifications" di bawah untuk skema, katalog tipe, dan rasional
> arsitektur (ADR-0029). Email untuk event yang SAMA (checkout, trial,
> dst) **BELUM dibangun** — dicatat eksplisit sebagai item pending di
> `docs/PROGRESS.md`, bukan terlupa.
>
> **Fase 132 (2026-09-17)** — 4 dari 12 tipe (`trial_ending_soon`,
> `subscription_ending_soon`, `trial_expired`, `subscription_expired`)
> SEKARANG dapat email juga, plus banner baru di dashboard/`/pilih-usaha`
> — lihat § "Reminder H-Sekian" dan § "Banner Expiry" di bawah. 8 tipe
> LAIN (checkout/pembayaran/dst) TETAP pending, sengaja di luar scope.

## Prinsip Umum
Semua notifikasi keluar (email, WA) **WAJIB lewat queue** (§
`architecture-jobs.md`), tidak pernah dikirim sinkron di request handler —
provider notifikasi bisa lambat/down, dan itu tidak boleh bikin request user
ikut lambat/gagal.

**✅ Email verifikasi akun JUGA lewat queue** (diperbaiki 2026-08-22,
sempat jadi pengecualian sinkron saat draf awal dokumen ini) —
`apps/api/src/lib/auth.ts`, callback `sendVerificationEmail` Better Auth,
sekarang `boss.send(JOBS.SEND_EMAIL, {...})`, bukan panggil `sendEmail()`
langsung. Konsekuensi: signup TIDAK ikut lambat/gagal kalau Resend lagi
lambat/down — worker yang proses pengiriman beneran di belakang layar.
`startQueue()` dipanggil eksplisit di titik enqueue ini juga (idempotent)
supaya test (`app.handle()` langsung, tidak boot `index.ts`) tetap bisa
enqueue tanpa error "Database not opened".

## 1. Email — Tool: Resend
**Kenapa Resend** (bukan SendGrid/Postmark/SMTP manual): DX modern (API
simpel, dashboard jelas), free tier cukup generous untuk skala awal, dan
tidak perlu maintain server SMTP sendiri (self-hosted mail server itu beban
ops besar — reputasi domain/deliverability susah dijaga sendiri, DKIM/SPF/DMARC
salah setup dikit langsung masuk spam).

**Kondisi SEKARANG (bukan target akhir)** — wrapper minimal, `{to, subject,
html}` langsung, TANPA sistem template:
```ts
// apps/api/src/lib/email.ts
import { Resend } from "resend";
import { env } from "./env";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  if (!resend) {
    // RESEND_API_KEY kosong = no-op + log (aman untuk dev lokal, § architecture-observability.md)
    return;
  }
  await resend.emails.send({ from: env.EMAIL_FROM ?? "noreply@localhost.test", to, subject, html });
}
```
Dipilih minimal karena belum ada fitur notifikasi konkret yang butuh
template nyata (baru dipakai untuk email verifikasi akun, HTML-nya
inline langsung di `auth.ts`).

### Template Email — TARGET, BELUM DIBANGUN
Folder `apps/api/src/emails/*.tsx` **BELUM ADA** di kode. Rencana kalau
nanti ada fitur yang butuh template nyata (mis. notifikasi hasil import
batch): pindah ke pola `sendEmail({ to, template, data })` +
`renderEmailTemplate()`, pakai React Email (`@react-email/components`) —
reusable component, bisa preview visual (`bunx react-email dev`), hasil
akhir tetap HTML biasa (kompatibel semua email client). **JANGAN
implementasikan struktur ini sampai template pertama benar-benar
dibutuhkan** — YAGNI, `email.ts` sekarang sudah cukup untuk kebutuhan
saat ini (cuma email verifikasi).

### Env
```
RESEND_API_KEY=
EMAIL_FROM=noreply@namadomain.com
```

## Idempotency & Retry (Email)
Email dikirim lewat job queue (§ `architecture-jobs.md`) yang otomatis
retry kalau gagal — WAJIB pastikan job **idempotent** (kirim ulang job yang
sama tidak boleh double-send ke user), pakai `idempotencyKey` unik per
notifikasi (mis. `"post-published:{postId}:{userId}"`) supaya `pg-boss` tidak
proses job yang sama 2x kalau ada retry/duplikat.

## 2. In-App Notifications — Fase 45

### Prinsip: Sinkron untuk 1 Penerima, Job untuk Broadcast
Notifikasi in-app = 1 INSERT ringan ke tabel `notifications`, BUKAN
"tugas berat" (§ `architecture-jobs.md`) — dibuat **SINKRON inline** di
titik kejadian (pola sama `audit_logs`, sudah tersebar di codebase ini),
**bukan lewat job queue**, KECUALI broadcast/pengumuman admin (fan-out ke
BANYAK penerima sekaligus) yang lewat `JOBS.SEND_ANNOUNCEMENT` — supaya
endpoint `POST /admin/announcements` tidak menunggu resolve target +
bulk-insert selesai.

### Skema Database
```ts
// apps/api/src/db/schema/notification.schema.ts
export const announcements = pgTable("announcements", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body").notNull(),
  target: varchar("target", { length: 20 }).notNull(), // "all_customers" | "specific_modules" | "specific_users"
  targetModules: jsonb("target_modules").$type<string[]>(),
  targetUserIds: jsonb("target_user_ids").$type<string[]>(), // audit/referensi — penerima ASLI di `notifications`
  recipientCount: integer("recipient_count").notNull().default(0), // diisi worker setelah fan-out
  createdBy: text("created_by").notNull().references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }), // penerima (customer MAUPUN admin/staff)
  type: varchar("type", { length: 50 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  body: text("body").notNull(),
  entityType: varchar("entity_type", { length: 50 }),
  entityId: uuid("entity_id"),
  sourceAnnouncementId: uuid("source_announcement_id").references(() => announcements.id),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```
**Fan-out (1 row per penerima), BUKAN shared-announcement + read-receipt
join** — rasional lengkap di `docs/decisions/adr-0029-notifikasi-fanout-per-penerima.md`.
Endpoint `notifications.route.ts` (`GET/PATCH/POST /me/notifications*`)
dipakai **SAMA PERSIS** untuk customer maupun admin/staff — dibedakan oleh
`userId` yang login, bukan endpoint/role terpisah.

### Katalog Tipe Notifikasi
Satu sumber kebenaran: `apps/api/src/lib/notifications.ts` `NOTIFICATION_TYPES`.

| Tipe | Trigger | Penerima | Link Frontend | Email? |
|---|---|---|---|---|
| `order_created` | Checkout sukses (`POST /subscriptions/checkout`) | Customer | `/billing` | ❌ pending |
| `payment_proof_submitted` | `PATCH /orders/:id/proof` (login MAUPUN publik) | Customer | `/billing` | ❌ pending |
| `payment_verified` | `POST /admin/orders/:id/confirm` | Customer | `/billing` | ❌ pending |
| `payment_rejected` | `POST /admin/orders/:id/reject` | Customer | `/billing` | ❌ pending |
| `trial_started` | `POST /subscriptions/trial` | Customer | `/subscribe` | ❌ pending |
| `trial_ending_soon` | Job `NOTIFY_EXPIRING_SOON`, H-3/H-1 | Customer | `/subscribe` | ✅ Fase 132 |
| `trial_expired` | Job `EXPIRE_SUBSCRIPTIONS`, `isTrial=true` | Customer | `/subscribe` | ✅ Fase 132 |
| `subscription_ending_soon` | Job `NOTIFY_EXPIRING_SOON`, H-7/H-3/H-1 | Customer | `/subscribe` | ✅ Fase 132 |
| `subscription_expired` | Job `EXPIRE_SUBSCRIPTIONS`, `isTrial=false` | Customer | `/subscribe` | ✅ Fase 132 |
| `accurate_connection_expired` | Job `REFRESH_ACCURATE_TOKEN` gagal, ATAU `openAccurateSession()` gagal saat import (⚠️ diperluas Fase 91 — dulu cuma job terjadwal) | Customer (pemilik koneksi, BUKAN admin — § ADR-0020) | `/accurate` | ❌ pending |
| `accurate_connection_disconnected_by_admin` | `POST /admin/subscriptions/:id/disconnect-accurate` (Fase 92) | Customer (pemilik koneksi) | `/accurate` | ❌ pending |
| `admin_payment_proof_submitted` | `PATCH /orders/:id/proof` | SEMUA user dengan permission `orders.manage` | `/admin/orders` | ❌ pending |
| `announcement` | Broadcast admin (`POST /admin/announcements`) | Sesuai target | Beda per surface | ❌ pending |

Link resolusi tipe→halaman: `apps/web/lib/notification-routes.ts`
(fungsi, bukan Record statis — beberapa tipe beda tujuan antara surface
app vs admin).

### Reminder H-Sekian — `JOBS.NOTIFY_EXPIRING_SOON`
Job harian TERPISAH dari `JOBS.EXPIRE_SUBSCRIPTIONS` (yang FLIP status,
bukan sekadar ingatkan). Threshold: subscription asli H-7/H-3/H-1, trial
H-3/H-1 (durasi lebih pendek). Logic murni (testable tanpa pg-boss) di
`apps/api/src/lib/subscription-reminders.ts` `findApplicableReminderThreshold()`
— kolom `subscriptions.lastReminderThresholdDays` cegah reminder dobel
tiap job jalan (nilai threshold TERKETAT terakhir yang sudah dikirim).

**§ Fase 132 (diminta user 2026-09-17)** — body notifikasi (bell DAN
email) sekarang SPESIFIK, bukan generik: sebut nama fitur (`moduleLabel()`,
resolve dari `plan.modules[0]`) + nama Data Usaha + tanggal exact berakhir
(`formatNotificationDate()`, § timezone company — bukan `daysLeft` doang).
Mis. *"Fitur Sales Invoice di Data Usaha PT Mitra Jaya akan berakhir 3
hari lagi (12 September 2026) — perpanjang sekarang supaya tidak
terputus."* Sama pola berlaku untuk `EXPIRE_SUBSCRIPTIONS` (notifikasi
"sudah berakhir", tanpa hitung mundur karena sudah lewat).

Email (4 tipe: `trial_ending_soon`/`subscription_ending_soon`/
`trial_expired`/`subscription_expired`) di-enqueue via `boss.send(JOBS.SEND_EMAIL,
{...})` PERSIS di titik yang sama, pola call-site IDENTIK
`lib/auth.ts`/`me.route.ts`/`team.route.ts` (HTML inline sederhana via
`escapeHtml(body)`, BUKAN React Email template — § "Kondisi SEKARANG"
di atas, belum ada alasan cukup kuat pindah pola). Metadata
(plan/Data Usaha/email user) di-batch-fetch HANYA untuk subscription yang
LOLOS filter threshold di run itu (bukan semua subscription aktif),
hindari over-fetch.

### Banner Expiry — Dashboard & `/pilih-usaha` (Fase 132)
Selain bell+email, ada 1 lapis lagi: banner PROAKTIF di 2 halaman yang
paling sering dibuka customer (dashboard = tempat kerja utama,
`/pilih-usaha` = gerbang SEBELUM masuk ke Data Usaha manapun). Berbeda
dari notifikasi bell (butuh diklik buka dropdown), banner ini LANGSUNG
terlihat begitu halaman dibuka.

- **Sumber data**: `GET /me/subscriptions` (endpoint EXISTING, BUKAN
  endpoint baru) — extend dengan `dataUsahaName` per baris (join
  `dataUsaha`, batch 1x). Dashboard reuse fetch yang SUDAH ada (scope 1
  Data Usaha aktif); `/pilih-usaha` tambah 1 fetch baru TANPA
  `dataUsahaId` (union SEMUA Data Usaha user, sama pola `subscribe-form.tsx`).
- **Komponen**: `apps/web/components/subscribe/expiring-soon-alert.tsx`
  (`ExpiringSoonAlert`) — shared, presentational murni. Filter
  `status === "active" && daysLeft ∈ [0,7]` (`EXPIRING_SOON_DAYS`
  hardcode terpisah dari `SUBSCRIPTION_REMINDER_THRESHOLDS` backend — 2
  app terpisah, nilainya SENGAJA disamakan konsepnya dengan threshold
  TERJAUH job biar banner "mulai muncul" konsisten hari yang sama dengan
  reminder bell/email pertama). Render `Alert` (`components/ui/alert.tsx`,
  `variant="warning"`) — daftar "Modul di Data Usaha X — berakhir
  tanggal Y", `null` (tidak render apa pun) kalau tidak ada yang expiring.
- **TIDAK dismissible** — banner ini tampil terus selama masih dalam
  window 7 hari (behavior SENGAJA beda dari notifikasi bell yang bisa
  ditandai "sudah dibaca") — reminder yang butuh action (perpanjang),
  bukan sekadar info sekali-lihat.

### Broadcast/Pengumuman Admin
Permission dedicated `notifications.broadcast` (seed, otomatis ikut role
"staff" via mekanisme EXCLUDE-list, § ADR-0027). Target:
- `all_customers` — semua user role "customer".
- `specific_modules` — customer dengan subscription AKTIF (real ATAU
  trial) yang meng-cover salah satu modul target.
- `specific_users` — daftar userId eksplisit (dipilih admin via
  Combobox multi-select, `admin/announcements/page.tsx`).

Resolve recipient + bulk-insert: `apps/api/src/lib/announcements.ts`
`resolveAnnouncementRecipients()` (worker `JOBS.SEND_ANNOUNCEMENT`).
**Known limitation**: job ini belum diberi `idempotencyKey` eksplisit —
retry pg-boss (kalau proses gagal DI TENGAH bulk-insert) berisiko
sebagian penerima dapat notifikasi 2x. Risiko rendah (butuh gagal
persis di tengah proses, admin trigger manual 1x per broadcast) —
diterima untuk sekarang, revisit kalau ada laporan nyata.

### Frontend
- `CompanyTimezoneProvider` (Fase 43/44 audit timezone) dipakai format
  tanggal SEMUA notifikasi — konsisten timezone perusahaan, BUKAN
  `.toLocaleDateString()` lokal (kelas bug yang sudah diperbaiki
  sebelumnya, § ADR-0028 — SEMUA teks notifikasi BACKEND yang menyebut
  tanggal juga WAJIB lewat `formatNotificationDate()`, bukan
  `.toLocaleDateString()` server, § `lib/notifications.ts`).
- `NotificationBell` (dropdown, poll unread-count tiap 30 detik) + arsip
  penuh (`app/notifications`, `admin/notifications`) — shared
  `NotificationList` component, pola sama `ImportBatchTable` (Fase 41).

## Referensi
- Semua notifikasi lewat queue (email) / broadcast (in-app) →
  `docs/architecture/architecture-jobs.md`
- Fan-out per-penerima vs shared+read-receipt → `docs/decisions/adr-0029-notifikasi-fanout-per-penerima.md`
- Detail eksekusi fase → `docs/phases/phase-45-sistem-notifikasi.md`
