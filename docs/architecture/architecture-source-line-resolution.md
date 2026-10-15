# Arsitektur — Penautan Baris Dokumen Sumber Otomatis ("pengganti VLOOKUP")

**Status:** RENCANA (Fase 196, 2026-10-16) — belum dieksekusi. Dasar: Fase 157/158/171 (Delivery Order ← Sales Order, SUDAH berjalan).

## 1. Masalah yang diselesaikan
Di Accurate, dokumen turunan (mis. Delivery Order) menautkan **tiap barisnya ke satu baris tertentu** di dokumen sumber (mis. Sales Order). Penanda baris adalah **ID baris internal** (`detailItem[].id` di respons `*/detail.do`), BUKAN nomor dokumen atau Item No. Kalau dokumen sumber memuat Item No yang sama di beberapa baris (dipesan per minggu/termin/batch), nomor dokumen + Item No ambigu → baris bisa tertaut ke baris yang salah **tanpa error** (sisa kuantitas dan status "terpenuhi" di dokumen sumber jadi salah).

Alat lama client memaksa pengguna melakukan VLOOKUP manual (kunci gabungan Item No + label "Week") untuk mengisi kolom ID baris. Facport menggantinya dengan pencarian otomatis di server; bila tetap ambigu → **gagal dengan pesan jelas, tidak pernah menebak** (filosofi ADR-0013).

## 2. Yang sudah ada (Fase 158/171)
- `getSalesOrderDetailByNumber` (`accurate-sales-order.ts`) — `GET sales-order/detail.do?number=`; `detailItem[].id` = ID baris (terbukti test call nyata: SO-IDR-01 dua baris Item No sama → id 102300/102301).
- `resolveSalesOrderDetailId` (`delivery-order.mapping.ts`, fungsi MURNI): Item No unik → langsung; kembar → saring CLS5 lalu **Item Notes ↔ Atribut Tambahan 1 (`charField1`)**; sisa ≠ 1 → error yang menyebut pilihan label yang ada.
- `resolveSalesOrderDetailIdsInPayload` — orkestrator dengan `fetchCandidates` disuntikkan + cache per nomor dokumen; isian manual tidak ditimpa.

## 3. Peta 7 relasi lintas-dokumen (utang teknis Fase 157)
Spesifikasi resmi Accurate (`docs/referencehtml/accurate-openapi.json`, diperiksa 2026-10-16) untuk `save.do` hanya mendokumentasikan tautan lewat **NOMOR** (`salesOrderNumber`, `deliveryOrderNumber`, `receiveItemNumber`, `purchaseOrderNumber`, `purchaseRequisitionNumber`, `salesQuotationNumber`) — **TIDAK ADA satu pun field `*DetailId` di spesifikasi**. Semua field ID baris bersifat tak terdokumentasi (diketahui lewat Accurate Support / reverse-engineering).

| # | Dokumen turunan ← sumber | Field nomor (resmi) | Field ID baris | Bukti |
|---|---|---|---|---|
| 1 | Delivery Order ← Sales Order | `salesOrderNumber` | `salesOrderDetailId` | **Sudah dibangun** (158/171) |
| 2 | Purchase Invoice ← Receive Item | `receiveItemNumber` | `receiveItemDetailId` | **Dikonfirmasi Accurate Support** (wajib bila Item No kembar) |
| 3 | Purchase Invoice ← Purchase Order | `purchaseOrderNumber` | (diduga `purchaseOrderDetailId`) | belum |
| 4 | Purchase Invoice ← Purchase Requisition | `purchaseRequisitionNumber` | (diduga `purchaseRequisitionDetailId`) | belum |
| 5 | Sales Invoice ← DO / SO / SQ | `deliveryOrderNumber` / `salesOrderNumber` / `salesQuotationNumber` | (diduga `...DetailId`) | belum |
| 6 | Sales Order ← Sales Quotation | `salesQuotationNumber` | (diduga `salesQuotationDetailId`) | teramati client di Accurate native ("Item A" ganda tertarik salah); Fase 169 sudah membaca SQ untuk mengisi item |
| 7 | Receive Item ← Purchase Order | `purchaseOrderNumber` | (diduga `purchaseOrderDetailId`) | belum |
| 8 | Purchase Order ← Purchase Requisition | `purchaseRequisitionNumber` | (diduga `purchaseRequisitionDetailId`) | belum |
(Item Requisition/Item Transfer ← Sales Order termasuk daftar lama; di luar daftar enam fitur yang ditanyakan client.)

## 4. Rancangan (setelah Discovery)
1. **Registri relasi** (data, bukan kode per modul): `{ target, sourceDoc, numberField, detailIdField, detailEndpoint, disambiguators[] }`.
2. **Resolver umum** `resolveSourceDetailId(candidates, itemNo, docNumber, hints)` — generalisasi `resolveSalesOrderDetailId` (perilaku DO TIDAK berubah; tes Fase 158/171 tetap hijau sebagai pagar regresi).
3. **Orkestrator umum** `resolveSourceDetailIdsInPayload(payload, relation, fetchCandidates)` — cache per nomor dokumen, isian manual menang, panggilan lewat `withAccurateRateLimit` (bucket koneksi, Fase 167).
4. **Scope:** tiap sumber butuh `GET <sumber>/detail.do`; cukup ditambahkan ke registri endpoint modul target (mesin scope menurunkan scope baca otomatis); pelanggan lama "Perbarui izin" (diterima, lihat memory).
5. **UI/template:** panduan template per modul menjelaskan kolom pembeda (Item Notes dll) + pesan galat menyebut pilihan label yang ada (pola Fase 171).
6. **Batas aman:** jumlah dokumen sumber unik per grup dibatasi; sumber tidak ditemukan/ambigu → baris gagal dengan pesan jelas; TIDAK ada fallback "kirim nomor saja" untuk kasus ambigu.

## 5. Risiko
- Field `*DetailId` tak terdokumentasi: Accurate bisa menolak/mengabaikannya → wajib uji nyata per relasi sebelum dibangun.
- Kolom pembeda tiap relasi belum diketahui (Week/Item Notes hanya terbukti untuk SO→DO) → butuh contoh data asli client.
- Biaya panggilan tambahan per dokumen sumber (dibatasi cache + limiter per koneksi).
- Scope baca baru → pelanggan harus memberi izin ulang.
