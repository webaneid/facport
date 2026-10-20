# Fase 203 — Diagnostik bentuk dokumen sumber + pesan galat kuantitas (kasus DO diretur)

**Status:** Done sisi kode (2026-10-20, belum dirilis) — perbaikan hitung sisa kuantitas menunggu nama field asli dari production
**Mulai:** 2026-10-20
**Selesai:** 2026-10-20 (diagnostik + pesan); perhitungan sisa kuantitas: -

## Tujuan
Laporan client 2026-10-20 (Sales Invoice dari Delivery Order, Fase 198): DO 10 pcs → retur penjualan 3 pcs → faktur hanya isi tanggal + nomor DO (`DO001`; Excel: Trans Date, CUST NO, Branch Name, ITEM: DELIVERY ORDER NO) → Accurate menolak: *"Kuantitas \"Anti Gores Iphone 5\" di faktur melebihi yang dikirim."* Penyebab: Facport menarik kuantitas ASLI DO (10); yang boleh ditagih 7 (retur 3 belum dikurangkan). Ini batasan yang dicatat di Fase 198 ("dokumen sumber yang diretur/ditagih sebagian tidak dihitung ulang"); skenario client membuktikannya nyata.

## Yang BELUM diketahui
Nama field di respons `delivery-order/detail.do` (juga SO/SQ) yang memuat sisa kuantitas setelah retur/penagihan sebelumnya. Spec `save.do` hanya menunjukkan `quantity`/`reverseInvoiceNumber`; respons `detail.do` tak terdokumentasi dan belum pernah dibaca. Tidak ditebak: menebak nama field berisiko salah hitung angka tagihan.

## Scope
- [x] Diagnostik: `summarizeSourceShape` + log `source_doc_shape` (doc, nomor, jumlah baris, nama field header & baris pertama, nilai field bernuansa kuantitas `quant|qty|ship|return|invoice|remain|avail|deliver|sisa|outstanding` untuk 3 baris pertama; objek diringkas `[objek]`; tanpa data pribadi) pada fetcher SQ/SO/DO. Cara baca: `docker compose logs worker | grep source_doc_shape`.
- [x] Pesan: `annotateSourceExpansionFailure` — galat kuantitas Accurate pada baris perluasan ditambah penjelasan + cara mengisi Item No/Unit Price/Qty sendiri; saran serupa di ringkasan galat web (`ERROR_HINTS`) dan peringatan di panduan template kolom DO/SO.
- [x] Tes (pesan, diagnostik, saran web).
- [ ] Hitung sisa kuantitas otomatis (qty sumber − retur − penagihan sebelumnya) setelah nama field asli diketahui dari log; beberapa dokumen sumber & pengaruhnya pada harga/diskon perlu dipertimbangkan.

## Workaround client (sekarang)
Isi Item No, Item Unit Price, Item Qty (mis. 7), Item Unit Name dan Item Warehouse sendiri di baris faktur (mode faktur sebagian), nomor DO tetap diisi untuk menautkan.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error
- [x] Suite hijau; data uji dibersihkan
- [x] Security review inline: log hanya nama field + angka kuantitas; tanpa endpoint/query/secret baru
- [x] `docs/PROGRESS.md`, lessons-learned

## Known Limitations
- Selama sisa kuantitas belum dihitung, faktur dari DO/SO yang pernah diretur/ditagih sebagian harus diisi manual.

## Ringkasan Hasil
Pesan galat dan panduan kini menjelaskan penyebab dan cara mengatasinya; log diagnostik akan mengungkap nama field sisa kuantitas dari respons Accurate asli pada percobaan berikutnya.
