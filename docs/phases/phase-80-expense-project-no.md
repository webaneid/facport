# Fase 80 — Field "Proyek" Level EXPENSE (Sales Invoice & Purchase Invoice)

**Status:** Done (kode selesai, menunggu konfirmasi push)
**Mulai:** 2026-09-09
**Selesai:** 2026-09-09

## Tujuan
Client tunjukkan form asli Accurate "Biaya Lainnya" (Other Expense) yang
punya field **Departemen**, **Proyek**, dan **Keterangan** di tab "Info
lainnya" — "Departemen" sudah diimplementasikan (Fase 74/75), tapi
**"Proyek" belum ada** sama sekali. Cek awal ke spec resmi Accurate
(`accurate-openapi.json`) menyimpulkan field ini TIDAK ADA — kesimpulan
ini KELIRU (sama persis pola kesalahan Fase 61 dulu untuk charField),
dikoreksi lewat TEST CALL NYATA yang membuktikan field-nya ADA dan
berfungsi, cuma tidak terdokumentasi di spec publik.

## Riset & Verifikasi
1. Client kirim screenshot form Accurate "Biaya Lainnya" → tab "Info
   lainnya" menampilkan field **Proyek** (Cari/Pilih) — bukti VISUAL
   field ini ada di UI Accurate sungguhan.
2. Minta client isi field Proyek itu manual di Accurate (transaksi test
   `INVTESSQ`, proyek "TES01"), simpan.
3. Ambil raw response `detail.do` transaksi itu lewat environment local
   dev (koneksi `d569afe4-...`, Data Usaha "Retail Demo") —
   `detailExpense[].projectId` + nested `project.no: "TES01"` ADA di
   response.
4. Test CALL SAVE langsung: kirim payload
   `detailExpense: [{..., projectNo: "TES01"}]` ke
   `/api/sales-invoice/save.do` (transaksi test `TESPROJEXP01`,
   dibuat & DIHAPUS lagi setelah verifikasi) — **BERHASIL disimpan**,
   `detail.do` sesudahnya konfirmasi `project.no` ke-resolve benar jadi
   "TES01". Field API **`projectNo`** CONFIRMED via test call nyata,
   BUKAN tebakan.
5. Field API SAMA PERSIS dengan `detailItem.projectNo` yang sudah lama
   ada (Fase 02/61) — "Proyek" ternyata konsep yang sama, cuma belum
   pernah diterapkan ke array `detailExpense`.

## Scope
- [x] `sales-invoice.mapping.ts` — `expenseProjectNo` →
      `detailExpense.projectNo`. `defaultColumnMap`: "Expense Project
      No", ditaruh setelah "Expense Department"/"Beban - Department",
      sebelum "Expense Financial Category 1" (TETAP di dalam grup
      Beban, bukan di ujung — field Beban baru).
- [x] `purchase-invoice.mapping.ts` — mirror: `expenseProjectNo` →
      `detailExpense.projectNo`, kolom "Beban - Proyek" (naming
      Indonesia, konsisten field Beban PI lain yang belum di-Inggriskan).
- [x] `template-guide.ts` — kolom baru ditambahkan di kedua template,
      posisi sama (dalam grup Beban).
- [x] `import/page.tsx` (SI & PI) — 1 opsi dropdown baru masing-masing.
- [x] Test baru (kedua file `.mapping.test.ts`) — payload placement
      (masuk `detailExpense`, bukan root), `defaultColumnMap`.
- [x] Typecheck 0 error, full test suite pass (499, +4 baru).
- [x] Dev DB dibersihkan dari data test.

## Referensi
- Test call empiris (bukan spec) — dilakukan langsung di sesi ini lewat
  environment local dev (`apps/api/src/lib/accurate-session.ts` §
  `openAccurateSession`).
- `detailItem.projectNo` (Fase 02/61) — field API yang SAMA, sudah lama
  ada di level ITEM, baru sekarang ditambahkan ke level EXPENSE.

## Keputusan Kecil Selama Eksekusi
- **Sales Invoice diverifikasi LANGSUNG** (test call nyata, save +
  delete cleanup) — confidence TINGGI.
- **Purchase Invoice TIDAK diverifikasi langsung** — koneksi local dev
  yang dipakai tidak punya scope `vendor_view` (dibutuhkan
  `findOrCreateVendor` sebelum bisa save Purchase Invoice test), dan
  reconnect ulang cuma untuk 1 verifikasi ini dianggap tidak sepadan
  effort-nya. DIASUMSIKAN konsisten (field API sama dengan `detailItem.
  projectNo` yang sudah terbukti konsisten di kedua modul) — dicatat
  eksplisit di Known Limitations, BUKAN diam-diam diasumsikan tanpa
  catatan (pola sama seperti charField/numericField/dateField Fase 75).
- **Naming kolom BEDA gaya sengaja** — Sales Invoice pakai "Expense
  Project No" (Inggris, konsisten field Beban SI lain sejak Fase 77),
  Purchase Invoice pakai "Beban - Proyek" (Indonesia, konsisten field
  Beban PI lain yang belum di-Inggriskan, mengikuti pola "Beban -
  Department"/"Beban - PO No" yang sudah ada).
- **Ditaruh DI DALAM grup Beban** (bukan di ujung bersama field link
  ITEM Fase 76/79) — sesuai instruksi eksplisit user sebelumnya (Fase
  79): field Beban baru masuk grup Beban, bukan disatukan dengan field
  non-Beban di paling akhir.
- Transaksi test (`INVTESSQ` dari client, `TESPROJEXP01` dari
  verifikasi save) TIDAK diubah/dihapus untuk `INVTESSQ` (punya
  client), TAPI `TESPROJEXP01` (buatan verifikasi ini) DIHAPUS lagi
  setelah selesai supaya tidak nyampah di Data Usaha demo mereka.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review inline — field pass-through sederhana (string),
      tidak ada endpoint/data flow baru. Tidak ada temuan.
- [x] `docs/PROGRESS.md` diupdate.

## Known Limitations
- **Purchase Invoice BELUM diverifikasi langsung** — field
  `detailExpense.projectNo` diasumsikan konsisten dari pola
  `detailItem.projectNo`, TAPI belum dites end-to-end nyata khusus
  untuk Purchase Invoice. Kalau ternyata field-nya beda/tidak ada di
  Purchase Invoice, ini yang paling mungkin perlu dikoreksi.
- Field ini TIDAK ADA di spec resmi publik Accurate — sama seperti
  charField/numericField/dateField, kalau Accurate suatu saat mengubah
  perilaku field tidak terdokumentasi ini, tidak akan ada peringatan
  resmi dari mereka.

## Ringkasan Hasil
Field "Proyek" level EXPENSE (`detailExpense.projectNo`) ditambahkan ke
Sales Invoice (diverifikasi LANGSUNG lewat test call nyata — save
berhasil, project ter-resolve benar) dan Purchase Invoice (mirror,
diasumsikan konsisten, belum diverifikasi langsung). Kolom "Expense
Project No" (SI) / "Beban - Proyek" (PI) ditaruh di dalam grup Beban.
`bun run typecheck` 0 error, `bun test` 499 pass/0 fail (4 baru). Dev DB
dibersihkan, transaksi test verifikasi dihapus dari Data Usaha client.
