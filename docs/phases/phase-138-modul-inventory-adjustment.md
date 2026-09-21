# Fase 138 — Modul Inventory Adjustment

**Status:** Done
**Mulai:** 2026-09-21
**Selesai:** 2026-09-21

## Tujuan
Bangun modul import Inventory Adjustment (Penyesuaian Persediaan)
end-to-end, sesuai `docs/architecture/architecture-inventory-adjustment.md`
yang sudah diverifikasi 100% field-per-field ke portal developer Accurate
live (0 gap dokumentasi API). Fase KEDUA dari 3 modul yang dieksekusi
berurutan (Sales Order → Inventory Adjustment → Job Costing) atas
otorisasi eksplisit user.

## Scope
- [x] `apps/api/src/lib/import-mapping/inventory-adjustment.mapping.ts` (+ `.test.ts`)
- [x] `apps/api/src/lib/accurate-inventory-adjustment.ts`
- [x] `apps/api/src/routes/inventory-adjustment-import.route.ts` (+ `.test.ts`)
- [x] `apps/web/app/app/(protected)/inventory-adjustment/import/page.tsx`
- [x] `apps/web/app/app/(protected)/inventory-adjustment/import/[batchId]/page.tsx`
- [x] `apps/web/app/app/(protected)/inventory-adjustment/import/riwayat/page.tsx`
- [x] `apps/web/components/inventory-adjustment/delete-import-dialog.tsx`
- [x] `apps/web/components/inventory-adjustment/edit-row-dialog.tsx`
- [x] Semua 11 titik registrasi existing (scopes, template-guide, module-catalog,
      plans.route, app.ts, workers/index.ts, landing-content.ts, sidebar.tsx,
      module-import-routes.ts, import-batch-table.tsx, admin batch-detail page)
- [x] Trik verifikasi diff (checklist § 3b) — 0 gap (10/10 file cocok persis,
      cuma nama file route yang beda)
- [x] `bun run typecheck` — 0 error
- [x] `bun run test` — full suite 1275 pass/0 fail (42 test baru)
- [x] `bun run db:cleanup-test-data` — data test dev DB dibersihkan

## Referensi
- Architecture doc: `docs/architecture/architecture-inventory-adjustment.md`
- Modul mirror: `apps/api/src/lib/import-mapping/item-transfer.mapping.ts` dan seluruh berkas terkaitnya (BUKAN Sales Order — beda keluarga: tanpa vendor/customer, punya `warehouseName`+`detailSerialNumber[]`)

## Keputusan Kecil Selama Eksekusi
- **TIDAK auto-create item** (beda dari Sales Order, SAMA seperti Item
  Transfer) — 2 alasan: (1) Excel client TIDAK punya kolom "Item Name",
  padahal helper `findOrCreateItem` MEWAJIBKAN nama saat membuat barang
  baru (akan throw error di baris pertama barang yang belum ada); (2)
  secara bisnis, "penyesuaian stok" cuma masuk akal untuk barang yang
  SUDAH ada & di-track sebagai inventory — auto-create barang baru
  sebagai `NON_INVENTORY` (default `findOrCreateItem`) salah konsep
  untuk modul ini. `itemNo` dikirim apa adanya, Accurate yang validasi
  eksistensi.
- **Dictionary "Tipe Adj" — RISIKO UTAMA yang tersisa** (§ Known
  Limitations): nilai literal kolom Excel client BELUM diverifikasi ke
  data asli. Dictionary di `inventory-adjustment.mapping.ts`
  (`ITEM_ADJUSTMENT_TYPE_DICTIONARY`) adalah tebakan terbaik berbasis
  istilah Indonesia umum: Tambah/Masuk/Barang Masuk/In → `ADJUSTMENT_IN`;
  Kurang/Keluar/Barang Keluar/Out → `ADJUSTMENT_OUT`; Stok/Stok
  Opname/Penyesuaian Stok/Stock → `ADJUSTMENT_STOCK`. Nilai enum literal
  (case-insensitive) JUGA tetap diterima langsung. Baris dengan nilai
  yang tidak cocok dictionary MANA PUN gagal dengan pesan jelas
  ("Tipe Adj tidak dikenali..."), BUKAN default diam-diam.
- **TIDAK ada Kategori Keuangan (`dataClassificationNName`)** di modul
  ini — Excel client cuma minta "Atribut Tambahan"/"Atribut Number"/
  "Atribut Date" (charField/numericField/dateField). Scope OAuth
  TIDAK butuh `data_classification_view`/`_save` (beda dari Sales
  Order/Item Transfer) — final: `["item_adjustment_save", "glaccount_view"]`.
- **`unitCost` default 0** kalau kolom Excel "Unit Price" kosong — API
  mewajibkan field ini walau nama kolom Excel menyiratkan opsional
  ("jika adj tambah"), TIDAK PERNAH dikirim `undefined`.
- **Icon sidebar/landing**: `Boxes` (belum dipakai modul manapun) — beda
  dari icon Item Transfer (`ArrowLeftRight`)/Item Requisition
  (`ClipboardList`).
- **`InventoryAdjustmentView` (admin batch-detail)**: mirror PERSIS
  `ItemTransferView` (row-view sederhana, tanpa grouping kolom khusus).
- **Grouping "No. Item Adjustment" OPSIONAL** (beda dari Item Transfer
  yang DIPAKSA required) — konsisten `architecture-inventory-adjustment.md`
  yang tidak menandai kolom ini wajib, kosong = 1 baris = 1 dokumen sendiri.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — 0 error, diverifikasi
      ULANG independen oleh sesi utama
- [x] Trik verifikasi diff — diverifikasi ULANG independen oleh sesi
      utama (0 gap, cuma nama file route yang beda)
- [x] Security review via subagent `security-auditor` (dipanggil sesi
      utama setelah fork selesai). Hasil: **0 Critical/0 High, 1
      Medium, 2 Low**. Medium: dictionary "Tipe Adj" dikonfirmasi
      mekanisme reject-nya SUDAH BENAR (nilai tak dikenal ditolak
      eksplisit di 3 titik: worker, edit-row single, edit-row bulk —
      TIDAK ADA fallback diam-diam), tapi tetap risiko *false positive
      match* kalau istilah client kebetulan cocok dictionary tapi beda
      makna bisnis — WAJIB retest Excel asli sebelum dianggap
      tervalidasi penuh (sudah tercatat, bukan temuan baru). 2 Low:
      normalisasi whitespace/dash tidak fuzzy (UX minor, sengaja by
      design — auditor eksplisit merekomendasikan TIDAK menambah
      fuzzy-matching karena risiko match-salah lebih besar dari
      manfaat), dan validasi `itemAdjustmentType` baru terjadi di
      worker bukan saat `confirm` (pola sama persis Item Transfer,
      bukan regresi).
- [x] Temuan Critical/High — tidak ada
- [x] Temuan Medium/Low — 3 total (di atas), TIDAK perlu perbaikan
      kode sekarang (auditor eksplisit: "tidak perlu tindakan kode
      SEKARANG") — cukup pastikan retest client dijalankan nyata
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- **Dictionary "Tipe Adj" BELUM diverifikasi ke data Excel client
  asli** — risiko UTAMA yang tersisa dari seluruh fase ini (dikonfirmasi
  ULANG oleh security-auditor sebagai temuan Medium). Kalau
  istilah client TIDAK cocok dictionary (mis. pakai bahasa Inggris
  campur/singkatan lain), SEMUA baris akan gagal dengan error jelas
  (bukan silent-fail) — tapi tetap perlu retest client pertama untuk
  konfirmasi dictionary-nya benar, atau perluas dictionary kalau ada
  istilah baru yang belum ter-cover.
- `unitCost` REQUIRED oleh spec API — perlu verifikasi test call nyata
  apakah `0` diterima Accurate untuk `ADJUSTMENT_OUT` (belum pernah
  dites ke akun Accurate sungguhan).
- `save-target-quantity.do` (varian "set ke qty target") dan
  `bulk-save.do` ADA di spec Accurate tapi TIDAK diimplementasikan —
  konsisten keputusan arsitektur (tidak diminta client).
- Field mapping BELUM pernah dites via test call nyata ke akun
  Accurate client sungguhan — arsitektur sudah 100% cocok dokumentasi
  API, tapi belum ada transaksi asli yang berhasil masuk.

## Ringkasan Hasil
Modul Inventory Adjustment dibangun end-to-end, mirror pola Item
Transfer (TIDAK auto-create item, TIDAK ada Kategori Keuangan). Semua
19 titik registrasi (8 file baru + 11 titik existing) tersentuh,
diverifikasi via trik diff checklist § 3b — 0 gap ditemukan (10/10
file cocok persis dengan Item Transfer, cuma nama file route yang
beda). Typecheck 0 error, test suite API penuh 1275 pass/0 fail (42
test baru: 26 unit mapping + 16 integrasi route). Test data dev DB
dibersihkan via `bun run db:cleanup-test-data`.

Keputusan desain terpenting: dictionary istilah Indonesia untuk "Tipe
Adj" (BELUM diverifikasi ke data client asli — risiko utama tersisa,
dikonfirmasi security-auditor sebagai temuan Medium) dan TIDAK
auto-create item (beda dari Sales Order, konsisten Item Transfer/
Receive Item). Security review via subagent `security-auditor` — 0
Critical/High, 1 Medium (dictionary retest, sudah diketahui), 2 Low
(UX minor, tidak perlu perbaikan). **Fase ditutup Done.**
