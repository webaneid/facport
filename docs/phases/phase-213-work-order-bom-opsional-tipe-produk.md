# Fase 213 — Work Order: "Bill Material no" tidak wajib untuk tipe Kode Produk (PRODUCT)

**Status:** Done sisi kode (belum dirilis)
**Mulai:** 2026-10-29
**Selesai:** 2026-10-29

## Tujuan
Client menegaskan (2026-10-29): di Accurate, kalau Work Order bertipe produk (Kode Produk), "Bill Material No" TIDAK perlu diisi. File Excel aktual client (tipe `PRODUCT`) memang tidak punya kolom itu, dan sejak Fase 200 baris-barisnya ditolak Facport ("Bill Material no" wajib untuk semua tipe, mengikuti `required` spec). Menyelesaikan pertanyaan terbuka 2026-10-27.

## Bukti
- Jawaban client (pengguna Accurate) 2026-10-29: tipe produk tidak butuh Bill Material No.
- Uji nyata ke database demo (2026-10-29): `work-order/save.do` tipe `PRODUCT` tanpa `billOfMaterialNo` -> semua galat Accurate yang muncul soal hal lain (detail kosong, barang harus bertipe "persediaan diproduksi", akun belum terdaftar di Preferensi Pabrikasi); TIDAK ada galat soal Bill Material/Nomor Formula. Uji penuh sampai tersimpan belum bisa karena demo belum punya barang "diproduksi" + Preferensi Pabrikasi (hanya bisa diatur lewat layar Accurate). Item uji dihapus; tidak ada WO yang terbentuk.
- Spec `required` memuat `billOfMaterialNo` untuk satu skema semua tipe; spec terbukti tidak lengkap di banyak tempat (lessons-learned 2026-09-09).

## Scope
- [x] `requiredFields` (cek pemetaan kolom): `billOfMaterialNo` dikeluarkan (kolom boleh tidak ada di Excel)
- [x] `workOrderHeaderMissing`: `billOfMaterialNo` wajib HANYA bila tipe BUKAN `PRODUCT` (tipe Nomor Formula / Nomor Rencana Produksi tetap wajib, sampai terbukti sebaliknya)
- [x] Template unduhan + label dropdown + hint web: "wajib kecuali tipe Kode Produk"
- [x] Tes mapping + tes route diperbarui; `architecture-work-order.md` (pertanyaan terbuka ditutup)

## Di Luar Scope
- Tipe `BILL_OF_MATERIAL` dan `MANUFACTURE_ORDER` tetap mewajibkan Bill Material no (belum ada bukti sebaliknya; untuk tipe Nomor Formula, kolom itu memang inti dokumen).
- Uji penuh sampai tersimpan di Accurate (butuh penyiapan Preferensi Pabrikasi + barang diproduksi di demo).

## Referensi
- `docs/architecture/architecture-work-order.md` § Known Limitations, `docs/phases/phase-200-*`

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error
- [x] Lint nol error
- [x] Test API/web
- [x] Security review
- [x] `docs/PROGRESS.md` diupdate

## Ringkasan Hasil
- `requiredFields` tanpa `billOfMaterialNo`; `workOrderHeaderMissing` mewajibkannya hanya bila tipe bukan `PRODUCT`. Template, label dropdown, dan hint dialog edit diperbarui.
- Tes: mapping (3 tes baru/diubah, termasuk file aktual client yang kini lolos), route (pemetaan tanpa kolom BOM tidak lagi ditolak).
- Hasil: typecheck nol error, lint bersih, `bun run test` 2674 (API) + 600 (web) lolos, security review tanpa temuan, database dev dibersihkan.
- Tidak ada migrasi, scope, atau endpoint baru.

## Known Limitations
- Belum teruji sampai tersimpan di Accurate (demo butuh barang "diproduksi" + Preferensi Pabrikasi lewat layar Accurate). Uji pertama dengan data client setelah rilis menentukan; bila Accurate menolak, galatnya muncul di baris terkait.
- Tipe Nomor Formula & Rencana Produksi tetap mewajibkan BOM (tanpa bukti sebaliknya).
- Kamus tipe ("Kode Produk" dst) masih dari penjelasan lisan; file aktual client memakai nilai `PRODUCT`.
