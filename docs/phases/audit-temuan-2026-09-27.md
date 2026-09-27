# Audit Menyeluruh Facport — 2026-09-27

> Hasil audit 3 subagent paralel (security, konsistensi+performa backend,
> konsistensi frontend) terhadap seluruh 23 modul import + infrastruktur
> inti. Status: **Batch 1, 2, 3 & 4 SELESAI dieksekusi (2026-09-27)**, Batch
> 5 (perlu konfirmasi produk) masih rencana untuk sesi berikutnya.
>
> **Update penting Batch 1** — item 1.3 (bug email duplikat di
> invites/transfers) ternyata membongkar fix PAGI HARI INI (admin/staff,
> admin/users) yang SALAH ASUMSI TOTAL soal root cause (baca source lib
> tanpa verifikasi empiris) — sudah dikoreksi TUNTAS untuk SEMUA 4
> endpoint, bukan cuma 2 yang disebut di rencana awal. § detail lengkap di
> `docs/lessons-learned.md` 2026-09-27 "KOREKSI bug email sudah
> terdaftar".

## Ringkasan

Codebase secara umum SUDAH cukup matang — mayoritas kategori yang dicek
kembali "bersih/konsisten" (permission/ownership guard, validasi skema,
raw SQL, N+1 query mayoritas modul, grouping/auto-create, konstanta
MAX_ROWS, fitur Batal Import). Temuan nyata terkonsentrasi di beberapa
titik spesifik, bukan tersebar acak — cocok dieksekusi per-batch.

**0 masalah level "sedang terjadi di production sekarang tanpa disadari
dan berdampak parah"** — tapi ada beberapa temuan Critical/High yang
berpotensi jadi insiden nyata (mirip kejadian minggu ini) kalau dibiarkan.

---

## BATCH 1 — ✅ SELESAI (2026-09-27)

### 1.1 ✅ [CRITICAL] Sales Invoice: `edit-row-dialog.tsx` tidak sinkron dengan `requiredFields` backend
- **File**: `apps/web/components/sales-invoice/edit-row-dialog.tsx:35`
- **Masalah**: `REQUIRED_INTERNAL_FIELDS` FE masih punya `itemUnitName` (sudah
  dihapus dari wajib di backend sejak Fase 61) dan KEHILANGAN `number`
  (Trans No — sudah jadi wajib di backend sejak Fase 61).
- **Dampak nyata**: user bisa TERJEBAK tidak bisa simpan baris yang
  sebenarnya valid (diblokir client-side oleh field yang sudah tidak
  wajib), DAN tidak diperingatkan soal field yang sungguh wajib (`number`)
  sampai submit ditolak server.
- **Fix**: ganti jadi
  `new Set(["customerNo", "transDate", "number", "itemNo", "unitPrice", "quantity", "warehouseName"])`
  — cocokkan `apps/api/src/lib/import-mapping/sales-invoice.mapping.ts:16`.
- **Verifikasi**: 20 modul lain SUDAH sinkron persis (dicek 1-per-1), 3
  modul (finished-good-slip/material-slip/work-order) SENGAJA kosong
  (validasi 100% server-side, multi-baris) — bukan bug.

### 1.2 ✅ [HIGH] Job `REFRESH_ACCURATE_TOKEN` rentan race condition — POLA SAMA PERSIS bug 1.457-baris-gagal minggu ini
- **File**: `apps/api/src/lib/queue.ts`, `apps/api/src/workers/index.ts` (~baris 2245-2280)
- **Masalah**: queue ini TIDAK masuk `LONG_RUNNING_QUEUES` — masih pakai
  default pg-boss (`expireInSeconds=900`, `retryLimit=2`). Job ini
  me-refresh token OAuth (sekali-pakai, dirotasi) untuk SEMUA koneksi
  aktif dalam 1 loop — makin banyak customer, makin lama durasinya.
- **Skenario kegagalan**: job dianggap "expired" pg-boss di menit ke-15
  lalu di-retry OTOMATIS SEMENTARA invocation lama masih jalan → 2
  invocation berebut refresh token yang SAMA untuk koneksi yang SAMA →
  invocation kedua dapat `invalid_grant` (token sudah dipakai/rotasi oleh
  invocation pertama) → `markConnectionExpired()` terpanggil KELIRU →
  customer yang koneksinya SEBENARNYA SEHAT diputus paksa, harus connect
  ulang tanpa alasan jelas.
- **Kenapa belum ketahuan**: dampaknya "cuma" minta customer reconnect
  (bukan baris gagal massal yang mencolok), jadi belum viral seperti
  insiden minggu ini — tapi akar masalahnya IDENTIK.
- **Fix**: masukkan `REFRESH_ACCURATE_TOKEN` ke `LONG_RUNNING_QUEUES` di
  `lib/queue.ts` dengan `retryLimit: 0` (job ini SUDAH dijadwalkan harian
  via `boss.schedule`, jadi "retry alami"-nya sudah ada) + `expireInSeconds`
  dihitung dari estimasi jumlah koneksi aktif × waktu round-trip OAuth
  Accurate (perlu angka konkret jumlah koneksi aktif saat ini).

### 1.3 ✅ [HIGH → TERNYATA LEBIH SERIUS] Security: bug Better Auth `signUpEmail` untuk email duplikat, ditemukan di 4 endpoint (bukan 2)

**Update pasca-eksekusi**: investigasi item ini membongkar bahwa fix "admin/staff.route.ts & admin/users.route.ts"
dari PAGI hari yang sama (sebelum audit ini) **salah asumsi total** soal root cause (throw exception yang
ternyata TIDAK PERNAH terjadi di project ini — Better Auth balikin user SINTETIS/PALSU, bukan throw, karena
`requireEmailVerification: true`). Sudah dikoreksi TUNTAS untuk SEMUA 4 endpoint sekaligus lewat helper terpusat
baru `safeSignUpEmail()` (`lib/auth-errors.ts`). § detail lengkap `docs/lessons-learned.md` 2026-09-27 "KOREKSI
bug email sudah terdaftar" — WAJIB dibaca kalau ada endpoint BARU nanti yang perlu `signUpEmail`.
- **File**: `apps/api/src/routes/invites.route.ts:58`, `apps/api/src/routes/transfers.route.ts:55`
- **Masalah**: `signUpEmail()` throw untuk email duplikat (bukan return
  null) — pattern IDENTIK dengan bug yang diperbaiki hari ini di
  `admin/staff.route.ts`/`admin/users.route.ts`, tapi TIDAK ikut disebar
  ke 2 endpoint publik ini (accept undangan/transfer kepemilikan).
- **Dampak**: race window sempit (email didaftarkan di tab lain persis
  bersamaan) → exception tak tertangani → `500` generik alih-alih `409`
  yang jelas. Tidak ada kebocoran data, tapi UX gagal-tanpa-penjelasan di
  endpoint publik.
- **Fix**: bungkus `signUpEmail` try/catch persis pola
  `admin/users.route.ts`/`admin/staff.route.ts`, balas `409 EMAIL_ALREADY_REGISTERED`.

---

## BATCH 2 — ✅ SELESAI (2026-09-27) — Index Database (1 migration, dampak luas)

> Migration `drizzle/0033_complex_mephisto.sql` — 8 index (2.1-2.5 semuanya, plus `subscriptions_status_idx` &
> `subscriptions_accurate_connection_id_idx` terpisah dari composite `data_usaha_id+status`). `CREATE INDEX`
> biasa (bukan `CONCURRENTLY`, konsisten migration lain di project ini) — § catatan lock table di
> `docs/lessons-learned.md` 2026-09-27 kalau tabel sudah jauh lebih besar di masa depan.

### 2.1 ✅ [CRITICAL] `import_batch_rows.batch_id` tanpa index
- Dipakai di **107 tempat** — SETIAP endpoint get-detail/export/retry/edit
  di SEMUA 23 modul + worker. Rekomendasi: index composite `(batch_id, status)`
  (query paling sering filter KEDUA kolom sekaligus).

### 2.2 ✅ [HIGH] `import_batches.subscription_id` tanpa index
- 32 pemakaian, termasuk list batch per subscription. Rekomendasi: composite
  `(subscription_id, module)`.

### 2.3 ✅ [HIGH] `subscriptions` — `user_id`/`data_usaha_id`/`accurate_connection_id`/`status` semua tanpa index
- 54 pemakaian — termasuk gating akses modul (`moduleAccess` guard) yang
  jalan di HAMPIR SEMUA endpoint aplikasi (bukan cuma import). Ini
  kandidat index dengan dampak PALING LUAS (bukan cuma modul import).

### 2.4 ✅ [MEDIUM] `notifications.user_id` tanpa index
- Dipakai buat list notifikasi (bell dashboard) — traffic tinggi tiap
  load dashboard meski cuma 4 titik kode.

### 2.5 ✅ [LOW] `audit_logs` tanpa index di `created_at`
- Traffic admin rendah, bukan prioritas — boleh sekalian kalau lagi
  bikin migration index yang lain.

**Catatan eksekusi**: gabungkan 2.1-2.5 jadi SATU migration (index
additive, aman) — cek dulu ukuran tabel `import_batch_rows`/`subscriptions`
di production sebelum jalankan `CREATE INDEX` (kalau tabelnya sudah besar,
pertimbangkan `CREATE INDEX CONCURRENTLY` supaya tidak lock table saat jam
sibuk).

---

## BATCH 3 — ✅ SELESAI (2026-09-27) — `ACCURATE_SCOPE_MISSING` tidak ditangani frontend (23 modul, sistemik)

### 3.1 ✅ [HIGH] Semua 23 modul: `confirm` & `retry` tidak baca kode `ACCURATE_SCOPE_MISSING`
- **Backend**: SEMUA 23 route.ts (confirm & retry) sudah balikin
  `{code: "ACCURATE_SCOPE_MISSING", missing: [...]}` (409) kalau koneksi
  Accurate kurang scope untuk modul itu.
- **Frontend**: NOL referensi ke kode ini di seluruh `apps/web` — baik
  `onConfirmMapping` maupun `handleRetry` di 23 modul cuma cek
  `MISSING_REQUIRED_FIELDS`/`TRIAL_ROW_LIMIT_EXCEEDED`, lalu fallback ke
  pesan generik ("Gagal konfirmasi mapping."/"Gagal mengirim ulang baris").
- **Skenario nyata**: katalog scope Accurate PERNAH berubah (§ perubahan
  `glaccount_view` 2026-09-22) — customer yang koneksinya sempat lolos
  gerbang lalu scope-nya berubah, retry batch lama dapat pesan generik
  tanpa tahu solusinya "Perbarui Izin Accurate".
- **Fix direkomendasikan**: BUKAN tempel manual di 23 tempat (itu yang
  bikin drift berulang kali minggu ini) — bikin 1 helper util bersama
  (mis. `lib/accurate-error-message.ts`) yang dipanggil dari semua 23
  `onConfirmMapping`/`handleRetry`, arahkan ke halaman "Perbarui Izin".
  Sekalian jadi kesempatan REFACTOR supaya error-handling generik masa
  depan otomatis konsisten di 23 tempat (bukan copy-paste lagi).

### 3.2 ✅ [LOW] `INVALID_MAPPING_FIELD` juga tidak ditangani FE
- Kemungkinan besar TIDAK reachable dari alur UI normal (dropdown mapping
  sudah dibatasi ke field valid) — defense-in-depth saja, prioritas rendah,
  bisa sekalian masuk helper yang sama di 3.1.

---

## BATCH 4 — ✅ SELESAI (2026-09-27) — Security Hardening

### 4.1 ✅ [MEDIUM] `apps/web` tidak set HTTP security header sama sekali
- **File**: `apps/web/next.config.ts` (tidak ada `headers()`), `Caddyfile`
  (reverse proxy transparan).
- Halaman login/admin/dashboard terkirim TANPA `X-Frame-Options`, CSP,
  `X-Content-Type-Options`, `Referrer-Policy` — API-nya (`app.ts`) sudah
  ada, web-nya belum.
- Mitigasi parsial SUDAH ada: cookie sesi `sameSite: "lax"` mengurangi
  risiko clickjacking klasik di browser modern. Gap yang tetap nyata: TIDAK
  ada CSP sama sekali (lapis pertahanan tambahan kalau ada XSS lolos).
- **Fix**: tambah `headers()` di `apps/web/next.config.ts` — 4 header sama
  persis dengan `apps/api/src/app.ts` (X-Content-Type-Options, X-Frame-Options,
  Referrer-Policy, HSTS production-only) + CSP baru. Origin `img-src`/
  `connect-src` diturunkan dari `process.env.NEXT_PUBLIC_API_URL`/
  `MINIO_PUBLIC_URL` dibaca SERVER-SIDE saat `next start` boot (bukan lewat
  bundle client — beda dari `lib/get-prod-api-origin.ts` yang sengaja
  hindari pola itu, § lessons-learned 2026-09-27 penjelasan lengkap kenapa
  keduanya aman meski mirip). `script-src`/`style-src` pakai `'unsafe-inline'`
  (keputusan sadar, bukan kelonggaran ceroboh — nonce butuh SEMUA halaman
  dynamic rendering + tidak menolong Radix UI inline style via JS, dicek
  langsung ke `node_modules/next/dist/docs/` versi Next 16 project ini).
  Diverifikasi NYATA browser (landing/app/admin, 3 surface) — 0 pelanggaran
  CSP, header dikonfirmasi `curl -I`. Security review: 0 temuan
  Critical/High.

### 4.2 [LOW] CSRF token API belum diimplementasikan (gap terdokumentasi, risiko rendah)
- Sudah disadari dari awal (`architecture-security.md` §5), bukan temuan
  baru — risiko riil rendah karena `sameSite: lax` sudah jadi mitigasi
  utama. Prioritas rendah, revisit kalau ada kebutuhan konkret.

---

## BATCH 5 — Minor / Perlu Konfirmasi Produk Dulu

### 5.1 [MEDIUM, perlu konfirmasi] Label kolom "ID Item Transfer Accurate" di halaman Item Requisition
- **File**: `apps/web/app/app/(protected)/item-requisition/import/[batchId]/page.tsx:173`
- Item Requisition memang memanggil endpoint Accurate `item-transfer/save.do`
  yang sama (keputusan produk: 2 modul Facport → 1 endpoint Accurate,
  terdokumentasi) — jadi ID yang dikembalikan API memang literal "Item
  Transfer" punya Accurate, BUKAN typo. TAPI beda dari modul lain yang
  pakai nama field API mentah serupa (Inventory Adjustment→"ID Item
  Adjustment", dst — tidak ambigu), "Item Transfer" JUGA nama modul
  Facport lain yang aktif → berpotensi bikin user mengira nyasar modul.
- **Rekomendasi**: tanya klien/tim produk — pertahankan (konsisten filosofi
  "nama field API asli") atau ganti ke label netral ("ID Transaksi
  Accurate / Error") supaya tidak ambigu dengan modul Item Transfer.

### 5.2 ✅ [LOW] Purchase Invoice/Sales Invoice: tombol Retry tidak memperhitungkan status `cancelling`
- Kalau batch sedang dibatalkan, tombol Retry tetap tampil & backend tidak
  memblokirnya — race window kecil dengan proses cancel. Prioritas rendah
  (jarang kejadian, butuh timing pas).
- **Fix**: guard `409 BATCH_BUSY` ditambah di endpoint `retry` PI & SI
  (sebelumnya TIDAK cek status batch sama sekali — bukan cuma "lupa
  `cancelling`", ternyata `processing` pun tidak dicek), reuse kode/status
  yang sama persis dengan handler `delete`. Tombol FE (`isProcessing` →
  `isBusy`) sekarang sembunyi untuk `processing` MAUPUN `cancelling`. Pesan
  `BATCH_BUSY` ditambah ke helper terpusat `describeImportActionError()`
  (§ Batch 3) supaya toast-nya jelas, bukan fallback generik. Test baru:
  4 test backend (`test.each` processing/cancelling × PI/SI) + 1 test
  frontend.

### 5.3 ✅ [LOW] Minor N+1 di job `NOTIFY_EXPIRING_SOON`
- 1 query update per subscription dalam loop — volume kecil (notifikasi
  harian), bukan bug import, tidak mendesak.
- **Fix**: insert notifikasi dikumpulkan jadi 1 `createNotificationsBulk()`
  (helper yang sudah ada, dipakai fan-out announcement), update
  `lastReminderThresholdDays` dikelompokkan per NILAI threshold jadi
  beberapa `UPDATE ... WHERE id IN (...)` (bukan 1 update per subscription).
  `boss.send` email TETAP per-penerima (dispatch job queue, bukan query DB
  berulang yang jadi concern audit ini). Tidak ada test dedicated untuk job
  ini (sudah begitu SEBELUM fix ini juga — job inline di `workers/index.ts`,
  butuh ekstraksi jadi fungsi terpisah untuk testable, di luar scope fix
  LOW-priority ini).

---

## Yang Sudah Dikonfirmasi BERSIH (tidak perlu disentuh, dicatat sebagai bukti sudah dicek)

- Semua endpoint 23 modul: `set.status` selalu benar sebelum `return {code}`.
- Permission (`import.create`+`moduleAccess`) + ownership guard konsisten
  di SEMUA endpoint 23 modul.
- Validasi edit-row vs edit-bulk IDENTIK dalam tiap modul.
- Grouping (`groupXRows`) & auto-create customer/vendor/item konsisten
  dengan dokumentasi arsitektur tiap modul — tidak ada yang kebalik.
- N+1 query: bersih di 23 `processXGroup()` (PI/SI update per-baris itu
  BY DESIGN, bukan oversight).
- `MAX_ROWS` konsisten 10.000 di semua 23 modul.
- Accordion "Cocokkan Kolom" tertutup default — sudah 100% menyebar.
- Tombol Retry/Edit Semua/Download Baris Gagal — kondisi tampil identik
  di semua 23 modul (rollout minggu ini terbukti tuntas & bersih).
- Fitur "Batal Import" — HANYA di Purchase Invoice & Sales Invoice, sesuai
  desain (ADR-0013/0014), tidak ada modul lain yang salah punya/tidak
  punya fitur ini.
- Guard auth/permission: HANYA `GET /plans` yang publik, dan itu memang
  disengaja (harga paket landing page).
- Raw SQL, file upload validation, rate limiting, RBAC admin vs staff,
  secret management, enkripsi token Accurate, CSRF OAuth Accurate, XSS —
  semua sudah benar/aman.

---

## Rekomendasi Urutan Eksekusi

1. **Batch 1** dulu — 3 fix kecil, risiko rendah, pola sudah familiar
   (persis seperti fix hari ini), bisa selesai cepat.
2. **Batch 2** — 1 migration index, perlu cek ukuran tabel production dulu
   sebelum eksekusi (pertimbangkan `CONCURRENTLY` kalau tabel sudah besar).
3. **Batch 3** — refactor kecil (1 helper baru) + rollout ke 23 modul,
   pola sudah terbukti aman dieksekusi sistematis (seperti rollout-rollout
   minggu ini).
4. **Batch 4** — perlu riset tambahan (inventarisasi resource eksternal
   untuk CSP) sebelum eksekusi, jangan buru-buru.
5. **Batch 5** — 5.1 perlu jawaban klien dulu, 5.2/5.3 bisa nunggu.
