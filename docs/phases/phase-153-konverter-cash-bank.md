# Fase 153 — Konverter: Cash & Bank (Other Deposit/Payment, Customer Receipt, Vendor Payment)

**Status:** Done
**Mulai:** 2026-09-23
**Selesai:** 2026-09-23

## Tujuan
Port 4 tipe transaksi kategori "Cash & Bank" — MENYELESAIKAN kategori ini (5 kalau dihitung dengan yang di
Facport, tapi untuk Konverter ini 4/4 lengkap). `otherdeposit`/`otherpayment` diporting SEBAGAI factory function
(bukan 2 file terduplikasi, mirror `cashbookType(kind)` legacy). `customerreceipt`/`vendorpayment` merujuk
faktur AR/AP yang SUDAH ADA di Accurate (tidak divalidasi eksistensinya di sisi kita).

## Scope
- [x] `lib/converter/types/cashbook.ts` — factory `cashbookType(kind)`, export `otherDepositType`+`otherPaymentType`
- [x] `lib/converter/types/customer-receipt.ts` — port VERBATIM `TYPES.customerreceipt` (`tool.html` 861-908)
- [x] `lib/converter/types/vendor-payment.ts` — port VERBATIM `TYPES.vendorpayment` (`tool.html` 915-967)
- [x] 4 halaman baru + sidebar wiring
- [x] Test: 4 file test (`cashbook.test.ts` cover deposit+payment, `customer-receipt.test.ts`, `vendor-payment.test.ts`),
      termasuk XML exact-string-match per tipe
- [x] Typecheck + lint + test penuh

## Referensi
- Architecture doc: `docs/architecture/architecture-konverter.md`
- ADR: `docs/decisions/adr-0038-produk-konverter.md`
- Phase sebelumnya: `docs/phases/phase-152-konverter-item-transfer-journal-voucher.md`
- Sumber legacy: `/Users/webane/sites/konverter/tool.html` baris 603-671 (`cashbookType`), 861-908
  (`TYPES.customerreceipt`), 915-967 (`TYPES.vendorpayment`)

## Keputusan Kecil Selama Eksekusi
- `cashbookType` diporting SEBAGAI factory function TypeScript (1 file, `ConverterType<CashbookCtx>` dikembalikan
  2x dengan parameter beda) — bukan diporting jadi 2 file terduplikasi — mirror PERSIS pola DRY sumbernya.
- `vendorPaymentType.needsCurrency: false` (BEDA dari `customerReceiptType.needsCurrency: true`) — sengaja
  dipertahankan sesuai legacy: nama mata uang Vendor Payment ikut data pemasok di Accurate (cuma `Kurs` dikirim),
  Customer Receipt punya kolom `Mata_Uang` terpisah.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review — TIDAK diulang penuh (4 tipe baru pure client logic tanpa DB/route/secret baru, halaman
      pakai `KonverterPage` yang sama, sudah direview Fase 151). Tidak ada permukaan risiko baru.
- [x] Temuan Critical/High — tidak ada.
- [x] Temuan Medium/Low — tidak ada.
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Kategori "Cash & Bank" Konverter SELESAI (4/4). 9 tipe transaksi sisanya (Purchase 4, Sales 4, Master Data 1)
  menyusul Fase 154+.
- No_Faktur (Customer Receipt/Vendor Payment) TIDAK divalidasi eksistensinya — sudah dicatat di
  `architecture-konverter.md`, bukan temuan baru.

## Ringkasan Hasil
4 tipe transaksi Cash & Bank diporting dengan fidelity terverifikasi (XML exact-string-match tiap tipe). Kategori
Cash & Bank Konverter SELESAI. 99 test lolos akumulatif di `lib/converter/`. Suite penuh 1636 (api) + 196 (web)
pass, 0 fail. typecheck+lint bersih.
