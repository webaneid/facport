# Fase 73 — Atribut Tambahan Level ITEM (charField/numericField/dateField)

**Status:** Done (kode selesai, menunggu konfirmasi push)
**Mulai:** 2026-09-09
**Selesai:** 2026-09-09

## Tujuan
Menutup investigasi panjang (Fase 67-72) soal "field apa yang client
maksud dengan ITEM: CUSTOM CHARACTER". Pertanyaan KEDUA yang dikirim ke
Accurate Support — kali ini spesifik menanyakan "Atribut Tambahan pada
DETAIL ITEM di transaksi Sales Invoice" (bukan pertanyaan umum seperti
sebelumnya) — akhirnya mengungkap field yang BENAR: `charField1-15`,
`numericField1-10`, `dateField1-2` **JUGA punya versi level ITEM**
(nested di `detailItem`), TERPISAH dari versi level FAKTUR/header yang
sudah diimplementasi Fase 64. Level ITEM punya **15 slot Karakter**
(BUKAN 10 seperti level header) — cocok PERSIS dengan Excel ASLI client
(Fase 55/61) yang punya 15 kolom "ITEM:CUSTOM CHARACTER", membuktikan
Fase 61 KELIRU menyimpulkan "field ini tidak mungkin ada di API".

## Scope
- [x] `sales-invoice.mapping.ts` — `fieldToAccuratePath` tambah
      `attributItemKarakter1-15` → `detailItem.charField1-15`,
      `attributItemAngka1-10` → `detailItem.numericField1-10`,
      `attributItemTanggal1-2` → `detailItem.dateField1-2`.
- [x] `DATE_FIELDS` set tambah `attributItemTanggal1-2` (konversi
      tanggal Accurate DD/MM/YYYY).
- [x] `defaultColumnMap` tambah "ITEM: CUSTOM CHARACTER 1-15"/"ITEM:
      CUSTOM NUMBER 1-10"/"ITEM: CUSTOM DATE 1-2" → field baru di atas
      (nama kolom PERSIS sama seperti Excel asli client, TAPI kali ini
      dengan field API yang BENAR — bukan salah kirim ke Kategori
      Keuangan seperti kesalahan Fase 69).
- [x] `template-guide.ts` — 27 kolom baru ditambahkan ke
      `salesInvoiceTemplateGuide`, posisi SAMA seperti file asli client
      (setelah "PPH", sebelum "CUSTOM CHARACTER" level header).
- [x] `import/page.tsx` (`ACCURATE_FIELDS`) — 27 opsi dropdown baru,
      label "Atribut Tambahan Karakter/Angka/Tanggal N (per barang)".
- [x] `edit-row-dialog.tsx` (`DATE_INTERNAL_FIELDS`) — tambah
      `attributItemTanggal1-2` supaya UI edit tanggal berfungsi.
- [x] Test baru (`sales-invoice.mapping.test.ts`) — payload placement
      (masuk `detailItem`, BUKAN root, BUKAN `dataClassificationNName`),
      konversi tanggal, `defaultColumnMap` lengkap. Test lama Fase 71
      yang assert "ITEM: CUSTOM CHARACTER 1" undefined DIPERBARUI
      (sekarang field yang benar, bukan lagi undefined).
- [x] Typecheck 0 error, full test suite pass (463, +3 baru, 1
      diperbarui).
- [x] Security review inline — tidak relevan (murni mapping/label baru,
      tidak ada endpoint/data flow baru).

## Referensi
- Architecture doc: `docs/architecture/architecture-sales-invoice.md`
  § "Atribut Tambahan" (update Fase 71-73 gabungan).
- Fase terkait: Fase 55/61 (implementasi awal & koreksi item-level yang
  KELIRU dismiss field ini), Fase 64 (versi HEADER dari field yang
  SAMA), Fase 68 (Kategori Keuangan, field TERPISAH), Fase 69/71 (saga
  kesalahan sebelum field ini ditemukan benar).

## Keputusan Kecil Selama Eksekusi
- Naming field internal `attributItemKarakter/Angka/Tanggal` (BUKAN
  reuse `attribut1-10` yang sudah dipakai Kategori Keuangan) — supaya
  tidak collision dan tetap jelas bedanya di kode: `attribut1-10` =
  Kategori Keuangan, `attributHeader*` = charField level faktur,
  `attributItem*` = charField level ITEM (field BARU fase ini).
- 15 slot Karakter (bukan 10) mengikuti PERSIS jawaban resmi Accurate
  Support — TIDAK dibulatkan/disamakan ke 10 seperti level header,
  karena memang berbeda jumlah slotnya di API asli.
- Posisi kolom di template SAMA PERSIS seperti file asli client
  (setelah PPH) — bukan idealisasi baru, minim kejutan visual.
- TIDAK menyentuh Purchase Invoice — field ini spesifik dikonfirmasi
  Accurate Support untuk Sales Invoice, dan PI memang tidak punya
  kebutuhan Atribut Tambahan sama sekali sampai sekarang.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review inline dijalankan
- [x] Tidak ada temuan Critical/High/Medium
- [x] `docs/PROGRESS.md` diupdate
- [x] `docs/architecture/architecture-sales-invoice.md` diupdate

## Known Limitations
- BELUM diverifikasi end-to-end ke Accurate SUNGGUHAN (butuh client
  retest dengan Trans No baru, isi kolom "ITEM: CUSTOM CHARACTER 1" dst)
  — field API dikonfirmasi dari balasan RESMI Accurate Support (bukan
  tebakan), tapi belum ada bukti pengiriman nyata seperti "HWGRIO" untuk
  Kategori Keuangan kemarin.
- Level Expense (`detailExpense.dataClassificationNName`) masih BELUM
  dikerjakan — tetap jadi fase terpisah berikutnya, TIDAK termasuk
  scope Fase 73 ini.

## Ringkasan Hasil
Field "ITEM: CUSTOM CHARACTER/NUMBER/DATE" akhirnya diidentifikasi benar
sebagai `detailItem.charField1-15`/`numericField1-10`/`dateField1-2` —
versi ITEM-level dari field yang sudah diimplementasi HEADER-level di
Fase 64, dikonfirmasi via pertanyaan spesifik ke Accurate Support.
27 field baru ditambahkan (mapping, template, dropdown, date handling),
posisi kolom disamakan dengan Excel asli client. `bun run typecheck` 0
error, `bun test` 463 pass/0 fail.
