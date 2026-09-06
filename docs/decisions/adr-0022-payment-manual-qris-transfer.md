# ADR-0022: Pembayaran Manual (Transfer Bank + QRIS Dinamis) — Ganti Rencana Payment Gateway Otomatis

**Status:** Accepted
**Tanggal:** 2026-09-04
**Supersedes:** Arah "Payment Gateway Ipaymu" di rencana awal Fase 16
(`docs/phases/phase-14-fondasi-langganan.md` § referensi plan file sesi,
`docs/architecture/architecture-payment.md` versi sebelum ADR ini) — TIDAK
ada ADR resmi sebelumnya untuk pilihan provider (baru sebatas draf
architecture doc "belum final"), jadi ini keputusan PERTAMA yang resmi
soal metode pembayaran Facport, bukan revisi dari keputusan final
sebelumnya.

## Context
Rencana awal (dibuat sebelum Fase 14 dimulai) mengasumsikan Facport akan
integrasi payment gateway otomatis (Ipaymu, dengan Xendit sebagai
kandidat kedua) — webhook, signature verification HMAC, redirect ke
halaman pembayaran provider.

User meminta riset ke repo sibling `/Users/webane/sites/jalajogja`
("Jalakarta") — aplikasi SaaS multi-tenant yang SUDAH production, dengan
klaim ada macam-macam payment gateway terbukti jalan di sana. Riset
(subagent, dikonfirmasi manual lewat pembacaan langsung kode) menemukan:

1. **Midtrans/Xendit/Ipaymu di jalajogja TIDAK PERNAH benar-benar
   diintegrasikan** — cuma ada form pengaturan tempat admin tenant bisa
   MENGETIK API key (`payment-settings-form.tsx`), disimpan di JSONB
   settings. **NOL** pemanggilan API keluar, NOL webhook handler, NOL
   dependency SDK gateway di `package.json` manapun. Enum
   `PAYMENT_METHODS` (`packages/db/src/schema/tenant/finance.ts:23`)
   menyertakan `"midtrans"|"xendit"|"ipaymu"` sebagai NILAI YANG VALID,
   tapi tidak ada satu baris kode pun yang benar-benar memanggil provider
   itu.
2. **Yang BENAR-BENAR terbukti jalan di production**: pembayaran MANUAL —
   customer transfer ke rekening bank ATAU scan QRIS (statis ATAU
   dinamis-nominal-terkunci via manipulasi EMV TLV lokal, TANPA API
   gateway apa pun), lalu upload foto bukti + isi info pengirim, admin
   verifikasi manual (approve → jurnal otomatis dibuat, atau reject →
   customer bisa retry). Ditemukan bug produksi nyata (2026-08-29,
   invoice nyangkut karena fungsi confirm/reject generik dipakai untuk
   payment bertipe invoice) dan sudah diperbaiki — pola matang, bukan
   prototipe.
3. Bahkan billing SUBSCRIPTION platform mereka sendiri (`tenants` →
   `tenantSubscriptions`, analog paling dekat dengan kebutuhan Facport
   nge-bill customer-nya sendiri) **manual** — staff aktivasi langsung,
   tanpa order/payment terhubung sama sekali.

## Decision
**Facport ganti rencana dari payment gateway otomatis (Ipaymu/Xendit) ke
pembayaran MANUAL**: transfer bank (dengan kode unik untuk pencocokan) +
QRIS (statis ATAU dinamis-nominal-terkunci, tanpa API gateway), diverifikasi
admin manual lewat bukti upload — mengadopsi pola yang TERBUKTI jalan di
jalajogja, disederhanakan sesuai kebutuhan Facport (bukan sistem akuntansi
umum multi-sumber-dana seperti jalajogja — Facport cuma punya 1 sumber uang
masuk: bayar invoice langganan).

1. **`orders` (skema `payment.schema.ts`) dirombak total** — dari bentuk
   generik "record transaksi gateway" (`externalId`, `rawWebhookPayload`)
   jadi representasi pembayaran manual 1:1 ke `invoices`:
   ```ts
   export const orders = pgTable("orders", {
     id: uuid("id").defaultRandom().primaryKey(),
     invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
     method: varchar("method", { length: 20 }).notNull(), // "bank_transfer" | "qris"
     uniqueCode: integer("unique_code").notNull().default(0),
     bankAccountRef: varchar("bank_account_ref", { length: 50 }), // id dari settings.company.bankAccounts[]
     qrisAccountRef: varchar("qris_account_ref", { length: 50 }), // id dari settings.company.qrisAccounts[]
     status: varchar("status", { length: 20 }).notNull().default("pending"),
     // "pending" | "submitted" | "paid" | "rejected" | "cancelled" | "expired"
     transferDate: timestamp("transfer_date", { withTimezone: true }),
     proofUrl: text("proof_url"),
     payerNote: text("payer_note"),
     submittedAt: timestamp("submitted_at", { withTimezone: true }),
     confirmedBy: text("confirmed_by").references(() => user.id),
     confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
     rejectedBy: text("rejected_by").references(() => user.id),
     rejectedAt: timestamp("rejected_at", { withTimezone: true }),
     rejectionNote: text("rejection_note"),
     createdAt/updatedAt,
   });
   ```
   **TIDAK polimorfik** (beda dari `payments` jalajogja yang punya
   `sourceType`/`sourceId` untuk donasi/event/dst) — Facport cuma punya 1
   jenis transaksi (bayar invoice langganan), jadi `invoiceId` FK
   langsung, bukan generik.
2. **Kode unik ditambahkan ke nominal transfer** (pola jalajogja) —
   `amountDue = invoice.total + order.uniqueCode` (mis. Rp150.000 + kode
   234 = customer transfer persis Rp150.234), memudahkan admin cocokkan
   mutasi bank ke invoice yang tepat TANPA API cek-mutasi otomatis.
3. **QRIS dinamis via manipulasi EMV TLV lokal** (adaptasi persis dari
   `qris-emv.ts` jalajogja) — admin upload SATU foto QRIS statis (dari
   bank/penyedia QRIS mereka, gratis, tanpa perlu daftar payment
   gateway), plus EMV payload string-nya (di-decode dari foto QRIS itu
   sendiri kalau memungkinkan, atau input manual). Sistem override Tag 54
   (nominal) + Tag 62 sub-tag 05 (reference) secara lokal, generate QR
   image baru via library `qrcode` — TANPA API/biaya provider gateway
   apa pun untuk fitur ini.
4. **Konfirmasi admin WAJIB row-level lock** (`SELECT ... FOR UPDATE`
   di dalam `db.transaction()`) pada `orders` DAN `invoices` sebelum
   update status — mencegah race condition (klik ganda, 2 admin proses
   submission yang sama bersamaan). Guard status WAJIB dicek ULANG di
   dalam transaction setelah lock (bukan cuma sebelum), persis lesson
   yang jalajogja catat dari bug produksi nyata mereka.
5. **Endpoint upload bukti (`POST /orders/:id/proof`) WAJIB `auth: true` +
   ownership check** (`invoice.userId === session.user.id`) — BEDA dari
   asumsi awal draf ADR ini (sempat disamakan keliru dengan pola
   "capability token tanpa auth" ala jalajogja). Koreksi: jalajogja perlu
   itu karena customer mereka BISA anonim/belum tentu login (storefront
   publik, link invoice dibagi lewat WhatsApp) — Facport TIDAK begitu,
   SEMUA customer yang checkout SUDAH login (`/subscriptions/checkout`
   sudah `auth: true` sejak awal). Pola yang benar & konsisten dengan
   fase-fase sebelumnya: `auth: true` session + ownership check by
   `invoice.userId`, PERSIS pola `GET /invoices/:id/pdf` (Fase 15) —
   bukan capability-token.
6. **Company settings baru** (group `billing`, key-value existing):
   `company.bankAccounts` (JSONB array terstruktur: `{id, bankName,
   accountNumber, accountName}[]`) dan `company.qrisAccounts` (JSONB
   array: `{id, name, imageUrl, isDynamic, emvPayload}[]`) — TERPISAH
   dari `company.bankAccount` (free-text tunggal, Fase 15, dipakai footer
   PDF invoice) yang TETAP ADA TIDAK BERUBAH. Field baru ini khusus
   dipakai UI pilih metode bayar interaktif (Fase 16), bukan pengganti
   field Fase 15.
7. **Foto bukti transfer disimpan di bucket MinIO PRIVAT baru
   `facport-payment-proofs`** (BUKAN `facport-public`/ADR-0017 — ini
   dokumen finansial customer, tidak boleh publicly-readable via URL
   tebak-tebakan) — disajikan ke admin lewat **presigned URL** (`minioClient.presignedGetObject`,
   expiry pendek, mis. 10 menit), digenerate on-demand saat admin buka
   detail order, BUKAN URL permanen tersimpan di DB. Ini menyelesaikan
   gap "private media belum bisa disajikan" (§ `architecture-storage.md`,
   dicatat sejak Fase 00/12) KHUSUS untuk kategori bukti pembayaran —
   kategori privat LAIN (`facport-media`, `POST /media/upload` umum)
   TETAP belum terselesaikan, di luar scope ADR ini.

## Alternatif yang Dipertimbangkan
- **Tetap lanjut integrasi Ipaymu sungguhan** — dipertimbangkan serius
  (desain webhook/signature Facport sendiri sudah lebih matang secara
  teori dari apa pun yang ada di jalajogja, karena jalajogja tidak punya
  implementasi APAPUN untuk dibandingkan). Ditolak: user eksplisit
  memilih arah manual setelah tahu bahwa TIDAK ADA referensi kode nyata
  Ipaymu yang terbukti jalan di jalajogja untuk dicontek — trade-off
  cepat-bangun-tapi-teruji (manual, ada referensi) vs
  otomatis-tapi-belum-teruji (Ipaymu, nol referensi, ADR-0021 dkk masih
  murni desain di atas kertas) dipilih ke arah pertama.
- **Polymorphic `sourceType`/`sourceId` seperti `payments` jalajogja** —
  ditolak, over-engineering untuk kebutuhan Facport yang cuma punya 1
  sumber uang masuk (invoice langganan) — `invoiceId` FK langsung lebih
  sederhana & type-safe.
- **Partial payment / cicilan** (jalajogja punya `paidAmount`,
  `installmentPlans`) — TIDAK diadopsi. Invoice Facport SELALU 1 nominal
  penuh (harga plan yang dibeli), tidak ada skenario bisnis bayar
  sebagian untuk fase ini.
- **API cek-mutasi bank otomatis** (mis. integrasi Brankas/Flip untuk
  auto-match transfer) — di luar scope, kode unik + verifikasi visual
  manual admin CUKUP untuk volume transaksi awal Facport, bisa
  direvisit kalau volume membesar.

## Konsekuensi
- `docs/architecture/architecture-payment.md` ditulis ulang total
  (provider gateway/webhook/HMAC dihapus, diganti alur manual).
- `apps/api/.env.example` — hapus placeholder `IPAYMU_*`/`XENDIT_*`
  (tidak pernah dipakai), tidak ada credential gateway baru yang perlu
  diisi SAMA SEKALI untuk fitur pembayaran (keuntungan operasional nyata
  — tidak perlu daftar/approval provider pihak ketiga sebelum bisa
  terima pembayaran pertama).
- Admin WAJIB isi rekening bank + QRIS lewat halaman settings SEBELUM
  fitur checkout bisa dipakai customer — tidak ada default/fallback
  (kalau kosong, checkout harus tampilkan pesan jelas "metode pembayaran
  belum dikonfigurasi admin", bukan crash/pesan generik).
- Verifikasi pembayaran 100% bergantung ketelitian admin membaca bukti
  upload — tidak ada jaminan otomatis anti-fraud dari sisi gateway
  (risiko yang diterima sadar, sama seperti jalajogja di production).
- Fase 16 (dan Fase 17 checkout UI) sekarang TIDAK butuh sandbox
  credential provider mana pun untuk testing — bisa diverifikasi
  end-to-end penuh (termasuk pembayaran "sungguhan" via transfer bank
  developer sendiri) tanpa dependency pihak ketiga, beda dari rencana
  Ipaymu yang butuh akun sandbox terverifikasi dulu.

## Referensi
- Riset pembanding lengkap → subagent fork sesi ini (`jalajogja` file:line
  dicatat di `docs/phases/phase-16-payment-manual.md` § Referensi Riset)
- Detail eksekusi → `docs/phases/phase-16-payment-manual.md`
- Model invoice (dasar `orders.invoiceId`) → ADR-0021,
  `docs/architecture/architecture-invoice.md`
