# Fase 70 — Reorder Kolom Kategori Keuangan + Rename "PO Number" -> "Bill No"

**Status:** Done
**Mulai:** 2026-09-08
**Selesai:** 2026-09-08

## Tujuan
Setelah Fase 69 (rename "ITEM:CUSTOM CHARACTER N" -> "Kategori
Keuangan N"), client minta 2 penyesuaian lanjutan pada template Sales
Invoice: (1) kolom "Kategori Keuangan 1"-"10" dipindah ke PALING AKHIR
template (setelah "Kategori Barang"), supaya tidak "menyempil" di
antara field inti; (2) kolom "PO Number" diganti judul jadi "Bill No"
supaya konsisten dengan istilah yang sudah dipakai di modul Purchase
Invoice.

## Scope
- [x] `template-guide.ts` — urutan array `salesInvoiceTemplateGuide`
      diubah: 10 entri "Kategori Keuangan N" dipindah dari posisi
      tengah (dekat field item lain) ke PALING AKHIR (setelah "Kategori
      Barang").
- [x] `template-guide.ts` — `column: "PO Number"` diganti jadi
      `column: "Bill No"` (field API TETAP `poNumber`, murni rename
      judul).
- [x] `defaultColumnMap` (`sales-invoice.mapping.ts`) — tambah sinonim
      BARU "Bill No" -> `poNumber`, sinonim LAMA "PO Number" TETAP
      dipertahankan.
- [x] Dropdown `ACCURATE_FIELDS` (`import/page.tsx`) — label `poNumber`
      diperbarui menyebut "Bill No".
- [x] Teks peringatan grup baris (`edit-row-dialog.tsx`) — "PO Number
      sama" diganti "Bill No sama".
- [x] Test baru (`sales-invoice.mapping.test.ts`) — sinonim "Bill No"
      termapping ke `poNumber`, "PO Number" tetap ada.
- [x] Typecheck 0 error, full test suite pass (461, +1 baru).

## Referensi
- Architecture doc: `docs/architecture/architecture-sales-invoice.md`.
- Fase terkait: Fase 69 (rename Kategori Keuangan, pola yang sama
  di-mirror di sini), Fase 13 (asal mula field `poNumber`/"PO Number").

## Keputusan Kecil Selama Eksekusi
- TIDAK mengganti nama internal field `poNumber` (tetap sama di
  `fieldToAccuratePath`, tetap sama field API Accurate) — murni ganti
  judul kolom Excel & label UI, konsisten pola Fase 69.
- Urutan `defaultColumnMap` (objek, bukan array) TIDAK perlu diubah —
  urutan kolom template ditentukan oleh array `salesInvoiceTemplateGuide`,
  bukan oleh urutan key `defaultColumnMap`.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review — tidak relevan (murni perubahan urutan array &
      teks label, tidak ada logic/data flow yang berubah).
- [x] `docs/PROGRESS.md` diupdate.

## Known Limitations
- Belum di-push/deploy — bersamaan dengan Fase 69, menunggu konfirmasi
  final dari user sebelum release (§ keputusan: push Fase 69+70
  bersamaan, Expense level jadi fase terpisah berikutnya).

## Ringkasan Hasil
Kolom "Kategori Keuangan 1-10" dipindah ke posisi PALING AKHIR template
Sales Invoice (setelah "Kategori Barang"), dan kolom "PO Number" diganti
judul jadi "Bill No" (field API `poNumber` tidak berubah, sinonim lama
"PO Number" tetap didukung). `bun run typecheck` 0 error, `bun test` 461
pass/0 fail (1 baru).
