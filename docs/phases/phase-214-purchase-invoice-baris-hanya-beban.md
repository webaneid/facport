# Fase 214 — Purchase Invoice: baris hanya-Beban tidak lagi menggagalkan seluruh grup

**Status:** In Progress — sisi kode selesai & teruji unit (2026-11-05); verifikasi ke Accurate nyata MENUNGGU database dengan hak Pemasok/Barang/Faktur Pembelian
**Mulai:** 2026-11-05
**Selesai:** -

## Tujuan
Laporan client (PI-2026-0001): faktur masuk ke Accurate, tetapi kedua baris tampil "Gagal" dengan galat `undefined is not an object (evaluating 'result.detailItem[i].id')`; Retry lalu menabrak "Sudah ada data lain dengan No Form # Faktur Pembelian".
Akar masalah (terbukti dari `raw_data` client): template resmi memuat pola "baris barang + baris Beban terpisah" (baris 2 hanya `Akun Beban`/`Jumlah Beban`, tanpa Item No). Facport selalu membuat 1 entri `detailItem` per baris sehingga baris 2 dikirim sebagai `{}`; Accurate membuangnya, `result.detailItem` lebih pendek dari jumlah baris, dan pemetaan id di worker melempar galat SETELAH `save.do` berhasil.

## Scope
- [x] `planPurchaseInvoiceRows` (mapping): tentukan baris hanya-Beban; tidak ikut `payload.detailItem`; tidak dipetakan dari `result.detailItem`
- [x] Grup yang SEMUA barisnya hanya-Beban: payload lama dipertahankan (perilaku Accurate untuk faktur tanpa barang belum teruji), pemetaan id tidak membaca `result.detailItem`
- [x] Pemetaan hasil simpan memakai `selectSavedDetailForMapping` (baca `detail.do` bila jumlah hasil > dikirim); bila tetap tak cocok → pesan "faktur SUDAH tersimpan, jangan unggah ulang"
- [x] Baris hanya-Beban diberi `EXPENSE_ONLY_ROW_MARKER` di `accurate_detail_item_id` agar Batal Import (Fase 09: tolak faktur bila ada baris sukses tanpa id) tidak terblokir
- [x] Adopsi faktur yang sudah ada saat Retry (`getPurchaseInvoiceByNumber` + `matchExistingPurchaseInvoice` + `tryAdoptExistingPurchaseInvoice`), mirror Sales Invoice Fase 208; cocok ketat: nomor, Vendor, barang berurutan, qty, harga, akun+jumlah Beban
- [x] Jalur append (lintas-batch): baris hanya-Beban ditolak dengan pesan jelas (jalur update hanya mengirim `detailItem`; Beban tidak akan sampai ke Accurate)
- [x] Edit Baris (satu baris + grid edit massal): baris hanya-Beban tidak diwajibkan mengisi kolom barang; header (Vendor/Tanggal/Trans No) tetap wajib. Satu sumber aturan `isRequiredFieldExemptForRow` + `missingRequiredValues` (API) dipakai ulang web lewat `apps/web/lib/purchase-invoice-expense-only.ts` (pola Sales Invoice Fase 198); dialog (`edit-row-dialog.tsx`) dan `EditableGrid` (`isRequiredExempt`) memakainya
- [x] Unit test dengan data persis client (payload, adopsi, validasi Edit Baris)
- [ ] Verifikasi ke Accurate nyata: (a) bentuk `detailExpense[]` di `detail.do` (nama field akun/jumlah) untuk adopsi; (b) perilaku faktur hanya-Beban (tanpa barang); (c) alur unggah→worker ujung ke ujung
- [ ] Sales Invoice: kode yang sama (`sales-invoice.mapping.ts` `payload.detailItem = rawRows.map(...)`). Belum diubah — baris tanpa item di SI juga bisa berarti baris perluasan dokumen sumber (Fase 198) dan pemetaan id memakai offset per baris; butuh rancangan terpisah + uji

## Referensi
- Architecture doc: `docs/architecture/architecture-purchase-invoice.md` § Fase 214
- Pola adopsi: Fase 208 (`lib/accurate-adopt-existing.ts`)

## Keputusan Kecil Selama Eksekusi
- Penanda `"expense-only"` (string, bukan id) dipilih daripada melonggarkan guard Batal Import: guard itu tetap menolak baris lama tanpa tracking, dan Batal Import selalu menghapus faktur UTUH (ADR-0014), jadi id per baris hanya berfungsi sebagai bukti "baris ini terlacak".
- Kriteria "hanya-Beban" sengaja sempit: `detailItem` benar-benar kosong DAN `accountNo`+`expenseAmount` terisi. Baris kosong total tetap diperlakukan seperti sebelumnya.
- Adopsi tidak menerima baris barang tambahan di Accurate (beda dari SI; Faktur Pembelian tidak punya baris otomatis yang dikenal).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] `bun test src/lib src/workers`: 1528 lulus; `purchase-invoice-import.route.test.ts` 19 lulus; test mapping/adopsi 75 lulus (DB dev dibersihkan sesudahnya)
- [ ] Security review dijalankan
- [ ] Verifikasi ke Accurate nyata (butir di Scope)
- [ ] `docs/PROGRESS.md` diupdate saat Done

## Known Limitations
- Kolom `Item Unit Name` tetap WAJIB di Edit Baris untuk baris barang (aturan lama tidak diubah): file client mengosongkannya, jadi baris barang miliknya masih ditolak saat disimpan lewat pensil sampai kolom itu diisi — padahal worker sendiri tidak membutuhkannya. Perlu keputusan terpisah (longgarkan atau tidak).
- Beban pada jalur Retry-lanjutan faktur yang sudah ada belum didukung (ditolak jelas).
- Faktur hanya-Beban belum teruji ke Accurate.
- Adopsi bergantung pada bentuk `detailExpense[]` di `detail.do` yang belum diverifikasi; bila ternyata berbeda hasilnya "isi tidak cocok" (aman, tidak salah tautan).

## Ringkasan Hasil (isi pas fase Done)
