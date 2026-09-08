# Fase 64 — Atribut Tambahan LEVEL HEADER/FAKTUR Sales Invoice (charField/numericField/dateField)

**Status:** Done
**Mulai:** 2026-09-08
**Selesai:** 2026-09-08

## Tujuan
Client evaluasi Sales Invoice poin 3-5: "Karakter butuh 2 tipe: detail
barang dan kolom (i)" + "Number 1-10" + "Date 1-2". Fase 61 sebelumnya
menyimpulkan level header/faktur (kolom Excel client "CUSTOM CHARACTER/
NUMBER/DATE" TANPA prefix "ITEM:") **tidak bisa diimport sama sekali**
berdasarkan `accurate-openapi.json`. Client kemudian forward email
resmi Accurate Support (tiket #357901) yang mengoreksi ini.

## Root Cause Kesalahan Fase 61
Riset Fase 61 HANYA mengandalkan `docs/referencehtml/accurate-openapi.json`
sebagai sumber kebenaran — dicek 0 kemunculan field custom di level
top-level payload SEMUA endpoint, disimpulkan "field-nya tidak ada".
**Kesimpulan itu salah** — bukan karena field API-nya tidak ada, tapi
karena **spec yang dijadikan acuan TIDAK LENGKAP** (gap dokumentasi
vendor, bukan gap API sungguhan).

## Temuan Baru (dari Accurate Support, bukan spec)
Field resmi level HEADER (top-level payload, sejajar `customerNo`/
`transDate`, BUKAN di dalam `detailItem`):
- `charField1` s/d `charField10` (Karakter)
- `numericField1` s/d `numericField10` (Angka)
- `dateField1`, `dateField2` (Tanggal)

Dikonfirmasi via email resmi (tiket #357901, dijawab 2026-04-24) dengan
contoh body JSON nyata untuk Purchase Invoice. DIPERKUAT bukti
independen: Excel asli client (`format_sales_inv_v7 (PLAN).xlsx`) punya
PERSIS 10 CUSTOM CHARACTER + 10 CUSTOM NUMBER + 2 CUSTOM DATE tanpa
prefix ITEM: — cocok persis jumlah field di atas.

## Scope
- [x] `apps/api/src/lib/import-mapping/sales-invoice.mapping.ts` —
  tambah `attributHeaderKarakter1-10` → `charField1-10`,
  `attributHeaderAngka1-10` → `numericField1-10`,
  `attributHeaderTanggal1-2` → `dateField1-2` (fieldToAccuratePath +
  defaultColumnMap tanpa prefix "ITEM:"); tambah ke `DATE_FIELDS`
- [x] `apps/web/components/sales-invoice/edit-row-dialog.tsx` —
  `DATE_INTERNAL_FIELDS` tambah 2 field tanggal baru (sinkron manual)
- [x] `apps/api/src/lib/import-mapping/sales-invoice.mapping.test.ts` —
  2 test baru
- [x] `apps/api/src/lib/import-mapping/template-guide.ts` — 22 entri
  baru (10 Character + 10 Number + 2 Date level header) untuk template
  unduhan, plus koreksi nama kolom "Karakter N" → "ITEM:CUSTOM
  CHARACTER N" yang TERLEWAT saat Fase 61 (baru ketahuan sekarang)
- [x] `docs/architecture/architecture-sales-invoice.md` — koreksi
  eksplisit klaim Fase 61 yang salah + section baru Fase 64

## Referensi
- `docs/phases/phase-61-koreksi-mapping-sales-invoice-format-client.md` — klaim yang dikoreksi di sini
- Email Accurate Support tiket #357901 (forward dari client, 2026-09-08)

## Keputusan Kecil Selama Eksekusi
- Internal field naming: `attributHeaderKarakter/Angka/Tanggal` (BEDA
  dari `attribut1-10` yang level item) — disengaja verbose supaya jelas
  bedanya saat baca kode, bukan cuma angka urut.
- Logic pembangunan payload (`buildSalesInvoicePayload`) TIDAK perlu
  kode baru — field tanpa prefix "detailItem." SUDAH otomatis masuk
  root payload sejak desain generik Fase 13/55.
- TIDAK diverifikasi end-to-end ke Accurate sungguhan untuk Sales
  Invoice spesifik (email resmi contohnya Purchase Invoice) — dicatat
  jelas sebagai Known Limitation, BUKAN diklaim 100% pasti.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (api+web)
- [x] Security review — tidak relevan (field mapping tambahan, jalur
  generik yang sudah ada, tidak ada input/endpoint baru)
- [x] Temuan Critical/High — tidak ada
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- BELUM diverifikasi end-to-end nyata ke Accurate untuk Sales Invoice
  (`charField`/`numericField`/`dateField` dikonfirmasi resmi untuk
  Purchase Invoice) — WAJIB dites dengan 1 faktur sungguhan begitu ada
  kesempatan, sebelum benar-benar dianggap "selesai total".
- `detailExpense`-level custom field (`EXPENSE:FINANCIAL CATEGORY
  1-10`) MASIH belum diimplementasi — di luar scope fase ini, menunggu
  konfirmasi client.

## Ringkasan Hasil
Ditemukan bahwa riset Fase 61 soal "level header tidak ada field custom
di API" KELIRU — bukan karena field-nya tidak ada, tapi karena spec API
yang dijadikan acuan (`accurate-openapi.json`) tidak lengkap. Email
resmi Accurate Support mengonfirmasi field `charField1-10`/
`numericField1-10`/`dateField1-2` di level header/faktur. Diimplementasi
mengikuti pola generik yang sudah ada (tanpa kode baru di builder),
cocok persis struktur Excel asli client.

Typecheck 0 error. Full suite `apps/api` 444 pass/0 fail (2 baru).
Full suite `apps/web` 36 pass/0 fail. Build sukses.
