# Fase 75 — Atribut Tambahan & Kategori Keuangan Purchase Invoice (Mirror Sales Invoice)

**Status:** Done (kode selesai, menunggu konfirmasi push)
**Mulai:** 2026-09-09
**Selesai:** 2026-09-09

## Tujuan
Menerapkan LENGKAP ke modul Purchase Invoice apa yang sudah dikerjakan
dan diverifikasi untuk Sales Invoice (Fase 55/61/64/68/73/74): Atribut
Tambahan level FAKTUR, ITEM, dan EXPENSE, plus Kategori Keuangan level
ITEM dan EXPENSE. Karena field API dan pola implementasinya sudah
diketahui pasti dari perjalanan panjang Sales Invoice (termasuk saga
investigasi Fase 67-73), pengerjaan modul ini jauh lebih cepat — TIDAK
perlu mengulang riset dari nol.

## Scope
- [x] `purchase-invoice.mapping.ts` — `fieldToAccuratePath` tambah 3
      kelompok field (mirror 1:1 nama internal dengan
      `sales-invoice.mapping.ts` supaya konsisten lintas modul):
      - `attribut1-10` → `detailItem.dataClassification1-10Name`
        (Kategori Keuangan ITEM).
      - `attributHeaderKarakter1-10`/`attributHeaderAngka1-10`/
        `attributHeaderTanggal1-2` → `charField1-10`/`numericField1-10`/
        `dateField1-2` (ROOT, Atribut Tambahan FAKTUR).
      - `attributItemKarakter1-15`/`attributItemAngka1-10`/
        `attributItemTanggal1-2` → `detailItem.charField1-15`/
        `numericField1-10`/`dateField1-2` (Atribut Tambahan ITEM).
      - `expenseAccountNo`/`expenseName`/`expenseAmount`/`expenseNotes`/
        `expenseDepartmentName`/`expenseKategoriKeuangan1-10` →
        `detailExpense.*` (level EXPENSE).
- [x] `DATE_FIELDS` — tambah `attributHeaderTanggal1-2`,
      `attributItemTanggal1-2`.
- [x] `buildPurchaseInvoicePayload` — skip `detailExpense.` (selain
      `detailItem.`) dari loop header; bangun `payload.detailExpense`
      dari SEMUA baris grup (filter null), cuma disertakan kalau ada
      minimal 1 hasil.
- [x] `buildDetailExpenseFromRow` (baru) — mirror `buildDetailItemFromRow`,
      syarat `accountNo`+`expenseAmount` dua-duanya terisi.
- [x] `extractDataClassificationValues`/`extractExpenseDataClassificationValues`
      (baru) — mirror Sales Invoice, untuk auto-create Kategori Keuangan.
- [x] `defaultColumnMap` — 73 kolom Excel baru, SEMUA ditaruh PALING
      AKHIR (setelah "PPH"/kolom terakhir existing), TIDAK diselipkan
      di tengah.
- [x] `template-guide.ts` (`purchaseInvoiceTemplateGuide`) — 73 kolom
      baru ditambahkan PALING AKHIR (setelah "Kategori Barang").
- [x] `import/page.tsx` (Purchase Invoice, `ACCURATE_FIELDS`) — 73 opsi
      dropdown baru.
- [x] `edit-row-dialog.tsx` (Purchase Invoice, `DATE_INTERNAL_FIELDS`)
      — tambah `attributHeaderTanggal1-2`/`attributItemTanggal1-2`.
- [x] `workers/index.ts` — fungsi baru `ensurePurchaseInvoiceDataClassifications`
      (mirror `ensureDataClassifications` Sales Invoice, tapi pakai
      extractor dari `purchase-invoice.mapping.ts` — fungsi terpisah,
      BUKAN 1 fungsi generik, konsisten pola "3 baris mirip lebih baik
      dari abstraksi prematur" yang sudah dipakai di file ini). Dipanggil
      dari `processPurchaseInvoiceGroup` dan `appendToExistingPurchaseInvoice`
      SEBELUM `savePurchaseInvoice`.
- [x] `accurate-scopes.ts` — scope `data_classification_view`/
      `data_classification_save` ditambah ke modul `purchase_invoice`
      (mirror Fase 68 Sales Invoice).
- [x] Test baru (`purchase-invoice.mapping.test.ts`) — payload placement
      (3 level: faktur/item/expense), `buildDetailExpenseFromRow`
      (lengkap, syarat minimal), `extractDataClassificationValues`/
      `extractExpenseDataClassificationValues`, `defaultColumnMap`.
- [x] Typecheck 0 error, full test suite pass (483, +15 baru).

## Referensi
- Architecture doc: `docs/architecture/architecture-purchase-invoice.md`
  § "Fase 75 — Atribut Tambahan & Kategori Keuangan".
- Fase terkait: Sales Invoice Fase 55/61/64/68/73/74 (implementasi asli
  yang di-mirror), Fase 67-73 (saga investigasi field API, TIDAK diulang
  di sini karena field-nya sudah pasti).

## Keputusan Kecil Selama Eksekusi
- **Nama field internal DISAMAKAN PERSIS** dengan Sales Invoice
  (`attribut1-10`, `attributHeaderKarakter1-10`, `attributItemKarakter1-15`,
  `expenseAccountNo`, dst) — bukan reuse/import lintas modul (masing-
  masing module tetap punya `fieldToAccuratePath` sendiri, konsisten
  arsitektur project), tapi PENAMAAN yang sama supaya konsisten kalau
  dilihat lintas modul.
- **`ensurePurchaseInvoiceDataClassifications` fungsi TERPISAH** dari
  `ensureDataClassifications` (Sales Invoice) — BUKAN diabstraksi jadi
  1 fungsi generik yang menerima parameter extractor, karena kedua
  fungsi motornya identik SEDERHANA (loop + dedupe + panggil API),
  abstraksi generik di sini nambah kompleksitas (parameter function)
  tanpa manfaat nyata dibanding duplikasi 3 baris.
- **TIDAK mengimplementasikan field expense TAMBAHAN yang PI punya tapi
  SI tidak** (`allocateToItemCost`, `chargedVendorName`, `amountCurrency`,
  `expenseCurrencyCode`) — di luar scope permintaan, bisa ditambah nanti
  kalau memang dibutuhkan.
- **Scope OAuth `data_classification_*` ditambah ke `purchase_invoice`**
  meski BELUM ada test nyata Kategori Keuangan PI — field ini SUDAH
  dikonfirmasi ada di spec resmi utk `detailItem`/`detailExpense` PI,
  jadi scope ini memang genuinely dibutuhkan begitu fitur ini dipakai,
  bukan spekulatif.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review inline — tidak ada endpoint baru, reuse fungsi
      auto-create yang sudah direview (Fase 68), scope baru konsisten
      prinsip least-privilege (cuma ditambah karena genuinely dipakai).
      Tidak ada temuan.
- [x] `docs/PROGRESS.md` diupdate.
- [x] `docs/architecture/architecture-purchase-invoice.md` diupdate.

## Known Limitations
- **Field `charField`/`numericField`/`dateField` (level FAKTUR & ITEM)
  BELUM dikonfirmasi resmi oleh Accurate Support khusus untuk Purchase
  Invoice** — cuma diasumsikan konsisten dari Sales Invoice. Ini poin
  PALING BERISIKO di fase ini kalau ternyata Accurate memperlakukan
  modul transaksi berbeda untuk field ini (preseden: `dataClassificationNName`
  TERBUKTI konsisten di 30+ endpoint, tapi charField/numericField/dateField
  belum pernah dicek eksplisit untuk PI).
- **BELUM diverifikasi end-to-end nyata sama sekali** untuk modul ini
  (belum ada test upload dari client) — SEMUA fase Sales Invoice yang
  jadi acuan ini sudah melalui banyak putaran test nyata sebelum
  dianggap benar; modul PI ini baru selesai dari sisi kode, belum
  pernah diuji ke Accurate sungguhan.
- Koneksi Accurate Purchase Invoice yang SUDAH connect SEBELUM fase ini
  WAJIB disconnect & reconnect untuk dapat scope
  `data_classification_view`/`_save` yang baru ditambah — kalau tidak,
  auto-create Kategori Keuangan akan gagal dengan error permission dari
  Accurate.
- Level Expense TIDAK diterapkan ke jalur `appendToExistingPurchaseInvoice`
  (retry lintas-batch, ADR-0012/Fase 08) — sama seperti Sales Invoice
  Fase 74, cuma berlaku untuk CREATE faktur baru.

## Ringkasan Hasil
Ketiga mekanisme Atribut Tambahan/Kategori Keuangan (level Faktur, Item,
Expense) dari Sales Invoice diterapkan mirror LENGKAP ke Purchase
Invoice — 73 field baru, kolom Excel semua ditaruh paling akhir template
sesuai permintaan, scope OAuth diperluas. `bun run typecheck` 0 error,
`bun test` 483 pass/0 fail (15 baru). Field `dataClassificationNName`
dikonfirmasi resmi di spec untuk PI; `charField`/`numericField`/
`dateField` masih ekstrapolasi dari Sales Invoice, belum dikonfirmasi
resmi khusus untuk PI — perlu retest nyata sebelum dianggap pasti benar.
