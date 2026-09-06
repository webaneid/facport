# ADR-0021: Skema Invoice Terpisah dari Order + PDF via @react-pdf/renderer

**Status:** Accepted
**Tanggal:** 2026-09-04

## Context
Rencana 5-fase (ADR-0019, ADR-0020, `docs/phases/phase-14-fondasi-langganan.md`)
menetapkan: 1 kali checkout BOLEH berisi 1+ sub-modul (cart multi-modul),
hasil checkout WAJIB berupa dokumen invoice profesional bergaya
"invoice.plane"-nya invoice-invoice B2B pada umumnya (bukan cuma catatan
`orders` internal seperti sekarang) — nomor invoice, tanggal, bill-to,
tabel baris per sub-modul yang dibeli, subtotal/total, instruksi
pembayaran — sebelum lanjut ke payment gateway (Fase 16) dan cart checkout
UI (Fase 17).

Skema `orders` (`payment.schema.ts`, ADR lama) cuma nyimpan
`{externalId, status, amount, paymentMethod, rawWebhookPayload}` — cocok
buat "record transaksi payment gateway", TIDAK cocok jadi representasi
dokumen invoice (tidak ada nomor invoice, tidak ada line item, tidak ada
bill-to, tidak ada due date).

Butuh keputusan: (1) invoice jadi tabel terpisah dari `orders` atau
extend `orders`? (2) PDF di-generate pakai apa?

## Decision
1. **`invoices`/`invoiceItems` jadi tabel BARU, terpisah dari `orders`**
   — `invoices` = dokumen bisnis (nomor, bill-to snapshot, due date,
   status `unpaid|paid|void|expired`), `invoiceItems` = baris per
   sub-modul (planId + moduleKey + label + price, SEMUA snapshot harga
   saat dibuat — `plans.price` boleh berubah di masa depan tanpa mengubah
   invoice lama). `orders` (Fase 16) nanti dapat `invoiceId` (FK) — 1
   order = 1 pembayaran untuk 1 invoice, relasi 1:1 per invoice (bukan
   sebaliknya invoice punya banyak order — 1 invoice cuma dibayar sekali,
   kalau gagal/expired dibuat invoice baru, bukan retry order pada
   invoice yang sama).
2. **`subscriptions` dapat kolom baru `invoiceItemId`** (nullable, FK ke
   `invoiceItems.id`) — pointer balik "subscription ini tercipta dari
   baris invoice yang mana". Nullable karena subscription BISA dibuat
   tanpa invoice (jalur admin "Tandai Sudah Dibayar" manual, Fase 18, atau
   subscription lama pra-fase ini).
3. **PDF di-generate via `@react-pdf/renderer`** (server-side, Node/Bun
   API `renderToBuffer`, BUKAN render-lalu-screenshot browser) — layout
   didefinisikan sebagai komponen React (JSX), di-compile jadi PDF
   langsung tanpa render HTML apa pun. File PDF **TIDAK disimpan** ke
   MinIO/disk — di-generate ulang on-demand tiap kali `GET
   /invoices/:id/pdf` dipanggil (data invoice immutable begitu dibuat,
   snapshot semua nilai penting, jadi regenerasi selalu identik — tidak
   ada alasan cache file-nya, lebih simpel dari sisi storage/lifecycle).
4. **Company settings tambahan** (`company.taxId`, `company.phone`,
   `company.email`, `company.bankAccount`) lewat skema key-value
   `settings` yang SUDAH ADA (§ `architecture-settings.md`) — TIDAK perlu
   tabel/kolom baru, cukup key baru + form field baru di halaman admin
   settings yang sudah ada.

## Alternatif yang Dipertimbangkan
- **Puppeteer (render HTML → screenshot PDF)** — ditolak eksplisit oleh
  user (§ plan Fase 14-18): butuh Chromium penuh di image Docker
  production, signifikan menambah ukuran image + attack surface + waktu
  render dibanding library PDF native JS.
- **Extend `orders` langsung jadi invoice** (tambah kolom invoiceNumber,
  billTo, dst ke `orders`) — ditolak: `orders` representasi TRANSAKSI
  PEMBAYARAN (bisa gagal, retry, macam-macam `paymentMethod`), invoice
  representasi DOKUMEN BISNIS (harus ada bahkan sebelum dibayar/kalau
  dibayar manual tanpa order sama sekali via Fase 18). Mencampur keduanya
  bikin `orders` jadi over-loaded dan invoice jadi tidak valid tanpa
  order (padahal Fase 18 eksplisit butuh invoice tanpa order untuk jalur
  "Tandai Sudah Dibayar Manual").
- **Simpan PDF ter-generate ke MinIO (cache), bukan generate on-demand**
  — dipertimbangkan (hindari re-render tiap request), ditolak untuk fase
  ini: data invoice snapshot/immutable jadi re-render selalu hasilnya
  identik byte-demi-byte secara VISUAL (bukan berarti byte-identik
  literal — timestamp generation PDF metadata bisa beda, tapi kontennya
  sama) — kompleksitas cache-invalidation (invoice yang di-void, dst)
  tidak sepadan untuk volume invoice yang diperkirakan rendah di fase
  awal produk ini. Bisa direvisit kalau traffic `GET /invoices/:id/pdf`
  ternyata signifikan.

## Konsekuensi
- `apps/api` sekarang punya dependency `react` + `@react-pdf/renderer`
  (dan `@types/react` dev-only) — SATU-SATUNYA pemakai JSX di backend ini
  (`lib/invoice-pdf.tsx`), `tsconfig.json` apps/api dapat tambahan
  `"jsx": "react-jsx"` yang cuma berlaku untuk file `.tsx` (tidak
  mempengaruhi `.ts` lain).
- `invoiceItems.price` dan `label` WAJIB snapshot (disalin dari `plans`
  saat invoice dibuat), BUKAN join live ke `plans` — perubahan harga plan
  di masa depan tidak boleh mengubah invoice yang sudah diterbitkan.
- Endpoint `GET /invoices/:id/pdf` butuh ownership check GANDA (invoice
  milik user yang request, ATAU user itu admin/`invoices.view`) — pola
  sama seperti endpoint lain di project ini yang campur akses
  customer-milik-sendiri + admin-semua (lihat `permission.ts`).
- Fase 15 ini BELUM ada jalur normal yang benar-benar `INSERT INTO
  invoices` (checkout UI = Fase 17, payment gateway = Fase 16) — endpoint
  baca (`GET /me/invoices`, `GET /admin/invoices`, `GET
  /invoices/:id/pdf`) diverifikasi pakai data yang di-insert manual lewat
  test/script, BUKAN alur user sungguhan. Ini SENGAJA (fondasi dulu,
  alur end-to-end lengkap baru bisa diverifikasi setelah Fase 16-17
  selesai) — dicatat di `docs/phases/phase-15-invoice-profesional.md`
  § Known Limitations, BUKAN kelupaan.

## Referensi
- Rencana lengkap 5 fase → `docs/phases/phase-14-fondasi-langganan.md`,
  plan file sesi (`sorted-inventing-volcano.md`)
- Detail eksekusi Fase 15 → `docs/phases/phase-15-invoice-profesional.md`
- Model sub-modul yang jadi dasar 1 invoiceItem = 1 sub-modul → ADR-0019
