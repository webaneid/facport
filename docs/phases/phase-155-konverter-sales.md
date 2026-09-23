# Fase 155 — Konverter: Sales (Sales Invoice, Sales Order, Delivery Order, Sales Return)

**Status:** Done
**Mulai:** 2026-09-23
**Selesai:** 2026-09-23

## Tujuan
Port 4 tipe transaksi kategori "Sales" — MENYELESAIKAN kategori ini (4/4), sekaligus MENYELESAIKAN SELURUH 16
Varian transaksi Konverter (15/16 tipe transaksi + stdcost Master Data yang bukan transaksi menyusul Fase 156
sebagai penutup akhir). `salesinvoice` adalah tipe PALING KOMPLEKS dari 16: multi-currency, pajak inklusif/
eksklusif, DAN kasus khusus "Saldo Awal" (opening balance piutang, pajak dimatikan otomatis).

## Scope
- [x] `lib/converter/types/sales-invoice.ts` — port VERBATIM `TYPES.salesinvoice` (`tool.html` 497-559)
- [x] `lib/converter/types/sales-order.ts` — port VERBATIM `TYPES.salesorder` (baris 735-792)
- [x] `lib/converter/types/delivery-order.ts` — port VERBATIM `TYPES.deliveryorder` (baris 1030-1081)
- [x] `lib/converter/types/sales-return.ts` — port VERBATIM `TYPES.salesreturn` (baris 1187-1245)
- [x] 4 halaman baru + sidebar wiring (kategori Sales Konverter SELESAI, seluruh 15 tipe transaksi SELESAI)
- [x] Test: 4 file test, masing-masing dengan XML exact-string-match. `sales-invoice.test.ts` cakupan KHUSUS
      kasus Saldo Awal (pajak dimatikan otomatis, default Kode_Barang/Deskripsi) + pajak inklusif (UNITPRICE
      dibagi mundur)
- [x] Typecheck + lint + test penuh

## Referensi
- Architecture doc: `docs/architecture/architecture-konverter.md`
- ADR: `docs/decisions/adr-0038-produk-konverter.md`
- Phase sebelumnya: `docs/phases/phase-154-konverter-purchase.md`
- Sumber legacy: `/Users/webane/sites/konverter/tool.html` baris 497-559 (`TYPES.salesinvoice`), 735-792
  (`TYPES.salesorder`), 1030-1081 (`TYPES.deliveryorder`), 1187-1245 (`TYPES.salesreturn`)

## Keputusan Kecil Selama Eksekusi
- Icon sidebar baru `Truck` (lucide-react) untuk Delivery Order — TIDAK ADA modul Facport setara yang bisa
  dipinjam iconnya (beda dari 14 tipe lain yang semua punya "kembaran" konsep di Facport), jadi ditambah baru.
- Tidak ada penyesuaian struktural lain — kompleksitas Saldo Awal `salesinvoice` tertampung penuh dalam
  `ConverterType<TCtx>` generik tanpa perlu perubahan interface (field khusus `isOB` cukup ditambah ke
  `SalesInvoiceHead` lokal).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review — TIDAK diulang penuh (4 tipe baru pure client logic tanpa DB/route/secret baru, halaman
      pakai `KonverterPage` yang sama, sudah direview Fase 151). Tidak ada permukaan risiko baru.
- [x] Temuan Critical/High — tidak ada.
- [x] Temuan Medium/Low — tidak ada.
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Kategori "Sales" Konverter SELESAI (4/4). Seluruh 15 tipe TRANSAKSI Konverter sudah diporting. Tersisa HANYA
  `stdcost` (Master Data, update data master — bukan transaksi, struktur `Ctx` berbeda dari 15 tipe lain karena
  pakai `items` bukan `order`/`groups`) menyusul Fase 156 sebagai penutup akhir seluruh 16 Varian.
- No_Faktur_Penjualan (Sales Return) TIDAK divalidasi eksistensinya — sudah dicatat di
  `architecture-konverter.md`, bukan temuan baru.

## Ringkasan Hasil
4 tipe transaksi Sales diporting dengan fidelity terverifikasi (XML exact-string-match tiap tipe, termasuk kasus
khusus Saldo Awal dan pajak inklusif Sales Invoice). Kategori Sales Konverter SELESAI. 15/16 Varian Konverter
sudah diporting (semua tipe TRANSAKSI selesai, tersisa 1 update data master). 156 test lolos akumulatif di
`lib/converter/`. Suite penuh 1636 (api) + 253 (web) pass, 0 fail. typecheck+lint bersih.
