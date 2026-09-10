# Fase 96 — Modul Baru: Other Payment (Pembayaran Bank/Kas)

**Status:** Planned
**Mulai:**
**Selesai:**

## Tujuan
Client minta modul baru "Other Payment" (Pembayaran Bank/Kas) —
pengeluaran kas/bank untuk beban langsung (listrik, gaji, dll) TANPA
faktur/vendor, beda dari Purchase Payment yang khusus melunasi faktur
pembelian yang sudah ada. Riset field mapping SUDAH SELESAI (§
`docs/architecture/architecture-other-payment.md`), fase ini untuk
EKSEKUSI implementasi.

## Scope
- [ ] Buat `apps/api/src/lib/import-mapping/other-payment.mapping.ts` +
      test (grouping by "Trans No", pola sama Sales Receipt/Journal
      Voucher — LANGSUNG grouping-by-default, tanpa dual-opsi)
- [ ] Buat `apps/api/src/lib/accurate-other-payment.ts` (client `save.do`)
- [ ] Buat `apps/api/src/routes/other-payment-import.route.ts` + test
      (mirror struktur `journal-voucher-import.route.ts`: upload,
      confirm, get, retry, edit-baris single+bulk, template)
- [ ] Tambah case `"other_payment"` di `apps/api/src/workers/index.ts`
- [ ] Tambah `other_payment` di `apps/api/src/lib/accurate-scopes.ts`
      (`other_payment_view`, `other_payment_save`, `glaccount_view`)
- [ ] Tambah `t.Literal("other_payment")` di
      `apps/api/src/routes/admin/plans.route.ts`
- [ ] Tambah `otherPaymentTemplateGuide` di `template-guide.ts`
- [ ] Frontend: halaman import (`/other-payment/import`), detail batch
      (`[batchId]`), riwayat, `edit-row-dialog.tsx` — mirror struktur
      Jurnal Umum/Sales Receipt
- [ ] Update `module-options.ts` (grup BARU "Kas & Bank" — keputusan
      kecil, belum ada grup ini di katalog), `module-import-routes.ts`,
      `landing-content.ts`, `sidebar.tsx`, `import-batch-table.tsx`,
      admin `[batchId]/page.tsx`
- [ ] Field: `projectNo` per-baris + `charField1-10`/`numericField1-10`/
      `dateField1-2` level root — DIIMPLEMENTASI dengan catatan "belum
      diverifikasi end-to-end untuk endpoint ini" (§ architecture doc
      § "2 Gap Ditemukan")
- [ ] TIDAK implementasi tab "Deferral" — gap terbuka, dicatat di Known
      Limitations, TIDAK diriset lebih lanjut fase ini (keputusan user)
- [ ] Typecheck + test + security review
- [ ] Update `docs/PROGRESS.md`

## Referensi
- Architecture doc: `docs/architecture/architecture-other-payment.md`
  (riset field lengkap, keputusan desain, footprint file)
- Template client: `docs/referencehtml/CLIENT_other-payment-v1.2.xlsx`
  + screenshot `docs/referencehtml/op-client-images/`
- Precedent modul serupa (mirror struktur): Fase 50 (Journal Voucher
  Opsi B), Fase 49 (Sales Receipt grouping)

## Keputusan Kecil Selama Eksekusi
- Grup katalog module baru "Kas & Bank" (BELUM ada di `MODULE_OPTIONS`
  saat ini — grup existing: Penjualan, Pembelian, Buku Besar, Data
  Master) — perlu dikonfirmasi user apakah nama grup ini tepat atau ada
  preferensi lain sebelum eksekusi frontend.
- `projectNo`/`charField` dkk diimplementasi TANPA verifikasi test call
  nyata dulu (beda dari Fase 95 yang verifikasi currency dulu) — atas
  instruksi eksplisit user ("yang sudah ada dulu dokumentasikan sisakan
  yg belum") — RISIKO: bisa jadi sama seperti kasus PPh Sales Receipt
  (field terkirim tapi diam-diam diabaikan Accurate). WAJIB test manual
  nyata setelah deploy sebelum dianggap benar-benar berfungsi.

## Checklist Sebelum Ditutup (sesuai SOP)
- [ ] Type check nol error (`bun run typecheck`)
- [ ] Security review dijalankan
- [ ] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan)
- [ ] `docs/PROGRESS.md` diupdate

## Known Limitations
- Tab "Deferral" TIDAK diimplementasi — 0 sinyal field API di seluruh
  spec Accurate (2.3MB, semua endpoint), butuh riset terpisah/tiket
  Support kalau client benar-benar butuh nanti.
- `projectNo`/`charField1-10`/`numericField1-10`/`dateField1-2` BELUM
  diverifikasi test call nyata KHUSUS untuk `other-payment/save.do` —
  bukti yang ada berasal dari endpoint LAIN (projectNo) dan modul LAIN
  (charField, dikonfirmasi untuk Purchase Invoice via email Support,
  Fase 64) — DIASUMSIKAN konsisten tapi belum dibuktikan langsung.

## Ringkasan Hasil (isi pas fase Done)
