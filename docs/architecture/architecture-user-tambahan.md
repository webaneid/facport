# Architecture — Restrukturisasi Dashboard per Data Usaha, User Tambahan (Seat), & Batas Device

> **STATUS: DIUSULKAN — BELUM DIIMPLEMENTASIKAN.** Dokumen ini adalah hasil
> riset arsitektur mendalam (2026-09-11, direvisi hari yang sama setelah user
> minta pendekatan LEBIH RADIKAL) untuk beberapa kemampuan besar yang diminta
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
>
> **Revisi dari draf pertama**: draf awal mengusulkan "multi-instance modul"
> sebagai fitur berdiri sendiri (subscription bisa >1 untuk modul yang sama,
> dibedakan label buatan "#1"/"#2"). User lalu minta pendekatan yang lebih
> radikal: jadikan **Data Usaha** (istilah yang sudah dipakai product ini
> untuk perusahaan/database Accurate) sebagai ANCHOR navigasi paling atas,
> mirip alur Accurate Online sendiri (pilih/buat database dulu sebelum masuk
> workspace). Ini TERNYATA menyelesaikan masalah "label buatan #1/#2" secara
> alami — instance dibedakan oleh Data Usaha yang berbeda, bukan angka
> buatan — sekaligus membuat model akses user tambahan jauh lebih intuitif
> ("akses ke Data Usaha PT Maju" alih-alih "akses ke subscription id abc-123").

## Latar Belakang & Kebutuhan Bisnis

Facport saat ini: 1 user = login bebas dari device mana pun tanpa batas
sesi, sidebar dashboard FLAT (langsung ke daftar modul, tanpa konsep
"perusahaan mana"), 1 user = maksimal 1 langganan aktif per modul secara
global (bukan per perusahaan). Client minta beberapa kemampuan yang
ternyata saling terkait erat:

1. **Restrukturisasi total alur dashboard ala Accurate**: Login → layar
   **"Pilih Data Usaha"** (kalau belum ada, harus buat dulu) → BARU masuk
   ke dashboard, yang sekarang SCOPED ke Data Usaha itu. Ada link "Ganti
   Data Usaha" di paling bawah sidebar (sebelum tombol ciutkan). Struktur
   konseptual baru: **Data Usaha → Modul → Fitur (sub-modul)** — "Fitur"
   di sini yang saat ini disebut `moduleKey` di kode (Purchase Invoice,
   dst), dikelompokkan di bawah "Modul" (grouping lebih tinggi, mis.
   Pembelian/Penjualan), semuanya bernaung di 1 Data Usaha spesifik.
   Langganan/billing tetap terjadi di level Fitur (granularitas tidak
   berubah), tapi navigasi & scoping akses sekarang mengikuti Data Usaha.
2. **Batasi jumlah device/sesi login bersamaan per user** — default 1,
   admin bisa naikkan ke 2/3/dst secara global. Login di device baru
   melebihi batas = otomatis logout device yang paling lama tidak aktif.
3. **User tambahan (seat) yang menumpang langganan user utama** — user
   utama beli slot user tambahan (harga terpisah, bulanan/tahunan),
   undang orang lain lewat email, orang itu login dengan akun sendiri
   (password ATAU Google) tanpa perlu subscribe modul sendiri — akses
   di-grant per Data Usaha/Fitur spesifik (bukan otomatis semua).

**Kenapa poin 1 sekarang jadi fondasi, bukan cuma "tambahan"**: begitu
Data Usaha jadi anchor navigasi, masalah "1 user bisa >1 langganan aktif
untuk modul yang sama" (draf lama, poin terpisah) **HILANG sebagai
masalah tersendiri** — itu otomatis terjadi kalau user punya 2 Data
Usaha yang masing-masing subscribe Purchase Invoice sendiri-sendiri,
tidak perlu logic multi-instance yang rumit di level 1 akun. Yang justru
jadi lebih besar sekarang: DATA USAHA itu sendiri adalah entity baru
yang harus dibangun dari nol (lihat § Ringkasan Riset), dan invariant
"1 modul aktif = 1 subscription" perlu digeser jadi "per Data Usaha"
(bukan dihapus).

## Ringkasan Riset (fakta kunci yang membentuk desain)

### Restrukturisasi navigasi per Data Usaha
- **Sidebar sudah punya struktur grup** (`components/app-shell/sidebar.tsx`)
  — `NavGroup = {label, items[]}`, tiap grup collapsible sendiri. Surface
  `app` (customer) punya 3 grup: "Utama"/"Import Data"/"Langganan".
  Filter modul (`navGroupsFor`) dan filter permission jalan terpisah,
  lalu grup kosong di-drop otomatis. **Belum ada level ke-3** (grup di
  dalam grup) — perlu ditambah untuk nesting "Modul" di dalam tampilan
  yang sudah scoped ke 1 Data Usaha.
- **Tidak ada elemen apa pun di paling bawah sidebar hari ini** selain
  tombol ciutkan — link "Ganti Data Usaha" perlu disisipkan sebelum
  tombol itu (dan versi mobile drawer, yang saat ini tidak punya elemen
  bawah sama sekali, perlu ditambah dari nol).
- **Tidak ada preseden "gerbang sebelum dashboard"** di kode manapun
  (dicek eksplisit — tidak ada wizard/onboarding/checklist). TAPI pola
  `redirect()` di Server Component (`apps/web/app/app/(protected)/layout.tsx`,
  dipakai buat cek role login) adalah idiom yang PAS untuk gerbang baru
  ini — tambah 1 kondisi lagi di file yang sama, pola sama persis.
- **Tabrakan #1 (URUTAN)**: hari ini WAJIB "subscribe fitur dulu → baru
  bisa connect Accurate" (`POST /accurate/connect` menolak kalau belum
  ada subscription aktif, error `SUBSCRIPTION_NOT_FOUND`). Tidak ada
  jalan bikin "Data Usaha" tanpa OAuth Accurate DAN tanpa subscription
  aktif lebih dulu — kalau gerbang "pilih Data Usaha" dipasang di paling
  awal (sebelum subscribe apa pun), ini membalik urutan yang sudah
  tertanam di banyak tempat.
- **Tabrakan #2 (TRIAL LEBIH BERAT)**: trial subscription hari ini
  SENGAJA bisa dibuat TANPA koneksi Accurate sama sekali (`lib/trial.ts`
  — tidak ada cek Accurate/Data Usaha di jalur trial). Kalau gerbang
  "harus pilih/buat Data Usaha dulu" mengharuskan OAuth Accurate di
  depan, funnel trial jadi jauh lebih berat dari sekarang (user baru mau
  coba-coba dipaksa OAuth duluan).
- **Resolusi kedua tabrakan (keputusan final, lihat § Keputusan Desain
  #6)**: "Data Usaha" dibuat sebagai ENTITY LOKAL BARU (tabel sendiri,
  cuma nama), TERPISAH dari `accurate_connections`. Tidak perlu OAuth
  saat dibuat. OAuth terjadi belakangan (kapan pun — bisa langsung saat
  dibuat kalau user mau, bisa nanti saat subscribe fitur pertama), dan
  begitu terhubung, **PERMANEN 1:1** untuk Data Usaha itu — tidak pernah
  ditanya ulang "connect ke Data Usaha mana" untuk fitur ke-2 dst di
  Data Usaha yang sama.
- **Istilah "Data Usaha" sudah jadi bahasa produk resmi** — dipakai
  konsisten di `/app/accurate` ("Pilih Data Usaha", "Hubungkan Data
  Usaha Baru", selalu digloss "(perusahaan)"). Tidak perlu istilah baru,
  user tidak akan bingung dengan terminologi asing.
- **UI "pilih Data Usaha yang sudah ada / hubungkan baru" SUDAH ADA
  PERSIS** di `/app/accurate` (`SelectDatabaseCard`, radio list dari
  `GET /accurate/connections`) — cuma scoped per-subscription, bukan
  gerbang global. Tinggal diangkat/digeneralisasi, BUKAN dibangun dari
  nol. Accurate sendiri TIDAK punya picker database di tengah alur OAuth
  (dikonfirmasi di `architecture-accurate-integration.md`) — picker yang
  ada murni buatan Facport sendiri (panggil `db-list.do`/`open-db.do`
  setelah token didapat) — jadi gerbang baru ini tidak bentrok/duplikat
  dengan apa pun yang di-host Accurate.
- **Pengelompokan "Modul" (Pembelian/Penjualan/dst) SUDAH ADA**, di
  `apps/web/lib/module-options.ts` — 5 grup: Penjualan, Pembelian, Buku
  Besar, Data Master, Kas & Bank. **SUDAH DIKONFIRMASI cuma dipakai
  kosmetik** (radio list form admin Paket), TIDAK PERNAH dipakai untuk
  access control sejak ADR-0019 (yang justru MENGHAPUS grouping ini dari
  gating, karena dulu grouping = unit akses, sekarang unit akses = per
  sub-modul). **Menata ulang jadi layer navigasi di sidebar customer
  TIDAK membuka lagi masalah ADR-0019** — selama ditegaskan di ADR baru
  bahwa "Modul" di sini murni UI, bukan unit gating (unit gating tetap
  di level Fitur/sub-modul, tidak berubah).
- **Import batches** (`import_batches`) di-scope oleh `subscriptionId`,
  BUKAN langsung oleh Data Usaha — perlu 2-hop join
  (`subscriptionId`→`accurateConnectionId`) untuk filter "riwayat import
  Data Usaha X", ATAU (lebih simpel) tinggal filter
  `subscriptionId IN (subscription-subscription milik Data Usaha itu)`
  begitu `subscriptions.dataUsahaId` ada (lihat skema). Tidak perlu
  migrasi `import_batches` itu sendiri.
- **Notifikasi & audit log TIDAK ADA konsep Data Usaha sama sekali**
  (cuma `userId`) — direkomendasikan TETAP account-wide (lonceng
  notifikasi tidak usah difilter per Data Usaha), jalur yang paling
  minim perubahan dan tidak mengorbankan apa pun secara fungsional.

### Batas device/sesi
*(tidak berubah dari draf sebelumnya)*
- Tidak ada plugin bawaan Better Auth untuk "batasi N sesi per user" —
  custom lewat `databaseHooks.session.create.before`
  (`apps/api/src/lib/auth.ts`), **dikonfirmasi ADA** di versi terpasang
  (`@better-auth/core@1.7.1`, diverifikasi ke `.d.mts` instalasi),
  meski ada komentar salah di `app.ts` (~baris 103-111) yang mengklaim
  sebaliknya.
- **Bonus temuan (bug keamanan nyata)**: karena kesalahpahaman itu,
  guard akun `disabled` cuma jalan untuk login password, **TIDAK jalan
  untuk login Google** — akan diperbaiki sekalian pakai hook yang sama.
- "Device" = sesi login (bukan fingerprint fisik) — diterima sebagai
  batasan wajar. `cookieCache` 5 menit = known limitation (evicted
  device tetap jalan sampai 5 menit).

### User tambahan (seat)
*(tidak berubah dari draf sebelumnya, TAPI model grant jadi lebih
intuitif berkat Data Usaha — lihat § Keputusan Desain #4 revisi)*
- Tidak ada fondasi "team/organization/seat/member" apa pun di
  kode/skema (greenfield total). Better Auth punya plugin `organization`
  bawaan (tidak dipakai) — **keputusan: bangun tabel custom minimal**.
- Pola provisioning admin + job email (pg-boss `JOBS.SEND_EMAIL`) adalah
  template siap-pakai untuk alur invite.
- RBAC flat — akun user tambahan WAJIB tetap dapat role `customer`
  (selain mekanisme grant, bukan gantinya).

## Keputusan Desain

| # | Keputusan | Pilihan Final & Alasan |
|---|---|---|
| 6 | **[BARU]** Cara "Data Usaha" dibuat & terhubung ke Accurate | **Entity lokal ringan dulu** (tabel baru `data_usaha` — cuma nama, TANPA OAuth), OAuth Accurate terjadi BELAKANGAN — bisa langsung saat dibuat (tombol "Hubungkan ke Accurate sekarang", untuk user yang sudah siap) ATAU dilewati dulu (tombol "Lewati, coba-coba dulu", untuk trial/eksplorasi). **Begitu terhubung (kapan pun), 1:1 PERMANEN** — Data Usaha itu tidak akan pernah menampilkan picker Accurate lagi untuk fitur berikutnya. Ini menjaga alur trial & subscribe yang sudah ada (tidak dipaksa OAuth di depan), SEKALIGUS mencegah "harus pilih Data Usaha berulang-ulang" yang bikin bingung — dipilih persis karena user friendly untuk 2 tipe user (yang serius langsung connect, yang mau coba-coba dulu). |
| 7 | **[BARU]** Hierarki navigasi | **Data Usaha → Modul (grup UI, reuse `module-options.ts` yang sudah ada) → Fitur (sub-modul, unit billing/gating TIDAK berubah)**. "Modul" murni pengelompokan tampilan sidebar, BUKAN unit akses baru — ditegaskan eksplisit di ADR final nanti supaya tidak membuka lagi ambiguitas yang sudah diperbaiki ADR-0019. |
| 8 | **[BARU]** Gerbang "Pilih Data Usaha" | Ditambahkan sebagai kondisi baru di `apps/web/app/app/(protected)/layout.tsx` (pola SAMA PERSIS `redirect("/login")` yang sudah ada untuk cek role) — belum ada Data Usaha terpilih → redirect ke halaman pilih/buat. Link "Ganti Data Usaha" baru di paling bawah sidebar (sebelum tombol ciutkan), juga di mobile drawer. |
| 1 | Fondasi hubungan user utama ↔ user tambahan | Tabel custom minimal baru, bukan plugin Organization Better Auth. |
| 2 | Definisi "device" | Sesi login, bukan fingerprint perangkat fisik. |
| 3 | Cara beli user tambahan | Input jumlah sekaligus (quantity) di UI — backend tetap N baris terpisah (pola "1 row = 1 unit"), keterbacaan invoice diselesaikan di render time. |
| 4 | Cakupan akses user tambahan | **Direvisi**: grant tetap presisi per subscription/Fitur (skema `member_module_grants` TIDAK berubah), TAPI sekarang UI pemberian akses dikelompokkan per Data Usaha dulu ("PT Maju Jaya" → centang Fitur mana saja), jauh lebih intuitif daripada mencentang daftar subscription id mentah seperti draf awal. |
| 5 | Alur "perpanjang vs beli baru" untuk modul yang sama | **Dipersempit cakupannya** berkat Data Usaha: kasus "2 instance modul sama dalam 1 Data Usaha" jadi jarang/tidak perlu (kalau butuh 2 Purchase Invoice, biasanya karena 2 Data Usaha, sudah otomatis terpisah). Yang masih perlu: aksi "Perpanjang/Ganti Paket" EKSPLISIT (update row yang sama di tempat, `id` tetap) untuk kasus renewal/upgrade tier DALAM Data Usaha yang sama, terpisah dari katalog "+ Tambah Langganan" — prinsip "tidak pernah menebak" tetap dipegang. |

## Skema Database (diusulkan)

### Data Usaha — 1 tabel baru + 1 kolom baru
```ts
// data_usaha — entity BARU, TERPISAH dari accurate_connections (yang tetap
// menyimpan token OAuth). 1 Data Usaha = 1 "workspace" yang dipilih user
// setelah login, opsional terhubung ke 1 accurate_connections permanen.
export const dataUsaha = pgTable("data_usaha", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id),
  // pemilik/user utama — user tambahan TIDAK punya baris ini sendiri,
  // mereka akses lewat grant (lihat member_module_grants, tidak berubah)
  name: varchar("name", { length: 200 }).notNull(),
  // nama bebas user, mis. "PT Maju Jaya" — TIDAK harus sama dengan
  // accurateDbAlias (yang baru terisi begitu benar-benar connect)
  accurateConnectionId: uuid("accurate_connection_id").unique()
    .references(() => accurateConnections.id),
  // NULLABLE — diisi begitu Data Usaha ini terhubung ke Accurate (kapan
  // pun terjadi). UNIQUE — 1 Data Usaha lokal = maksimal 1 koneksi
  // Accurate permanen, tidak pernah ganti-ganti diam-diam.
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// subscriptions — tambah 1 kolom
dataUsahaId: uuid("data_usaha_id").notNull().references(() => dataUsaha.id),
// diisi SAAT CHECKOUT (user sedang berada di dalam konteks 1 Data Usaha
// ketika subscribe) — bukan lewat accurateConnectionId (yang bisa masih
// kosong kalau belum connect). Ini yang bikin scoping "1 modul aktif per
// Data Usaha" (bukan per akun) bisa dicek LANGSUNG tanpa join ke Accurate.
```

**Migrasi data lama (perhatian khusus, BUKAN sekadar tambah kolom
kosong)**: user yang sudah py subscription+koneksi Accurate sebelum
fitur ini ada WAJIB dapat backfill — buat 1 `data_usaha` row per
`accurate_connections` unik yang mereka punya (pakai `accurateDbAlias`
jadi `name` awal), lalu isi `subscriptions.dataUsahaId` masing-masing
berdasarkan `accurateConnectionId` yang sudah ada. Subscription yang
BELUM pernah connect Accurate (trial murni, atau baru checkout belum
sempat connect) perlu 1 "Data Usaha Utama" default per user supaya
`dataUsahaId` tetap NOT NULL. Ini bagian paling berisiko dari seluruh
rencana — WAJIB jadi fase tersendiri dengan dry-run di data produksi
sebelum di-apply, bukan disatukan diam-diam dengan fase lain.

### Batas device — tidak ada tabel baru
1 setting baru: `security.maxDevicesPerUser` (pola sama
`IMPORT_RETENTION_SETTING_KEY`).

### User tambahan (seat) — 2 tabel baru + 1 kolom baru di `plans`
*(tidak berubah dari draf sebelumnya — lihat detail lengkap di riwayat
dokumen/plan file, ringkasan: `plans.kind`, `member_seats`,
`member_module_grants`)*

## Rencana Fase (kalau/ketika dilanjutkan — urutan wajib)

### Fase A — Batasi Device/Sesi per User (independen, bisa duluan)
Tidak berubah dari draf sebelumnya — setting + `databaseHooks.session.create.before`
+ perbaikan gap Google-login sekalian.

### Fase B0 — Migrasi Data Usaha (WAJIB paling hati-hati, sebelum kode apa pun)
- Buat tabel `data_usaha`, kolom `subscriptions.dataUsahaId`.
- Skrip backfill (dry-run dulu di data produksi, direview manual sebelum
  apply) sesuai § Skema Database di atas.
- **Verifikasi WAJIB**: tidak ada subscription yang "kehilangan" Data
  Usaha setelah backfill; tidak ada Data Usaha ganda tak sengaja untuk
  koneksi Accurate yang sama.

### Fase B1 — Backend: Gerbang & Scoping per Data Usaha
- Endpoint baru: `GET/POST /me/data-usaha` (list, create — cuma nama,
  tanpa OAuth), `POST /me/data-usaha/:id/connect` (trigger OAuth,
  reuse alur `accurate.route.ts` yang sudah ada, hasilnya diikat ke
  `dataUsaha.accurateConnectionId`).
- `subscriptions.route.ts` checkout: WAJIB `dataUsahaId` di body,
  guard `MODULE_ALREADY_SUBSCRIBED` di-scope ulang jadi **per Data
  Usaha** (bukan per akun) — perubahan lebih kecil & lebih aman dari
  draf sebelumnya (dulu diusulkan "hapus guard total", sekarang cukup
  "tambah filter `dataUsahaId`").
- `admin/orders.route.ts` confirm-time cancel-logic: scope yang sama
  (per Data Usaha, bukan per akun) — trial-supersede tetap jalan seperti
  sekarang (trial ditutup begitu beli asli, tidak berubah).
- `subscription-gate.ts`: tambah `dataUsahaId` sebagai bagian resolusi
  akses (subscription harus match `dataUsahaId` yang sedang aktif di
  sesi/context request, BUKAN cuma `moduleKey`).

### Fase B2 — Frontend: Gerbang & Sidebar Bertingkat
- Halaman baru "Pilih Data Usaha" (`/app/pilih-usaha` atau serupa) —
  list Data Usaha milik user (reuse `GET /me/data-usaha`), tombol "Buat
  Data Usaha Baru", tiap card ada status terhubung/belum ke Accurate.
- `layout.tsx`: tambah kondisi redirect (pola sama cek role) — belum
  ada Data Usaha terpilih (baca dari cookie/session baru) → redirect ke
  halaman di atas.
- Sidebar: nesting baru Modul (grup UI) di dalam tampilan yang sudah
  scoped ke 1 Data Usaha; link "Ganti Data Usaha" di paling bawah
  (desktop + mobile drawer).
- `subscribe/page.tsx`: scoped ke Data Usaha yang sedang aktif; badge
  "Sedang Aktif"/aksi "Perpanjang/Ganti Paket" per Keputusan #5.
- 7 halaman import: tidak perlu tahu `dataUsahaId` eksplisit lagi (sudah
  implisit dari context Data Usaha yang aktif di sesi).

### Fase C — User Tambahan (Seat) + Invite + Akses Granular
Bergantung penuh pada B0+B1+B2. Detail sama seperti draf sebelumnya
(schema `plans.kind`/`member_seats`/`member_module_grants`, alur invite,
`subscription-gate.ts` union primary+grant), dengan penyesuaian: UI
pemberian akses sekarang dikelompokkan per Data Usaha (Keputusan #4).

**Penyempurnaan alur invite (hasil validasi ilustrasi user, 2026-09-11)
— penerimaan undangan lewat 2 jalur, bukan cuma 1**:
- **Jalur A (utama)**: klik link di email undangan (`/invite/:token`) →
  kalau email BELUM terdaftar → form daftar (password atau tombol
  Google) → otomatis diterima setelah akun dibuat. Kalau email SUDAH
  terdaftar → link ini WAJIB deteksi ini dan arahkan ke halaman login
  (BUKAN coba bikin akun baru/dobel) → setelah login, lanjut ke
  penerimaan otomatis.
- **Jalur B (cadangan/robustness, BARU)**: kalau orang yang diundang
  login normal (tanpa lewat link email — mis. email hilang/link
  kedaluwarsa, atau dia login dari rute lain), sistem tetap HARUS
  mendeteksi ada `member_seats` pending dengan `invitedEmail` cocok ke
  email akun yang login, lalu tampilkan **notifikasi besar** (banner
  mencolok, BUKAN cuma item kecil di dropdown lonceng) — "Anda diundang
  ke Data Usaha X, klik untuk terima." Klik = aksi terima eksplisit
  (sama seperti klik link, keduanya berujung ke endpoint accept yang
  sama). Ini bikin penerimaan undangan TIDAK 100% bergantung ke link
  email yang bisa hilang/kedaluwarsa — Data Usaha yang di-invite-kan
  "otomatis muncul" begitu orangnya login, sesuai yang diminta user.
- Entry point beli seat: bisa dipicu dari dalam halaman 1 Data Usaha
  ("Tambah User" di context Data Usaha yang sedang aktif) — TAPI lihat
  § Keputusan Tertunda di bawah soal cakupan akses seat, ini menentukan
  apakah "dari dalam Data Usaha X" itu sekadar default awal atau
  cakupan permanen.
- Setelah pembayaran seat disetujui admin, tawarkan LANGSUNG isi
  nama+email undangan (form muncul begitu approve, bukan cuma
  dokumentasikan slot kosong lalu tunggu user buka halaman Kelola Tim
  lain waktu) — opsi "isi nanti saja" tetap ada untuk yang belum tahu
  siapa yang mau diundang.

## Keputusan Tertunda (butuh konsultasi client, BUKAN keputusan teknis)

### Cakupan seat: per-akun (bisa pindah) vs per-Data-Usaha (permanen)
Ditemukan lewat ilustrasi user (2026-09-11) — user secara eksplisit
minta ini DITUNDA untuk dikonsultasikan ke client, karena berdampak ke
model bisnis/harga, bukan cuma teknis. Kerangka masalahnya:

- **Kalau seat = kapasitas per-akun yang bebas dipindah** (beli 2 seat,
  bisa dialokasikan ke Data Usaha mana pun kapan saja) — fleksibel buat
  customer, TAPI membuka celah: beli seat murah, pindahkan bebas ke
  Data Usaha mana pun tanpa biaya tambahan — mirip diskon tersembunyi
  kalau harga seat tidak dibedakan per Data Usaha.
- **Kalau seat = melekat permanen ke 1 Data Usaha tempat dibeli** — lebih
  aman secara penagihan (jelas seat X dibayar untuk Data Usaha Y, tidak
  bisa dialihkan diam-diam), TAPI kaku: customer yang salah pilih Data
  Usaha saat beli, atau butuh pindahkan tim ke Data Usaha lain, harus
  beli seat baru lagi.
- **Belum ditentukan**: dampaknya ke skema `member_seats` (apakah perlu
  kolom `dataUsahaId` yang mengunci slot itu ke 1 Data Usaha, atau tetap
  account-wide seperti draf skema saat ini) — TIDAK ditulis ke skema
  final sampai keputusan bisnis ini turun dari client.

### Fase D — Polish
Sama seperti draf sebelumnya + ADR resmi menutup dokumen ini, update
`architecture-subscription.md`/`architecture-auth.md`/
`architecture-accurate-integration.md`/`architecture-app-dashboard.md`
dengan hasil final.

## Dependensi Antar Fase
A — independen. B0 → B1 → B2 (WAJIB berurutan, B0 paling berisiko/hati-hati
karena migrasi data produksi). C bergantung PENUH ke B0+B1+B2. D setelah
C stabil.

## Risiko & Hal yang Perlu Dievaluasi Lebih Lanjut

- **Migrasi data produksi (Fase B0)** adalah risiko TERBESAR di seluruh
  rencana ini — user/subscription/koneksi Accurate yang SUDAH ADA harus
  di-backfill dengan benar tanpa kehilangan akses siapa pun. WAJIB
  dry-run + review manual, bukan migrasi sekali jalan.
- **Scope bertambah dari draf awal** — restrukturisasi navigasi (Fase
  B0-B2) adalah pekerjaan baru yang tidak ada di permintaan awal
  ("cuma" batas device + user tambahan) — total footprint jauh lebih
  besar dari perkiraan awal siapa pun.
- **UX gerbang login berubah untuk SEMUA customer** (bukan cuma yang
  mau pakai user tambahan) — setiap login sekarang lewat 1 langkah
  tambahan (pilih Data Usaha kalau py lebih dari 1, atau auto-masuk
  kalau cuma py 1 — perlu diputuskan: kalau user cuma py 1 Data Usaha,
  apakah tetap ditampilkan gerbang pilihnya atau auto-skip langsung ke
  dashboard? Ini detail UX yang belum diputuskan, kandidat kuat: auto-skip
  kalau cuma 1, supaya user existing yang belum butuh multi-Data-Usaha
  tidak merasakan friksi tambahan sama sekali).
- Timeline & prioritas relatif ke fase-fase lain yang sedang berjalan
  belum ditentukan.

## Referensi
- `docs/decisions/adr-0008-model-langganan.md`,
  `docs/decisions/adr-0019-gating-per-sub-modul-dan-katalog-plan.md`
  (rasional kenapa grouping "Modul" harus TETAP UI-only, tidak boleh
  jadi unit gating lagi).
- `docs/architecture/architecture-subscription.md`, `architecture-auth.md`,
  `architecture-accurate-integration.md`, `architecture-app-dashboard.md`
  — akan di-update begitu ada keputusan final (§ Fase D).
- File inti yang akan disentuh: `apps/api/src/lib/auth.ts`,
  `apps/api/src/lib/subscription-gate.ts`,
  `apps/api/src/routes/subscriptions.route.ts`,
  `apps/api/src/routes/admin/orders.route.ts`,
  `apps/api/src/routes/accurate.route.ts`,
  `apps/api/src/db/schema/subscription.schema.ts`,
  `apps/api/src/db/schema/accurate.schema.ts` (tabel baru `data_usaha`),
  `apps/web/app/app/(protected)/layout.tsx`,
  `apps/web/app/app/(protected)/subscribe/page.tsx`,
  `apps/web/app/app/(protected)/accurate/page.tsx`,
  `apps/web/components/app-shell/sidebar.tsx`,
  `apps/web/lib/module-options.ts`.
