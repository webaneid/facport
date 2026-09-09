# Fase 77 — "PO No" Rename, Expense Bahasa Inggris, Link Alur Penjualan Level EXPENSE (Sales Invoice)

**Status:** Done (kode selesai, menunggu konfirmasi push)
**Mulai:** 2026-09-09
**Selesai:** 2026-09-09

## Tujuan
3 permintaan client sekaligus (digabung 1 fase, bukan dipisah, sesuai
instruksi user "jangan dulu kita sekalian aja"):
1. Judul kolom "Bill No" (Fase 70) DIKEMBALIKAN jadi "PO No" — client
   minta singkron dengan nama field ASLI Accurate `poNumber`.
2. SEMUA judul kolom Expense (Fase 74) diganti ke Bahasa Inggris.
3. 2 field BARU level EXPENSE (`detailExpense`) untuk link alur
   penjualan (Sales Order No, Sales Quotation No) — mirror Fase 76 yang
   sebelumnya baru diterapkan di level ITEM (`detailItem`) saja.

## Scope
- [x] `sales-invoice.mapping.ts` — `defaultColumnMap`: tambah "PO No"
      sebagai sinonim UTAMA untuk `poNumber` ("Bill No"/"PO Number" TETAP
      ada sebagai sinonim lama, tidak dihapus).
- [x] `defaultColumnMap` — 5 kolom Expense existing diganti Bahasa
      Inggris sebagai sinonim UTAMA ("Expense Acc No", "Expense Name",
      "Expense Amount", "Expense Note", "Expense Department", "Expense
      Financial Category 1-10") — nama Indonesia lama ("Akun Beban" dkk)
      TETAP ada sebagai sinonim.
- [x] `fieldToAccuratePath` — 2 field baru: `expenseSalesOrderNo`/
      `expenseSalesQuotationNo` → `detailExpense.salesOrderNumber`/
      `salesQuotationNumber` (DIKONFIRMASI RESMI di spec Accurate).
- [x] `defaultColumnMap` — "Expense Sales Order No"/"Expense Sales
      Quotation No", ditaruh PALING AKHIR (setelah "ITEM: SALES QUOT NO"
      Fase 76).
- [x] `template-guide.ts` — kolom "PO No" (ganti "Bill No"), 5 kolom
      Expense English, 2 kolom Expense link field baru PALING AKHIR.
- [x] `import/page.tsx` (Sales Invoice) — label dropdown di-update sama.
- [x] `edit-row-dialog.tsx` (Sales Invoice) — teks peringatan "Bill No"
      diganti "PO No".
- [x] Test baru/update (`sales-invoice.mapping.test.ts`) — sinonim "PO
      No" & Expense English, payload placement 2 field baru (masuk
      `detailExpense`, bukan root/`detailItem`), `defaultColumnMap`
      lengkap, pastikan TIDAK ada padanan "Expense Delivery Order No".
- [x] Typecheck 0 error, full test suite pass (489, +4 baru).
- [x] Dev DB dibersihkan dari data test (`bun test` pollution).

## Referensi
- Architecture doc: `docs/architecture/architecture-sales-invoice.md`.
- Spec resmi: `accurate-openapi.json` § `/api/sales-invoice/save.do` →
  `detailExpense.salesOrderNumber`/`salesQuotationNumber`.
- Fase 76 (mirror level ITEM, sudah Done sebelumnya, field yang sama
  persis tapi nempel di `detailItem`).

## Keputusan Kecil Selama Eksekusi
- **Semua rename TETAP backward-compatible** (pola konsisten Fase
  69/70/76) — nama lama ("Bill No", "PO Number", "Akun Beban" dkk) TIDAK
  DIHAPUS dari `defaultColumnMap`, cuma ditambah nama baru sebagai
  sinonim tambahan. Client/template lama yang sudah terlanjur pakai nama
  lama TIDAK regresi.
- **"Expense Delivery Order No" SENGAJA TIDAK ditambahkan** — dicek ke
  spec resmi, `detailExpense` TIDAK PUNYA field `deliveryOrderNumber`
  sama sekali (beda dari `detailItem` yang punya ketiganya: Delivery
  Order/Sales Order/Sales Quotation). Deskripsi resmi field
  `salesOrderNumber`/`salesQuotationNumber` di `detailExpense` TETAP
  menyebut `deliveryOrderNumber` di teksnya — kemungkinan besar
  deskripsi ini di-copy dari field `detailItem` tanpa ditulis ulang
  khusus untuk `detailExpense` (quirk dokumentasi Accurate, dicatat di
  Known Limitations, BUKAN alasan untuk menambah field yang tidak ada).
  Prioritas yang BERLAKU di sini cuma antara 2 field yang memang ADA:
  `salesOrderNumber` > `salesQuotationNumber`.
- **Label Expense Kategori Keuangan diterjemahkan "Expense Financial
  Category N"** (bukan dibiarkan Indonesia atau diterjemahkan literal
  "Expense Finance Category") — user screenshot cuma tunjukkan 4 kolom
  contoh (Acc No/Amount/Name/Note) + 2 field baru, TIDAK menyebut
  Department/Kategori Keuangan secara eksplisit, tapi instruksi "expense
  diubah SEMUA jadi bhs inggris" (kata "semua") dibaca sebagai cakupan
  PENUH — bukan cuma 4 contoh di screenshot — supaya konsisten (semua
  kolom Expense memang prefix "Expense" sekarang, tidak ada sisa nama
  Indonesia nyelip di antara nama Inggris).
- Field baru ditaruh PALING AKHIR (setelah "ITEM: SALES QUOT NO" Fase
  76) — konsisten pola penempatan Fase 69-76.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review inline — tidak ada endpoint/data flow baru, field
      pass-through sederhana (string, tidak butuh konversi tipe), murni
      rename label + 2 field baru yang mirror pola sudah ada. Tidak ada
      temuan.
- [x] `docs/PROGRESS.md` diupdate.

## Known Limitations
- BELUM diverifikasi end-to-end nyata (belum ada test upload dari
  client) — field-nya sendiri dikonfirmasi dari spec resmi (confidence
  tinggi, sama seperti Fase 76), tapi perilaku prioritas "cuma 1 yang
  diproses" belum pernah diuji langsung ke Accurate sungguhan khusus
  untuk kombinasi `detailExpense`.
- Quirk dokumentasi Accurate: deskripsi resmi `salesOrderNumber`/
  `salesQuotationNumber` di `detailExpense` menyebut `deliveryOrderNumber`
  walau field itu tidak ada di array ini — dicatat, tidak diimplementasikan.
- Hanya diterapkan ke Sales Invoice — Purchase Invoice BELUM diminta
  untuk field link EXPENSE ini (beda dari Fase 75 yang eksplisit mirror
  semua Atribut Tambahan). Kemungkinan perlu mirror juga nanti kalau
  client minta, konsisten pola sebelumnya.

## Ringkasan Hasil
Judul kolom "PO No" dikembalikan (sinonim "Bill No"/"PO Number" tetap
didukung). Semua 15 kolom Expense diganti Bahasa Inggris (sinonim
Indonesia lama tetap didukung). 2 field baru link alur penjualan level
EXPENSE (`expenseSalesOrderNo`/`expenseSalesQuotationNo` →
`detailExpense.salesOrderNumber`/`salesQuotationNumber`) ditambahkan,
dikonfirmasi resmi dari spec Accurate, ditaruh paling akhir template.
`bun run typecheck` 0 error, `bun test` 489 pass/0 fail (4 baru). Dev DB
dibersihkan dari data test.
