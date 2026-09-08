# Fase 61 — Koreksi Mapping Sales Invoice dengan Format Excel Asli Client

**Status:** Done
**Mulai:** 2026-09-08
**Selesai:** 2026-09-08

## Tujuan
File Excel asli Sales Invoice dari client akhirnya diterima
(`docs/referencehtml/format_sales_inv_v7 (PLAN).xlsx`) — dipakai untuk
koreksi placeholder yang dibuat di Fase 55 (nama kolom "Karakter
1-10" cuma tebakan, belum dikonfirmasi ke file asli) dan menyamakan
aturan wajib-isi (`requiredFields`) dengan spesifikasi resmi client.

## Riset
File berisi 2 sheet: "Sales_Invoice" (135 kolom header) dan "Penjelasan
Kolom" (status WAJIB/TIDAK WAJIB + keterangan per kolom).

**Temuan #1 — nama kolom Atribut Tambahan**: kolom asli client adalah
`ITEM:CUSTOM CHARACTER 1` s/d `15` (LEVEL ITEM, bukan header), BUKAN
"Karakter 1-10" yang jadi placeholder Fase 55.

**Temuan #2 — batas 10 dikonfirmasi UNIVERSAL**: field
`dataClassificationNName` di-scan ke SEMUA 30+ endpoint transaksi
`accurate-openapi.json` (Purchase Invoice, Sales Order, Journal
Voucher, Job Order, Bill of Material, Item Adjustment, dst) — HASIL
KONSISTEN 100%, semua cuma punya slot 1-10, TIDAK ADA satu pun yang
sampai 15. Jadi `ITEM:CUSTOM CHARACTER 11-15` di Excel client TIDAK
BISA diimport lewat API Accurate sama sekali, di modul apa pun.

**Temuan #3 — 3 kategori custom field, cuma 1 yang match tepat**:
1. **Item** (`ITEM:CUSTOM CHARACTER/NUMBER/DATE/FINANCE CATEGORY`) —
   API (`detailItem[]`) CUMA punya varian Character
   (`dataClassification1-10Name`). Number/Date/FinanceCategory di
   level item TIDAK ADA field-nya di API sama sekali (dicek field-by-
   field, bukan cuma nama mirip).
2. **Expense** (`EXPENSE:FINANCIAL CATEGORY 1-10`) — API
   (`detailExpense[]`) TERNYATA JUGA punya `dataClassification1-10Name`
   sendiri (array beda, field API sama). Secara teknis BISA
   diimport — TAPI import Sales Invoice kita SAAT INI cuma proses
   `detailItem`, `detailExpense` belum diimplementasi sama sekali.
   **Di luar scope fase ini** — perlu konfirmasi client dulu apakah
   fitur baris Expense ini memang dibutuhkan sebelum dikerjakan sebagai
   fase terpisah.
3. **Header/"Info Lainnya"** (`CUSTOM CHARACTER/NUMBER/DATE` tanpa
   prefix) — dikonfirmasi TIDAK ADA field custom apa pun di level
   header/faktur pada API Accurate. Tidak bisa diimport, di modul apa
   pun.

**Temuan #4 — selisih requiredFields**: sheet "Penjelasan Kolom"
menandai "Trans No" WAJIB (kode sebelumnya tidak mewajibkan) dan "Item
Unit Name" TIDAK WAJIB (kode sebelumnya keliru mewajibkan).

## Scope
- [x] `apps/api/src/lib/import-mapping/sales-invoice.mapping.ts` —
  `defaultColumnMap`: ganti "Karakter 1-10" → "ITEM:CUSTOM CHARACTER
  1-10"; `requiredFields`: tambah `number` (Trans No), hapus
  `itemUnitName`
- [x] `apps/api/src/lib/import-mapping/sales-invoice.mapping.test.ts` —
  2 test baru (defaultColumnMap pakai nama asli + slot 11 tidak ada;
  requiredFields cocok persis aturan client)
- [x] `docs/architecture/architecture-sales-invoice.md` § Atribut
  Tambahan — dokumentasikan semua temuan riset di atas

## Referensi
- File sumber: `docs/referencehtml/format_sales_inv_v7 (PLAN).xlsx`
- `docs/phases/phase-55-atribut-tambahan-sales-invoice.md` — implementasi awal yang dikoreksi di sini
- `docs/phases/phase-49-grouping-sales-receipt-dan-invoice.md` — alasan `number` (Trans No) dipakai sebagai kunci grouping, konsisten dengan keputusan mewajibkannya di sini

## Keputusan Kecil Selama Eksekusi
- TIDAK mengimplementasikan `detailExpense` (baris Expense) — client
  belum eksplisit minta ini, cuma field API-nya KEBETULAN ada. Menunggu
  konfirmasi client dulu, dicatat sebagai Known Limitation, bukan
  dikerjakan spekulatif.
- Mewajibkan `number` (Trans No) SEKALIGUS memperkuat grouping
  multi-item (Fase 49, yang sudah pakai `number` sebagai kunci grouping
  utama) — efek samping positif, bukan cuma menuruti aturan client.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review — tidak relevan (perubahan konstanta mapping,
  tidak ada endpoint/input baru)
- [x] Temuan Critical/High — tidak ada
- [x] Temuan Medium/Low — keputusan detailExpense di atas
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Kolom `EXPENSE:FINANCIAL CATEGORY 1-10` di Excel client TIDAK
  diimplementasi (butuh `detailExpense` yang belum ada sama sekali di
  import Sales Invoice) — MENUNGGU konfirmasi client apakah dibutuhkan.
  Kalau ya, ini fase baru terpisah (endpoint mapping baru +
  `buildExpenseFromRow()`-style function, bukan cuma tambah field).
- Kolom `ITEM:CUSTOM CHARACTER 11-15`, semua `ITEM:CUSTOM
  NUMBER/DATE/FINANCE CATEGORY`, dan semua kolom header tanpa prefix —
  TIDAK BISA diimport via API Accurate SAMA SEKALI (bukan keterbatasan
  kode kita, field-nya memang tidak ada). Kalau client butuh ini
  terisi, harus manual langsung di Accurate.

## Ringkasan Hasil
Mapping Sales Invoice dikoreksi berdasarkan file Excel ASLI client:
nama kolom Atribut Tambahan diubah ke `ITEM:CUSTOM CHARACTER 1-10`
(dari tebakan "Karakter 1-10"), `requiredFields` disamakan persis
dengan aturan client (Trans No wajib, Item Unit Name tidak). Riset
menyeluruh ke SELURUH API Accurate (30+ endpoint) mengonfirmasi batas
10 slot bersifat universal, bukan spesifik Sales Invoice — kolom
tambahan di Excel client yang melebihi itu (character 11-15,
number/date/finance category di level item, dan semua kolom header)
dikonfirmasi TIDAK BISA diimport via API dalam kondisi apa pun.

Typecheck 0 error. Full suite `apps/api` 440 pass/0 fail (2 baru).
Security review: tidak relevan (bukan perubahan endpoint/keamanan).
