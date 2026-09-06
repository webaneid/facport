# Fase 34 — Modul Sales Receipt (Penerimaan Penjualan)

**Status:** Done
**Mulai:** 2026-09-05
**Selesai:** 2026-09-05

## Tujuan
Eksekusi modul ke-2 dari 2 sisa modul yang belum dikerjakan (Sales
Receipt, Jurnal Umum — § audit modul `docs/PROGRESS.md` 2026-09-05,
lanjutan setelah Fase 33 Purchase Payment): Sales Receipt — aplikasi
penerimaan pembayaran ke Faktur Penjualan yang SUDAH ADA di Accurate.
Riset ke OpenAPI spec (`sales-receipt/save.do`)
mengonfirmasi modul ini adalah bayangan cermin PERSIS Purchase Payment
(Fase 33) — struktur field IDENTIK 100%, cuma `vendorNo` → `customerNo`
dan faktur acuan Faktur Penjualan (bukan Faktur Pembelian). Semua
keputusan desain di-reuse dari Fase 33 tanpa perlu konfirmasi ulang ke
user (§ `docs/architecture/architecture-sales-receipt.md`).

## Scope
- [x] `apps/api/src/lib/import-mapping/sales-receipt.mapping.ts` (baru)
      — `salesReceiptMapping` + `buildSalesReceiptPayload()`, mirror
      `purchase-payment.mapping.ts` (vendorNo→customerNo).
- [x] `apps/api/src/lib/accurate-sales-receipt.ts` (baru) —
      `saveSalesReceipt()`, POST `sales-receipt/save.do` LANGSUNG TANPA
      lookup customer/faktur.
- [x] `apps/api/src/lib/import-mapping/template-guide.ts` — tambah
      `salesReceiptTemplateGuide`, header Excel konsisten dengan
      `sales-invoice.mapping.ts` ("Customer No").
- [x] `apps/api/src/routes/sales-receipt-import.route.ts` (baru) —
      mirror `purchase-payment-import.route.ts` 1:1 (template/list/
      upload/confirm/detail/retry, `moduleAccess: "sales_receipt"`).
- [x] `apps/api/src/workers/index.ts` — tambah
      `case "sales_receipt"` di `processImportRow()`, diproses lewat
      jalur per-baris existing.
- [x] `apps/api/src/app.ts` — daftarkan `salesReceiptImportRoute`.
- [x] `apps/web/app/app/(protected)/sales-receipt/import/page.tsx` +
      `[batchId]/page.tsx` (baru) — mirror halaman
      `purchase-payment/import/*` 1:1.
- [x] `apps/web/components/app-shell/sidebar.tsx` — item nav baru
      "Import Sales Receipt" (`moduleKey: "sales_receipt"`, icon
      `HandCoins`).
- [x] `apps/api/src/routes/sales-receipt-import.route.test.ts` (baru, 7
      test) — mirror `purchase-payment-import.route.test.ts`.

**TIDAK termasuk scope ini** (sudah tersedia dari fase sebelumnya):
scope OAuth Accurate (`sales_receipt_view`/`_save` sudah disiapkan Fase
14, TIDAK butuh `glaccount_view` tambahan — beda dari Purchase Payment
yang menambahkannya untuk fitur validasi `bankNo` yang juga tidak
dibangun), katalog modul admin (`module-options.ts`/`plans.route.ts`
`t.Literal("sales_receipt")` sudah ada sejak ADR-0019).

## Referensi
- Architecture: `docs/architecture/architecture-sales-receipt.md`
- Bayangan cermin (sumber semua keputusan desain): Fase 33,
  `docs/architecture/architecture-purchase-payment.md`
- Katalog 5 sub-modul: `docs/decisions/adr-0019-gating-per-sub-modul-dan-katalog-plan.md`

## Keputusan Kecil Selama Eksekusi
- Tidak ada ADR baru — riset OpenAPI spec mengonfirmasi 0 perbedaan
  struktural dari Purchase Payment (cuma nama field vendor→customer),
  jadi tidak ada keputusan baru yang perlu didiskusikan (semua 4
  keputusan di architecture doc adalah REUSE dari Fase 33, bukan
  keputusan baru).
- Icon sidebar baru: `HandCoins` (lucide-react) — dipilih supaya beda
  visual dari `Wallet` (Purchase Payment, uang KELUAR) untuk uang
  MASUK/diterima.
- Modul ini juga TIDAK mendapat endpoint "Batal Import", konsisten
  dengan Purchase Payment (alasan sama: 2 penerimaan nominal sama ke
  faktur sama adalah 2 transaksi valid berbeda, bukan duplikat).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — 0 error (api+web)
- [x] Lint nol error (`bun run lint`) — 0 error
- [x] Test suite penuh — 212 pass/0 fail (api), termasuk 7 test baru
      modul ini (naik dari 205 di Fase 33)
- [x] Verifikasi payload manual — `buildSalesReceiptPayload()` dicek
      langsung hasilkan bentuk `{customerNo, bankNo, transDate,
      chequeAmount, detailInvoice: [{invoiceNo, paymentAmount}]}` yang
      cocok persis skema `sales-receipt/save.do` di OpenAPI spec.
- [x] Security review dijalankan (inline — file baru MEKANIS, reuse
      pola `purchase-payment-import.route.ts` yang sudah diaudit Fase
      33: schema Elysia lengkap tiap field, guard permission+
      moduleAccess dua lapis, ownership check `subscriptionId` sebelum
      akses batch manapun. 0 temuan.)
- [x] Temuan Critical/High — tidak ada
- [x] Temuan Medium/Low — tidak ada, tidak perlu catatan
      `docs/lessons-learned.md`
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Belum ada plan aktif untuk `sales_receipt` di database — admin WAJIB
  bikin plan baru di `/admin/plans` sebelum fitur ini bisa dibeli
  siapa pun.
- Verifikasi visual browser TIDAK dilakukan (ekstensi Chrome tidak
  tersambung) — verifikasi lewat test suite otomatis + inspeksi
  payload manual saja.
- Sesuai desain: kalau `customerNo` atau `invoiceNo` salah ketik/belum
  ada di Accurate, baris gagal dengan pesan error dari Accurate
  langsung (tidak ada auto-fix/auto-create).

## Ringkasan Hasil
Modul Sales Receipt (penerimaan pembayaran dari Faktur Penjualan
existing) selesai dibangun. Bersama Purchase Payment (Fase 33), ini
menyelesaikan 2 dari 2 modul yang tersisa dari audit "sudah dieksekusi
vs belum" (§ `docs/PROGRESS.md` 2026-09-05) — SISA 1 modul terakhir
dari katalog 5 sub-modul ADR-0019 yang BELUM dikerjakan: **Jurnal Umum
(Journal Voucher)**, yang arsitekturnya beda paling jauh (GL debit/
kredit lines, tanpa vendor/customer) — belum diriset sama sekali di
sesi ini, menunggu arahan user untuk lanjut.

Riset OpenAPI spec (`sales-receipt/save.do`) mengonfirmasi modul ini
IDENTIK strukturnya dengan Purchase Payment (Fase 33) — implementasi
mengikuti pola itu 1:1 tanpa penyesuaian desain. Typecheck 0 error,
lint 0 error, test suite 212 pass/0 fail (7 baru). Security review
inline: 0 temuan.

Data test yang regrow dari test run dibersihkan, sisa `admin@facport.test`
+ `user@facport.com`.

Status katalog 6 sub-modul (5 ADR-0019 + 1 Data Master ADR-0026) saat
ini: **5 sudah punya implementasi end-to-end lengkap** (Purchase
Invoice, Sales Invoice, Vendor Payable Account, Purchase Payment, Sales
Receipt), **1 belum** (Jurnal Umum). Modul yang belum ada plan aktif di
database (Vendor Payable Account, Purchase Payment, Sales Receipt)
tetap perlu admin bikin plan-nya dulu sebelum bisa dijual.
