# Fase 35 — Modul Jurnal Umum (Journal Voucher)

**Status:** Done
**Mulai:** 2026-09-05
**Selesai:** 2026-09-05

## Tujuan
Eksekusi modul TERAKHIR dari katalog 5 sub-modul yang dijual (ADR-0019):
Jurnal Umum — transaksi akuntansi murni (debit/kredit ke akun COA),
BEDA TOTAL dari 4 modul lain yang semua berputar di sekitar vendor/
customer + faktur. Riset OpenAPI spec (`journal-voucher/save.do`)
mengonfirmasi modul ini butuh minimal 2 baris (debit+kredit, WAJIB
seimbang) per transaksi — beda dari Purchase Payment/Sales Receipt yang
1 baris = 1 transaksi. § `docs/architecture/architecture-journal-voucher.md`.

**Keputusan desain**: dipresentasikan 2 opsi granularitas Excel ke user
via AskUserQuestion (bukan asumsi sepihak, karena ini genuinely
keputusan baru — beda dari Purchase Payment/Sales Receipt yang 0
keputusan baru): (A) format lebar — 1 baris Excel = 1 jurnal lengkap
(Akun Debit + Nominal Debit + Akun Kredit + Nominal Kredit dalam 1
baris), sederhana tapi cuma 2-akun; (B) format panjang — grouping by
"Nomor Jurnal" (reuse pola Bill No ADR-0011), mendukung N-akun tapi
lebih kompleks. **User memilih Opsi A** — modul ini akhirnya SESEDERHANA
Purchase Payment/Sales Receipt (per-baris, tanpa grouping).

## Scope
- [x] `apps/api/src/lib/import-mapping/journal-voucher.mapping.ts`
      (baru) — `journalVoucherMapping` + `buildJournalVoucherPayload()`.
      **Beda dari modul lain**: fungsi ini MELEMPAR Error kalau
      `debitAmount !== creditAmount` (validasi double-entry LOKAL,
      sebelum panggil Accurate sama sekali — hemat rate limit, pesan
      error lebih jelas).
- [x] `apps/api/src/lib/accurate-journal-voucher.ts` (baru) —
      `saveJournalVoucher()`, POST `journal-voucher/save.do` LANGSUNG
      TANPA lookup akun COA.
- [x] `apps/api/src/lib/import-mapping/template-guide.ts` — tambah
      `journalVoucherTemplateGuide`.
- [x] `apps/api/src/routes/journal-voucher-import.route.ts` (baru) —
      mirror `purchase-payment-import.route.ts` 1:1 (template/list/
      upload/confirm/detail/retry, `moduleAccess: "journal_voucher"`).
- [x] `apps/api/src/workers/index.ts` — tambah
      `case "journal_voucher"` di `processImportRow()`, diproses lewat
      jalur per-baris existing (error dari `buildJournalVoucherPayload()`
      ditangkap try/catch generik yang sudah ada, row ditandai `failed`
      dengan pesan balance TANPA panggil Accurate).
- [x] `apps/api/src/app.ts` — daftarkan `journalVoucherImportRoute`.
- [x] `apps/web/app/app/(protected)/journal-voucher/import/page.tsx` +
      `[batchId]/page.tsx` (baru) — mirror halaman
      `purchase-payment/import/*` 1:1.
- [x] `apps/web/components/app-shell/sidebar.tsx` — item nav baru
      "Import Jurnal Umum" (`moduleKey: "journal_voucher"`, icon
      `BookOpenCheck`).
- [x] `apps/api/src/routes/journal-voucher-import.route.test.ts` (baru,
      7 test) — mirror `purchase-payment-import.route.test.ts`.
- [x] `apps/api/src/lib/import-mapping/journal-voucher.mapping.test.ts`
      (baru, 3 test) — UNIT TEST KHUSUS untuk validasi balance (jurnal
      seimbang → payload benar; jurnal TIDAK seimbang → throw; field
      opsional kosong → tidak dikirim). Modul lain (Purchase Payment,
      Sales Receipt) TIDAK dapat test mapping terpisah karena tidak
      punya logic baru yang perlu diuji sendiri (murni passthrough) —
      modul ini beda, punya validasi baru yang layak diuji eksplisit.

**TIDAK termasuk scope ini** (sudah tersedia dari fase sebelumnya):
scope OAuth Accurate (`journal_voucher_view`/`_save`/`glaccount_view`
sudah disiapkan Fase 14), katalog modul admin
(`module-options.ts`/`plans.route.ts` `t.Literal("journal_voucher")`
sudah ada sejak ADR-0019).

## Referensi
- Architecture: `docs/architecture/architecture-journal-voucher.md`
- Pola per-baris (template implementasi): `docs/architecture/architecture-purchase-payment.md`, Fase 33
- Katalog 5 sub-modul: `docs/decisions/adr-0019-gating-per-sub-modul-dan-katalog-plan.md`

## Keputusan Kecil Selama Eksekusi
- Tidak ada ADR baru — keputusan granularitas Excel (Opsi A vs B)
  didokumentasikan penuh langsung di architecture doc (dikonfirmasi via
  AskUserQuestion, bukan diskusi bebas di chat) — cukup, konsisten pola
  modul lain yang juga tidak butuh ADR terpisah.
- `fieldToAccuratePath` untuk `debitAccountNo`/`debitAmount`/
  `creditAccountNo`/`creditAmount` pakai notasi
  `detailJournalVoucher[0].accountNo` dst (bukan prefix `detailItem.`
  seperti Purchase Invoice) — ini MURNI dokumentasi (values di objek
  ini tidak dieksekusi programatik, cuma `Object.keys()` dipakai untuk
  validasi `VALID_FIELDS` di route, sama seperti pola
  `vendor-payable-account.mapping.ts`/`purchase-payment.mapping.ts`).
- Modul ini juga TIDAK mendapat endpoint "Batal Import", konsisten
  dengan Purchase Payment/Sales Receipt.
- Icon sidebar baru: `BookOpenCheck` (lucide-react).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — 0 error (api+web)
- [x] Lint nol error (`bun run lint`) — 0 error
- [x] Test suite penuh — 222 pass/0 fail (api), termasuk 10 test baru
      modul ini (7 route + 3 unit balance validation), naik dari 212
- [x] Security review dijalankan (inline — file baru MEKANIS, reuse
      pola `purchase-payment-import.route.ts` yang sudah diaudit Fase
      33: schema Elysia lengkap tiap field, guard permission+
      moduleAccess dua lapis, ownership check `subscriptionId`. Satu-
      satunya logic BARU — validasi balance debit/kredit — murni
      business logic, tidak menyentuh permukaan auth/validasi input,
      sudah diuji unit test terpisah. 0 temuan.)
- [x] Temuan Critical/High — tidak ada
- [x] Temuan Medium/Low — tidak ada, tidak perlu catatan
      `docs/lessons-learned.md`
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Belum ada plan aktif untuk `journal_voucher` di database — admin
  WAJIB bikin plan baru di `/admin/plans` sebelum fitur ini bisa
  dibeli siapa pun.
- Verifikasi visual browser TIDAK dilakukan (ekstensi Chrome tidak
  tersambung) — verifikasi lewat test suite otomatis + inspeksi
  payload manual saja.
- **Hanya mendukung jurnal 2-akun** (1 debit, 1 kredit) — sesuai Opsi A
  yang dipilih user. Jurnal yang butuh N-akun (split ke banyak
  departemen/akun sekaligus) TIDAK bisa lewat template ini untuk MVP —
  Opsi B (format panjang + grouping) didokumentasikan sebagai alternatif
  di architecture doc kalau nanti ada bukti kebutuhan nyata.
- Sesuai desain: kalau `accountNo` salah ketik/belum ada di Accurate,
  atau debit≠kredit, baris gagal dengan pesan error jelas (tidak ada
  auto-fix/auto-create akun).

## Ringkasan Hasil
Modul Jurnal Umum (transaksi debit/kredit murni ke akun COA) selesai
dibangun — **modul TERAKHIR dari katalog 5 sub-modul ADR-0019, sekarang
SEMUA 5 sub-modul plus 1 modul Data Master (Vendor Payable Account,
ADR-0026) punya implementasi end-to-end lengkap** (backend route +
halaman customer + worker processing): Purchase Invoice, Sales Invoice,
Vendor Payable Account, Purchase Payment, Sales Receipt, Jurnal Umum.

Riset OpenAPI spec menemukan modul ini butuh minimal 2 baris (debit+
kredit seimbang) per transaksi — beda arsitektur dari 4 modul lain.
Karena ini keputusan baru (bukan mirror seperti Purchase Payment/Sales
Receipt), 2 opsi desain dipresentasikan ke user via AskUserQuestion
sebelum kode ditulis — user memilih format lebar (1 baris = 1 jurnal
2-akun), yang membuat implementasi akhirnya SESEDERHANA modul
per-baris lain (tanpa grouping/cross-batch sama sekali).

Satu-satunya logic baru: validasi balance debit=kredit LOKAL (sebelum
panggil Accurate, hemat rate limit + pesan error lebih jelas), diuji
lewat 3 unit test terpisah (modul lain tidak butuh test mapping
terpisah karena murni passthrough).

Typecheck 0 error (api+web), lint 0 error, test suite `apps/api` 222
pass/0 fail (10 baru, naik dari 212). Security review inline: 0 temuan.

Data test yang regrow dari test run dibersihkan, sisa `admin@facport.test`
+ `user@facport.com`.

**Dengan ini, seluruh katalog modul Accurate yang direncanakan (ADR-0019
+ ADR-0026) sudah punya implementasi lengkap.** Pekerjaan lanjutan
(kalau ada) berupa: admin membuat plan aktif untuk modul-modul baru
(Vendor Payable Account, Purchase Payment, Sales Receipt, Jurnal Umum)
di `/admin/plans` supaya bisa dijual, atau fitur tambahan per modul
kalau ada kebutuhan nyata dari user (mis. Opsi B Jurnal Umum N-akun).
