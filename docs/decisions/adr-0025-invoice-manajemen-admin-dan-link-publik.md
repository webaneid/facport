# ADR-0025: Manajemen Invoice Admin + Link Pembayaran Publik (Tanpa Login)

**Status:** Accepted
**Tanggal:** 2026-09-05

## Context
User minta menu "Invoice" di admin: admin bisa MEMBUAT invoice untuk
user yang sudah ada (bukan cuma otomatis saat checkout/create-user baru
seperti Fase 16/18), boleh berisi lebih dari 1 paket sekaligus, dan
invoice itu dapat **link publik** yang bisa diakses/dibayar TANPA LOGIN
— terintegrasi dengan alur konfirmasi pembayaran yang sudah ada
(Fase 16). Referensi diminta: InvoicePlane (invoiceplane.com) — homepage
& README publik ternyata TIDAK cukup detail soal layout/mekanisme link
publik (dikonfirmasi lewat fetch langsung, cuma bullet fitur marketing).
User mengarahkan riset ke `/Users/webane/sites/jalajogja` sebagai
gantinya — repo sibling dengan invoice publik SUNGGUHAN di production
(customer anonim toko online, bertahun-tahun berjalan):
`app/(public)/[tenant]/invoice/[id]/page.tsx` (akses langsung pakai
`invoice.id` UUID, TANPA token terpisah, `generateMetadata` set
`robots: noindex`) + `app/api/invoice/proof-upload/route.ts` (upload
bukti TANPA auth, guard cuma "invoice ada & status belum
paid/cancelled").

Ini keputusan yang PERLU ADR sendiri (bukan cuma catatan di
`architecture-invoice.md`) karena secara eksplisit **memperluas** batas
yang ditetapkan ADR-0022 ("Facport customers are always logged in,
BEDA dari jalajogja") — bukan supersede, tapi menambah 1 jalur BARU
untuk kasus yang ADR-0022 belum cover: invoice yang DIBUAT ADMIN untuk
seseorang yang belum tentu mau/sudah punya akun Facport (mis. kontrak
korporat, transfer manual di luar sistem, klien yang cuma perlu bayar
1x tanpa perlu login rutin).

## Decision
1. **Admin bisa bikin invoice untuk USER EXISTING** — endpoint baru
   `POST /admin/invoices` `{userId, planIds: uuid[]}`, permission BARU
   `invoices.manage` (terpisah dari `invoices.view` yang sudah ada,
   konsisten pola `orders.manage`/`subscriptions.manage`). Reuse
   `createInvoiceAndOrder()` (`lib/invoice-order.ts`, Fase 18) di dalam
   `db.transaction()` — SUDAH mendukung multi-plan (`planRows: PlanRow[]`)
   sejak awal, tidak perlu diubah.
2. **SETIAP order (invoice manapun — checkout self-service, admin
   create-user, ATAU admin create-invoice baru ini) dapat link publik**:
   `{APP_URL}/pay/{orderId}` — order dipilih sebagai anchor (bukan
   invoice) karena order yang punya alur pembayaran (pilih metode,
   upload bukti), konsisten dengan `/billing/[orderId]/pay` yang sudah
   ada untuk customer login.
3. **`order.id` (UUID random) dipakai LANGSUNG sebagai identifier link
   publik** — TIDAK ada kolom token terpisah. Diputuskan berdasarkan
   presedan nyata `jalajogja` (production, storefront anonim bertahun-
   tahun, pola identik). UUID v4 (122 bit acak) tidak feasible ditebak
   brute-force — menambah kolom token terpisah cuma menambah 1
   identifier lagi untuk hal yang sama tanpa manfaat keamanan berarti.
4. **Endpoint publik baru, prefix `/public`, TANPA `auth:true`**:
   `GET /public/orders/:id`, `PATCH /public/orders/:id/method`,
   `PATCH /public/orders/:id/proof`, `GET /public/orders/:id/qris` — guard
   lewat **keberadaan order + status** (bukan ownership user — tidak ada
   sesi login), SAMA PERSIS guard status yang sudah ada di versi
   customer-login (order `paid`/`rejected`/`cancelled`/`expired` menolak
   perubahan). Response `GET /public/orders/:id` di-filter field SAMA
   ketatnya dengan versi login (§ security review Fase 16 — TIDAK
   expose `confirmedBy`/`rejectedBy` internal admin id).
5. **Bucket bukti pembayaran TETAP PRIVAT** (`facport-payment-proofs`,
   presigned URL admin-only, § ADR-0022) — BEDA SENGAJA dari jalajogja
   yang pakai bucket publik. Endpoint publik upload ke bucket privat
   YANG SAMA seperti jalur login, cuma otentikasinya beda (keberadaan
   order, bukan session) — TIDAK melonggarkan keamanan storage.
6. **Rate limit WAJIB** di seluruh prefix `/public/orders` (§
   `architecture-security.md` §7, pola `rate-limit.ts` yang sudah ada)
   — cegah abuse (spam upload gambar, enumerasi order ID via brute-force
   berulang meski secara matematis tidak feasible, tetap best-practice
   defense-in-depth).
7. **Jalur login (`/billing`, `/billing/[orderId]/pay`) TIDAK berubah**
   — link publik TAMBAHAN, bukan pengganti. Kedua jalur berujung ke
   ROW `orders` yang sama, status yang sama, konsisten otomatis (tidak
   ada 2 sumber kebenaran).
8. **Halaman publik ditaruh di surface `landing`** (`apps/web/app/landing/pay/[orderId]/page.tsx`)
   — satu-satunya surface tanpa auth guard di `proxy.ts` (admin/app
   selalu redirect ke `/login` kalau tidak ada session cookie).
   `generateMetadata` set `robots: {index:false, follow:false}` (pola
   jalajogja) — bukan halaman yang boleh ter-index mesin pencari.

## Alternatif yang Dipertimbangkan
- **Token publik terpisah (`orders.publicToken`, random string BEDA
  dari `id`)** — ditolak untuk sekarang: presedan produksi nyata
  (jalajogja) pakai UUID langsung tanpa insiden bertahun-tahun, kolom
  tambahan cuma nambah kompleksitas (2 identifier untuk 1 entity) tanpa
  manfaat keamanan signifikan di atas UUID v4 yang sudah cryptographically
  random. **Bisa direvisit** kalau nanti butuh kemampuan "cabut akses
  link tanpa ubah order" (UUID `id` tidak bisa di-rotate tanpa ganti PK).
- **Requireed login walau utk invoice buatan admin** — ditolak, itu
  PERSIS masalah yang mau diselesaikan (klien korporat/kontrak manual
  belum tentu mau/sempat bikin akun cuma buat bayar 1 invoice).
- **Bucket publik untuk bukti pembayaran** (ikut pola jalajogja apa
  adanya) — ditolak, Facport SUDAH punya keputusan sadar (ADR-0022)
  bukti pembayaran adalah dokumen finansial sensitif, presigned URL
  admin-only tetap yang benar untuk konteks Facport (B2B SaaS finance,
  beda profil risiko dari toko online retail).

## Konsekuensi
- Permission baru `invoices.manage` perlu ditambah `seed.ts` + di-grant
  role `admin`.
- `docs/architecture/architecture-invoice.md` & `architecture-payment.md`
  perlu update (endpoint publik baru, alur admin create-invoice).
- Endpoint publik adalah SURFACE BARU tanpa autentikasi — WAJIB security
  review lewat subagent `security-auditor` (bukan self-review), fokus:
  tidak ada field sensitif bocor, guard status konsisten dengan versi
  login, rate limit benar-benar aktif.
- Halaman pay publik & versi login (`/billing/[orderId]/pay`) berpotensi
  duplikasi UI — pertimbangkan ekstrak komponen bersama saat eksekusi
  (keputusan detail di phase doc, bukan didikte di ADR ini).
