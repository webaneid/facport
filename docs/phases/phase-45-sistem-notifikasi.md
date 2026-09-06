# Fase 45 — Sistem Notifikasi (In-App) + Pengumuman Admin

**Status:** Done
**Mulai:** 2026-09-06
**Selesai:** 2026-09-06

## Tujuan
Lonceng notifikasi di `Topbar` sudah ada sejak ADR-0024 tapi sengaja
`disabled` (UI-only scaffold, belum ada sistem di baliknya). User minta
diaktifkan jadi sistem notifikasi sungguhan — fokus utama alur subscribe
(checkout → bukti transfer dikirim → terverifikasi) dan alur trial (mulai
→ mendekati habis → expired), plus notifikasi admin (customer kirim bukti
transfer). Sekalian dibangun fitur pengumuman/broadcast dari admin
(dikonfirmasi masuk fase ini, bukan ditunda).

Rencana lengkap (riset, skema, katalog tipe notifikasi, 4-batch eksekusi)
ada di plan file Plan Mode sesi ini — diringkas ke sini poin pentingnya.

## Scope

### Batch A — Fondasi: Schema + Endpoint + Bell + Arsip
- [x] Migration: `notifications`, `announcements`,
      `subscriptions.lastReminderThresholdDays`
- [x] `lib/notifications.ts` (`createNotification`, `createNotificationsBulk`)
- [x] `lib/permission.ts` — `getUserIdsWithPermission()` (reverse lookup)
- [x] `routes/notifications.route.ts` (list, unread-count, mark-read, read-all)
- [x] `NotificationBell` + `NotificationList` + halaman arsip (app+admin)
- [x] `lib/notification-routes.ts` (type → link lookup)

### Batch B — Wiring Trigger Alur Subscribe
- [x] checkout, proof (customer+admin), confirm, reject, trial start

### Batch C — Reminder & Operational Alert
- [x] Job `NOTIFY_EXPIRING_SOON` (trial + subscription asli)
- [x] `EXPIRE_SUBSCRIPTIONS` — notifikasi expired
- [x] `REFRESH_ACCURATE_TOKEN` — notifikasi ke customer pemilik koneksi

### Batch D — Broadcast/Pengumuman Admin
- [x] Permission `notifications.broadcast` (seed)
- [x] `admin/announcements.route.ts` + job `SEND_ANNOUNCEMENT`
- [x] Halaman admin "Pengumuman" (list + buat baru) + nav sidebar

## Referensi
- Plan mode file (riset lengkap, skema, katalog tipe): `/Users/webane/.claude/plans/sorted-inventing-volcano.md`
- ADR: `docs/decisions/adr-0029-notifikasi-fanout-per-penerima.md`
- Architecture doc: `docs/architecture/architecture-notifications.md` § "2. In-App Notifications"

## Keputusan Kecil Selama Eksekusi
- Notifikasi = 1 INSERT ringan → dibuat SINKRON inline di handler (pola
  sama `audit_logs`), BUKAN lewat job queue — kecuali broadcast (fan-out
  ke banyak user, lewat `JOBS.SEND_ANNOUNCEMENT`).
- Skema fan-out (1 row per penerima) dipilih atas shared-announcement +
  read-receipt join — lihat ADR-0029 untuk rasional lengkap.
- Email untuk event yang sama TIDAK dibangun fase ini — dicatat eksplisit
  sebagai item terpisah "Belum Dimulai" di `docs/PROGRESS.md`, sesuai
  permintaan eksplisit user (jangan sampai hilang dari radar).
- Semua teks notifikasi backend yang menyebut tanggal WAJIB pakai
  `formatNotificationDate()` (§ `lib/notifications.ts`, baca
  `company.timezone`), BUKAN `.toLocaleDateString()` — ketemu sendiri
  saat nulis notifikasi `trial_started`, diperbaiki SEBELUM sempat
  masuk kode (bukan post-hoc fix) — persis kelas bug yang diperbaiki
  Fase 44/ADR-0028, hampir terulang di fase ini kalau tidak diperhatikan.
- Logic reminder threshold (`findApplicableReminderThreshold`) dan
  resolve recipient broadcast (`resolveAnnouncementRecipients`)
  diekstrak jadi fungsi murni/near-murni testable, BUKAN inline di
  worker — pola sama `checkTrialRowBudget` (Fase 43), supaya business
  logic penting tetap ter-unit-test walau worker job sendiri tidak
  ada precedent ditest langsung di codebase ini.
- `saveProofAndMarkSubmitted` (shared antara `orders.route.ts` login dan
  `public/orders.route.ts` tanpa login) jadi SATU-SATUNYA titik
  notifikasi "bukti transfer terkirim" — kedua jalur otomatis konsisten,
  tidak drift.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`, api+web) — 0 error
- [x] Security review dijalankan (inline) — 0 temuan Critical/High
- [x] Temuan Critical/High sudah diperbaiki — tidak ada
- [x] Temuan Medium/Low dicatat — 2 temuan Low, § Known Limitations
- [x] `docs/PROGRESS.md` diupdate (+ item pending "Email notifikasi")

## Known Limitations
- **Broadcast fan-out belum idempotent** — `JOBS.SEND_ANNOUNCEMENT`
  belum diberi `idempotencyKey` eksplisit. Kalau job gagal DI TENGAH
  proses (jarang, butuh crash tepat di antara bulk-insert dan update
  `recipientCount`) dan pg-boss retry, sebagian penerima BISA dapat
  notifikasi broadcast 2x. Risiko rendah (admin trigger manual 1x per
  broadcast, bukan proses berulang) — diterima untuk sekarang.
- **`targetUserIds` broadcast tidak divalidasi ada/tidaknya user itu**
  sebelum di-enqueue — kalau admin somehow kirim userId yang tidak
  valid (seharusnya tidak mungkin lewat UI resmi, Combobox cuma
  menampilkan hasil pencarian nyata), job fan-out akan gagal di FK
  constraint `notifications.userId` — gagal ke seluruh job (termasuk
  penerima lain yang valid), bukan skip-per-row. Risiko rendah (UI
  resmi tidak memungkinkan input sembarang ID), tidak ada celah
  keamanan (bukan bisa dieksploitasi user luar, endpoint sudah
  permission-gated `notifications.broadcast`).
- **Email untuk event yang sama (checkout, trial, dst) BELUM dibangun**
  — eksplisit diminta user untuk TETAP tercatat, § `docs/PROGRESS.md`
  baris "Belum Dimulai: Email notifikasi (menyusul in-app)".
- Verifikasi visual browser TIDAK dilakukan (ekstensi Chrome tidak
  disambungkan sesi ini) — diverifikasi lewat typecheck penuh (api+web),
  lint 0 error, test suite penuh.

## Ringkasan Hasil
Sistem notifikasi in-app penuh: 12 tipe notifikasi (10 customer + 1
admin + 1 broadcast) mencakup SELURUH alur subscribe (checkout → bukti
transfer → verifikasi/tolak) dan trial (mulai → reminder H-3/H-1 →
expired), plus 2 operational alert yang ketemu lewat screening
(subscription asli reminder H-7/H-3/H-1, dan koneksi Accurate terputus
— sebelumnya customer TIDAK PERNAH tahu koneksinya putus sampai coba
import gagal). Lonceng di Topbar (dulu `disabled`) sekarang fungsional
penuh: badge unread (poll 30 detik), dropdown 7 terbaru, arsip penuh
per-surface (`/notifications`, `/admin/notifications`), pola shared
component sama `ImportBatchTable` (Fase 41).

Sekalian dibangun fitur broadcast/pengumuman admin: 3 mode target (semua
customer / modul tertentu / user tertentu), UI `/admin/announcements`
dengan Combobox multi-select user (reuse pola `CreateInvoiceDialog`,
Fase 26), fan-out lewat job `SEND_ANNOUNCEMENT` (bukan sinkron — bisa
banyak baris kalau target semua customer).

Skema fan-out (1 row `notifications` per penerima, BUKAN shared+
read-receipt join) didokumentasikan di ADR-0029 — pilihan disengaja
demi kesederhanaan query ("1 SELECT, tanpa UNION lintas sumber"),
konsisten filosofi project ini.

Email untuk event yang sama TIDAK dibangun fase ini (dikonfirmasi user)
— dicatat eksplisit sebagai item pending terpisah, bukan hilang dari
radar.

Typecheck 0 error (api+web). Test suite `apps/api` **317 pass / 0 fail**
(18 baru: `lib/notifications.test.ts`, `routes/notifications.route.test.ts`,
`lib/subscription-reminders.test.ts`, `lib/announcements.test.ts`,
`routes/admin/announcements.route.test.ts`, plus assertion tambahan di
`subscriptions.route.test.ts`/`orders.route.test.ts`/`admin/orders.route.test.ts`
existing). `apps/web` 15 pass/0 fail (tidak ada test baru di sisi web —
komponen UI baru, bukan pure-logic). Lint 0 error. Security review
inline: 0 temuan Critical/High, 2 temuan Low (§ Known Limitations di
atas, diterima).
