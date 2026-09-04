# Fase 13 — Sales Invoice (Faktur Penjualan)

**Status:** Done
**Mulai:** 2026-09-04
**Selesai:** 2026-09-04

## Tujuan
Client minta 5 sub-modul aktif dalam aplikasi (2026-09-04): Sales Invoice
(SI), Purchase Invoice (PI, sudah ada), Sales Receipt/"Customer Receipt"
(CR), Purchase Payment (PP), Journal Voucher/"Jurnal Umum" (JU). Fase ini
Sales Invoice saja — dipilih pertama karena polanya identik Purchase
Invoice yang sudah production dan matang (risiko paling rendah). PP/CR/JU
menyusul fase terpisah setelah SI solid.

Dibangun LANGSUNG lengkap (bukan bertahap seperti histori PI) — keputusan
eksplisit user, mereplikasi SEMUA kapabilitas PI saat ini: single & multi-
item per faktur, auto-create Customer/Item, retry cerdas (append ke faktur
existing lintas-batch), batal import (hapus dari Accurate).

## Scope
- [x] `apps/api/src/lib/import-mapping/sales-invoice.mapping.ts` (mirror
      `purchase-invoice.mapping.ts`)
- [x] `apps/api/src/lib/accurate-customer.ts` (mirror `accurate-vendor.ts`)
- [x] `apps/api/src/lib/accurate-sales-invoice.ts` (mirror
      `accurate-purchase-invoice.ts`)
- [x] `apps/api/src/lib/import-mapping/template-guide.ts` — tambah
      `salesInvoiceTemplateGuide`
- [x] `apps/api/src/routes/sales-invoice-import.route.ts` (mirror 8
      endpoint `purchase-invoice-import.route.ts`)
- [x] `apps/api/src/workers/index.ts` — branch `sales_invoice` di
      `IMPORT_TO_ACCURATE` (grouping, retry cerdas) DAN `CANCEL_IMPORT`
      (batal import, generalisasi delete call by module)
- [x] `apps/api/src/app.ts` — registrasi route baru
- [x] ADR-0018 — nav & dashboard difilter oleh modul langganan (sudah
      ditulis Langkah 1)
- [x] `components/app-shell/sidebar.tsx` — `NavItem.moduleKey`, filter
      by subscription
- [x] `app/app/(protected)/layout.tsx` — fetch subscription, oper
      `subscriptionModules` ke `AppShell`
- [x] `app/app/(protected)/page.tsx` — card "Import Faktur Penjualan"
      baru + gating card PI existing juga (retroaktif, § ADR-0018)
- [x] `app/app/(protected)/sales-invoice/import/*` (3 halaman, mirror PI)
- [x] `components/sales-invoice/*` (3 komponen, mirror PI)
- [x] Test: `sales-invoice.mapping.test.ts` (21 test, pass),
      `sales-invoice-import.route.test.ts` (6 test, pass — jalan ke
      Postgres lokal nyata)

## Referensi
- Architecture doc: `docs/architecture/architecture-accurate-integration.md`
  § "Sales Invoice (Faktur Penjualan) — Fase 13"
- ADR: `docs/decisions/adr-0018-nav-filtered-by-subscription-modules.md`
  (nav/dashboard), reuse ADR-0011/0012/0013/0014 (pola generik dari PI)

## Keputusan Kecil Selama Eksekusi
- "PO Number" (`poNumber`, field resmi Accurate) dipakai sebagai kolom
  pengelompokan multi-item SI — pengganti peran "Bill No" di PI (nomor
  referensi eksternal dari customer, bukan nomor transaksi Accurate).
- Field opsional `customerReceivableAccountListNo` ("Akun Piutang")
  ditaruh LANGSUNG di mapping Sales Invoice (bukan modul "Import Data
  Pelanggan" terpisah seperti Fase 04 vendor) — tidak ada permintaan
  client spesifik soal itu, cukup jadi field opsional simetris.
- Tidak ada standalone "Import Data Pelanggan" module — beda dari PI
  yang punya Fase 04 terpisah (dipicu permintaan client spesifik yang
  tidak ada padanannya untuk Sales Invoice saat ini).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review dijalankan (subagent `security-auditor`)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — 0
      Critical/High ditemukan
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda
      — 1 Medium DIPERBAIKI langsung (bukan ditunda), 0 Low
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- **Belum diverifikasi end-to-end ke akun Accurate NYATA** (browser
  sungguhan, seperti histori PI Fase 02/05/06/08/09) — sesi eksekusi ini
  tidak punya akses OAuth interaktif ke akun Accurate customer. WAJIB
  diverifikasi manual oleh user SEBELUM dianggap production-ready,
  MINIMAL: create faktur single-item, create faktur multi-item (PO
  Number sama), auto-create customer baru, retry setelah gagal, batal
  import.
- Shape response asli `sales-invoice/detail.do` (khususnya field
  `customer.customerNo`) belum diverifikasi empiris ke Accurate sungguhan
  (§ komentar `accurate-sales-invoice.ts`) — kalau nama field aslinya
  beda dari asumsi, safety-check vendor/customer-match di
  `appendToExistingSalesInvoice` (retry cerdas) bisa gagal diam-diam,
  persis kejadian yang pernah ketemu di PI (§ ADR-0012 koreksi
  2026-08-28). WAJIB dicek test call nyata SEBELUM retry cerdas SI
  dianggap production-ready.

## Ringkasan Hasil (isi pas fase Done)
Sales Invoice (Faktur Penjualan) — modul Fase 13, mirror 1:1 Purchase
Invoice yang sudah production: single & multi-item per faktur (grouping
by "PO Number", pengganti peran "Bill No"), auto-create Customer/Item
(termasuk field opsional "Akun Piutang" `customerReceivableAccountListNo`,
setara Akun Hutang vendor), retry cerdas (append ke faktur existing
lintas-batch), batal import (hapus dari Accurate).

Backend: `sales-invoice.mapping.ts`, `accurate-customer.ts`,
`accurate-sales-invoice.ts`, endpoint `sales-invoice-import.route.ts` (8
endpoint identik pola PI), branch baru di `workers/index.ts`
(`processSalesInvoiceGroup`, `appendToExistingSalesInvoice`,
`findExistingAccurateSalesInvoiceId`, generalisasi delete call
`CANCEL_IMPORT` by module). Frontend: 3 halaman + 3 komponen
`components/sales-invoice/*` mirror PI.

**Sekaligus (ADR-0018)**: sidebar nav & dashboard SEKARANG difilter oleh
modul plan langganan AKTIF customer (`NavItem.moduleKey`,
`subscriptionModules` dioper dari layout ke AppShell/Sidebar) — pola BAKU
untuk semua modul baru berikutnya (PP, CR, JU), bukan kasus khusus SI.
Card "Import Faktur Pembelian" yang sebelumnya unconditional ikut
digating juga (retroaktif, konsistensi).

Typecheck nol error, lint bersih, 88 test pass (termasuk 6 test integrasi
baru ke Postgres nyata + 21 test unit mapping baru). Security review: 0
Critical/High, 1 Medium DIPERBAIKI (query "Batal Import" `CANCEL_IMPORT`
kurang scope by `module`, risiko over-blocking lintas-modul kalau ID
Accurate PI/SI kebetulan sama — bukan celah hapus faktur salah).

**BELUM diverifikasi ke akun Accurate NYATA** (lihat Known Limitations) —
ini prasyarat sebelum modul berikutnya (Purchase Payment/Sales Receipt)
dikerjakan, supaya pola yang di-reuse benar-benar terbukti dulu.
