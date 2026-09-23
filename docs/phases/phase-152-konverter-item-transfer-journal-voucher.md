# Fase 152 — Konverter: Item Transfer & Journal Voucher

**Status:** Done
**Mulai:** 2026-09-23
**Selesai:** 2026-09-23

## Tujuan
Port 2 tipe transaksi berikutnya: `konverter_item_transfer` (Inventory, penutup kategori bersama Requisition) dan
`konverter_journal_voucher` (General Ledger, validasi bisnis PALING KETAT dari 16 tipe — debit=kredit WAJIB
balance per dokumen). Sekaligus ekstrak gerbang subscription (`page.tsx` per tipe) jadi 1 component reusable
(`KonverterPage`) — sebelumnya (Fase 151) logic itu cuma ada di 1 file, sekarang jelas akan diduplikasi 14x lagi
kalau tidak di-DRY-kan sekarang.

## Scope
- [x] `lib/converter/shared.ts` — tambah `fmtMoney()` (helper generik legacy yang kelewat diporting Fase 150-151)
- [x] `lib/converter/types/item-transfer.ts` — port VERBATIM `TYPES.itemtransfer` (`tool.html` baris 1304-1349)
- [x] `lib/converter/types/journal-voucher.ts` — port VERBATIM `TYPES.journalvoucher` (`tool.html` baris 793-861),
      termasuk validasi balance debit=kredit per dokumen
- [x] `components/converter/konverter-gate.tsx` — ekstrak gerbang subscription dari `page.tsx` requisition
      (Fase 151) jadi 1 Server Component reusable `KonverterPage<TCtx>`, dipakai SEMUA tipe mulai fase ini
- [x] `page.tsx` requisition disederhanakan pakai `KonverterPage` (retrofit, bukan cuma 2 tipe baru)
- [x] 2 halaman baru: `/konverter/item-transfer`, `/konverter/journal-voucher`
- [x] Sidebar: 2 item baru di grup "Konverter"
- [x] Test: `item-transfer.test.ts` + `journal-voucher.test.ts` (termasuk assertion XML exact-string-match +
      cakupan LENGKAP kasus balance/tidak-balance/multi-currency untuk journal voucher)
- [x] Typecheck + lint + test penuh

## Referensi
- Architecture doc: `docs/architecture/architecture-konverter.md`
- ADR: `docs/decisions/adr-0038-produk-konverter.md`
- Phase sebelumnya: `docs/phases/phase-151-konverter-requisition.md`
- Sumber legacy: `/Users/webane/sites/konverter/tool.html` baris 793-861 (`TYPES.journalvoucher`), 1304-1349
  (`TYPES.itemtransfer`), 486 (`fmtMoney`)

## Keputusan Kecil Selama Eksekusi
- Gerbang subscription per halaman DIEKSTRAK jadi `KonverterPage` component (§ Scope) — keputusan DRY murni,
  tidak mengubah perilaku sama sekali dari Fase 151 (page requisition retrofit tanpa perubahan fungsional, hanya
  hilang duplikasi kode).
- Field alternatif nama kolom (`Tipe_Subsidiary` vs `"Tipe Subsidiary (Pelanggan/ Pemasok)"` vs `"Tipe Subsidiary"`)
  di `journal-voucher.ts` diporting APA ADANYA dari legacy (toleransi variasi nama header lama) — walau template
  resmi kita cuma punya `Tipe_Subsidiary`, fallback ini dipertahankan untuk kompatibilitas kalau ada user yang
  masih pakai file Excel dari template app lama.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review — TIDAK diulang penuh: `konverter-gate.tsx` adalah logic YANG SAMA PERSIS yang sudah
      direview Fase 151 (cuma dipindah lokasi file), `item-transfer.ts`/`journal-voucher.ts` pure client logic
      tanpa DB/route/secret baru. Tidak ada permukaan risiko baru dari fase ini.
- [x] Temuan Critical/High — tidak ada.
- [x] Temuan Medium/Low — tidak ada.
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- 13 tipe transaksi sisanya BELUM diporting — menyusul Fase 153+.
- Journal Voucher: toleransi balance `Math.abs(sum) >= 0.005` (rounding 2 desimal) — SAMA PERSIS legacy, bukan
  perubahan. Kalau ada kasus riil currency dengan >2 desimal, revisit (belum pernah jadi masalah legacy).

## Ringkasan Hasil
2 tipe transaksi baru diporting dengan fidelity terverifikasi (exact-string XML match + cakupan kasus tepi
balance/multi-currency untuk Journal Voucher). Gerbang subscription per-halaman di-DRY-kan jadi 1 component
reusable, siap dipakai 13 tipe sisanya tanpa duplikasi lebih lanjut. 79 test lolos di `lib/converter/` (total
akumulatif sejak Fase 151). Suite penuh 1636 (api) + 176 (web) pass, 0 fail. typecheck+lint bersih.
