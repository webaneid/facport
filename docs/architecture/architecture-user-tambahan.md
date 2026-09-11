# Architecture — User Tambahan (Seat), Multi-Instance Modul, & Batas Device

> **STATUS: DIUSULKAN — BELUM DIIMPLEMENTASIKAN.** Dokumen ini adalah hasil
> riset arsitektur mendalam (2026-09-11) untuk 3 kemampuan baru yang diminta
> client, TAPI user (pemilik project) secara eksplisit memilih untuk
> **mengevaluasi dulu sebelum eksekusi** — "ini akan bertabrakan banyak hal."
> JANGAN mulai implementasi fase mana pun di dokumen ini tanpa konfirmasi
> ulang eksplisit dari user. Riset & keputusan desain di bawah tetap valid
> sebagai referensi kalau/ketika fitur ini dilanjutkan.
>
> Memenuhi catatan yang sudah lama menunggu di
> `docs/decisions/adr-0008-model-langganan.md`: *"Per-seat pricing... belum
> dibutuhkan di scope awal... TIDAK diimplementasikan sekarang (kalau nanti
> dibutuhkan, ADR baru)."* — dokumen ini adalah cikal-bakal ADR itu.

## Latar Belakang & Kebutuhan Bisnis

Facport saat ini: 1 user = login bebas dari device mana pun, tanpa batas
sesi bersamaan, 1 user = maksimal 1 langganan aktif per modul. Client
(lewat pemilik project) minta 3 kemampuan sekaligus, yang ternyata SALING
BERKAITAN erat (bukan 3 fitur independen):

1. **Batasi jumlah device/sesi login bersamaan per user** — default 1,
   admin bisa naikkan ke 2/3/dst secara global. Login di device baru
   melebihi batas = otomatis logout device yang paling lama tidak aktif.
2. **User tambahan (seat) yang menumpang langganan user utama** — user
   utama beli slot user tambahan (harga terpisah dari modul, bulanan/
   tahunan), undang orang lain lewat email, orang itu login dengan akun
   sendiri (password ATAU Google) tanpa perlu subscribe modul sendiri —
   tapi HANYA modul/instance spesifik yang di-grant oleh user utama
   (granular, bukan otomatis semua modul aktif).
3. **Satu user bisa punya lebih dari 1 langganan aktif untuk modul yang
   SAMA** — mis. "Purchase Invoice" x2, masing-masing terhubung ke Data
   Usaha Accurate yang berbeda (2 perusahaan berbeda dikelola dari 1
   akun Facport). Kebutuhan ini MUNCUL dari poin 2: akses granular per
   user tambahan cuma masuk akal kalau ada lebih dari 1 instance untuk
   digranulasi ("user tambahan A boleh akses Purchase Invoice milik PT
   Maju, TIDAK boleh akses milik PT Sejahtera").

**Kenapa ini besar, bukan 3 fitur kecil**: poin 3 mengubah invariant inti
yang sudah lama dipegang sistem sejak Fase 01 ("1 modul aktif = 1
subscription per user") dan menyentuh alur konfirmasi pembayaran yang
sudah production-proven (fix bug nyata 2026-09-07). Poin 2 sepenuhnya
baru — tidak ada fondasi "team/organization/seat/member" apa pun di kode
saat ini (dicek eksplisit lewat riset, greenfield total).

## Ringkasan Riset (fakta kunci yang membentuk desain)

### Batas device/sesi
- **Tidak ada plugin bawaan Better Auth untuk "batasi N sesi per user."**
  Plugin `multi-session` bawaan Better Auth itu untuk hal BEDA (ganti-ganti
  akun dalam 1 browser, account-switcher ala Google) — bukan pembatasan
  device per akun. Harus custom lewat `databaseHooks.session.create.before`
  (`apps/api/src/lib/auth.ts`).
- **Dikonfirmasi ADA** di versi Better Auth terpasang (`@better-auth/core@1.7.1`
  — diverifikasi langsung ke file `.d.mts` instalasi,
  `node_modules/.bun/@better-auth+core@1.7.1+.../dist/types/init-options.d.mts`
  baris 1280-1293), MESKIPUN ada komentar di `apps/api/src/app.ts`
  (~baris 103-111) yang salah mengklaim hook ini "tidak ada di versi ini."
- **Bonus temuan (bug keamanan nyata, bukan hipotetis)**: karena
  kesalahpahaman itu, guard akun `disabled` SAAT INI cuma jalan untuk
  login password (`app.ts` intercept manual di route
  `POST /api/auth/sign-in/email`) — **TIDAK jalan untuk login Google**.
  Akun yang dinonaktifkan admin masih bisa dapat sesi via Google OAuth
  hari ini. Ini WAJIB diperbaiki begitu fitur batas-device dikerjakan
  (pakai hook yang sama, retire guard manual yang cuma cover 1 jalur).
- Tabel `session` (`apps/api/src/db/schema/auth.schema.ts`) tidak punya
  kolom identitas device asli (cuma `ipAddress`/`userAgent`) — "device"
  realistisnya = "sesi login," bukan fingerprint perangkat fisik. 2
  browser berbeda di 1 komputer yang sama = 2 "device" di mata sistem.
  **Diterima sebagai batasan yang wajar** (keputusan user, sama seperti
  kebanyakan SaaS — mis. Netflix).
- `cookieCache` (`auth.ts`, `maxAge: 300`) berarti device yang di-evict
  tetap bisa akses sampai 5 menit lewat cache, sebelum request
  berikutnya kena cek ulang ke DB — known limitation, bukan bug.

### Multi-instance modul
- **Titik penegakan "1 modul = 1 subscription" yang SEBENARNYA bukan di
  guard checkout** (`subscriptions.route.ts` `DUPLICATE_MODULE_IN_CART`/
  `MODULE_ALREADY_SUBSCRIBED`), **tapi di `admin/orders.route.ts`
  `POST /:id/confirm`** (~baris 120-149) — kode ini UNCONDITIONALLY
  membatalkan (cancel) subscription aktif LAIN yang modulnya sama,
  setiap kali order baru dikonfirmasi. Sengaja ditulis 2026-09-07 untuk
  fix bug production nyata (trial+asli sama-sama "active" bersamaan,
  status UI jadi ambigu tergantung urutan array). Kalau cuma guard
  checkout yang dilonggarkan tanpa menyentuh logic ini, instance ke-2
  akan langsung membatalkan instance ke-1 saat admin konfirmasi bayar —
  fitur multi-instance gagal total secara DIAM-DIAM (tanpa error), yang
  paling berbahaya dari semua temuan riset ini.
- 3 struktur data `Record<moduleKey, X>` di frontend akan rusak begitu 1
  modul bisa >1 subscription aktif (data instance ke-2 menimpa/hilang
  diam-diam, bukan error jelas): `apps/web/app/app/(protected)/layout.tsx`
  `modulePlanNames`, `apps/web/app/app/(protected)/subscribe/page.tsx`
  `activeModuleMap`, dan sidebar nav (`components/app-shell/sidebar.tsx`)
  yang statis 1-entry-per-moduleKey.
- **Lapisan Accurate/koneksi SUDAH siap multi-instance, TIDAK perlu
  diubah**: `accurate_connections` (`apps/api/src/db/schema/accurate.schema.ts`)
  sudah di-scope ke `userId` TANPA unique constraint (bisa banyak
  koneksi per user — desain ADR-0020 "connection reusable lintas
  subscription"), OAuth connect (`apps/api/src/routes/accurate.route.ts`)
  sudah di-scope per-`subscriptionId` (bukan per-user, `state` OAuth
  terikat `subscriptionId`), dan halaman `/accurate` SUDAH render 1
  baris per subscription (bukan per modul) — sudah 100% kompatibel.

### User tambahan (seat)
- **Tidak ada fondasi "team/organization/seat/member" apa pun** di
  kode/skema (dicek eksplisit via grep menyeluruh, greenfield total).
  Better Auth punya plugin `organization` bawaan (tidak dipakai project
  ini) — org/member/invitation/team tables + alur invite siap pakai —
  tapi didesain untuk multi-tenant umum, bukan spesifik "user utama +
  user gratis menumpang." **Keputusan: bangun tabel custom minimal**,
  bukan pakai plugin itu, supaya nyambung persis ke model "grant akses
  per subscription instance spesifik" (lihat § Keputusan Desain #1).
- Pola provisioning admin (`admin/staff.route.ts`, `admin/users.route.ts`)
  + mekanisme job email (pg-boss `JOBS.SEND_EMAIL`, sudah ada, dipakai
  verifikasi email & reset password Better Auth) adalah template
  siap-pakai untuk alur invite: `auth.api.signUpEmail()` server-side,
  paksa `emailVerified=true`, assign role via `userRoles`, email lewat
  job queue — semua polanya sudah ada, tinggal direplikasi untuk invite
  user tambahan.
- RBAC (`apps/api/src/lib/permission.ts`) flat, cek `userRoles`→
  `rolePermissions`→`permissions` — akun user tambahan WAJIB tetap dapat
  role `customer` (bukan "sebagai pengganti" mekanisme grant, tapi
  "selain itu") supaya semua permission check yang sudah ada tetap jalan.

## Keputusan Desain

| # | Keputusan | Pilihan Final & Alasan |
|---|---|---|
| 1 | Fondasi hubungan user utama ↔ user tambahan | **Tabel custom minimal baru**, bukan plugin Organization Better Auth — supaya nyambung persis ke grant per-subscription-instance (poin 4), tanpa bawa kompleksitas multi-tenant umum yang tidak dibutuhkan. |
| 2 | Definisi "device" | **Sesi login**, bukan fingerprint perangkat fisik. Diterima sebagai batasan wajar. |
| 3 | Cara beli user tambahan | **Input jumlah sekaligus (quantity) di UI** — TAPI di backend diimplementasikan sebagai N baris terpisah (pola "1 row = 1 unit" yang SUDAH dipakai semua invoice/subscription saat ini), BUKAN kolom `quantity` baru di skema. Tiap seat butuh row/id sendiri sebagai target FK (supaya bisa di-revoke satu per satu) — kolom quantity di level plan/invoice tidak menghilangkan kebutuhan "expand jadi N row," cuma memindah kerjanya ke tempat lebih rawan (downstream). Keterbacaan invoice/PDF ("5x Tambahan User @ Rp20.000") diselesaikan di RENDER TIME (kelompokkan baris identik saat tampil), bukan di skema. |
| 4 | Cakupan akses user tambahan | **Granular per subscription instance** — user utama pilih persis subscription MANA (bukan cuma "modul mana") yang boleh diakses tiap user tambahan. |
| 5 | Alur "beli modul yang sama lagi" — perpanjang vs instance baru | **Restrukturisasi UI, TIDAK PERNAH menebak dari kesamaan plan** (menghindari pola bug 2026-09-07 terulang). Tiap modul di halaman Subscribe menampilkan: (a) kartu untuk TIAP subscription aktif yang sudah ada, masing-masing dengan tombol **"Perpanjang/Ganti Paket"** sendiri (update baris subscription YANG SAMA di tempat — `endAt`/`planId` diganti, `id` TETAP SAMA, supaya koneksi Accurate & grant user tambahan yang sudah ada tidak putus), DAN (b) tombol terpisah **"+ Tambah Langganan Baru"** di katalog yang SELALU membuat instance baru. Dua aksi ini selalu tersedia terpisah secara visual — user tidak pernah ditanya/menebak. |

## Skema Database (diusulkan)

### Batas device — tidak ada tabel baru
1 setting baru di tabel `settings` yang sudah ada:
`security.maxDevicesPerUser` (group `"security"`, integer, default 1,
validasi range 1–10, pola sama persis `IMPORT_RETENTION_SETTING_KEY`
yang sudah ada di `settings.route.ts`).

### Multi-instance modul — tidak ada tabel baru
`subscriptions` tidak berubah strukturnya — "perpanjang di tempat" cukup
`UPDATE subscriptions SET planId=?, endAt=? WHERE id=?`. Perubahan murni
di LOGIC (`admin/orders.route.ts` confirm), bukan skema.

### User tambahan (seat) — 2 tabel baru + 1 kolom baru
```ts
// plans — tambah 1 kolom, default aman untuk row lama
kind: varchar("kind", { length: 20 }).notNull().default("module"),
// "module" | "seat_addon" — migrasi: semua row lama otomatis "module",
// tidak ada perubahan perilaku untuk plan yang sudah ada.

// member_seats — 1 row = 1 slot user tambahan yang sudah dibeli
export const memberSeats = pgTable("member_seats", {
  id: uuid("id").defaultRandom().primaryKey(),
  primaryUserId: text("primary_user_id").notNull().references(() => user.id),
  // user utama, pemilik & pembayar
  seatSubscriptionId: uuid("seat_subscription_id").notNull().unique()
    .references(() => subscriptions.id),
  // 1:1 dgn 1 subscription "seat_addon" yang sudah aktif — expiry/lifecycle
  // slot ini otomatis ikut expiry subscription ini, TIDAK perlu job
  // cleanup terpisah.
  memberUserId: text("member_user_id").references(() => user.id),
  // diisi setelah invite di-accept. SENGAJA TIDAK unique — 1 orang boleh
  // jadi user tambahan di BANYAK user utama berbeda (skenario nyata:
  // akuntan yang pegang beberapa klien berbeda).
  invitedEmail: varchar("invited_email", { length: 255 }),
  inviteTokenHash: text("invite_token_hash"),
  inviteTokenExpiresAt: timestamp("invite_token_expires_at", { withTimezone: true }),
  status: varchar("status", { length: 20 }).notNull().default("available"),
  // available | invited | active | revoked
  invitedAt: timestamp("invited_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedBy: text("revoked_by").references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// member_module_grants — subscription SPESIFIK mana yang di-grant ke slot mana
export const memberModuleGrants = pgTable("member_module_grants", {
  id: uuid("id").defaultRandom().primaryKey(),
  memberSeatId: uuid("member_seat_id").notNull().references(() => memberSeats.id),
  subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [unique().on(t.memberSeatId, t.subscriptionId)]);
```

## Rencana Fase (kalau/ketika dilanjutkan — urutan wajib)

### Fase A — Batasi Device/Sesi per User (independen, bisa duluan)
- Setting `security.maxDevicesPerUser` + kartu "Keamanan" di Admin Settings.
- `databaseHooks.session.create.before` di `auth.ts`: hitung sesi aktif
  user, evict yang paling lama kalau sudah di batas; SEKALIGUS cek
  `user.disabled` di sini (perbaiki gap Google-login, retire guard
  manual di `app.ts`).
- Known limitation yang didokumentasikan (bukan dikerjakan): evicted
  device tetap jalan ≤5 menit karena `cookieCache`; tidak ada halaman
  "device saya" self-service di v1 (pola scope-cut yang sama seperti
  Fase 22 sebelumnya).
- Hal yang WAJIB divalidasi di awal eksekusi: konfirmasi langsung hook
  ini benar-benar terpanggil di runtime (bukan cuma ada di type
  declaration) — quick spike sebelum commit ke pendekatan ini.

### Fase B1 — Backend: Multi-Instance Subscription per Modul
- Longgarkan `DUPLICATE_MODULE_IN_CART`/`MODULE_ALREADY_SUBSCRIBED`.
- **Persempit** logic cancel-otomatis di `admin/orders.route.ts` confirm
  — HANYA supersede trial, TIDAK LAGI supersede subscription asli lain
  di modul yang sama.
- Endpoint baru "Perpanjang/Ganti Paket" — UPDATE row yang SAMA (`id`
  tidak berubah), terpisah dari jalur checkout beli-baru.
- `subscription-gate.ts` `moduleAccess`: tambah disambiguasi
  `subscriptionId` untuk route yang butuh pilih instance mana.
  `getActiveSubscriptionsWithPlans` TIDAK berubah (tetap primary-only).

### Fase B2 — Frontend: UI Multi-Instance
- `layout.tsx`: reshape `subscriptionModules`/`modulePlanNames` jadi
  array `{subscriptionId, moduleKey, label}` (label pakai
  `accurateDbAlias` kalau sudah connect).
- Sidebar nav dinamis per subscription aktif.
- `subscribe/page.tsx`: kartu per-instance-aktif ("Perpanjang/Ganti
  Paket") + katalog "+ Tambah Langganan Baru" terpisah (Keputusan #5).
- 7 import page: terima/pakai `subscriptionId` eksplisit.

### Fase C — User Tambahan (Seat) + Invite + Akses Granular
*Bergantung PENUH pada B1+B2 — grant per-instance tidak masuk akal
tanpa multi-instance jalan end-to-end.*
- Migrasi skema (`plans.kind`, `member_seats`, `member_module_grants`).
- Field `kind` di form admin Paket. Checkout beli N seat = N `planId`
  sama diulang di array `planIds` (quantity UI meng-generate ini).
- Aktivasi seat_addon subscription → auto-create `member_seats` row
  `available` (hook di titik subscription lain jadi aktif).
- Endpoint customer-facing baru (kemungkinan `routes/team.route.ts`):
  `GET /me/team`, `POST /me/team/invite`, `.../resend`, `.../revoke`
  (WAJIB juga evict sesi aktif user tambahan — reuse primitive Fase A),
  `PUT /me/team/:seatId/grants`.
- Endpoint publik `GET/POST /invites/:token` (tanpa auth): validasi
  hash+expiry, buat akun (`auth.api.signUpEmail()`), **WAJIB** assign
  role `customer` juga (bukan gantinya), link `memberUserId`, status
  → `active`. Google-login: cek `member_seats` pending dgn
  `invitedEmail` cocok di `databaseHooks.user.create.after` cabang OAuth.
- Cek `apps/api/src/lib/rate-limit.ts` — terapkan pola sama ke
  `/invites/:token` (endpoint publik sensitif).
- `subscription-gate.ts` rewrite jadi **UNION** (bukan if/else): fetch
  subscription primary-owned DAN grant-derived (join flat, bukan loop
  per-grant), gabungkan sebelum matching. 1 akun BISA jadi primary
  sekaligus user tambahan di tempat lain — tidak boleh eksklusif.
- Guard defensif tambahan: checkout, trial, `/accurate/connect`,
  `/accurate/reuse` — tolak (403) eksplisit kalau pemanggil punya
  `member_seats` aktif (user tambahan tidak pernah masuk alur
  billing/koneksi Accurate).
- Invoice/PDF: kelompokkan baris item identik jadi 1 baris tampilan
  ("5x Tambahan User @ Rp20.000 = Rp100.000") — render-time saja, data
  mentah tetap N baris.
- UI: halaman "Kelola Tim" (list seat, invite form, checkbox grant per
  subscription, tombol revoke), halaman publik `/invite/[token]`,
  sidebar menyembunyikan Subscribe/Billing/Kelola-Tim untuk akun
  bertipe user tambahan.
- Keputusan yang didokumentasikan (bukan gap): tidak ada grace period
  saat seat_addon expired (konsisten cara modul expired sekarang); job
  import yang sedang berjalan saat revoke dibiarkan selesai.
- Notifikasi expiring-soon: varian copy khusus seat_addon (beda dari
  notifikasi expiry modul).

### Fase D — Polish (opsional, setelah A–C stabil)
- Admin: kolom "Anggota dari: X" di halaman Pengguna.
- Audit log UI untuk histori invite/revoke/grant-change.
- ADR resmi untuk model seat (menutup catatan ADR-0008), update
  `architecture-subscription.md` & `architecture-auth.md` dengan hasil
  final (dokumen ini akan digantikan/di-supersede oleh ADR + update
  dokumen arsitektur yang sudah ada, bukan dipertahankan selamanya
  sebagai dokumen terpisah).

## Dependensi Antar Fase
A — independen. B1 → B2 (backend dulu). C bergantung PENUH ke B1+B2. D
setelah C stabil.

## Risiko & Hal yang Perlu Dievaluasi Lebih Lanjut

Ini alasan eksplisit user menunda eksekusi — daftar berikut BUKAN daftar
lengkap, tapi titik-titik yang paling mungkin "bertabrakan":

- **Perubahan invariant inti** ("1 modul = 1 subscription") menyentuh
  kode yang sudah production-proven dan pernah py bug nyata — risiko
  regresi ke perilaku trial/renewal yang sudah stabil.
- **Kompleksitas gabungan**: 3 sub-fitur ini saling bergantung erat
  (device-limit independen, tapi seat bergantung PENUH ke multi-instance)
  — total footprint perubahan jauh lebih besar dari yang terlihat dari
  masing-masing poin permintaan awal.
- **UX checkout berubah signifikan** (Keputusan #5) — dari "pilih 1
  tier per modul" jadi "kelola banyak instance + perpanjang individual"
  — perlu divalidasi ke user akhir/client sebelum dibangun penuh.
  Pertimbangkan: apakah perlu dipecah jadi lebih banyak sub-fase, atau
  ada model lebih sederhana yang belum tergali di sesi riset ini.
  Timeline & prioritas relatif terhadap fase-fase lain yang sedang
  berjalan JUGA belum ditentukan.

## Referensi
- `docs/decisions/adr-0008-model-langganan.md` — catatan asal yang
  memicu dokumen ini.
- `docs/architecture/architecture-subscription.md`,
  `architecture-auth.md`, `architecture-accurate-integration.md` — akan
  di-update begitu ada keputusan final (§ Fase D).
- File inti yang akan disentuh kalau dilanjutkan: `apps/api/src/lib/auth.ts`,
  `apps/api/src/lib/subscription-gate.ts`,
  `apps/api/src/routes/subscriptions.route.ts`,
  `apps/api/src/routes/admin/orders.route.ts`,
  `apps/api/src/db/schema/subscription.schema.ts`,
  `apps/web/app/app/(protected)/layout.tsx`,
  `apps/web/app/app/(protected)/subscribe/page.tsx`,
  `apps/web/components/app-shell/sidebar.tsx`.
