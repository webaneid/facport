# Fase 96 — Modul Baru: Other Payment (Pembayaran Bank/Kas)

**Status:** Done
**Mulai:** 2026-09-10
**Selesai:** 2026-09-10

## Tujuan
Client minta modul baru "Other Payment" (Pembayaran Bank/Kas) —
pengeluaran kas/bank untuk beban langsung (listrik, gaji, dll) TANPA
faktur/vendor, beda dari Purchase Payment yang khusus melunasi faktur
pembelian yang sudah ada. Riset field mapping sudah selesai sejak awal
sesi (§ `docs/architecture/architecture-other-payment.md`), fase ini
untuk EKSEKUSI implementasi — sub-modul TERAKHIR dari roadmap yang
belum dieksekusi (5 sub-modul asli + Akun Hutang Pemasok + modul ini).

Modul ini fully independent, SKU sendiri (sama persis Sales Invoice/
Purchase Invoice/Sales Receipt/Purchase Payment/Journal Voucher) —
admin bisa bikin/harga-kan plan yang mencakupnya, gating akses lewat
`moduleAccess` yang sama, tidak ada perlakuan khusus "gratis".

## Scope
- [x] Buat `apps/api/src/lib/import-mapping/other-payment.mapping.ts` +
      test (grouping by "Trans No", langsung grouping-by-default sejak
      awal — modul baru, tidak ada versi lama yang perlu dijaga)
- [x] Buat `apps/api/src/lib/accurate-other-payment.ts` (client `save.do`)
- [x] Buat `apps/api/src/routes/other-payment-import.route.ts` + test
      (mirror struktur `journal-voucher-import.route.ts`: upload,
      confirm, get, retry, edit-baris single+bulk, template, delete)
- [x] Registrasi route baru di `apps/api/src/app.ts` (TIDAK terdaftar
      di footprint rencana awal — ketahuan & ditambahkan saat eksekusi)
- [x] Tambah case `"other_payment"` di `apps/api/src/workers/index.ts`
      (`processOtherPaymentGroup`, `ensureOtherPaymentDataClassifications`)
- [x] Tambah `other_payment` di `apps/api/src/lib/accurate-scopes.ts`
      (`other_payment_view`, `other_payment_save`, `glaccount_view`,
      **+`data_classification_view`/`_save` dari awal** — pelajaran
      Fase 98, bukan direncanakan awal tapi ditambahkan proaktif)
- [x] Tambah `t.Literal("other_payment")` di
      `apps/api/src/routes/admin/plans.route.ts`
- [x] Tambah `otherPaymentTemplateGuide` di `template-guide.ts`
- [x] Frontend: halaman import (`/other-payment/import`), detail batch
      (`[batchId]`), riwayat, `edit-row-dialog.tsx`, `delete-import-dialog.tsx`
      — mirror struktur Jurnal Umum
- [x] Update `module-options.ts` (grup BARU "Kas & Bank", dikonfirmasi
      user), `module-import-routes.ts`, `landing-content.ts`,
      `sidebar.tsx`, `import-batch-table.tsx`, admin `[batchId]/page.tsx`
- [x] Field: `projectNo` per-baris + `charField1-10`/`numericField1-10`/
      `dateField1-2` level root — DIIMPLEMENTASI dengan catatan "belum
      diverifikasi end-to-end untuk endpoint ini" (§ architecture doc
      § "3 Gap Ditemukan")
- [x] TIDAK implementasi tab "Deferral" — DIVERIFIKASI bukan gap, tidak
      ada kolom Excel untuk ini di template client sama sekali.
- [x] Kolom BARU "Expense Name" ditambah (gap ditemukan saat eksekusi
      — lihat § Keputusan Kecil)
- [x] Auto-create Kategori Keuangan (`findOrCreateDataClassification`)
      dari awal (bukan fase perbaikan terpisah)
- [x] Typecheck (api+web) 0 error
- [x] Test: `other-payment.mapping.test.ts` (15 test), `other-payment-import.route.test.ts` (19 test)
- [x] Security review — tidak ada temuan
- [x] Verifikasi manual browser (login, upload file Excel real, auto-mapping, confirm, job masuk queue)
- [x] Update `docs/PROGRESS.md`

## Referensi
- Architecture doc: `docs/architecture/architecture-other-payment.md`
  (riset field lengkap, keputusan desain, footprint file, koreksi saat eksekusi)
- Template client: `docs/referencehtml/CLIENT_other-payment-v1.2.xlsx`
  + screenshot `docs/referencehtml/op-client-images/`
- Precedent modul serupa (mirror struktur): Fase 50 (Journal Voucher
  Opsi B), Fase 49 (Sales Receipt grouping), Fase 98 (auto-create
  Kategori Keuangan, dipakai sebagai referensi supaya tidak mengulang
  gap yang sama)

## Keputusan Kecil Selama Eksekusi
- Grup katalog module baru **"Kas & Bank"** — dikonfirmasi eksplisit
  user (AskUserQuestion, opsi Recommended dipilih) sebelum eksekusi
  frontend.
- **"Expense Name" (kolom BARU)** — `expenseName` WAJIB di Accurate
  (`detailAccount[].expenseName`, "Nama beban yang ingin dicatat")
  TAPI template client (`CLIENT_other-payment-v1.2.xlsx`, 19 kolom)
  TIDAK PUNYA kolom untuk ini — gap yang tidak ketahuan saat riset awal
  (asumsi keliru bahwa "Account Name" cukup, padahal field itu
  display-only). Ditemukan & diklarifikasi ke user SEBELUM eksekusi
  (bukan setelah), user eksplisit minta tambah kolom baru: *"kalau ada
  di api-nya bikin kolom baru berarti bro.. bahaya kalau kosong gk bisa
  diterima accurate."* — DITAMBAHKAN sebagai kolom wajib baru, BUKAN
  repurpose "Account Name" atau dibiarkan kosong.
- Auto-create Kategori Keuangan (`ensureOtherPaymentDataClassifications`)
  DIBANGUN DARI AWAL (bukan ditunda) — pelajaran langsung dari gap Fase
  98 (Journal Voucher lupa mekanisme ini saat field-nya pertama
  ditambahkan Fase 95) — modul baru ini tidak mengulang kesalahan yang
  sama.
- `EditRowDialog` TIDAK butuh logic XOR sama sekali (beda dari Journal
  Voucher) — modul ini tidak punya field debit/kredit atau field
  mutually-exclusive lain, semua `requiredFields` dicek "wajib berisi"
  apa adanya.
- Verifikasi manual browser dilakukan terhadap DEV SERVER YANG SUDAH
  BERJALAN (proses `next dev`/`bun --watch` milik user, bukan instance
  baru) — sempat tidak sengaja start instance `bun run dev` duplikat
  yang bentrok port dengan proses existing, langsung dihentikan begitu
  ketahuan (lihat `docs/lessons-learned.md`).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — api+web, 0 error.
- [x] Security review dijalankan (skill `security-review`) — tidak ada temuan.
- [x] Temuan Critical/High — tidak ada.
- [x] Temuan Medium/Low — tidak ada yang perlu dicatat.
- [x] `docs/PROGRESS.md` diupdate.
- [x] `apps/api` test suite: 639 pass / 0 fail (termasuk 34 test baru modul ini).
- [x] `apps/web` test suite: 50 pass / 0 fail.
- [x] `bun run lint` — 0 error.
- [x] Verifikasi browser manual (login real, upload file Excel real, cek auto-mapping & alur end-to-end sampai job masuk queue).

## Known Limitations
- `projectNo`/`charField1-10`/`numericField1-10`/`dateField1-2` BELUM
  diverifikasi test call nyata KHUSUS untuk `other-payment/save.do` —
  bukti yang ada berasal dari endpoint LAIN (projectNo, 48 endpoint) dan
  modul LAIN (charField/numericField/dateField, dikonfirmasi resmi
  untuk Purchase Invoice via email Support, Fase 64) — DIASUMSIKAN
  konsisten tapi belum dibuktikan langsung untuk endpoint ini. Kalau
  Accurate diam-diam mengabaikan field ini (pola sama kasus PPh23 Sales
  Receipt), butuh test call nyata terpisah untuk konfirmasi.
- Tab "Deferral" TIDAK diimplementasi — BUKAN gap, tidak ada kolom
  Excel untuk ini di template client (dicek langsung ke file asli).
- **Belum pernah dites transaksi SUNGGUHAN ke Accurate** (test browser
  cuma sampai job masuk antrian — worker di dev environment ini punya
  backlog job lama dari sesi-sesi sebelumnya, job baru belum sempat
  diproses saat verifikasi). Disarankan client/user test manual nyata
  minimal 1x per field opsional setelah deploy, terutama 2 gap field
  di atas.
- Kolom "Expense Name" adalah kolom BARU yang TIDAK ADA di template
  client asli — client perlu diberi tahu untuk menambahkan kolom ini
  saat mengisi data (download template Facport terbaru, jangan pakai
  template lama).

## Ringkasan Hasil
Modul Other Payment (Pembayaran Bank/Kas) selesai diimplementasikan
end-to-end: mapping+builder, client Accurate, route CRUD lengkap
(upload/confirm/get/retry/edit/delete/template), worker processing
(grouping by Trans No, auto-create Kategori Keuangan dari awal), dan
seluruh frontend (halaman import, detail batch, riwayat, dialog edit/
delete) — mirror struktur Journal Voucher tapi tanpa validasi balance.
1 gap ditemukan & diperbaiki saat eksekusi (kolom "Expense Name" baru,
dikonfirmasi user). Semua test pass (639 api + 50 web), typecheck 0
error, security review bersih, dan sudah diverifikasi manual lewat
browser (login, upload Excel real, auto-mapping 100% cocok, confirm
berhasil, job masuk antrian). Ini adalah sub-modul TERAKHIR dari
roadmap Facport yang belum dieksekusi — dengan ini semua sub-modul
sudah punya kode (7 total: Sales Invoice, Purchase Invoice, Sales
Receipt, Purchase Payment, Journal Voucher, Akun Hutang Pemasok, Other
Payment).
