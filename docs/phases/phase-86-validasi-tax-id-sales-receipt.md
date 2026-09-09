# Fase 86 — Validasi "Tax ID" Sales Receipt

**Status:** Done
**Mulai:** 2026-09-10
**Selesai:** 2026-09-10

## Tujuan
Fase 85 men-skip field "Tax ID" (dianggap tidak relevan — ID record
master data pajak terpisah, bukan atribut transaksi `sales-receipt/save.do`).
User minta ditinjau ulang, menolak alasan "di luar scope API fitur" dan
menegaskan project ini SUDAH biasa menggabungkan >1 API Accurate dalam 1
alur import (pola `findOrCreateVendor`/`findOrCreateItem`/`findOrCreateDataClassification`).
Fase ini membangun validasi Tax ID sungguhan — BUKAN mengikuti asumsi
dokumentasi kompetitor, tapi berdasarkan test call NYATA ke API
Accurate `/api/tax/*` (instruksi eksplisit: *"JANGAN IKUTI KOMPETITOR ..
kita punya data cukup untuk memanggil tax berfungsi dengan benar"*).

## Scope
1. Siapkan environment test lokal proper: plan+subscription Sales
   Receipt baru di dev DB, connect ke company Accurate demo via OAuth
   (BUKAN workaround pinjam scope modul lain — sempat diusulkan, DITOLAK
   eksplisit user).
2. Test call nyata `/api/tax/list.do` (scope `tax_view`, sudah disiapkan
   sejak sesi eksplorasi sebelumnya) — konfirmasi scope berfungsi &
   pahami struktur response ASLI.
3. Audit ulang data mentah 556 baris kompetitor untuk kolom Tax ID
   (dan 3 field skip lain) — temuan: 0% pernah diisi di data nyata,
   deskripsi resmi kompetitor mengarah ke "Fitur Facport" (bukan
   Accurate), bukan alasan untuk ikut skip — keputusan akhir tetap
   dibangun sesuai data API nyata milik Accurate, bukan interpretasi
   template kompetitor.
4. Implementasi field `taxId` (Excel "Tax ID") — VALIDASI-ONLY,
   dicocokkan ke Master Data Pajak Accurate SEBELUM payload dibangun,
   TIDAK PERNAH dikirim sebagai field transaksi (tidak ada field itu di
   `sales-receipt/save.do`).
5. Update dokumentasi arsitektur, template guide, dropdown mapping.

## Keputusan Kecil Selama Riset
- **Environment test**: dibuat plan+subscription+koneksi Accurate BARU
  di dev DB (bukan reuse/pinjam scope modul lain) — sesuai instruksi
  eksplisit user, dan konsisten prinsip "project masih building, belum
  ada customer nyata, jadi aman siapkan data test sendiri" (dikoreksi
  dari kekhawatiran awal soal "dampak ke customer existing" yang
  ternyata tidak relevan di tahap ini).
- **Validasi-only, bukan auto-create**: BEDA dari `findOrCreateVendor`/
  `findOrCreateItem`/`findOrCreateDataClassification` — Master Data
  Pajak adalah konfigurasi akuntansi resmi (tarif pajak), auto-create
  otomatis dianggap terlalu sensitif/berisiko dibanding vendor/item.
  Kalau tidak ditemukan → gagal dengan pesan jelas, bukan auto-buat.
- **Pencarian fleksibel (angka `id` ATAU teks `taxCode`/`description`)**
  — user awam lebih mungkin tahu nama pajak ("Jasa Kebersihan") daripada
  id internal Accurate.
- **`taxCode` TERNYATA tidak unik** untuk PPh23 (ditemukan lewat test
  call nyata, bukan dokumentasi) — template guide diarahkan pakai
  `description` (unik), bukan `taxCode`, didokumentasikan sebagai Known
  Limitation (bukan disembunyikan).

## File yang Diubah
- `apps/api/src/lib/accurate-tax.ts` (BARU) — `findTaxByIdentifier`,
  fetch `/api/tax/list.do`.
- `apps/api/src/lib/import-mapping/sales-receipt.mapping.ts` — `taxId`
  ditambah ke `fieldToAccuratePath` (path placeholder validasi-only) &
  `defaultColumnMap`, fungsi baru `extractTaxIdsFromRows`.
- `apps/api/src/lib/import-mapping/sales-receipt.mapping.test.ts` — 5
  test baru (`extractTaxIdsFromRows` + regression-guard "Tax ID TIDAK
  PERNAH masuk payload").
- `apps/api/src/lib/import-mapping/template-guide.ts` — 1 baris guide
  baru, posisi sesuai urutan asli client.
- `apps/api/src/workers/index.ts` — fungsi baru `validateTaxIdsForReceipt`,
  dipanggil di `processSalesReceiptGroup` SEBELUM `buildSalesReceiptPayload`.
- `apps/web/app/app/(protected)/sales-receipt/import/page.tsx` — 1
  opsi dropdown baru.
- `docs/architecture/architecture-sales-receipt.md` — section baru
  "Fase 86 — Validasi Tax ID", tabel keputusan Fase 85 diupdate (Tax ID
  dari ❌ SKIP jadi ✅ DIIMPLEMENTASI VALIDASI-ONLY).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Eksekusi kode.
- [x] Test baru (unit — extraction & payload-safety guard).
- [x] Test call NYATA ke `/api/tax/list.do` (company demo) — konfirmasi
      scope `tax_view` berfungsi, struktur response asli, temuan
      `taxCode` tidak unik untuk PPh23.
- [x] Type check nol error (`bun run typecheck`).
- [x] `docs/PROGRESS.md` diupdate ke Done.
- [x] Dev DB test-run dibersihkan (subscription/plan test Sales Receipt
      dev — BUKAN data disposable, sengaja dipertahankan untuk testing
      lanjutan modul ini).

## Known Limitations
- `taxCode` ambigu untuk PPh23 (1 kode dipakai banyak jenis jasa) —
  mitigasi via rekomendasi pakai `description` di template guide, bukan
  validasi tambahan.
- Belum ada UI referensi Master Data Pajak di Facport sendiri (user
  harus cek Accurate langsung untuk tahu nama pastinya) — di luar
  scope, calon fitur terpisah kalau dibutuhkan.
- Belum divalidasi dengan Excel data REAL dari client (data test masih
  manual/manufactured) — validasi lapangan menunggu client kirim data
  sungguhan yang mengisi kolom ini.

## Ringkasan Hasil
Tax ID BERHASIL diimplementasikan sebagai validasi-only terhadap Master
Data Pajak Accurate (`/api/tax/list.do`, scope `tax_view`) — dikonfirmasi
via test call NYATA (bukan asumsi dokumentasi) terhadap company demo.
Ditemukan `taxCode` tidak unik untuk PPh23 — didokumentasikan sebagai
Known Limitation, guide diarahkan pakai `description` yang unik. Field
`taxId` TIDAK PERNAH masuk payload `sales-receipt/save.do` (tidak ada
field itu di sana) — gagal SELURUH grup dengan pesan jelas kalau tidak
ditemukan di Accurate, bukan auto-create (beda dari pola
vendor/item/kategori keuangan — Master Data Pajak dianggap terlalu
sensitif untuk auto-create). `bun run typecheck` 0 error, `apps/api`
537 pass/0 fail (5 baru), `apps/web` 44 pass/0 fail.
