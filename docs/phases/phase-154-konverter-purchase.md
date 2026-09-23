# Fase 154 — Konverter: Purchase (Purchase Invoice, Purchase Order, Receive Item, Purchase Return)

**Status:** Done
**Mulai:** 2026-09-23
**Selesai:** 2026-09-23

## Tujuan
Port 4 tipe transaksi kategori "Purchase" — MENYELESAIKAN kategori ini (4/4). `purchaseinvoice` termasuk tipe
paling kompleks dari 16 (multi-currency, pajak inklusif/eksklusif, INVOICEAMOUNT TERMASUK PPN). `receiveitem`
opsional merujuk `purchaseorder` yang sudah ada (nomor harus persis sama, tidak divalidasi eksistensinya).
`purchasereturn` merujuk faktur pembelian existing (sama prinsip Customer Receipt/Vendor Payment).

## Scope
- [x] `lib/converter/types/purchase-invoice.ts` — port VERBATIM `TYPES.purchaseinvoice` (`tool.html` 675-734)
- [x] `lib/converter/types/purchase-order.ts` — port VERBATIM `TYPES.purchaseorder` (baris 969-1029)
- [x] `lib/converter/types/receive-item.ts` — port VERBATIM `TYPES.receiveitem` (baris 1246-1303, ejaan XML
      `RECIEVEITEM` sesuai skema resmi Accurate, BUKAN typo kita)
- [x] `lib/converter/types/purchase-return.ts` — port VERBATIM `TYPES.purchasereturn` (baris 1130-1186)
- [x] 4 halaman baru + sidebar wiring (kategori Purchase Konverter SELESAI)
- [x] Test: 4 file test, masing-masing dengan XML exact-string-match + cakupan pajak inklusif/eksklusif/tidak
      kena pajak (purchase-invoice), uang muka (purchase-order), referensi PO opsional (receive-item), referensi
      faktur beda-per-baris (purchase-return)
- [x] Typecheck + lint + test penuh

## Referensi
- Architecture doc: `docs/architecture/architecture-konverter.md`
- ADR: `docs/decisions/adr-0038-produk-konverter.md`
- Phase sebelumnya: `docs/phases/phase-153-konverter-cash-bank.md`
- Sumber legacy: `/Users/webane/sites/konverter/tool.html` baris 675-734 (`TYPES.purchaseinvoice`), 969-1029
  (`TYPES.purchaseorder`), 1130-1186 (`TYPES.purchasereturn`), 1246-1303 (`TYPES.receiveitem`)

## Keputusan Kecil Selama Eksekusi
- Tidak ada penyesuaian struktural — 4 tipe ini diporting APA ADANYA tanpa perlu keputusan baru (pola generik
  `ConverterType<TCtx>` + `KonverterPage` dari Fase 151-152 sudah cukup fleksibel menampung kompleksitas pajak/
  multi-currency purchase-invoice tanpa perubahan interface).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review — TIDAK diulang penuh (4 tipe baru pure client logic tanpa DB/route/secret baru, halaman
      pakai `KonverterPage` yang sama, sudah direview Fase 151). Tidak ada permukaan risiko baru.
- [x] Temuan Critical/High — tidak ada.
- [x] Temuan Medium/Low — tidak ada.
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Kategori "Purchase" Konverter SELESAI (4/4). 5 tipe transaksi sisanya (Sales 4, Master Data 1) menyusul Fase 155+.
- Diskon Purchase Order belum didukung — SAMA seperti legacy (catatan legacy sendiri: "belum ada sampel XML
  ekspor ber-diskon"), bukan keterbatasan baru dari porting ini.
- No_Faktur_Pembelian (Purchase Return) TIDAK divalidasi eksistensinya — sudah dicatat di
  `architecture-konverter.md`, bukan temuan baru.

## Ringkasan Hasil
4 tipe transaksi Purchase diporting dengan fidelity terverifikasi (XML exact-string-match tiap tipe, termasuk
perhitungan pajak inklusif/eksklusif yang benar). Kategori Purchase Konverter SELESAI. 129 test lolos akumulatif
di `lib/converter/`. Suite penuh 1636 (api) + 226 (web) pass, 0 fail. typecheck+lint bersih. 11/16 Varian
Konverter sudah diporting.
