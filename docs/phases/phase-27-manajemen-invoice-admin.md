# Fase 27 — Manajemen Invoice Admin + Link Pembayaran Publik

**Status:** Done
**Mulai:** 2026-09-05
**Selesai:** 2026-09-05

## Tujuan
User minta menu "Invoice" di admin: bisa lihat semua invoice, BUAT
invoice baru untuk user existing (boleh >1 paket sekaligus), dan invoice
itu dapat link publik yang terintegrasi alur konfirmasi pembayaran
existing (Fase 16) — bisa dibayar TANPA LOGIN. Riset dilakukan ke
InvoicePlane (homepage/README publik ternyata tidak cukup detail) dan
`/Users/webane/sites/jalajogja` (atas arahan user, referensi produksi
nyata: invoice publik + upload bukti tanpa auth).

Ini INTERUPSI SENGAJA dari inisiatif Admin UI Kit v2 (Fase 24-26 masih
"Not Started", DITUNDA — bukan dibatalkan, lanjut setelah fase ini kalau
user minta). Halaman baru di fase ini pakai primitif Admin UI Kit v2
yang SUDAH ada (Fase 23: shell, token biru) tapi BELUM primitif Fase
24-26 (Button/Card/Badge/DataTable versi lama tetap dipakai, konsisten
dengan halaman admin lain yang belum dimigrasi).

Referensi: ADR-0025, `docs/architecture/architecture-invoice.md` §
"Admin Membuat Invoice", `docs/architecture/architecture-payment.md` §
"Link Pembayaran Publik".

## Scope
- [x] `apps/api/src/db/seed.ts` — permission baru `invoices.manage`, grant ke role admin
- [x] `apps/api/src/routes/admin/invoices.route.ts` — `POST /admin/invoices`
      `{userId, planIds}`, reuse `createInvoiceAndOrder()` dalam `db.transaction()`,
      permission `invoices.manage`; `GET /` diperluas balas `orderId` per invoice
- [x] `apps/api/src/lib/order-payment.ts` (baru) — diekstrak dari
      `orders.route.ts` (field-filtering, QRIS, proof-image processing,
      DB write) supaya rute login DAN publik pakai LOGIC YANG SAMA
      (bukan copy-paste yang bisa drift)
- [x] `apps/api/src/lib/rate-limit.ts` — pasang `rateLimitPlugin` baru
      untuk prefix `/public` di `app.ts`; **diperbaiki saat security
      review** — ganti sumber IP dari `x-forwarded-for` (spoofable) ke
      `x-real-ip` (§ Keputusan Kecil)
- [x] `apps/api/src/routes/public/orders.route.ts` (baru) — `GET
      /public/orders/:id`, `PATCH /public/orders/:id/method`, `PATCH
      /public/orders/:id/proof`, `GET /public/orders/:id/qris` — TANPA
      `auth:true`, guard keberadaan+status order via `lib/order-payment.ts`
- [x] `apps/web/components/app-shell/sidebar.tsx` — nav item "Invoice"
      (grup Manajemen, admin)
- [x] `apps/web/app/admin/(protected)/invoices/page.tsx` (baru) — list
      semua invoice (DataTable) + dialog "Buat Invoice" (Combobox cari
      user, checkbox pilih 1+ paket), tombol Salin Link + Unduh PDF per baris
- [x] `apps/web/components/billing/order-pay-flow.tsx` (baru) — UI alur
      bayar diekstrak dari halaman login existing, dipakai KEDUA halaman
      (login & publik) via `OrderApiBinding` struktural
- [x] `apps/web/app/landing/pay/[orderId]/page.tsx` + `public-pay-client.tsx`
      (baru) — halaman publik, `generateMetadata` noindex, pakai
      `api.public.orders({id})`
- [x] `apps/web/app/app/(protected)/billing/[orderId]/pay/page.tsx` —
      disederhanakan jadi wrapper tipis pakai `OrderPayFlow` yang sama
- [x] `NEXT_PUBLIC_LANDING_URL` env var baru (`.env.example`+`.env.local`)
      — base URL surface landing untuk link publik lintas-surface
- [x] Tombol "Salin Link" di admin invoice list (copy
      `{LANDING_URL}/pay/{orderId}` ke clipboard)

## Referensi
- ADR: `docs/decisions/adr-0025-invoice-manajemen-admin-dan-link-publik.md`
- Riset pembanding: InvoicePlane (invoiceplane.com — kurang detail),
  `/Users/webane/sites/jalajogja` (`app/(public)/[tenant]/invoice/[id]/page.tsx`,
  `app/api/invoice/proof-upload/route.ts`, `components/keuangan/billing/invoice-create-form.tsx`)

## Keputusan Kecil Selama Eksekusi
- **`lib/order-payment.ts` diekstrak SEBELUM menulis rute publik** —
  `orders.route.ts` (login) di-refactor pakai helper yang sama LEBIH
  DULU, baru `public/orders.route.ts` ditulis di atasnya. Mencegah 2
  copy field-filtering/QRIS/proof-processing yang bisa drift (persis
  kelas bug yang sudah pernah kejadian di project ini — duplikasi
  status-badge, § lessons-learned sebelumnya).
- **`OrderPayFlow` (frontend) diekstrak dengan kontrak STRUKTURAL**
  (`OrderApiBinding`), bukan tipe Eden literal — supaya 1 komponen bisa
  menerima BAIK `api.orders({id})` (login) MAUPUN `api.public.orders({id})`
  (publik) tanpa adaptasi, TypeScript structural typing yang menjamin
  keduanya cocok tervalidasi lewat `bun run typecheck` (bukan asumsi).
- **Halaman publik ditaruh di surface `landing`** (root domain), BUKAN
  path baru di surface `app` yang di-exempt dari guard `proxy.ts` — opsi
  itu dipertimbangkan (lebih sedikit env var baru) tapi ditolak: surface
  `landing` SUDAH didesain sebagai satu-satunya tempat tanpa auth guard
  sama sekali, menambah pengecualian path di `app` akan menambah
  percabangan logic `proxy.ts` yang sebelumnya bersih (per-surface, bukan
  per-path).
- **Env var baru `NEXT_PUBLIC_LANDING_URL`** (analog `NEXT_PUBLIC_APP_URL`
  yang sudah ada) — dibutuhkan karena link publik LINTAS SURFACE
  (dibuat/disalin dari admin, dibuka di landing) — pola sama seperti
  `APP_URL` dipakai landing untuk link ke app.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck` — apps/api & apps/web)
- [x] Security review dijalankan — subagent `security-auditor` (audit
      penuh + 1 putaran klarifikasi susulan karena laporan awal
      menyebut angka "1 Medium, 2 Low" tanpa merincinya di badan
      laporan — lihat Known Limitations soal ketidaksesuaian ini)
- [x] Temuan Critical/High sudah diperbaiki — **1 High**: rate limiter
      `/public` bisa dilewati lewat header `X-Forwarded-For` yang bebas
      diisi client (nginx cuma MENAMBAHKAN, bukan menimpa, header itu) —
      DIPERBAIKI, ganti sumber IP ke `X-Real-IP` (§ `lib/rate-limit.ts`,
      detail lengkap di `docs/lessons-learned.md`)
- [x] Temuan Medium/Low dicatat kalau ditunda — **tidak ada temuan
      Medium/Low BARU yang tersubstansiasi** untuk scope fase ini
      setelah putaran klarifikasi (lihat Known Limitations)
- [x] `docs/PROGRESS.md` diupdate
- [x] Verifikasi FUNGSIONAL nyata (curl) — skenario PENUH dijalankan:
      admin bikin invoice 2-paket untuk user existing → `GET
      /public/orders/:id` TANPA cookie sama sekali (dikonfirmasi
      field sensitif tidak bocor) → `PATCH .../method` TANPA cookie →
      status disimulasikan "submitted" (upload sungguhan tidak bisa
      dites, § Known Limitations) → order MUNCUL di antrian
      `GET /admin/orders?status=submitted` EXISTING tanpa perubahan →
      `POST /admin/orders/:id/confirm` EXISTING → 2 subscription
      aktif tercipta dengan durasi benar per plan. Data test dibersihkan
      setelah verifikasi (pola sama sesi sebelumnya).

## Known Limitations
- ~~**Upload bukti pembayaran SUNGGUHAN tidak bisa dites** (MinIO lokal
  env mismatch, gap yang SAMA sejak Fase 16 — bukan regresi baru fase
  ini). 1 test baru (`public/orders.route.test.ts`) di-skip dengan
  alasan yang sama seperti test lama, verifikasi fungsional pakai
  simulasi UPDATE status manual (dijelaskan di atas), bukan upload asli.~~
  **RESOLVED 2026-09-05** — user melaporkan 500 di halaman bayar publik,
  ternyata `.env` lokal salah port+password (§ `docs/lessons-learned.md`
  2026-09-05). Sudah diverifikasi end-to-end manual (curl → 200,
  `status` jadi `submitted`) + test yang di-skip sudah di-unskip, PASS.
- **Proses security review 2 putaran** — laporan pertama subagent
  menyebut ringkasan "0 Critical, 1 High, 1 Medium, 2 Low" tapi badan
  laporan cuma merinci temuan High; agent tidak bisa di-resume (sudah
  selesai/hilang dari daftar agent aktif) untuk klarifikasi verbatim,
  jadi diminta re-audit scope yang sama sebagai agent baru. Hasil
  re-audit: cuma bisa mensubstansiasi **1 Medium + 1 Low** (bukan 2
  Low) di scope ini, dan KEDUANYA ternyata proteksi YANG SUDAH ADA
  sejak Fase 16 (dipertahankan utuh lewat ekstraksi `order-payment.ts`,
  BUKAN temuan baru fase ini) — kemungkinan besar count awal "1
  Medium, 2 Low" adalah miscount penulisan laporan pertama, BUKAN
  temuan asli yang hilang. Dicatat apa adanya (transparan), bukan
  dipaksa cocok dengan angka awal.
- **Konfigurasi nginx production TIDAK diverifikasi langsung** — fix
  rate-limit (`X-Real-IP`) berasumsi konfigurasi nginx mengikuti contoh
  di `docs/deployment-new-domain-onboarding.md` (yang memang selalu set
  `X-Real-IP $remote_addr`) — cek manual di server kalau ada keraguan.
- **Volume trafik nyata `/public/orders` belum ada** — limit 20
  request/menit per IP (§ `app.ts`) adalah estimasi awal, belum
  divalidasi dengan pola pakai sungguhan (customer buka halaman +
  pilih metode + cek status beberapa kali bisa saja mendekati limit
  ini kalau reload berulang) — revisit kalau ada laporan false-positive
  dari customer asli.
- **Verifikasi visual browser sungguhan BELUM dilakukan** — konsisten
  dengan seluruh sesi ini (ekstensi Chrome tidak tersambung).

## Ringkasan Hasil
Menu "Invoice" baru di admin: list semua invoice + dialog "Buat Invoice"
untuk user existing (Combobox cari user, checkbox pilih 1+ paket —
multi-plan per invoice SUDAH didukung `createInvoiceAndOrder()` sejak
Fase 18, tinggal dipakai ulang). Setiap invoice/order (baik dari
checkout self-service, admin create-user, MAUPUN admin create-invoice
baru ini) sekarang punya **link pembayaran publik**
(`{LANDING_URL}/pay/{orderId}`) yang bisa dibuka & dibayar TANPA LOGIN
sama sekali — diputuskan lewat ADR-0025, meniru pola production nyata
`jalajogja` (`order.id` UUID langsung jadi identifier, tanpa token
terpisah) setelah riset InvoicePlane (homepage/README publik) ternyata
tidak cukup detail.

Backend: `lib/order-payment.ts` diekstrak dari `orders.route.ts` supaya
jalur login dan publik pakai LOGIC IDENTIK (field-filtering, QRIS,
proof-processing) — tidak ada 2 sumber kebenaran yang bisa drift. 4
endpoint baru prefix `/public/orders` TANPA auth, guard status SAMA
PERSIS dengan versi login, upload bukti TETAP ke bucket privat (beda
sengaja dari `jalajogja` yang pakai bucket publik — keputusan ADR-0022
dipertahankan). Frontend: `OrderPayFlow` (shared component, kontrak
struktural `OrderApiBinding`) dipakai KEDUA halaman bayar (login &
publik) — halaman login existing disederhanakan jadi wrapper tipis.

Security review (subagent, 2 putaran karena laporan pertama tidak
lengkap): **1 High ditemukan & DIPERBAIKI** — rate limiter `/public`
(mitigasi utama abuse untuk endpoint upload tanpa auth) bisa dilewati
lewat header `X-Forwarded-For` yang bebas diisi client (nginx cuma
menambahkan, bukan menimpa header itu); fix pakai `X-Real-IP` yang
selalu ditimpa nginx. Tidak ada Medium/Low baru yang tersubstansiasi
untuk scope fase ini di luar proteksi lama yang sudah benar
dipertahankan.

Verifikasi FUNGSIONAL nyata end-to-end via curl (bukan cuma typecheck):
admin bikin invoice 2-paket → link publik diakses tanpa cookie sama
sekali (field sensitif dikonfirmasi tidak bocor) → pilih metode bayar
tanpa cookie → order MUNCUL di antrian konfirmasi admin EXISTING tanpa
perubahan apa pun di endpoint itu → admin konfirmasi → 2 subscription
aktif tercipta dengan durasi benar per plan (30 hari & 365 hari). Data
test dibersihkan setelahnya.

Typecheck 0 error (apps/api & apps/web), lint 0 error, test suite API
170 pass/3 skip/0 fail (19 test baru: 10 `POST /admin/invoices`, 9
`public/orders` — 1 di-skip, gap MinIO yang sama sejak Fase 16).
