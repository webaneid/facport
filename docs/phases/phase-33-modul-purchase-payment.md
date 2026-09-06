# Fase 33 — Modul Purchase Payment (Pembayaran Pembelian)

**Status:** Done
**Mulai:** 2026-09-05
**Selesai:** 2026-09-05

## Tujuan
Eksekusi modul ke-4 dari 5 sub-modul yang dijual (ADR-0019): Purchase
Payment — aplikasi pembayaran ke Faktur Pembelian yang SUDAH ADA di
Accurate (BUKAN mirror Purchase Invoice, § riset di
`docs/architecture/architecture-purchase-payment.md`). Modul mengikuti
pola `vendor_payable_account` (per-baris, TIDAK ada grouping seperti
Purchase Invoice/Sales Invoice) karena 1 baris Excel = 1 pembayaran = 1
faktur, sesuai keputusan yang sudah dikonfirmasi user sebelum eksekusi.

## Scope
- [x] `apps/api/src/lib/import-mapping/purchase-payment.mapping.ts`
      (baru) — `purchasePaymentMapping` + `buildPurchasePaymentPayload()`,
      1 kolom "Jumlah Bayar" dipakai untuk `chequeAmount` DAN
      `detailInvoice[0].paymentAmount` sekaligus (selalu sama nilainya,
      § keputusan partial/lunas di architecture doc).
- [x] `apps/api/src/lib/accurate-purchase-payment.ts` (baru) —
      `savePurchasePayment()`, POST `purchase-payment/save.do` LANGSUNG
      TANPA lookup vendor/faktur (beda dari `accurate-vendor.ts` —
      `vendorNo`/`invoiceNo` dikirim apa adanya, Accurate yang validasi
      eksistensinya).
- [x] `apps/api/src/lib/import-mapping/template-guide.ts` — tambah
      `purchasePaymentTemplateGuide`.
- [x] `apps/api/src/routes/purchase-payment-import.route.ts` (baru) —
      mirror `vendor-payable-account-import.route.ts` 1:1 (template/
      list/upload/confirm/detail/retry, `moduleAccess: "purchase_payment"`,
      `permission: "import.create"`).
- [x] `apps/api/src/workers/index.ts` — tambah
      `case "purchase_payment"` di `processImportRow()`, diproses lewat
      jalur per-baris existing (else branch job `IMPORT_TO_ACCURATE`),
      TIDAK butuh cabang grouping baru.
- [x] `apps/api/src/app.ts` — daftarkan `purchasePaymentImportRoute`.
- [x] `apps/web/app/app/(protected)/purchase-payment/import/page.tsx` +
      `[batchId]/page.tsx` (baru) — mirror halaman
      `vendor/payable-account/import/*` 1:1.
- [x] `apps/web/components/app-shell/sidebar.tsx` — item nav baru
      "Import Purchase Payment" (`moduleKey: "purchase_payment"`, icon
      `Wallet`).
- [x] `apps/api/src/routes/purchase-payment-import.route.test.ts` (baru,
      7 test) — mirror `vendor-payable-account-import.route.test.ts`
      (401/403 guard, ownership batch, validasi mapping wajib, list
      scoped per-subscription).

**TIDAK termasuk scope ini** (sudah tersedia dari fase sebelumnya, tidak
perlu perubahan): scope OAuth Accurate (`purchase_payment_view`/
`_save`/`glaccount_view` sudah disiapkan Fase 14), katalog modul admin
(`module-options.ts`/`plans.route.ts` `t.Literal("purchase_payment")`
sudah ada sejak ADR-0019).

## Referensi
- Architecture: `docs/architecture/architecture-purchase-payment.md`
- Pola per-baris (template implementasi): `docs/phases/phase-04-import-vendor.md`
- Katalog 5 sub-modul: `docs/decisions/adr-0019-gating-per-sub-modul-dan-katalog-plan.md`

## Keputusan Kecil Selama Eksekusi
- Tidak ada ADR baru — semua keputusan desain (granularitas 1-baris,
  no-auto-create vendor/faktur, 1-kolom Jumlah Bayar untuk lunas
  maupun sebagian) sudah tuntas dan terdokumentasi penuh di architecture
  doc sebelum eksekusi dimulai (pola sama seperti Fase 04 Vendor Payable
  Account, yang juga tidak butuh ADR terpisah).
- Modul ini TIDAK mendapat endpoint "Batal Import" (`CANCEL_IMPORT`
  job) — konsisten dengan `vendor_payable_account` yang juga tidak
  punya endpoint cancel (job itu hardcode cabang `purchase_invoice`/
  `sales_invoice` saja). Membatalkan pembayaran yang sudah tercatat
  bukan operasi yang aman/jelas by design (2 pembayaran sama nominal ke
  faktur sama adalah 2 transaksi valid berbeda, bukan duplikat, §
  architecture doc "Worker Processing") — tidak ditambahkan tanpa
  kebutuhan nyata.
- Icon sidebar baru: `Wallet` (lucide-react) — `Landmark`/`Receipt`/
  `CreditCard` sudah dipakai item nav lain, dihindari supaya tidak
  ambigu secara visual.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — 0 error (api+web)
- [x] Lint nol error (`bun run lint`) — 0 error
- [x] Test suite penuh — 205 pass/0 fail (api), termasuk 7 test baru
      modul ini
- [x] Verifikasi payload manual — `buildPurchasePaymentPayload()` dicek
      langsung hasilkan bentuk `{vendorNo, bankNo, transDate,
      chequeAmount, detailInvoice: [{invoiceNo, paymentAmount}]}` yang
      cocok persis skema `save.do` di architecture doc.
- [x] Security review dijalankan (inline — file baru MEKANIS, reuse
      pola `vendor-payable-account-import.route.ts` yang sudah diaudit
      Fase 04/28: schema Elysia lengkap tiap field, guard
      permission+moduleAccess dua lapis, ownership check
      `subscriptionId` sebelum akses batch manapun — TIDAK ada pola
      auth/validasi baru yang butuh audit ulang dari nol. 0 temuan.)
- [x] Temuan Critical/High — tidak ada
- [x] Temuan Medium/Low — tidak ada, tidak perlu catatan
      `docs/lessons-learned.md`
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Belum ada plan aktif untuk `purchase_payment` di database — admin
  WAJIB bikin plan baru di `/admin/plans` sebelum fitur ini bisa dibeli
  siapa pun (pola sama seperti modul-modul lain saat baru dibangun).
- Verifikasi visual browser TIDAK dilakukan (ekstensi Chrome tidak
  tersambung sepanjang sesi ini) — verifikasi dilakukan lewat test
  suite otomatis + inspeksi payload manual saja.
- Sesuai desain: kalau `vendorNo` atau `invoiceNo` salah ketik/belum ada
  di Accurate, baris gagal dengan pesan error dari Accurate langsung
  (tidak ada auto-fix/auto-create) — user perlu Edit Baris (fitur umum
  yang sudah ada di alur import) lalu retry manual.

## Ringkasan Hasil
Modul Purchase Payment (pembayaran ke Faktur Pembelian existing) selesai
dibangun mengikuti arsitektur yang sudah difinalkan sebelum eksekusi:
1 baris Excel = 1 pembayaran = 1 faktur, diproses per-baris (bukan
grouping), vendor & faktur WAJIB sudah ada di Accurate (tidak
auto-create), dan 1 kolom "Jumlah Bayar" mendukung baik pelunasan penuh
maupun pembayaran sebagian tanpa kompleksitas tambahan (Accurate yang
menghitung sisa saldo).

Implementasi mengikuti pola `vendor_payable_account` (Fase 04) persis:
mapping file, service Accurate (`save.do` langsung tanpa lookup), route
6-endpoint, halaman upload+detail, entri sidebar. Typecheck 0 error,
lint 0 error, test suite 205 pass/0 fail (7 baru). Security review
inline: 0 temuan (pola reuse dari route yang sudah teraudit).

Data test yang regrow dari test run dibersihkan, sisa `admin@facport.test`
+ `user@facport.com`.
