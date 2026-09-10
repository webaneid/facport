# Fase 89 — Ekspansi Field Opsional Purchase Payment (Sesuai Wishlist Client)

**Status:** Done
**Mulai:** 2026-09-10
**Selesai:** 2026-09-10

## Tujuan
Setelah Fase 88 (audit & perbaikan bug), client kirim wishlist Excel
untuk Purchase Payment (`template-purchase-payment.xlsx` Sheet1, copy
dari template kompetitor `Sample_Format_Import_PP_v4.0.xlsx`) — mirror
pola Fase 85 Sales Receipt: 23 kolom, 6 sudah ada, 16 baru + 1 skip.

## Scope
Detail lengkap tabel keputusan per-kolom, keputusan desain (Cheque
Amount eksplisit vs auto-SUM, boolean Y/kosong, paymentMethod enum,
detailDiscount nested, PPh ID validasi-only) → lihat
`docs/architecture/architecture-purchase-payment.md` § "Ekspansi Field
Opsional — Fase 89".

- [x] Riset 5 sumber independen (wishlist client, template kompetitor,
      595 baris data transaksi ASLI kompetitor, spec resmi Accurate,
      5 screenshot UI Accurate asli dari client)
- [x] Tulis rencana LENGKAP ke architecture doc SEBELUM eksekusi
      (instruksi eksplisit user: "jangan eksekusi sebelum benar2
      perencanaannya matang")
- [x] Konfirmasi 3 keputusan terbuka ke user (PPh ID, Branch
      wajib/opsional, nama field internal) sebelum eksekusi
- [x] Implementasi 16 field baru di `purchase-payment.mapping.ts`
- [x] Reuse infrastruktur Tax ID Sales Receipt Fase 86 untuk "PPh ID"
      (`accurate-tax.ts`, `findTaxByIdentifier` — TIDAK ditulis ulang)
- [x] Tambah scope `tax_view` ke modul `purchase_payment`
- [x] Update `template-guide.ts`, dropdown `import/page.tsx`,
      `edit-row-dialog.tsx` — urutan PERSIS wishlist client
- [x] Test baru (29 test) mirror pola `sales-receipt.mapping.test.ts`

## Sumber & Metodologi Riset
**5 sumber independen** (lebih ketat dari Fase 85 Sales Receipt):
1. Wishlist client — `template-purchase-payment.xlsx` Sheet1, 23 kolom.
2. Template kompetitor `Sample_Format_Import_PP_v4.0.xlsx` — header
   PERSIS sama dengan wishlist (client contoh dari file ini utuh).
3. **595 baris data TRANSAKSI ASLI** kompetitor (bukan cuma template
   kosong) — dicek pemakaian nyata tiap kolom. Temuan: 7 field selalu
   dipakai (100%), 13 field 0% pernah dipakai, grouping multi-faktur
   NYATA dipakai (16% dari 506 pembayaran unik bayar >1 faktur, sampai
   4 faktur sekaligus) — mengkonfirmasi desain Fase 50 sudah benar.
4. Spec resmi Accurate (`accurate-openapi.json` §
   `/api/purchase-payment/save.do`) — DICEK LANGSUNG, BUKAN diasumsikan
   sama persis Sales Receipt walau memang mirip. Ketemu perbedaan
   nyata: Purchase Payment TIDAK PUNYA `useCredit`/`passValidateInvoiceDate`/
   `departmentName` (level detailInvoice) sama sekali — konsisten
   dengan wishlist client yang juga tidak menyebutnya.
5. **5 screenshot UI Accurate ASLI** ("Pembayaran Pembelian") dari
   client — konfirmasi struktur "Informasi Diskon" (tab terpisah), alur
   "Dipotong PPh" (checkbox → detail muncul, PPh Amount read-only), dan
   field Cheque No/Date/Payment Method di section "Info lainnya".

**Temuan metodologi berulang**: Penjelasan Kolom kompetitor untuk
`Payment Method` cuma sebut 8 nilai (lewat `CREDIT_CARD`/`DEBIT_CARD`/
`E_WALLET`) — DICEK ULANG ke spec resmi, ternyata 11 nilai (IDENTIK
Sales Receipt). Pola persis sama dengan temuan Fase 85 — dokumentasi
kompetitor TIDAK BOLEH jadi satu-satunya sumber.

## Keputusan Kecil Selama Eksekusi
- **PPh ID validasi-only, REUSE 100%** dari `accurate-tax.ts` (Sales
  Receipt Fase 86) — tidak menulis ulang logic lookup, cuma tambah
  fungsi `validateTaxIdsForPurchasePayment` (mirror
  `validateTaxIdsForReceipt`) dan scope `tax_view`.
- **Branch: OPSIONAL** — dikonfirmasi user ("kalau accurate bilang
  opsional ya opsional") meski kompetitor tandai "WAJIB" & screenshot
  UI tunjukkan "Cabang*" — data 595 baris nyata 0% pernah diisi,
  konsisten prinsip ikuti spec + data real.
- **Nama field internal `paymentTotalAmount`** dipertahankan (bukan
  nama lain) — user serahkan ke kebijakan asal Excel-facing tetap
  "Cheque Amount" (sudah demikian, field internal tidak terlihat user).
- **Alias collision**: `extractTaxIdsFromRows` diekspor DUA kali (Sales
  Receipt & Purchase Payment mapping) — diimpor dengan alias
  `extractTaxIdsFromRowsPP` di `workers/index.ts`, konsisten pola alias
  existing (`buildDetailItemFromRow as buildDetailItemFromRowSI`).

## File yang Diubah
- `apps/api/src/lib/import-mapping/purchase-payment.mapping.ts` — 16
  field baru, infrastruktur baru identik Sales Receipt (`toAccurateBoolean`/
  `TRUE_TEXT_VALUES`, `toAccuratePaymentMethod`/`VALID_PAYMENT_METHODS`,
  `buildDetailDiscountFromRowValues`, `extractTaxIdsFromRows`),
  `buildPurchasePaymentPayload` diperluas (return type dilonggarkan ke
  `Record<string, unknown>`).
- `apps/api/src/lib/import-mapping/purchase-payment.mapping.test.ts` —
  29 test baru (43 total, dari 14).
- `apps/api/src/lib/import-mapping/template-guide.ts` —
  `purchasePaymentTemplateGuide` diperluas 16 baris baru, urutan sesuai
  wishlist client.
- `apps/api/src/workers/index.ts` — `validateTaxIdsForPurchasePayment`
  baru, dipanggil di `processPurchasePaymentGroup` SEBELUM
  `buildPurchasePaymentPayload`.
- `apps/api/src/lib/accurate-scopes.ts` — scope `tax_view` ditambah ke
  `purchase_payment`.
- `apps/web/app/app/(protected)/purchase-payment/import/page.tsx` — 16
  opsi dropdown baru, urutan sesuai wishlist.
- `apps/web/components/purchase-payment/edit-row-dialog.tsx` —
  `chequeDate` ditambah ke `DATE_INTERNAL_FIELDS`, hint baru untuk
  `paymentMethod`/`paidPph`/`taxId`.
- `docs/architecture/architecture-purchase-payment.md` — section
  "Ekspansi Field Opsional — Fase 89" lengkap (riset + tabel keputusan
  23 kolom + 8 keputusan desain), paragraf basi lama diperbaiki.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Eksekusi kode.
- [x] Test baru — 29 test (root fields, paymentMethod translasi 11
      nilai, boolean Y/kosong, decimal precision, Cheque Amount
      eksplisit vs auto-SUM, detailInvoice paidPph/pphNumber,
      detailDiscount nesting, PPh ID extraction & payload-safety guard).
- [x] Type check nol error (`bun run typecheck`).
- [x] Security review inline — pola identik Sales Receipt Fase 85/86
      yang sudah direview (tidak ada endpoint baru, whitelist enum,
      reuse token existing). Tidak ada temuan.
- [x] `docs/PROGRESS.md` diupdate ke Done.

## Known Limitations
- PPh ID (`taxId`) belum diverifikasi via test call NYATA di context
  Purchase Payment secara spesifik — infrastruktur (`accurate-tax.ts`)
  SUDAH diverifikasi nyata untuk Sales Receipt Fase 86 (function
  generik, tidak spesifik modul), jadi confidence tinggi TANPA perlu
  test call ulang — TAPI belum ada koneksi dev Purchase Payment aktif
  untuk uji end-to-end penuh (grouping + validasi + save.do sekaligus).
- Sama seperti Fase 85, belum divalidasi dengan Excel data REAL dari
  client (data test masih manual/manufactured berdasarkan pola 595
  baris kompetitor).

## Ringkasan Hasil
16 field baru BERHASIL diimplementasikan mirror PERSIS pola Sales
Receipt Fase 85/86: 8 field root (description/branchName/currencyCode/
rate/paymentTotalAmount/chequeNo/chequeDate/paymentMethod), 2 field
per-invoice (paidPph/pphNumber), 5 field `detailDiscount[]` nested, 1
field validasi-only (PPh ID, reuse 100% infrastruktur Fase 86). 1 field
di-skip (PPh Amount, read-only/auto-computed, dikonfirmasi screenshot).
Riset 5 sumber independen (lebih ketat dari Fase 85) menemukan 1
koreksi penting (paymentMethod 8→11 nilai, sama pola Fase 85) dan
mengkonfirmasi desain grouping Fase 50 sudah benar (16% data nyata
multi-faktur). `bun run typecheck` 0 error, `apps/api` 569 pass/0 fail
(29 baru), `apps/web` 50 pass/0 fail.
