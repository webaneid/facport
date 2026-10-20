# Fase 203 — Diagnostik bentuk dokumen sumber + pesan galat kuantitas (kasus DO diretur)

**Status:** Done (2026-10-20) — diagnostik dirilis di v2.40.0; perhitungan sisa kuantitas untuk DO selesai di `develop` (belum dirilis) setelah nama field asli terbaca dari log production
**Mulai:** 2026-10-20
**Selesai:** 2026-10-20 (diagnostik + pesan); perhitungan sisa kuantitas: -

## Tujuan
Laporan client 2026-10-20 (Sales Invoice dari Delivery Order, Fase 198): DO 10 pcs → retur penjualan 3 pcs → faktur hanya isi tanggal + nomor DO (`DO001`; Excel: Trans Date, CUST NO, Branch Name, ITEM: DELIVERY ORDER NO) → Accurate menolak: *"Kuantitas \"Anti Gores Iphone 5\" di faktur melebihi yang dikirim."* Penyebab: Facport menarik kuantitas ASLI DO (10); yang boleh ditagih 7 (retur 3 belum dikurangkan). Ini batasan yang dicatat di Fase 198 ("dokumen sumber yang diretur/ditagih sebagian tidak dihitung ulang"); skenario client membuktikannya nyata.

## UPDATE 2026-10-20 (sore) — nama field asli terbaca dari log production; sisa kuantitas DO selesai
Client mengunggah ulang file `DO001` setelah v2.40.0; log `source_doc_shape` menampilkan baris DO asli. Baris DO membawa kelompok `available*` yang SUDAH dihitung Accurate: `availableQuantity` **7**, `availableUnitPrice` 50.000, `availableTotalPrice` 350.000, `availableItemUnitName` PCS, `availableItemCashDiscount` 0; sedangkan `quantity`/`quantityDefault` = 10 (asli), `returnQuantity` = 3 (`returnQuantityDesc` "3 PCS"), `invoiceQuantity` = 0. **Perbaikan:** untuk sumber Delivery Order (label "Pengiriman") parser memakai `availableQuantity` (kuantitas), `availableUnitPrice` (harga), `availableItemUnitName` (satuan), `availableItemCashDiscount` (diskon nominal untuk sisa); baris dengan sisa 0 dilewati; bila semua baris tanpa sisa → galat "tidak punya sisa yang bisa ditagih". Jatuh ke `quantity`/`unitPrice` biasa bila field `available*` tidak ada. **SO/SQ TIDAK diubah** (bentuknya belum terbukti; log diagnostik tetap aktif untuk keduanya). Pesan galat DO kini menyebut "sisa yang tersedia menurut Accurate". Tes memakai baris nyata (DO 10, retur 3 → 7).

## (Sebelumnya) Yang BELUM diketahui
Nama field di respons `delivery-order/detail.do` (juga SO/SQ) yang memuat sisa kuantitas setelah retur/penagihan sebelumnya. Spec `save.do` hanya menunjukkan `quantity`/`reverseInvoiceNumber`; respons `detail.do` tak terdokumentasi dan belum pernah dibaca. Tidak ditebak: menebak nama field berisiko salah hitung angka tagihan.

## Scope
- [x] Diagnostik: `summarizeSourceShape` + log `source_doc_shape` (doc, nomor, jumlah baris, nama field header & baris pertama, nilai field bernuansa kuantitas `quant|qty|ship|return|invoice|remain|avail|deliver|sisa|outstanding` untuk 3 baris pertama; objek diringkas `[objek]`; tanpa data pribadi) pada fetcher SQ/SO/DO. Cara baca: `docker compose logs worker | grep source_doc_shape`.
- [x] Pesan: `annotateSourceExpansionFailure` — galat kuantitas Accurate pada baris perluasan ditambah penjelasan + cara mengisi Item No/Unit Price/Qty sendiri; saran serupa di ringkasan galat web (`ERROR_HINTS`) dan peringatan di panduan template kolom DO/SO.
- [x] Tes (pesan, diagnostik, saran web).
- [x] Hitung sisa kuantitas untuk DO: memakai `available*` dari Accurate (lihat UPDATE). [ ] SO/SQ: menunggu bentuk respons asli (log `source_doc_shape` doc=sales-order/sales-quotation).

## Workaround client (sekarang)
Isi Item No, Item Unit Price, Item Qty (mis. 7), Item Unit Name dan Item Warehouse sendiri di baris faktur (mode faktur sebagian), nomor DO tetap diisi untuk menautkan.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error
- [x] Suite hijau; data uji dibersihkan
- [x] Security review inline: log hanya nama field + angka kuantitas; tanpa endpoint/query/secret baru
- [x] `docs/PROGRESS.md`, lessons-learned

## Known Limitations
- Sales Order & Sales Quotation sebagai sumber masih memakai kuantitas ASLI; bila diretur/ditagih sebagian, isi manual (menunggu bentuk respons asli).

## Ringkasan Hasil
Pesan galat dan panduan kini menjelaskan penyebab dan cara mengatasinya; log diagnostik akan mengungkap nama field sisa kuantitas dari respons Accurate asli pada percobaan berikutnya.
