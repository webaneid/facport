# Architecture — Payment Manual (Transfer Bank + QRIS)

> Untuk langganan/pembayaran penggunaan Facport sendiri (SaaS billing) —
> BUKAN bagian dari alur impor data ke Accurate Online (itu murni API
> integration, lihat `architecture-accurate-integration.md`). Terhubung ke
> model langganan → `docs/architecture/architecture-subscription.md`
> (`subscriptions.orderId`, `subscriptions.invoiceItemId`) dan invoice →
> `docs/architecture/architecture-invoice.md`.
>
> Rasional keputusan lengkap (kenapa manual, bukan Ipaymu/Xendit) →
> `docs/decisions/adr-0022-payment-manual-qris-transfer.md` — DIBUAT
> setelah riset ke aplikasi sibling terbukti production (`jalajogja`)
> menemukan payment gateway otomatis TIDAK PERNAH benar-benar
> diimplementasikan di sana (cuma form pengaturan kosong), sementara pola
> manual (transfer + QRIS + verifikasi admin) TERBUKTI jalan bertahun-tahun.

## Kenapa Manual, Bukan Gateway Otomatis
- **Tidak ada dependency approval pihak ketiga** — bisa terima pembayaran
  pertama SEGERA, tanpa nunggu proses pendaftaran/verifikasi akun
  Ipaymu/Xendit/Midtrans (bisa makan waktu berhari-hari).
- **Tidak ada biaya transaksi per-pembayaran ke provider** — cuma admin
  time untuk verifikasi manual.
- **QRIS dinamis via manipulasi EMV lokal** (§ di bawah) tetap kasih UX
  scan-QR modern ke customer, TANPA perlu daftar QRIS-acquirer/gateway
  apa pun — cukup 1 foto QRIS statis yang perusahaan SUDAH punya dari
  bank mereka.
- **Trade-off yang diterima sadar**: verifikasi 100% bergantung
  ketelitian admin baca bukti upload, tidak ada anti-fraud otomatis dari
  gateway. Diterima karena volume transaksi awal Facport kecil, dan admin
  yang sama sudah memverifikasi banyak hal manual lainnya (assign
  subscription, dst).

## Alur Standar
```
Customer → pilih 1+ sub-modul (cart) → POST /subscriptions/checkout
  { planIds: uuid[] }
  → API: buat invoice (N invoiceItems, snapshot harga) + 1 order
    (status "pending", kode unik di-generate, method BELUM dipilih)
  → return { invoiceId, orderId, amountDue: total + uniqueCode }

Customer → pilih metode (transfer bank ATAU QRIS) → lihat instruksi
  pembayaran (nomor rekening ATAU QR code, amountDue SUDAH termasuk
  kode unik) → transfer/scan di luar aplikasi
  → upload foto bukti + isi payerNote/transferDate
  → PATCH /orders/:id/proof → order.status "submitted"

Admin → buka antrian "Konfirmasi Pembayaran" (order status="submitted")
  → lihat bukti (presigned URL, § "Bucket Bukti Pembayaran" di bawah)
  → POST /admin/orders/:id/confirm (cocok) ATAU
    POST /admin/orders/:id/reject (tidak cocok, alasan wajib diisi)
  → confirm: invoice.status="paid", order.status="paid", confirmedAt/By
    diisi, LOOP semua invoiceItems → buat 1 subscriptions row PER item
    (status="active", startAt=now, endAt=now+plan.durationDays,
    invoiceItemId=item.id, orderId=order.id) — SEMUA di dalam 1
    db.transaction() dengan row lock (§ "Konkurensi" di bawah)
  → reject: order.status="rejected", rejectionNote diisi, customer bisa
    submit ulang bukti (PATCH /orders/:id/proof lagi, order kembali ke
    "submitted")
```

## Skema Database
```ts
// apps/api/src/db/schema/payment.schema.ts — orders DIROMBAK TOTAL dari
// bentuk lama (externalId/rawWebhookPayload, era rencana gateway)
export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id), // 1 invoice = 1 order (order dibuat BARENG invoice saat checkout)
  method: varchar("method", { length: 20 }), // "bank_transfer" | "qris" — NULLABLE, dipilih customer BELAKANGAN (bukan saat checkout)
  // § kode unik ditambahkan ke invoice.total agar admin bisa cocokkan
  // mutasi bank ke invoice yang tepat TANPA API cek-mutasi otomatis.
  // Contoh: total Rp150.000 + kode 234 → customer transfer PERSIS Rp150.234.
  uniqueCode: integer("unique_code").notNull().default(0),
  bankAccountRef: varchar("bank_account_ref", { length: 50 }), // id dari settings.company.bankAccounts[]
  qrisAccountRef: varchar("qris_account_ref", { length: 50 }), // id dari settings.company.qrisAccounts[]
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  // "pending" (baru dibuat, belum pilih metode/upload bukti) |
  // "submitted" (customer sudah upload bukti, menunggu admin) |
  // "paid" (admin verifikasi ✅) | "rejected" (admin tolak, bisa retry) |
  // "cancelled" | "expired" (invoice lewat dueDate belum dibayar, § job)
  transferDate: timestamp("transfer_date", { withTimezone: true }), // tanggal customer klaim transfer
  proofUrl: text("proof_url"), // MinIO key (BUKAN URL publik) di bucket privat, § di bawah
  payerNote: text("payer_note"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  confirmedBy: text("confirmed_by").references(() => user.id),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  rejectedBy: text("rejected_by").references(() => user.id),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  rejectionNote: text("rejection_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
```
**Amount TIDAK disimpan di `orders`** (beda dari skema lama) — jumlah
tagihan sepenuhnya milik `invoices.total`, `orders` cuma nambah
`uniqueCode` di atasnya. `amountDue` (nilai yang HARUS customer transfer
persis) dihitung `invoice.total + order.uniqueCode`, tidak disimpan
redundan.

## Nomor Invoice — Sequence Atomik (Ganti Pola `COUNT`, § Fase 15 Known Limitation)
Fase 15 pakai `COUNT(*) LIKE 'INV/...%'` untuk generate nomor invoice —
sudah didokumentasikan sebagai rawan race condition di bawah checkout
concurrent. Fase 16 mengganti dengan **tabel sequence dedicated + row
lock**, pola yang terbukti dipakai jalajogja (`financial_sequences` →
`generateFinancialNumber`, `SELECT ... FOR UPDATE` di dalam
`db.transaction()` sebelum increment):
```ts
export const invoiceSequences = pgTable("invoice_sequences", {
  id: uuid("id").defaultRandom().primaryKey(),
  year: smallint("year").notNull(),
  month: smallint("month").notNull(), // 1-12
  lastNumber: integer("last_number").notNull().default(0),
}, (t) => ({ uniq: unique().on(t.year, t.month) }));
```
`generateInvoiceNumber(tx?, now?)` sekarang: `INSERT ... ON CONFLICT DO
UPDATE SET lastNumber = lastNumber + 1 RETURNING lastNumber` — 1
statement atomik, tidak perlu `SELECT ... FOR UPDATE` terpisah — baris
`(year, month)` bulan berjalan → increment → format
`INV/{year}/{month}/{lastNumber padded 4 digit}`. Race condition Fase 15
(2 invoice nomor sama) TIDAK BISA TERJADI LAGI — atomicity di level row
Postgres, bukan cuma di level aplikasi, jadi aman dipanggil dari koneksi
manapun. **`tx` opsional** (default modul-level `db`) — satu-satunya
caller (`createInvoiceAndOrder`, § Fase 18) SELALU oper `tx`-nya sendiri
supaya alokasi nomor ini jadi bagian transaction YANG SAMA dengan insert
invoice-nya (kalau tidak, rollback transaction pembungkus akan
"membakar"/melewati 1 nomor invoice secara permanen — gap penomoran,
bukan duplikat, tapi tetap tidak rapi).

## QRIS Dinamis — Manipulasi EMV Lokal (TANPA API Gateway)
Adaptasi dari `qris-emv.ts` (jalajogja, TERBUKTI production) — format
EMV QRIS Indonesia adalah TLV (Tag-Length-Value) berbasis teks, BUKAN
biner:
```ts
// apps/api/src/lib/qris-emv.ts
export function buildDynamicQris(staticPayload: string, amount: number, reference: string): string {
  // 1. Strip CRC lama (tag 63, 4 hex char di akhir)
  // 2. Parse semua TLV lain (tag 2 digit + length 2 digit desimal + value)
  // 3. Tag 01 (Point of Initiation Method): "11" (statis) → "12" (dinamis)
  // 4. Tag 54 (Transaction Amount): override/inject dengan `amount`
  // 5. Tag 62 sub-tag 05 (Additional Data — Reference Label): inject `reference`
  // 6. Rebuild payload, hitung ulang CRC16-CCITT, append
}
```
**Guard keras**: kalau payload admin TIDAK punya Tag 53 (Currency) MAUPUN
Tag 54 (Amount) sama sekali, `buildDynamicQris()` **`throw`** (BUKAN
lolos diam-diam) — payload malformed/salah salin sebelumnya bisa
lolos jadi QR "dinamis" TANPA nominal ter-inject, customer diam-diam
diminta ketik manual tanpa tahu (§ security review 2026-09-04, Medium).
Caller (`lib/order-payment.ts` `buildQrisResult()`, § di bawah) sudah
`try/catch` → response `502 QRIS_GENERATION_FAILED`.

**Payload EMV dibaca OTOMATIS dari foto QRIS yang diupload** (§ Fase 42,
2026-09-06) — `apps/api/src/lib/qris-decode.ts` (`sharp().ensureAlpha().raw()`
+ `jsQR`) decode barcode-nya begitu admin upload, TIDAK perlu admin
scan/decode manual pakai alat eksternal lagi (§ fallback kalau decode
gagal, lihat paragraf di bawah). Saat checkout, sistem generate QR
**baru** dengan nominal terkunci ke `amountDue` via
`buildDynamicQris()`, dirender jadi image via library `qrcode`
(`QRCode.toDataURL()` — TIDAK perlu simpan file, cukup data URL
langsung dikirim ke response/ditampilkan `<img>`). Kedua langkah
(`buildDynamicQris()` + `generateQrDataUrl()`) dipanggil lewat 1 helper
bersama, `lib/order-payment.ts` `buildQrisResult()` — dipakai KEDUA
jalur (`/orders/:id/qris` login DAN `/public/orders/:id/qris` publik,
§ "Link Pembayaran Publik" di bawah), supaya logic-nya SATU tempat.

**Kalau payload EMV tidak berhasil didapat sama sekali** (auto-decode
gagal DAN admin tidak isi manual) — fallback **statis**: tampilkan foto
asli apa adanya,
customer scan lalu **ketik manual** nominal `amountDue` (termasuk kode
unik) di aplikasi e-wallet/m-banking mereka sendiri. Ini KURANG ideal
(rawan customer salah ketik nominal, kode unik jadi tidak berfungsi) tapi
tetap FUNGSIONAL — dicatat sebagai preferensi kuat "admin sebaiknya isi
payload EMV", bukan hard requirement.

## Bucket Bukti Pembayaran — PRIVAT, Presigned URL (Beda dari ADR-0017)
Foto bukti transfer adalah **dokumen finansial customer** — TIDAK BOLEH
disimpan di bucket public (`facport-public`, ADR-0017, dipakai
logo/favicon) yang bisa diakses siapa pun lewat URL langsung. Bucket BARU
`facport-payment-proofs` (private, TANPA public-read policy):
```ts
// apps/api/src/lib/minio.ts — tambahan
export const PAYMENT_PROOF_BUCKET = "facport-payment-proofs";
export async function ensurePaymentProofBucket() {
  const exists = await minioClient.bucketExists(PAYMENT_PROOF_BUCKET).catch(() => false);
  if (!exists) await minioClient.makeBucket(PAYMENT_PROOF_BUCKET);
  // TIDAK ada setBucketPolicy public — default private (beda dari ensurePublicBucket)
}
```
`orders.proofUrl` menyimpan **MinIO object key** (bukan URL utuh). Saat
admin buka detail order untuk verifikasi, server generate **presigned
GET URL** (expiry pendek — 10 menit cukup untuk 1 sesi review) on-demand,
BUKAN disimpan permanen. Ini menyelesaikan gap "private media belum bisa
disajikan" (§ `architecture-storage.md`, terbuka sejak Fase 00) KHUSUS
untuk kategori ini — kategori privat lain (`facport-media` umum) TETAP
terbuka, di luar scope.

> ⚠️ **BUG DITEMUKAN & DIPERBAIKI (Fase 93, 2026-09-10)** — paragraf di
> atas SEBELUMNYA salah sebut `minioClient.presignedGetObject(...)`.
> `minioClient` dikonfigurasi pakai `MINIO_ENDPOINT` **INTERNAL** (nama
> service Docker `minio` di production) — presigned URL yang dihasilkan
> TIDAK PERNAH bisa dibuka browser admin (host itu tidak ada di luar
> jaringan Docker), persis laporan user *"tempat saya gk bisa dibuka
> bukti transfernya"*. Diperbaiki dengan client TERPISAH
> `minioPublicClient` (`apps/api/src/lib/minio.ts`), dikonfigurasi dari
> `MINIO_PUBLIC_URL` (host publik lewat reverse proxy nginx, SUDAH ada
> & dipakai bucket `facport-public`, cuma belum pernah dipakai untuk
> bucket privat ini). **Kenapa aman**: `presignedGetObject` TIDAK PERNAH
> benar-benar connect ke endpoint yang dikonfigurasi — signature-nya
> dihitung SECARA LOKAL (murni kriptografi berdasar access/secret key +
> path/expiry), jadi generate presigned URL pakai host PUBLIK aman
> walau server API ini sendiri tidak pernah terhubung balik ke situ.
> **Kenapa tidak ketahuan dari dev lokal**: `.env` dev punya
> `MINIO_PUBLIC_URL` SAMA PERSIS dengan `MINIO_ENDPOINT`
> (`http://localhost:9000` keduanya) — cuma di production/staging (yang
> benar-benar punya reverse proxy terpisah, `MINIO_ENDPOINT=minio` vs
> `MINIO_PUBLIC_URL=https://media.<domain>`) bug ini muncul. Detail
> lengkap → `docs/phases/phase-93-fix-bukti-transfer-tidak-bisa-dibuka.md`.

## Link Pembayaran Publik (Tanpa Login) — ADR-0025
Selain jalur customer login (`/billing/[orderId]/pay`, di atas), SETIAP
order punya link publik: `{APP_URL}/pay/{orderId}` — bisa diakses TANPA
sesi login sama sekali. Dipakai terutama untuk invoice yang DIBUAT ADMIN
untuk user existing (§ `architecture-invoice.md` § "Admin Membuat
Invoice") — klien korporat/kontrak manual belum tentu mau/sempat bikin
akun cuma untuk bayar 1 invoice.

**`order.id` (UUID random) dipakai LANGSUNG sebagai identifier link** —
TIDAK ada kolom token terpisah (§ ADR-0025 § Decision 3, presedan
`jalajogja` production). Endpoint publik (prefix `/public`, TANPA
`auth: true`):
```
GET   /public/orders/:id            → detail order (field di-filter SAMA
                                       ketatnya dengan versi login — TIDAK
                                       ada confirmedBy/rejectedBy)
PATCH /public/orders/:id/method     → pilih metode bayar
PATCH /public/orders/:id/proof      → upload bukti (bucket privat SAMA,
                                       § "Bucket Bukti Pembayaran" di atas
                                       — TIDAK berubah jadi publik)
GET   /public/orders/:id/qris       → QR dinamis (kalau method="qris")
```
Guard SEMUA endpoint ini: **keberadaan order + status** (bukan ownership
user — tidak ada sesi) — order `paid`/`rejected`/`cancelled`/`expired`
menolak perubahan, identik guard versi login. **Rate limit WAJIB** di
seluruh prefix `/public/orders` (`rateLimitPlugin`, § `architecture-security.md`
§7) — endpoint publik tanpa auth adalah target abuse paling mudah.

Halaman publik (`apps/web/app/landing/pay/[orderId]/page.tsx`) ditaruh
di surface `landing` (satu-satunya surface tanpa auth guard di
`proxy.ts`), `generateMetadata` set `robots: {index:false, follow:false}`
(pola jalajogja — dokumen finansial personal, jangan ter-index mesin
pencari).

## Konkurensi — Row Lock WAJIB di Konfirmasi Admin
Pelajaran langsung dari bug produksi jalajogja (invoice nyangkut karena
guard status tidak di-recheck setelah lock): **setiap transisi status
order/invoice WAJIB terjadi di dalam `db.transaction()` dengan `SELECT
... FOR UPDATE` pada BAIK `orders` MAUPUN `invoices` SEBELUM update**,
dan guard (`status === "submitted"`, dst) **WAJIB dicek ULANG setelah
lock diperoleh** — bukan cuma sebelum transaction dimulai (pre-check di
luar transaction boleh ada untuk UX cepat, tapi BUKAN jaminan
korektnes):
```ts
await db.transaction(async (tx) => {
  const [lockedOrder] = await tx.select().from(orders)
    .where(sql`${orders.id} = ${orderId} FOR UPDATE`).limit(1);
  if (!lockedOrder || lockedOrder.status !== "submitted") {
    throw new Error("Order sudah diproses (mungkin baru saja dikonfirmasi/ditolak)");
  }
  // ... update order + invoice + insert subscriptions, SEMUA di dalam tx yang sama
});
```
Ini mencegah race: 2 admin klik "Konfirmasi" bersamaan pada order yang
sama, atau admin klik "Tolak" tepat saat proses "Konfirmasi" lain sedang
jalan.

## Idempotency — Tidak Ada Retry Otomatis (Beda dari Webhook)
Karena TIDAK ADA webhook/provider eksternal yang bisa kirim notifikasi
berkali-kali, idempotency di sini murni soal **klik ganda admin** —
diselesaikan oleh row lock + guard status di atas (klik kedua pada order
yang statusnya sudah bukan `"submitted"` lagi otomatis ditolak dengan
pesan jelas).

## Env
**TIDAK ADA env var provider payment gateway apa pun** (`IPAYMU_*`/
`XENDIT_*` di `.env.example` — DIHAPUS, tidak pernah dipakai). Semua
konfigurasi (rekening bank, QRIS) disimpan di `settings` (DB), diatur
lewat halaman admin — bukan environment variable server.

## Referensi
- Riset pembanding lengkap (jalajogja, kode nyata terverifikasi manual)
  → `docs/decisions/adr-0022-payment-manual-qris-transfer.md`
- Detail eksekusi → `docs/phases/phase-16-payment-manual.md`
- Auto-decode payload EMV dari foto QRIS → `docs/phases/phase-42-qris-auto-decode.md`
- Aktivasi langganan setelah bayar → `docs/architecture/architecture-subscription.md`
- Model invoice/PDF → `docs/architecture/architecture-invoice.md`
- Notifikasi konfirmasi/tolak ke user → `docs/architecture/architecture-notifications.md`
- Audit log perubahan status order → `docs/architecture/architecture-security.md` §11
