# Fase 65 — Fix: Atribut Tambahan Tidak Bisa Dipetakan di UI + defaultColumnMap Tidak Cocok Header Standar Accurate

**Status:** Done
**Mulai:** 2026-09-08
**Selesai:** 2026-09-08

## Tujuan
Client evaluasi Sales Invoice poin 2 & 6: "Karakter belum masuk di
edit" dan "Unit Price juga belum masuk". Investigasi menemukan 2 bug
terpisah yang sama-sama menyebabkan gejala "field tidak bisa/tidak
kelihatan dipetakan".

## Root Cause #1 — Dropdown Mapping Tidak Pernah Ditambah Field Atribut Tambahan
`apps/web/app/app/(protected)/sales-invoice/import/page.tsx` (konstanta
`ACCURATE_FIELDS`) adalah daftar STATIS pilihan field yang ditampilkan
di dropdown Combobox saat konfirmasi mapping kolom. Field `attribut1-10`
(Atribut Tambahan level item, Fase 55) **TIDAK PERNAH ditambahkan ke
daftar ini** — backend sudah mendukung sejak Fase 55, tapi UI konfirmasi
mapping tidak pernah di-update, jadi client TIDAK BISA memetakan kolom
Karakter ke field manapun sama sekali (opsinya tidak ada di dropdown).
Field header-level baru dari Fase 64 (`attributHeaderKarakter/Angka/
Tanggal`) juga otomatis kena masalah yang sama karena baru dibuat.

## Root Cause #2 — `defaultColumnMap` Tidak Cocok Header Standar Accurate
Dibandingkan header ASLI Excel client (`format_sales_inv_v7 (PLAN).xlsx`
— kemungkinan besar format EXPORT BAKU Accurate, bukan custom 1
client), MAYORITAS tebakan `defaultColumnMap` (Fase 13) TIDAK COCOK —
bukan soal huruf besar/kecil (matching SUDAH case-insensitive), tapi
KATA-NYA SENDIRI beda, mis.:
| Field | Tebakan Lama | Header Asli Accurate |
|---|---|---|
| unitPrice | "Unit Price" | "ITEM UNIT PRICE" |
| description | "Note" | "DESCRIPTION" |
| paymentTermName | "Pay Term" | "PAYMENT TERM NAME" |
| warehouseName | "Item Warehouse" | "ITEM: WAREHOUSE" |
| poNumber | "PO Number" | "PURCHASE ORDER NO" |

(15 field total tidak cocok — daftar lengkap di kode/test.) Field-field
ini SECARA TEKNIS tetap bisa dipetakan manual (semua ADA di dropdown),
tapi TIDAK ter-auto-suggest — client kemungkinan melihat "(tidak
dipetakan)" default dan mengira field itu tidak didukung sama sekali.

## Scope
- [x] `apps/web/app/app/(protected)/sales-invoice/import/page.tsx` —
  `ACCURATE_FIELDS` tambah 32 entri (attribut1-10, attributHeaderKarakter/
  Angka1-10, attributHeaderTanggal1-2); label "Nomor Transaksi" &
  "Satuan Barang" disesuaikan dengan status wajib Fase 61
- [x] `apps/api/src/lib/import-mapping/sales-invoice.mapping.ts` —
  `defaultColumnMap` tambah 15 sinonim header standar Accurate (tebakan
  lama TETAP dipertahankan, harmless)
- [x] `apps/api/src/lib/import-mapping/sales-invoice.mapping.test.ts` —
  2 test baru

## Referensi
- File sumber header standar: `docs/referencehtml/format_sales_inv_v7 (PLAN).xlsx`
- `docs/phases/phase-55-atribut-tambahan-sales-invoice.md` — fase yang
  lupa update dropdown ini
- `docs/phases/phase-64-atribut-tambahan-level-header-sales-invoice.md` — fase sebelumnya di sesi yang sama

## Keputusan Kecil Selama Eksekusi
- Sinonim `defaultColumnMap` DITAMBAHKAN, bukan MENGGANTI tebakan lama
  — kalau ada file lain (bukan dari Accurate langsung) yang kebetulan
  pakai nama lama, tetap ke-auto-suggest, tidak ada regresi.
- TIDAK mengubah nama kolom KANONIS di `template-guide.ts` (nama kolom
  di file Excel TEMPLATE yang bisa diunduh dari Facport) ke standar
  Accurate — ini keputusan desain terpisah (apakah template unduhan
  Facport sebaiknya meniru format native Accurate persis) yang belum
  diminta eksplisit, di luar scope perbaikan bug ini.
- TIDAK menambah field untuk kolom "ITEM: SALES ORDER NO"/"ITEM:
  DELIVERY ORDER NO"/dst yang ADA di Excel client tapi BELUM ada field
  internalnya sama sekali di mapping kita — itu fitur baru, bukan bug,
  di luar scope evaluasi 6 poin ini.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (api+web)
- [x] Security review — tidak relevan (daftar dropdown & konstanta
  mapping statis, tidak ada input/endpoint baru)
- [x] Temuan Critical/High sudah diperbaiki — 2 (dropdown kosong +
  defaultColumnMap tidak sinkron), keduanya diperbaiki
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Kolom Excel client yang BELUM ada field internalnya sama sekali
  (ITEM: SALES ORDER NO/DELIVERY ORDER NO/SALES QUOT NO/SALESMAN NO,
  Down Payment, Retail ID Card, dst) TETAP tidak bisa dipetakan — bukan
  bug, memang belum diimplementasi, di luar scope 6 poin evaluasi ini.
- Template unduhan (`template-guide.ts`) belum diselaraskan penuh ke
  penamaan standar Accurate untuk SEMUA kolom (cuma kolom yang terkait
  Atribut Tambahan yang dikoreksi) — keputusan desain terpisah,
  didiskusikan kalau relevan.

## Ringkasan Hasil
2 bug ditemukan & diperbaiki: (1) field Atribut Tambahan tidak pernah
ditambahkan ke dropdown pilihan mapping UI sejak Fase 55, membuatnya
mustahil dipetakan sama sekali; (2) mayoritas `defaultColumnMap` tidak
cocok header standar export Accurate asli, membuat banyak field
(termasuk Unit Price) gagal ter-auto-suggest walau secara teknis tetap
bisa dipetakan manual. Keduanya kemungkinan besar penyebab client
melaporkan field "belum masuk".

Typecheck 0 error. Full suite `apps/api` 444 pass/0 fail (2 baru). Full
suite `apps/web` 36 pass/0 fail. Build sukses.
