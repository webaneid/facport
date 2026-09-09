# Fase 81 — Grouping Prioritas Trans No untuk Purchase Invoice (Mirror Fase 49/61/63 Sales Invoice)

**Status:** Done (kode selesai, menunggu konfirmasi push)
**Mulai:** 2026-09-09
**Selesai:** 2026-09-09

## Tujuan
Evaluasi client: "Bill No boleh sama walau beda transaksi, Trans No
harus unik" — Purchase Invoice masih grouping multi-item MURNI by Bill
No (ADR-0011/Fase 06), sedangkan Sales Invoice sudah diperbaiki total
untuk masalah identik ini (Fase 49 backend, Fase 61 requiredFields, Fase
63 frontend). Fase ini nge-port 1:1 ketiga perbaikan itu ke Purchase
Invoice.

## Scope
- [x] `purchase-invoice.mapping.ts`:
  - `requiredFields` — `number` (Trans No) DITAMBAHKAN jadi wajib
    (mirror Fase 61 SI).
  - `PurchaseInvoiceGroup` — `billNumber: string | null` diganti
    `groupKey: string | null` + `groupColumn: string | null` (mirror
    `SalesInvoiceGroup`).
  - `numberColumnOf` — fungsi baru, cari kolom yang di-mapping ke
    `number`.
  - `groupPurchaseInvoiceRows` — DIGENERALISASI: Trans No diutamakan,
    Bill No fallback (mirror `groupSalesInvoiceRows`).
  - `validateGroupVendorConsistency` — pakai `group.groupKey`.
- [x] `workers/index.ts`:
  - `findExistingAccurateInvoiceId` — parameter digeneralisasi jadi
    `groupKey`/`groupColumn` (mirror `findExistingAccurateSalesInvoiceId`).
  - `appendToExistingPurchaseInvoice` — 2 pesan error pakai
    `group.groupKey` (bukan `group.billNumber`).
  - Blok proses utama modul `purchase_invoice` — pakai
    `group.groupKey`/`group.groupColumn`, `billNumberColumnOf` import
    yang sudah tidak dipakai dihapus.
- [x] `apps/web/lib/purchase-invoice-batch-helpers.ts` (BARU) — mirror
      `sales-invoice-batch-helpers.ts` persis, plus test file-nya sendiri.
- [x] `purchase-invoice/import/[batchId]/page.tsx` — pakai helper baru,
      kolom tabel "Nomor Faktur" → **"Nomor Transaksi"**.
- [x] `components/purchase-invoice/edit-row-dialog.tsx` —
      `REQUIRED_INTERNAL_FIELDS` tambah `"number"`, teks peringatan
      sibling-row update jadi "Nomor Transaksi/Bill No sama".
- [x] `template-guide.ts` — "Trans No" jadi `required: true`, deskripsi
      "Bill No" & "Trans No" diselaraskan dengan versi Sales Invoice.
- [x] Test baru/update: `purchase-invoice.mapping.test.ts` (describe
      "Fase 81 — prioritas Trans No", update test grouping/consistency
      lama ke shape baru), `purchase-invoice-batch-helpers.test.ts`
      (BARU), fix 1 test existing (`purchase-invoice-import.route.test.ts`
      — `VALID_COLUMN_MAPPING` perlu tambah "Trans No" sekarang wajib).
- [x] Typecheck 0 error, full suite `apps/api` 503 pass/0 fail,
      `apps/web` 44 pass/0 fail.
- [x] Dev DB dibersihkan dari data test.

## Referensi
- Fase 49 (`groupSalesInvoiceRows`), Fase 61 (`number` jadi wajib), Fase
  63 (`sales-invoice-batch-helpers.ts`, kolom "Nomor Transaksi") — pola
  yang di-port 1:1 ke sini.
- `docs/architecture/architecture-purchase-invoice.md`.

## Keputusan Kecil Selama Eksekusi
- **Trans No dijadikan WAJIB** — sempat didiskusikan bolak-balik dengan
  user (awalnya "jangan wajib, cukup diprioritaskan", lalu dikoreksi
  "tetap wajib") — keputusan FINAL: wajib, full mirror SI Fase 61, demi
  konsistensi lintas modul dan supaya grouping selalu punya kunci yang
  reliable.
- **Admin generic batch view** (`app/admin/(protected)/import-batches/[batchId]/page.tsx`
  § `PurchaseInvoiceView`/`SalesInvoiceView`) **SENGAJA TIDAK diubah** —
  dicek, kedua view di situ (PI DAN SI) masih pakai kolom lama ("Nomor
  Faktur", murni Bill No/PO Number tanpa prioritas Trans No) sejak awal,
  bahkan SI-nya sendiri belum pernah di-backfill setelah Fase 63. Ini
  gap PRE-EXISTING di KEDUA modul (bukan regresi dari fase ini), file
  itu punya komentar eksplisit "sengaja duplikasi, bukan shared util,
  supaya customer page tidak ikut ter-impact" — dianggap di luar scope
  evaluasi client kali ini (admin cuma alat bantu telepon support,
  bukan yang dipakai customer sehari-hari). Dicatat di Known Limitations.
- Label kolom customer-facing: "Nomor Transaksi" (persis sama istilah
  Sales Invoice), BUKAN "No Trans" literal seperti disebut client di
  chat — "Nomor Transaksi" sudah istilah established di produk ini
  sejak Fase 63, dipakai lagi supaya konsisten (bukan istilah baru per
  modul).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review inline — perubahan validasi (requiredFields) +
      generalisasi key grouping, TIDAK ada endpoint baru. Query
      `findExistingAccurateInvoiceId` tetap pakai Drizzle `sql` tag
      dengan parameter binding (bukan string concat) — pola yang sama
      persis dengan sebelumnya, cuma nama variabel diganti. Tidak ada
      temuan.
- [x] `docs/PROGRESS.md` diupdate.

## Known Limitations
- Admin generic batch view (`/admin/import-batches/:id`) BELUM
  di-backfill untuk Trans No priority — berlaku untuk KEDUA modul
  (Purchase Invoice DAN Sales Invoice), bukan regresi baru. Kalau admin
  perlu diagnosa batch dengan Bill No/PO Number yang kebetulan sama
  antar faktur beda, tampilan admin BISA membingungkan (masih group
  tampilan by Bill No/PO Number murni) — customer-facing page (yang
  dipakai user asli) SUDAH benar.
- Trans No SEKARANG wajib untuk import baru — user existing yang biasa
  upload TANPA Trans No (mengandalkan auto-number Accurate) akan mulai
  ditolak validasi "kolom belum di-mapping"/"nilai kosong" mulai deploy
  ini. Sama seperti konsekuensi Fase 61 SI — dianggap trade-off yang
  disengaja (grouping reliable > kenyamanan auto-number).

## Ringkasan Hasil
Purchase Invoice sekarang punya kemampuan grouping multi-item yang SAMA
persis dengan Sales Invoice: Trans No diutamakan (WAJIB diisi), Bill No
cuma fallback — sesuai konfirmasi client "Bill No boleh sama walau beda
transaksi". Kolom tabel hasil import berubah dari "Nomor Faktur" jadi
"Nomor Transaksi". `bun run typecheck` 0 error, `bun test` apps/api 503
pass/0 fail, apps/web 44 pass/0 fail. Dev DB dibersihkan.
