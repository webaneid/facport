# Fase 200 — Fix: isian bawaan di kolom pendamping memicu kewajiban Item No/Qty bahan baku (Work Order)

**Status:** Done (2026-10-20, belum dirilis)
**Mulai:** 2026-10-20
**Selesai:** 2026-10-20

## Tujuan
Production 2026-10-19: batch Work Order 7.812 baris (434 dokumen × 18 baris) gagal 100% dalam 3 detik — "Kolom wajib kosong atau tidak valid di baris …: matItemNo, matQuantity". Ditemukan dari anomali di evaluasi Fase 199 (semua baris gagal cepat = kegagalan validasi sistematis, bukan kapasitas).

## Penyebab (dibuktikan dari baris nyata di DB production)
Template client mengisi **"Standard Cost" = 1** di blok bahan baku pada SEMUA baris, termasuk baris produk+biaya. Aturan lama (Fase 147): section "tersentuh" bila kolom APA PUN di section itu terisi → `matStdCost` terisi menyentuh bahan baku → Item No + Qty bahan menjadi wajib → gagal. Bukan regresi: aturan tidak berubah sejak 22 Sep; file ini tidak pernah bisa lolos.

## Scope
- [x] `SectionSpec.identity` + `isSectionActive`: section dianggap dipakai baris HANYA bila kolom identitasnya terisi — bahan baku & biaya produksi: Item No / nama item / Qty; produk sampingan: Item No / nama / Qty; proses: semua kolom (tanpa identitas khusus, perilaku lama). Kolom pendamping (Standard Cost/Date/Total, Project No, Department, Notes, Process Category, Kategori Keuangan, Portion) tidak lagi memicu section sendirian.
- [x] Satu aturan dipakai di tiga tempat: validasi baris (`workOrderRowError`), pembentukan payload (`buildSectionEntry` — entri bahan tanpa item tidak terkirim), dan `extractDataClassificationValues` (isian bawaan tidak membuat Kategori Keuangan sampah di Accurate client).
- [x] Nama item / Qty terisi tanpa Item No tetap galat (tidak dibuang diam-diam). Bahan baku nyata (Item No/Qty terisi) dikirim persis seperti sebelumnya termasuk Standard Cost.
- [x] Tes: baris nyata client (regresi), kolom pendamping saja, CLS section tak dipakai, bahan nyata tetap lengkap; 2 tes lama yang menegaskan aturan lama diperbarui.

## Keputusan Kecil Selama Eksekusi
- `billOfMaterialNo` ("Bill Material no") TETAP wajib untuk semua tipe: spec resmi Accurate memasukkannya ke `required` `work-order/save.do`, dan tidak ada bukti tipe PRODUCT boleh tanpa itu. Tes mendokumentasikan bahwa baris nyata client kini berhenti di langkah ini ("Kolom header wajib diisi di baris pertama Work Order: Bill Material no") — pesan yang jelas, bukan lagi galat keliru.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error
- [x] Suite API 2484 hijau; data uji dibersihkan
- [x] Security review inline: hanya logika validasi/pemetaan data; tanpa endpoint/query/secret baru
- [x] `docs/PROGRESS.md`, lessons-learned

## Known Limitations
- File client yang sama kemungkinan besar masih gagal di "Bill Material no" (tidak ada di file; spec mewajibkan). Perlu jawaban: apakah dokumen bertipe Kode Produk (PRODUCT) di Accurate mereka memang punya Nomor Formula? Bila tidak, uji di Accurate demo untuk memutuskan melonggarkan aturan itu khusus PRODUCT.
- Isian bawaan lain pada kolom identitas (mis. Qty bawaan tanpa Item No) tetap ditandai galat.

## Ringkasan Hasil
Isian bawaan di kolom pendamping tidak lagi membuat section dianggap terpakai; baris produk+biaya dengan Standard Cost bawaan kini lolos validasi baris. Kegagalan sistematis 434 Work Order bergeser ke penyebab sebenarnya yang tersisa (Bill Material no kosong), yang kini dilaporkan jelas.
