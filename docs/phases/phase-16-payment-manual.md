# Fase 16 — Payment Manual (Transfer Bank + QRIS)

**Status:** Done
**Mulai:** 2026-09-04
**Selesai:** 2026-09-04

## Tujuan
Ganti rencana awal "Payment Gateway Ipaymu" (belum pernah diimplementasi,
cuma desain di atas kertas) dengan pembayaran MANUAL yang TERBUKTI jalan
di aplikasi sibling production (`jalajogja`/"Jalakarta") — transfer bank
dengan kode unik + QRIS dinamis (manipulasi EMV lokal, tanpa API
gateway), diverifikasi admin manual lewat bukti upload. Fase ini
menyelesaikan backend PENUH (schema, checkout cart, upload bukti,
konfirmasi admin, aktivasi subscription) + UI minimal yang cukup untuk
verifikasi end-to-end nyata — polish tampilan katalog/cart publik penuh
tetap di Fase 17.

Keputusan lengkap + riset pembanding → ADR-0022,
`docs/architecture/architecture-payment.md`.

## Scope
### A — Skema & Fondasi
- [x] `apps/api/src/db/schema/payment.schema.ts` — `orders` dirombak
      total (lihat ADR-0022/architecture-payment.md § Skema Database)
- [x] `apps/api/src/db/schema/invoice.schema.ts` — tambah
      `invoiceSequences` table (ganti pola `COUNT` Fase 15)
- [x] `apps/api/src/lib/invoice-number.ts` — `generateInvoiceNumber()`
      pakai `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` atomik,
      HAPUS query `COUNT`
- [x] `apps/api/src/lib/minio.ts` — tambah `PAYMENT_PROOF_BUCKET` +
      `ensurePaymentProofBucket()` (privat, TANPA public policy)
- [x] `apps/api/.env.example` — hapus placeholder `IPAYMU_*`/`XENDIT_*`
      (tidak pernah dipakai)
- [x] Migration Drizzle (`0012_ambitious_taskmaster.sql` +
      `0013_dizzy_microbe.sql`, 2-langkah ADD-lalu-DROP — `orders`
      dirombak banyak kolom sekaligus, sama teknik Fase 14)

### B — QRIS Dinamis
- [x] `apps/api/src/lib/qris-emv.ts` (baru) — `buildDynamicQris()`,
      `isValidQrisPayload()`, adaptasi dari referensi jalajogja
      (`qris-emv.ts`, TERVERIFIKASI production) — DIPERKUAT pasca security
      review: throw eksplisit kalau Tag 53/54 tidak ada di payload (§
      Ringkasan Hasil)
- [x] `apps/api/src/lib/qr-code.ts` (baru) — `generateQrDataUrl()` via
      dependency baru `qrcode`
- [x] Test unit `qris-emv.test.ts` — parse+rebuild TLV, override Tag 54
      (nominal) + Tag 62 (reference), CRC16 valid, PLUS test regresi
      throw-kalau-tidak-ada-Tag-53/54 (13 test total)

### C — Company Settings: Rekening Bank & QRIS
- [x] `company.bankAccounts` (JSONB array), `company.qrisAccounts` (JSONB
      array) — group `billing`, key-value existing (§ ADR-0022 poin 6),
      DIPERKUAT pasca security review dengan validasi runtime di `PUT
      /settings` (`settings.route.ts`, test baru `settings.route.test.ts`)
- [x] `apps/web/app/admin/(protected)/settings/page.tsx` — CRUD
      rekening bank (nama bank, no rekening, nama pemilik) + QRIS (upload
      foto + payload EMV opsional + toggle statis/dinamis)

### D — Checkout (Cart Multi-Modul) & Pemilihan Metode Bayar
- [x] `apps/api/src/routes/subscriptions.route.ts` — `POST
      /subscriptions/checkout` rework total: terima `{ planIds: uuid[] }`
      (cart), buat 1 invoice (N invoiceItems, snapshot harga via
      `generateInvoiceNumber()` atomik) + 1 order (`status: "pending"`,
      `uniqueCode` random 3 digit), return `{ invoiceId, orderId,
      amountDue }` — HAPUS endpoint lama 1-plan-per-checkout. DIPERKUAT
      pasca security review: seluruh alur dalam `db.transaction()` +
      row lock `user`, guard modul diperluas ke invoice/order non-terminal
      (§ Ringkasan Hasil)
- [x] `apps/api/src/routes/orders.route.ts` (baru) — `PATCH
      /orders/:id/method` (pilih `bank_transfer`/`qris` + `bankAccountRef`/
      `qrisAccountRef`), `GET /orders/:id/qris` (return QR data URL kalau
      method qris, generate on-the-fly), `PATCH /orders/:id/proof`
      (`auth: true` + ownership by invoice.userId, upload file ke bucket
      privat + `transferDate`+`payerNote`, set status "submitted"). `GET
      /orders/:id` DIPERKUAT pasca security review: response di-pick
      eksplisit (tidak lagi spread seluruh row, cegah bocor `proofUrl`/
      admin id)

### E — Konfirmasi Admin & Aktivasi Subscription
- [x] `apps/api/src/routes/admin/orders.route.ts` (baru) — `GET
      /admin/orders` (filter status, default "submitted" = antrian),
      `GET /admin/orders/:id/proof-url` (presigned URL, permission
      `orders.manage` — ditambah ke `ADMIN_PERMISSION_KEYS`), `POST
      /admin/orders/:id/confirm` (row lock, invoice+order→paid, LOOP
      invoiceItems→buat N subscriptions), `POST /admin/orders/:id/reject`
      (row lock, alasan wajib)
- [x] `apps/web/app/admin/(protected)/orders/page.tsx` (baru) — antrian
      konfirmasi pembayaran, preview bukti, tombol konfirmasi/tolak

### F — UI Customer Minimal (Checkout → Bayar)
- [x] `apps/web/app/app/(protected)/billing/page.tsx` — tambah tombol
      "Bayar Sekarang" untuk invoice `status: "unpaid"` yang belum punya
      order/method dipilih (butuh `GET /me/invoices` ikut expose
      `orderId`, tidak direncanakan eksplisit di awal tapi diperlukan)
- [x] `apps/web/app/app/(protected)/billing/[orderId]/pay/page.tsx`
      (baru — route by `orderId`, BUKAN `invoiceId` seperti tertulis di
      rencana awal, karena semua endpoint backend fase ini dikunci by
      order) — pilih metode (rekening bank ATAU QRIS), tampilkan instruksi
      + `amountDue`, form upload bukti + `transferDate`/`payerNote`.
      DIPERKUAT pasca security review: fallback pesan kalau rekening
      bank yang dipilih sudah dihapus admin

## Referensi
- ADR: `docs/decisions/adr-0022-payment-manual-qris-transfer.md`
- Architecture doc: `docs/architecture/architecture-payment.md`,
  `docs/architecture/architecture-invoice.md`,
  `docs/architecture/architecture-subscription.md`,
  `docs/architecture/architecture-storage.md`

## Referensi Riset (jalajogja, file:line yang jadi dasar keputusan)
- `packages/db/src/schema/tenant/finance.ts:100-157` — skema `payments`
  (sumber pola `orders` baru, disederhanakan non-polimorfik)
- `packages/db/src/schema/tenant/finance.ts:203-218` + helper
  `generateFinancialNumber` — pola sequence atomik (sumber
  `invoiceSequences`)
- `apps/web/app/api/qris/route.ts`, `apps/web/lib/qris-emv.ts`,
  `apps/web/lib/qr-code.ts` — QRIS dinamis EMV TLV (diadaptasi persis)
- `apps/web/app/api/invoice/proof-upload/route.ts` — pola upload bukti
  (Sharp WebP + auto-orient EXIF, penting untuk foto HP)
- `apps/web/app/(dashboard)/app/[tenant]/finance/billing/actions.ts:1177-1900+`
  (`confirmInvoicePaymentAction`, `verifySubmittedPaymentAction`) — pola
  row-lock + guard-recheck-setelah-lock (sumber § Konkurensi)
- `apps/web/app/(dashboard)/app/[tenant]/finance/actions.ts:332-456`
  (`confirmPaymentAction`/`rejectPaymentAction` GENERIK) — lesson
  produksi nyata (2026-08-29) kenapa transisi status invoice-spesifik
  HARUS terpisah dari fungsi generik

## Keputusan Kecil Selama Eksekusi
- **Tabel `orders` dirombak dengan teknik transisi 2-langkah** (ADD dual
  state → DROP kolom lama), persis pola Fase 14 — banyak kolom
  hilang+muncul sekaligus di 1 tabel memicu prompt interaktif rename-
  detection `drizzle-kit generate` yang tidak bisa dijawab di lingkungan
  non-TTY ini. Tabel `orders` KEBETULAN kosong (1 baris test lama dari
  Fase 01 dibersihkan dulu) jadi step 2 (`invoice_id SET NOT NULL`) tidak
  butuh backfill data.
- **`GET /me/invoices` (Fase 15) diperluas** expose `orderId` per invoice
  (join `orders` by `invoiceId`) — dibutuhkan tombol "Bayar Sekarang" di
  `/billing`, tidak direncanakan eksplisit di scope awal tapi konsekuensi
  wajar dari desain "route pembayaran by orderId".
- **Row lock checkout pakai baris `user`, BUKAN invoice/order** (belum
  ada baris untuk dikunci saat checkout PERTAMA kali bagi user itu) —
  serialisasi checkout SESAMA user tanpa memblokir checkout user LAIN
  yang berjalan paralel (baris `user` berbeda yang dikunci).
- **QRIS EMV `emvPayload` divalidasi 2x** (saat admin simpan via `PUT
  /settings`, DAN saat generate QR di `GET /orders/:id/qris`) — sengaja
  redundant (defense-in-depth), bukan duplikasi yang perlu disederhanakan
  ke satu titik saja, karena baris settings lama (sebelum validasi ada)
  tetap bisa lolos ke titik generate.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck` — apps/api & apps/web)
- [x] Security review dijalankan (subagent `security-auditor`, ~20 file)
- [x] Temuan Critical/High sudah diperbaiki — 0 Critical, 1 High (guard
      checkout concurrent) DIPERBAIKI
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` — 3 Medium
      DIPERBAIKI langsung, 1 Low DIPERBAIKI (fallback rekening dihapus),
      2 Low diterima sebagai debt beralasan
- [x] `docs/PROGRESS.md` diupdate
- [~] Verifikasi end-to-end SUNGGUHAN — **SEBAGIAN**: checkout cart 2
      plan → admin confirm → 2 subscription aktif dengan `invoiceItemId`
      + `durationDays` per-plan BENAR, diverifikasi lewat test otomatis
      (`admin/orders.route.test.ts`, bukan browser sungguhan). Upload
      bukti transfer via MinIO NYATA **TIDAK terverifikasi** sesi ini —
      mismatch credential MinIO lokal (§ Known Limitations), 2 test
      di-skip eksplisit. QRIS EMV diverifikasi lewat 13 unit test
      (fixture terkontrol), BUKAN decode ulang QR sungguhan pakai scanner
      HP asli.

## Known Limitations
- **Belum ada UI katalog/cart publik** (landing page pilih sub-modul) —
  itu Fase 17. Fase 16 cuma expose endpoint checkout `{planIds}` +
  halaman bayar minimal, dipakai lewat cara manual (Postman/curl atau
  halaman sementara) sampai Fase 17 selesai.
- **Tidak ada anti-fraud otomatis** — verifikasi 100% visual manual
  admin (keputusan sadar, § ADR-0022).
- **Tidak ada auto-expire invoice yang lewat `dueDate` belum dibayar** —
  status `"expired"` ADA di enum tapi belum ada job yang men-set-nya
  otomatis (mirip pola `EXPIRE_SUBSCRIPTIONS` yang sudah ada) — dicatat,
  belum dikerjakan fase ini kalau di luar scope inti "verifikasi konsep
  manual payment jalan end-to-end".
- **Upload bukti transfer via MinIO NYATA belum terverifikasi sesi ini**
  — `.env` lokal (port 9002, credential docker-compose.dev.yml) tidak
  reachable dengan instance MinIO asli yang jalan di mesin ini (native
  homebrew, port 9000, credential beda — dikonfirmasi `S3Error
  SignatureDoesNotMatch`, BUKAN bug kode). Docker tidak terpasang di
  mesin ini. 2 test (`orders.route.test.ts`) di-skip eksplisit dengan
  komentar detail. **WAJIB diverifikasi manual di staging/lingkungan
  dengan MinIO benar** sebelum alur upload bukti dianggap benar-benar
  jalan end-to-end.
- **Object MinIO lama tidak dihapus saat resubmit bukti setelah ditolak**
  — numpuk file "yatim" di bucket privat, murni storage housekeeping,
  bukan celah keamanan (§ lessons-learned.md 2026-09-04).
- **Verifikasi UI browser sungguhan TIDAK dilakukan** (ekstensi Chrome
  tidak terhubung, sama seperti Fase 14/15) — halaman `/admin/orders`,
  `/billing/[orderId]/pay`, Card baru rekening/QRIS di `/admin/settings`
  belum pernah dilihat langsung di browser.
- **3 temuan security review** (1 High, 3 Medium, 2 Low diterima) — detail
  lengkap + alasan penerimaan → `docs/lessons-learned.md` 2026-09-04.

## Ringkasan Hasil
Payment manual (transfer bank + QRIS) selesai penuh menggantikan rencana
awal payment gateway otomatis (Ipaymu) yang tidak pernah diimplementasi —
keputusan didasari riset konkret ke aplikasi sibling production
(jalajogja/"Jalakarta") yang menemukan gateway otomatis di sana JUGA
tidak pernah benar-benar diintegrasikan, sementara pola manual (transfer
+ kode unik + QRIS EMV lokal + verifikasi admin) TERBUKTI jalan
bertahun-tahun. Checkout sekarang cart multi-modul sungguhan
(`{planIds: uuid[]}`) — 1 invoice + 1 order per transaksi, dibungkus
`db.transaction()` dengan row lock untuk cegah duplikasi checkout
concurrent (ditemukan & diperbaiki via security review). QRIS dinamis
di-generate 100% lokal (manipulasi EMV TLV, tanpa API gateway apa pun) —
diadaptasi dari kode TERBUKTI production, diperkuat dengan validasi
Tag 53/54 yang sebelumnya tidak ada. Konfirmasi admin pakai row-lock +
guard-recheck-setelah-lock (persis lesson dari bug produksi jalajogja
2026-08-29) — 1 order bisa berisi banyak invoiceItems, tiap item aktivasi
1 subscription dengan `durationDays` plan-nya sendiri (diverifikasi test
eksplisit 2 plan beda durasi). Nomor invoice sekarang atomik (sequence
table + `ON CONFLICT DO UPDATE`), mengganti pola `COUNT` Fase 15 yang
sudah didokumentasikan rawan race condition. Typecheck 0 error, 144/146
test API pass (26 test baru — 2 di-skip dengan alasan jelas), security
review 0 Critical (1 High + 3 Medium diperbaiki langsung, 1 Low
diperbaiki, 2 Low diterima sebagai debt beralasan). Fase ini backend
LENGKAP + UI fungsional minimal (bukan polish penuh) — katalog/cart
publik yang lebih matang adalah Fase 17.
