# Fase 06 — Purchase Invoice: Multi-Item per Faktur

**Status:** In Progress
**Mulai:** 2026-08-28
**Selesai:**

## Tujuan
Faktur Pembelian saat ini (Fase 02) dibatasi "1 baris Excel = 1 faktur =
TEPAT 1 item" — dicatat eksplisit sebagai Known Limitation, bukan
kelupaan. Client, lewat feedback pasca-presentasi 2026-08-27, butuh 1
faktur bisa punya banyak item — ini juga **akar penyebab error nyata**
yang muncul saat demo ("Sudah ada data lain dengan No Form # Faktur
Pembelian...", karena user mencoba menandai baris-baris 1 faktur yang
sama pakai Trans No yang sama, dan itu ditolak Accurate).

Prioritas TERTINGGI dari 3 feedback client (disepakati user 2026-08-27),
dikerjakan sebelum Fase 07 (pencarian riwayat per nomor faktur).

## Scope
- [x] `lib/import-mapping/purchase-invoice.mapping.ts`: fungsi baru
      `groupPurchaseInvoiceRows()` — pengelompokan baris berdasarkan
      `billNumber` (lihat ADR-0011 untuk aturan lengkap) — hasilkan array
      of groups, tiap group berisi row-row Excel yang jadi 1 faktur.
- [x] `buildPurchaseInvoicePayload`: diubah terima array `rawRows[]` (1
      group), hasilkan 1 payload dengan `detailItem[]` banyak elemen
      (field header dari row pertama, `detailItem` dari tiap row).
- [x] Validasi: `validateGroupVendorConsistency()` — semua row dalam 1
      group WAJIB `vendorNo` sama, group gagal SELURUHNYA (bukan
      sebagian) kalau tidak, pesan error jelas sebut Bill No + vendor
      yang bentrok.
- [x] `workers/index.ts` — job `IMPORT_TO_ACCURATE` branch per `batch.module`:
      `purchase_invoice` diproses PER GROUP (fungsi baru
      `processPurchaseInvoiceGroup`, exported), modul lain (`vendor_payable_account`)
      tetap per-row seperti sebelumnya (`processImportRow`, disederhanakan
      — case `purchase_invoice` dihapus dari situ). Hasil
      (`accurateTransactionId`/status/errorMessage) satu panggilan
      `save.do` di-apply ke SEMUA `import_batch_rows` anggota group lewat
      `inArray()`.
- [x] Endpoint retry — **dikonfirmasi TIDAK PERLU diubah** (bukan cuma
      diasumsikan): status di-apply UNIFORM per grup (tidak pernah
      partial sukses/gagal dalam 1 grup), jadi worker yang re-run dari
      retry akan re-group dengan benar dari row `pending`/`failed` yang
      tersisa.
- [x] UI konfirmasi mapping (`app/app/purchase-invoice/import/page.tsx`)
      — **disederhanakan dari rencana awal** (preview hitungan "N→M"
      dibatalkan, `previewRows` cuma 5 baris jadi hitungan bisa
      menyesatkan untuk file besar) — diganti catatan info teks statis
      soal fungsi grouping, ditaruh dekat tombol submit.
- [x] `template-guide.ts` § kolom "Bill No" — deskripsi diperbarui
      jelasin fungsi grouping ini.
- [x] Test: `purchase-invoice.mapping.test.ts` (baru) — 9 test murni
      (grouping 2+ baris sama/beda Bill No, Bill No kosong, kolom Bill No
      tidak di-mapping, whitespace/kapital; payload multi-item
      `detailItem.length`; validasi vendor-mismatch).

## Referensi
- Architecture doc: `docs/architecture/architecture-accurate-integration.md`
  § "Purchase Invoice — Multi-Item per Faktur (Fase 06)"
- ADR: `docs/decisions/adr-0011-purchase-invoice-multi-item.md`
- Known Limitation asal (Fase 02):
  `docs/phases/phase-02-modul-pembelian-purchase-invoice.md` § Known Limitations
- Bug nyata yang memicu fase ini: error demo 2026-08-27 "Sudah ada data
  lain dengan No Form # Faktur Pembelian..." — akar masalah 1-row-1-faktur

## Keputusan Kecil Selama Eksekusi
(hal yang diputuskan di tengah jalan, nggak cukup besar buat ADR tapi tetap
perlu diingat kenapa dipilih begitu)
-

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — apps/api DAN apps/web
- [x] Security review dijalankan (skill `security-review`) — 0 temuan
- [x] Temuan Critical/High — tidak ada
- [x] `docs/PROGRESS.md` diupdate
- [ ] **Divalidasi ke akun Accurate Online NYATA — BELUM, menunggu deploy**
      (minimal 1 faktur multi-item beneran tercipta dengan `detailItem`
      lebih dari 1, dicek langsung di Accurate). Status fase TETAP
      `In Progress` sampai ini terverifikasi — dilakukan setelah deploy ke
      `ane.web.id` (bagian dari alur push→release→deploy yang sedang
      berjalan).

## Known Limitations
(hal yang sengaja belum ditangani di fase ini, biar jelas dan disengaja —
bukan kelupaan)
- Tidak ada batas jumlah baris per grup (1 faktur bisa punya `detailItem`
  sebanyak apa pun kalau Bill No-nya sama) — kalau user salah isi Bill No
  sama untuk seluruh file, hasilnya 1 faktur raksasa, bukan error. Sudah
  termitigasi sebagian oleh catatan info di UI, belum ada validasi keras.
- Tidak ada preview "N baris akan jadi M faktur" sebelum submit (dicoba,
  dibatalkan — lihat § Scope, `previewRows` cuma 5 baris pertama, hitungan
  dari situ bisa menyesatkan). Diganti catatan info teks statis.

## Ringkasan Hasil (isi pas fase Done)
**Sisi kode selesai 2026-08-28, verifikasi Accurate nyata menyusul setelah
deploy** — lihat checklist di atas untuk apa yang sudah/belum.

Baris Excel dengan kolom "Bill No" (`billNumber`) yang sama sekarang
dikelompokkan jadi 1 payload `save.do` dengan `detailItem[]` banyak
elemen — ini akar penyebab error "Sudah ada data lain dengan No Form..."
yang muncul di demo 2026-08-27 sudah diperbaiki di level desain (bukan
cuma ditangani errornya). Baris dengan Bill No kosong tetap berperilaku
seperti sebelumnya (1 baris = 1 faktur, non-breaking).

Detail teknis lengkap (fungsi, file, keputusan) → ADR-0011 dan §
Scope di atas. Hasil test: 9 unit test baru lolos, full suite 48/48,
typecheck 0 error, build lokal (api+worker+web) sukses, security review
0 temuan.
