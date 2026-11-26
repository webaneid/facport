# Fase 225 — Receive Item: tarik isi Purchase Order cukup dengan nomor PO

**Status:** Done, LIVE v2.54.0 (2026-11-26); terbukti ke Accurate dev
**Mulai:** 2026-11-26 (rencana)
**Selesai:** -

## Tujuan
Permintaan client (2026-11-26): "narik PO 100% tanpa isi detail barang". Upload dengan kolom barang kosong sekarang ditolak Accurate ("Barang dan Jasa belum terisi") karena `ITEM: Purchase Order No` hanya diteruskan sebagai tautan.

## Scope
- [x] Tahap 0 — uji nyata (database dev `facport`)
- [x] Tahap A — kode + tes
- [x] Tahap B — typecheck, tes, security review, dokumen

## Temuan Tahap 0
- `purchase-order/detail.do` membawa `availableQuantity`/`availableUnitPrice`/`availableItemCashDiscount`, `warehouse.name`, `vendor.vendorNo`, `id` baris.
- Tanpa `purchaseOrderDetailId`, baris Item No kembar SEMUA tertaut ke baris PO pertama (sisa -5), tanpa error. Dengan ID → tepat.
- Accurate TIDAK menolak penerimaan berlebih → PO dobel dalam 1 dokumen ditolak Facport, batch berisi perluasan diproses berurutan.
- `receive-item/detail.do` butuh scope view yang tidak diminta (tidak dipakai).

## Aturan (usulan, mengikuti Fase 198)
- Baris perluasan: `ITEM: Purchase Order No` terisi DAN Item No, Item Name, Item Price, ITEM: Description, Quantity, Unit Name semuanya kosong.
- Salah satu terisi → seluruhnya dari Excel (penerimaan sebagian).
- Tetap wajib dari Excel: Date, Vendor No, Receive Number, Branch Name.
- Isian Excel menang; kolom kosong (gudang, departemen, proyek, diskon, pajak, mata uang/kurs) diisi dari PO.
- Qty = SISA yang belum diterima; baris habis dilewati; semua habis → gagal jelas.
- Pemasok PO beda dari Vendor No → gagal jelas.
- PO tidak ditemukan/tidak terbaca → gagal jelas; tidak pernah kirim sebagian.
- PO yang sama dua kali dalam satu Receive Number → ditolak (mencegah qty dobel).
- Batas 500 baris per PO (sama dengan Fase 198).

## Risiko
1. **Sisa kuantitas** belum diketahui nama fieldnya untuk PO. Bila Accurate tidak menyediakannya, rancang ulang sebelum Tahap A (jangan kirim qty awal diam-diam).
2. **Scope baru** `purchase_order_view`: SEMUA pelanggan Receive Item harus "Perbarui izin" sebelum import berikutnya, walau tidak memakai fitur ini.
3. **Paralel:** `receive_item` dikirim paralel; dua Receive Number yang menarik PO sama bisa sama-sama membaca sisa penuh. Usulan: batch yang berisi baris perluasan diproses berurutan (hanya cara kirim yang berubah). Sisa tidak boleh di-cache lintas grup.
4. Item No kembar di PO: tautan baris bisa salah tanpa error (§ `architecture-source-line-resolution.md`); diputuskan setelah Tahap 0.

## Di luar scope
Receive Item dari Purchase Requisition; Purchase Invoice ← PO/Receive Item; pemeriksaan sel kosong saat konfirmasi di modul lain; Konverter.

## Pertanyaan terbuka
1. Satu PO sering diterima bertahap?
2. Satu surat jalan bisa memuat beberapa PO? (rencana: ya)
3. Gudang diambil dari PO, atau selalu diisi di Excel?

## Referensi
`architecture-receive-item.md` § Fase 225, `phase-198-sales-invoice-tarik-isi-dokumen-sumber.md`, `phase-203-*.md`, `architecture-source-line-resolution.md`.

## Checklist Sebelum Ditutup
- [x] Type check nol error; tes api 2833 + web 632 lulus
- [x] Security review (inline): 0 Critical/High
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Baris yang diisi MANUAL dengan Item No kembar di PO tetap tertaut ke baris pertama (perilaku lama; terkait Fase 196).
- Dua batch BERBEDA yang menarik PO sama secara serentak bisa menerima dobel.
- Multi satuan pada PO belum diuji; belum diuji lewat upload di browser.
