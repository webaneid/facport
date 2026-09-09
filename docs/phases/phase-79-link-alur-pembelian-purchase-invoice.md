# Fase 79 — Link Alur Pembelian Level ITEM & EXPENSE (Purchase Invoice)

**Status:** Done (kode selesai, menunggu konfirmasi push)
**Mulai:** 2026-09-09
**Selesai:** 2026-09-09

## Tujuan
Mirror Fase 76 (link alur penjualan level ITEM, Sales Invoice) dan Fase
77 (link alur level EXPENSE) ke Purchase Invoice — client minta
konsistensi ("mirip-mirip") antara kedua modul. Alur PEMBELIAN beda dari
alur PENJUALAN: Permintaan Pembelian (Purchase Requisition) → Pesanan
Pembelian (Purchase Order) → Penerimaan Barang (Receive Item) → Faktur
Pembelian — jadi field API-nya BEDA nama dari Sales Invoice, walau
konsepnya sama persis (field opsional yang menghubungkan 1 baris ke
transaksi alur sebelumnya, dengan aturan mutual-exclusive + prioritas).

## Scope
- [x] `purchase-invoice.mapping.ts` — 3 field baru level ITEM:
      `itemReceiveItemNo`/`itemPurchaseOrderNo`/`itemPurchaseRequisitionNo`
      → `detailItem.receiveItemNumber`/`purchaseOrderNumber`/
      `purchaseRequisitionNumber`. 1 field baru level EXPENSE:
      `expensePurchaseOrderNo` → `detailExpense.purchaseOrderNumber`.
- [x] `defaultColumnMap` — "Beban - PO No" (TETAP di dalam grup Beban,
      bukan dipisah), lalu "ITEM: RECEIVE ITEM NO"/"ITEM: PURCHASE ORDER
      NO"/"ITEM: PURCHASE REQUISITION NO" PALING AKHIR (setelah SELURUH
      grup Expense) — sesuai instruksi eksplisit user: field baru SELALU
      di ujung, SETELAH grup Expense, bukan di tengah/sebelumnya.
- [x] `template-guide.ts` — 4 kolom baru ditambahkan dengan urutan sama.
- [x] `import/page.tsx` (Purchase Invoice) — 4 opsi dropdown baru, label
      menyebut prioritas.
- [x] Test baru (`purchase-invoice.mapping.test.ts`) — payload placement
      (masuk `detailItem`/`detailExpense`, bukan root), `defaultColumnMap`
      lengkap.
- [x] Typecheck 0 error, full test suite pass (495, +3 baru).
- [x] Dev DB dibersihkan dari data test.

## Referensi
- Spec resmi: `accurate-openapi.json` § `/api/purchase-invoice/save.do`
  → `detailItem.receiveItemNumber`/`purchaseOrderNumber`/
  `purchaseRequisitionNumber`, `detailExpense.purchaseOrderNumber`.
- Fase 76/77 (Sales Invoice) — pola yang di-mirror, field API beda tapi
  struktur keputusan sama persis.

## Keputusan Kecil Selama Eksekusi
- **Field API BEDA dari Sales Invoice** (bukan sekadar rename) —
  `deliveryOrderNumber`/`salesOrderNumber`/`salesQuotationNumber` (sisi
  jual) berpadanan dengan `receiveItemNumber`/`purchaseOrderNumber`/
  `purchaseRequisitionNumber` (sisi beli). Prioritas resmi Accurate:
  `receiveItemNumber` > `purchaseOrderNumber` > `purchaseRequisitionNumber`
  (dokumen paling dekat ke faktur menang — pola sama seperti Sales
  Invoice: Delivery Order paling dekat ke faktur, menang atas Sales
  Order/Sales Quotation).
- **`detailExpense` Purchase Invoice cuma punya 1 field link**
  (`purchaseOrderNumber`) — TIDAK ada `receiveItemNumber`/
  `purchaseRequisitionNumber` di array Expense (beda dari `detailItem`
  yang punya ketiganya), jadi TIDAK ADA masalah prioritas di level ini.
- **"Beban - PO No" ditaruh DI DALAM grup Beban** (bukan disatukan
  dengan 3 field ITEM di ujung) — user eksplisit klarifikasi
  mid-eksekusi: "selalu taro paling akhir di excel setelah groupnya
  expense" — dibaca sebagai "field Beban baru tetap masuk grup Beban;
  field non-Beban ditaruh SETELAH seluruh grup Beban", bukan "semua
  field baru asal di ujung tanpa peduli pengelompokan logis".
- Label dropdown pakai istilah Indonesia yang sudah dipakai user
  ("Penerimaan Barang", "Pesanan Pembelian", "Permintaan Pembelian")
  supaya konsisten dengan istilah Accurate yang sudah familiar.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review inline — tidak ada endpoint/data flow baru, field
      pass-through sederhana (string). Tidak ada temuan.
- [x] `docs/PROGRESS.md` diupdate.

## Known Limitations
- BELUM diverifikasi end-to-end nyata (belum ada test upload dari
  client) — field-nya dikonfirmasi dari spec resmi (confidence tinggi),
  tapi perilaku prioritas "cuma 1 yang diproses" belum pernah diuji
  langsung ke Accurate sungguhan khusus untuk Purchase Invoice.

## Ringkasan Hasil
4 field link alur pembelian ditambahkan ke Purchase Invoice: 3 level
ITEM (Receive Item No, Purchase Order No, Purchase Requisition No) dan 1
level EXPENSE (PO No Beban) — field API dikonfirmasi resmi dari spec
Accurate. Field Beban baru masuk grup Beban, field ITEM di paling akhir
(setelah seluruh grup Expense), sesuai instruksi user. `bun run
typecheck` 0 error, `bun test` 495 pass/0 fail (3 baru). Dev DB
dibersihkan.
