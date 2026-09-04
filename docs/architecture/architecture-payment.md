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
`generateInvoiceNumber()` sekarang: `db.transaction()` → `SELECT ... FOR
UPDATE` (atau `INSERT ... ON CONFLICT DO UPDATE SET lastNumber =
lastNumber + 1 RETURNING lastNumber`, lebih ringkas — 1 statement atomik,
tidak perlu SELECT terpisah) baris `(year, month)` bulan berjalan →
increment → format `INV/{year}/{month}/{lastNumber padded 4 digit}`.
Race condition Fase 15 (2 invoice nomor sama) TIDAK BISA TERJADI LAGI —
lock/atomicity di level row Postgres, bukan cuma di level aplikasi.

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
Admin upload **1 foto QRIS statis** (dari bank/penyedia QRIS mereka,
gratis) via halaman settings, PLUS payload EMV string mentahnya (di-scan
dari QR itu sendiri via library decode QR, atau input manual kalau
decode gagal). Saat checkout, sistem generate QR **baru** dengan nominal
terkunci ke `amountDue` via `buildDynamicQris()`, dirender jadi image via
library `qrcode` (`QRCode.toDataURL()` — TIDAK perlu simpan file, cukup
data URL langsung dikirim ke response/ditampilkan `<img>`).

**Kalau admin cuma punya foto QRIS TANPA payload EMV** (tidak sempat/tidak
bisa di-decode) — fallback **statis**: tampilkan foto asli apa adanya,
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
GET URL** (`minioClient.presignedGetObject(bucket, key, expirySeconds)`,
expiry pendek — 10 menit cukup untuk 1 sesi review) on-demand, BUKAN
disimpan permanen. Ini menyelesaikan gap "private media belum bisa
disajikan" (§ `architecture-storage.md`, terbuka sejak Fase 00) KHUSUS
untuk kategori ini — kategori privat lain (`facport-media` umum) TETAP
terbuka, di luar scope.

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
- Aktivasi langganan setelah bayar → `docs/architecture/architecture-subscription.md`
- Model invoice/PDF → `docs/architecture/architecture-invoice.md`
- Notifikasi konfirmasi/tolak ke user → `docs/architecture/architecture-notifications.md`
- Audit log perubahan status order → `docs/architecture/architecture-security.md` §11
