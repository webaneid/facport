# Fase 98 — Fix Gap: Auto-Create Kategori Keuangan (Data Classification) Jurnal Umum

**Status:** Done
**Mulai:** 2026-09-10
**Selesai:** 2026-09-10

## Tujuan
Client retest import Jurnal Umum (setelah Fase 97 di-deploy) dan dapat
error Accurate: "Kategori Keuangan 1 tidak ditemukan atau sudah
dihapus". Root cause: field `attribut1`-`attribut10`
(`dataClassification1-10Name`, ditambahkan Fase 95) bukan teks bebas —
nilainya wajib sudah ada sebagai master data "Kategori Keuangan" di
Accurate. Field identik di Sales Invoice (Fase 68) dan Purchase Invoice
(Fase 75) sudah punya mekanisme auto-create untuk masalah ini, tapi
Journal Voucher (Fase 95) ketinggalan — gap yang baru ketahuan sekarang
lewat retest nyata client, bukan ditemukan lewat audit proaktif.

## Scope
- [x] `journal-voucher.mapping.ts` — fungsi baru `extractDataClassificationValues`
      (extract `{index, name}` dari attribut1-10 di SETIAP baris grup).
- [x] `workers/index.ts` — fungsi baru `ensureJournalVoucherDataClassifications`
      (mirror `ensureDataClassifications`/`ensurePurchaseInvoiceDataClassifications`),
      dipanggil di `processJournalVoucherGroup` sebelum `buildJournalVoucherPayload`.
- [x] `accurate-scopes.ts` — scope `journal_voucher` ditambah
      `data_classification_view`/`data_classification_save`.
- [x] Test: `extractDataClassificationValues` (3 test baru,
      `journal-voucher.mapping.test.ts`), regresi scope (2 test baru,
      `accurate-scopes.test.ts`, mirror pola Fase 78).
- [x] Update `architecture-journal-voucher.md` § "Fase 98".

## Referensi
- Architecture doc: `docs/architecture/architecture-journal-voucher.md` § Fase 98
- Precedent: `docs/architecture/architecture-sales-invoice.md` § Fase 68 (Sales Invoice, pertama kali ditemukan), Fase 75 (Purchase Invoice, mirror kedua)
- `docs/phases/phase-68-auto-create-kategori-keuangan-sales-invoice.md`

## Keputusan Kecil Selama Eksekusi
- `findOrCreateDataClassification` (`accurate-data-classification.ts`)
  TIDAK disentuh sama sekali — fungsi itu sudah generik
  (index+name, tidak peduli modul pemanggil) dan battle-tested lewat 2
  modul lain, jadi cukup panggil ulang, bukan modifikasi.
- `ensureJournalVoucherDataClassifications` dibuat sebagai FUNGSI
  TERPISAH (bukan reuse `ensureDataClassifications` Sales Invoice apa
  adanya) — konsisten pola project ini ("3 fungsi mirip lebih baik dari
  abstraksi prematur", sudah dipakai untuk `ensurePurchaseInvoiceDataClassifications`
  juga). Beda penting dari versi Sales Invoice: JV tidak punya extractor
  level "expense" terpisah (modul ini tidak punya konsep item/expense
  sama sekali), jadi cuma 1 extractor yang dipanggil, bukan 2 digabung.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — api+web, 0 error.
- [x] Security review dijalankan (skill `security-review`) — tidak ada temuan.
- [x] Temuan Critical/High — tidak ada.
- [x] Temuan Medium/Low — tidak ada yang perlu dicatat.
- [x] `docs/PROGRESS.md` diupdate.
- [x] `apps/api` test suite: 598 pass / 0 fail.
- [x] `bun run lint` — 0 error.

## Known Limitations
- **Aksi wajib setelah deploy**: koneksi Accurate yang CONNECT SEBELUM
  fix ini WAJIB "Hubungkan Ulang" (disconnect+reconnect) supaya scope
  `data_classification_view`/`data_classification_save` yang baru
  ditambahkan ikut ke token OAuth yang tersimpan. Tanpa reconnect,
  `findOrCreateDataClassification` akan gagal 403 — symptom-nya BEDA
  dari bug asal ("tidak ditemukan atau sudah dihapus" vs error
  permission), jadi kalau masih gagal setelah deploy, cek dulu apakah
  user sudah reconnect.
- Pola yang sama (field baru ditambahkan tanpa mirror scope/mekanisme
  pendukungnya) sudah terjadi 2x di project ini (Fase 78 untuk
  vendor_view/vendor_save, Fase 98 ini untuk data_classification) —
  kalau menambah field baru yang field API-nya SAMA dengan modul lain
  yang sudah punya auto-create/scope khusus, WAJIB cek apakah modul
  baru itu juga perlu mirror mekanisme yang sama, bukan cuma field
  mapping-nya saja.

## Ringkasan Hasil
Journal Voucher sekarang auto-create "Kategori Keuangan" (Data
Classification) yang belum ada di Accurate, sebelum kirim transaksi —
user tidak perlu bikin manual dulu di Accurate, mirror persis perilaku
Sales Invoice/Purchase Invoice. Scope OAuth baru ditambahkan untuk
modul ini; koneksi existing wajib reconnect. Semua test pass, typecheck
0 error, security review bersih.
