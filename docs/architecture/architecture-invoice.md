# Architecture — Invoice (Dokumen Bisnis + PDF)

> Rasional keputusan → `docs/decisions/adr-0021-invoice-schema-dan-pdf-generator.md`.
> File ini pelengkap teknis (skema, generator PDF, endpoint). Terhubung ke
> `architecture-subscription.md` (`subscriptions.invoiceItemId` → 1 baris
> invoice yang membuat subscription itu) dan `architecture-payment.md`
> (Fase 16 — `orders.invoiceId`, 1 invoice dibayar lewat 1 order).

## Prinsip
Invoice = **dokumen bisnis**, terpisah dari `orders` (= **catatan
transaksi pembayaran**, Fase 16). Invoice bisa ada TANPA order sama
sekali (jalur admin "Tandai Sudah Dibayar Manual", Fase 18) — jangan
gabungkan keduanya jadi 1 tabel.

## Skema Database
```ts
// apps/api/src/db/schema/invoice.schema.ts
export const invoices = pgTable("invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceNumber: varchar("invoice_number", { length: 30 }).notNull().unique(), // "INV/2026/09/0001"
  userId: text("user_id").references(() => user.id).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("unpaid"), // "unpaid" | "paid" | "void" | "expired"
  billToName: varchar("bill_to_name", { length: 200 }).notNull(), // SNAPSHOT nama user saat invoice dibuat
  billToAddress: text("bill_to_address"), // SNAPSHOT, nullable (user boleh belum isi alamat)
  subtotal: integer("subtotal").notNull(), // Rupiah, integer — jumlah semua invoiceItems.price
  total: integer("total").notNull(), // = subtotal fase ini (kolom disiapkan utk pajak/diskon nanti, TIDAK dipakai sekarang)
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }), // diisi Fase 16 (webhook payment sukses) atau Fase 18 (admin tandai manual)
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const invoiceItems = pgTable("invoice_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id").references(() => invoices.id, { onDelete: "cascade" }).notNull(),
  planId: uuid("plan_id").references(() => plans.id).notNull(), // 1 baris = 1 SKU sub-modul yang dibeli
  moduleKey: varchar("module_key", { length: 50 }).notNull(), // denormalisasi dari plan.modules[0] saat invoice dibuat
  label: varchar("label", { length: 200 }).notNull(), // SNAPSHOT plan.name saat invoice dibuat
  price: integer("price").notNull(), // SNAPSHOT plan.price saat invoice dibuat — plan.price masa depan TIDAK mempengaruhi invoice lama
});
```

**`subscriptions` (`subscription.schema.ts`) dapat kolom baru**:
```ts
invoiceItemId: uuid("invoice_item_id").references(() => invoiceItems.id), // nullable — subscription bisa dibuat TANPA invoice (Fase 18 manual)
```

## Kenapa SEMUA Field Penting di `invoiceItems` Snapshot, Bukan Join Live
`label` dan `price` disalin dari `plans` PERSIS saat invoice dibuat, BUKAN
di-`JOIN` live ke tabel `plans` tiap kali invoice dibaca/di-PDF-kan. Admin
BOLEH ganti harga plan kapan saja (§ `architecture-subscription.md`) —
invoice yang SUDAH diterbitkan harus tetap menampilkan harga yang
BENAR-BENAR ditagihkan saat itu, bukan harga plan yang berlaku sekarang.
Ini prinsip standar akuntansi (dokumen historis immutable), bukan
preferensi implementasi.

## Nomor Invoice — Format & Keunikan
Format `INV/{YYYY}/{MM}/{urutan 4 digit, reset tiap bulan}` (mis.
`INV/2026/09/0001`). **Fase 15 ini generate nomor lewat query `COUNT`
sederhana** (hitung invoice bulan berjalan + 1) di dalam transaksi DB yang
sama dengan `INSERT` — cukup untuk fase ini karena BELUM ada jalur
otomatis yang benar-benar membuat invoice (checkout = Fase 16-17, volume
insert nyata masih nol). **Fase 16-17 WAJIB revisit kalau checkout jadi
concurrent** (2 user checkout bersamaan di detik yang sama) — pola
`COUNT`-lalu-`INSERT` rawan race condition (2 invoice dapat nomor yang
sama) tanpa `SELECT ... FOR UPDATE`/advisory lock/sequence terpisah per
bulan. Dicatat sebagai Known Limitation Fase 15, BUKAN diselesaikan
sekarang (di luar scope — belum ada trafik nyata yang memicunya).

## PDF Generator — `@react-pdf/renderer`
```ts
// apps/api/src/lib/invoice-pdf.tsx
import { renderToBuffer } from "@react-pdf/renderer";

export async function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument {...data} />);
}
```
- **Server-side murni, tanpa browser/Chromium** (§ ADR-0021) — komponen
  React di-compile langsung jadi PDF, bukan render HTML lalu screenshot.
- **Logo company** (`company.logo`, § `architecture-settings.md`) sudah
  berupa URL publik (bucket `facport-public`, § ADR-0017), TAPI SELALU
  `.webp` (re-encode paksa di `admin/branding.route.ts`) dan
  **`@react-pdf/image` TIDAK BISA decode webp** (§ Fase 104,
  2026-09-11 — sama persis masalah bukti transfer di bawah). Handler
  `GET /invoices/:id/pdf` WAJIB `fetch()` URL logo lalu convert ke PNG
  (`getCompanyLogoAsPng()`, `sharp(buffer).png().toBuffer()`) SEBELUM
  diserahkan ke `generateInvoicePdf()` sebagai `logoImage: Buffer | null`
  (top-level, sejajar `proofImage` — BUKAN lagi field `company.logoUrl`
  string). Kegagalan fetch/decode di-`try/catch`, TIDAK menggagalkan PDF
  — fallback ke `<Text>{company.name}</Text>` (logo GANTIKAN nama teks
  di header, bukan tampil berdampingan — beda dari header dashboard §
  `architecture-app-dashboard.md` yang tetap render logo tanpa fallback
  nama karena selalu ada `alt` text browser).
- **Urutan section PDF (§ Fase 104)**: Header (logo/nama+info invoice) →
  Ditagihkan Kepada → Status Pembayaran → Detail Invoice (tabel item +
  total) → Bukti Transfer → Footer (instruksi pembayaran, kondisional).
  Bukti Transfer SEBELUMNYA menyatu dengan Status Pembayaran di ATAS
  tabel (sejak Fase 94) — dipindah ke bawah tabel+total atas permintaan
  user, supaya alur baca invoice logis dulu (status → rincian tagihan)
  baru bukti pembayarannya.
- **TIDAK disimpan ke MinIO/disk** — di-generate ulang tiap request `GET
  /invoices/:id/pdf` (§ ADR-0021 — data snapshot/immutable, regenerasi
  selalu identik secara konten).
- `apps/api/tsconfig.json` dapat `"jsx": "react-jsx"` — SATU-SATUNYA
  pemakai JSX di backend ini, dibatasi ke file `.tsx` saja.
- **§ Fase 94 (2026-09-10) — Status pembayaran + bukti transfer DI DALAM
  PDF**: `InvoicePdfData` punya `invoiceStatus` (selalu ada, § coarse
  `invoices.status`), `orderStatus` (nullable, § granular `orders.status`
  — dipakai kalau order SUDAH ada, prioritas di atas `invoiceStatus`), dan
  `proofImage` (`Buffer | null`, PNG). Objek bukti transfer tersimpan
  SELALU `.webp` (§ `processProofImage`, `architecture-payment.md`) tapi
  `@react-pdf/image` **TIDAK BISA decode webp** (cuma PNG/JPEG) — handler
  `GET /invoices/:id/pdf` WAJIB convert webp→PNG dulu (`sharp`, fungsi
  `getProofImageAsPng` di `lib/order-payment.ts`) sebelum diserahkan ke
  `generateInvoicePdf()`. Kegagalan fetch/convert (mis. objek MinIO
  hilang) di-`try/catch`, TIDAK menggagalkan generate PDF keseluruhan —
  cuma di-log, PDF tetap jadi tanpa gambar bukti.
- Label/warna badge status di PDF **duplikat manual** dari
  `apps/web/lib/status-badges.tsx` (domain `"order"`/`"invoice"`) — apps/api
  tidak bisa import dari apps/web (app terpisah). Kalau label sumbernya
  berubah, update juga mapping di `invoice-pdf.tsx`.

## API
```
GET  /me/invoices                → riwayat invoice caller SAJA (auth: true, filter userId dari session)
GET  /admin/invoices             → SEMUA invoice, permission "invoices.view". § Fase 94: tiap
                                    baris ikut punya `orderStatus` (granular, null kalau belum
                                    ada order) dan `hasProof` (boolean) dari JOIN ke `orders` —
                                    dipakai dialog "Detail Invoice" (§ halaman admin di bawah).
POST /admin/invoices             → { userId, planIds: uuid[] } — buat invoice BARU untuk user
                                    EXISTING (§ "Admin Membuat Invoice" di bawah), permission
                                    "invoices.manage" (BARU, ADR-0025 — terpisah dari
                                    "invoices.view" yang cuma baca)
GET  /invoices/:id/pdf           → binary PDF (Content-Type: application/pdf).
                                    Ownership: invoice.userId === caller ATAU caller
                                    punya permission "invoices.view" (admin) — SELAIN itu 404
                                    (bukan 403 — hindari konfirmasi "invoice ID ini valid milik
                                    orang lain", pola sama endpoint ownership lain di project ini).
                                    § Fase 94: ownership check ini terjadi SEBELUM fetch bukti
                                    transfer untuk PDF — bukti transfer TIDAK PERNAH ter-embed
                                    untuk caller yang gagal ownership check.
```

## Halaman Admin `/admin/invoices` — Dialog "Detail Invoice" (§ Fase 94)
Sebelumnya halaman ini TIDAK punya cara lihat isi invoice (item yang
dibeli) maupun bukti transfer sama sekali. Sekarang kolom Aksi punya icon
mata ("Lihat Detail") yang buka dialog berisi: nama penagih, daftar item
+ harga, badge status pembayaran (`orderStatus` kalau ada — fallback
`status` invoice kalau belum ada order sama sekali), dan — kalau
`hasProof` true — tombol icon **Banknote** ("Lihat Bukti Transfer", BUKAN
icon mata lagi, sengaja dibedakan dari icon mata detail supaya 2 aksi
beda tidak tertukar makna) yang fetch `GET /admin/orders/:id/proof-url`
(endpoint existing, di-reuse, § `architecture-payment.md`). Endpoint itu
digate permission **`orders.manage`** (beda dari `invoices.view` yang
menggate halaman ini) — kalau ada role custom yang punya `invoices.view`
tanpa `orders.manage`, tombolnya tetap kelihatan tapi klik akan gagal
(ditangani graceful via toast, bukan kebocoran data) — § Known Limitations
`docs/phases/phase-94-invoice-detail-status-bukti-transfer.md`.

## Admin Membuat Invoice untuk User Existing — ADR-0025
Sebelumnya invoice CUMA tercipta otomatis sebagai efek samping: checkout
self-service (Fase 16) atau admin bikin USER BARU sekaligus pilih paket
(Fase 18, `POST /admin/users`). **ADR-0025** menambah jalur ketiga: admin
pilih 1 user YANG SUDAH ADA + 1 atau lebih paket, buat invoice kapan saja
setelah user itu terdaftar (mis. upsell paket tambahan, invoice ulang
kontrak tahunan).

`POST /admin/invoices` reuse **`createInvoiceAndOrder()`** (`lib/invoice-order.ts`,
diekstrak Fase 18) di dalam `db.transaction()` — helper ini SUDAH
mendukung multi-plan (`planRows: PlanRow[]`) sejak awal, TIDAK perlu
diubah. `billToName` diambil dari `user.name` (user sudah ada, beda dari
jalur Fase 18 "Kirim Invoice" yang ambil dari input form karena user
BARU dibuat bersamaan).

Invoice+order hasil endpoint ini otomatis dapat **link publik**
(`{APP_URL}/pay/{orderId}`, § `architecture-payment.md` § "Link
Pembayaran Publik") — admin bisa kirim link itu ke klien tanpa klien
perlu login, SEKALIGUS klien yang PUNYA akun tetap bisa lihat/bayar
invoice yang sama lewat `/billing` setelah login (2 jalur, 1 order, 1
status — tidak ada duplikasi sumber kebenaran).

## Company Settings Tambahan (Group `billing`)
Lihat `architecture-settings.md` § "Field Group `billing`" — `company.taxId`,
`company.phone`, `company.email`, `company.bankAccount`, dipakai footer PDF
("Instruksi Pembayaran"). Skema `settings` key-value SUDAH ADA, TIDAK
perlu migration baru untuk field ini.

## Referensi
- ADR: `docs/decisions/adr-0021-invoice-schema-dan-pdf-generator.md`
- Model sub-modul (dasar 1 invoiceItem = 1 sub-modul) → ADR-0019,
  `architecture-subscription.md`
- Payment gateway (Fase 16, `orders.invoiceId`) → `architecture-payment.md`
- Detail eksekusi → `docs/phases/phase-15-invoice-profesional.md`
