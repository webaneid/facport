# Fase 76 — Link Alur Penjualan Level ITEM (Sales Invoice)

**Status:** Done (kode selesai, menunggu konfirmasi push)
**Mulai:** 2026-09-09
**Selesai:** 2026-09-09

## Tujuan
Client minta field yang menghubungkan alur penjualan lengkap (Penawaran
→ Pesanan → Pengiriman → Faktur) di level ITEM Sales Invoice, supaya 1
baris barang bisa dikaitkan ke transaksi Sales Quotation/Sales
Order/Delivery Order sebelumnya. Dikonfirmasi LANGSUNG dari spec resmi
Accurate (`detailItem.deliveryOrderNumber`/`salesOrderNumber`/
`salesQuotationNumber`) — BUKAN field baru yang perlu riset dari nol
seperti saga Atribut Tambahan (Fase 67-73), field ini SUDAH
terdokumentasi lengkap.

## Scope
- [x] `sales-invoice.mapping.ts` — 3 field baru:
      `itemDeliveryOrderNo`/`itemSalesOrderNo`/`itemSalesQuotationNo`
      → `detailItem.deliveryOrderNumber`/`salesOrderNumber`/
      `salesQuotationNumber`.
- [x] `defaultColumnMap` — "ITEM: DELIVERY ORDER NO"/"ITEM: SALES ORDER
      NO"/"ITEM: SALES QUOT NO", ditaruh PALING AKHIR.
- [x] `template-guide.ts` — 3 kolom baru ditambahkan PALING AKHIR
      `salesInvoiceTemplateGuide`, deskripsi menyebut EKSPLISIT
      keterhubungan & prioritas antar field.
- [x] `import/page.tsx` — 3 opsi dropdown baru, label menyebut prioritas.
- [x] Test baru (`sales-invoice.mapping.test.ts`) — payload placement
      (masuk `detailItem`, bukan root), `defaultColumnMap` lengkap +
      pastikan TIDAK ada padanan "Purchase Order No".
- [x] Typecheck 0 error, full test suite pass (485, +2 baru).

## Referensi
- Architecture doc: `docs/architecture/architecture-sales-invoice.md`.
- Spec resmi: `accurate-openapi.json` §
  `/api/sales-invoice/save.do` → `detailItem.deliveryOrderNumber`/
  `salesOrderNumber`/`salesQuotationNumber`.

## Keputusan Kecil Selama Eksekusi
- **"ITEM: PURCHASE ORDER NO" TIDAK diimplementasikan** — dicek ke
  spec resmi, TIDAK ADA field API setara untuk referensi PO di level
  ITEM Sales Invoice (Sales Invoice itu dokumen PENJUALAN, PO adalah
  konsep sisi PEMBELIAN customer — sudah tercakup di field header
  `poNumber`/"Bill No" sejak Fase 13/70, cuma level FAKTUR bukan
  per-barang). Client diberi tahu field ini sengaja tidak ditambahkan
  karena memang tidak ada padanannya, bukan terlewat.
- **Peringatan prioritas ditulis EKSPLISIT di deskripsi kolom template**
  (bukan cuma di dokumentasi internal) — supaya user yang download
  template langsung tahu risikonya tanpa perlu baca dokumentasi
  terpisah, mengingat field ini official-nya SALING MENGGANTIKAN
  (bukan independen), berbeda dari kebanyakan field lain di template
  yang independen satu sama lain.
- Ditaruh PALING AKHIR (setelah "Kategori Keuangan Beban 10") — konsisten
  dengan pola penempatan Fase 69-75.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review inline — tidak ada endpoint/data flow baru, field
      pass-through sederhana (string, tidak butuh konversi tipe). Tidak
      ada temuan.
- [x] `docs/PROGRESS.md` diupdate.

## Known Limitations
- BELUM diverifikasi end-to-end nyata (belum ada test upload dari
  client) — field-nya sendiri dikonfirmasi dari spec resmi (confidence
  tinggi, beda dari kasus charField yang undocumented), tapi perilaku
  prioritas "cuma 1 yang diproses" belum pernah diuji langsung ke
  Accurate sungguhan oleh kita.
- Hanya diterapkan ke Sales Invoice — Purchase Invoice tidak diminta
  untuk field ini di fase ini (beda dari Fase 75 yang eksplisit mirror
  semua field Atribut Tambahan).

## Ringkasan Hasil
3 field link alur penjualan level ITEM (Delivery Order No, Sales Order
No, Sales Quotation No) ditambahkan ke Sales Invoice, field API
dikonfirmasi resmi dari spec Accurate. Peringatan "cuma 1 diproses kalau
diisi bersamaan" ditulis eksplisit di deskripsi kolom template.
"Purchase Order No" level item sengaja tidak ditambahkan (tidak ada
field API setara). `bun run typecheck` 0 error, `bun test` 485 pass/0
fail (2 baru).
