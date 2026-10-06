# Fase 169 — Sales Order: Ambil Baris Item Otomatis dari Sales Quotation

**Status:** Done
**Mulai:** 2026-10-06
**Selesai:** 2026-10-06

## Tujuan
Sales Order adalah kelanjutan langsung Sales Quotation, tapi sampai sekarang kolom "Sales Quot No" hanya meneruskan NOMOR penawaran; Item No, harga, qty, dan satuan tetap wajib diketik ulang di Excel (spec Accurate mewajibkan `itemNo` & `unitPrice` di `detailItem`, jadi menautkan nomor saja tidak menarik isinya). Fase ini membuat Sales Order bisa MENARIK baris item dari Sales Quotation di Accurate.

## Aturan (diputuskan user 2026-10-06)
- Baris Excel dengan **Sales Quot No terisi DAN keenam kolom item kosong** (Item No, Item Name, Item Price, Item Note [deskripsi baris], Qty, Unit Name) → baris itu **diperluas menjadi SEMUA baris item penawaran** (itemNo, nama, harga, catatan, qty, satuan dari Accurate; tiap baris hasil membawa `salesQuotationNumber`).
- **Salah satu** dari keenam kolom terisi → **semua dari Excel** (perilaku sekarang, tanpa mengisi kolom kosong dari penawaran) — karena qty order bisa lebih kecil dari penawaran (penawaran 10, order 5).
- Kolom lain di baris itu (gudang, departemen, proyek, pajak, diskon, atribut/CLS, salesman) **berlaku ke semua baris hasil perluasan**.
- Scope OAuth `sales_quotation_view` **WAJIB** (opsi A, keputusan user): customer Sales Order yang ada akan diminta "Perbarui izin" sekali. Alasan user: customer masih sedikit, ingin benar sejak awal, pola ini akan dipakai modul lain.

## Scope
- [x] Registri endpoint: `GET sales-quotation/detail.do` ditambahkan ke modul `sales_order` (scope `sales_quotation_view` turunan dari snapshot).
- [x] `lib/accurate-sales-quotation.ts` — `getSalesQuotationLinesByNumber` (baca detail penawaran, parse ketat: baris tanpa itemNo/harga/qty/satuan terbaca → error jelas, TIDAK kirim data setengah).
- [x] `sales-order.mapping.ts` — `isQuotationExpansionRow`, `missingRequiredFieldsForRow` (wajib per baris, dikecualikan untuk baris perluasan), `expandQuotationLines` (pure).
- [x] Worker `processSalesOrderGroup` — perluas baris penawaran setelah build payload (cache per nomor penawaran).
- [x] API route edit baris & edit massal — validasi "wajib" memakai `missingRequiredFieldsForRow`.
- [x] Web — dialog edit baris & grid edit massal (wajib dinamis), label dropdown mapping, template guide.
- [x] Test + dokumentasi (architecture-sales-order.md, scope engine, PROGRESS).

## Referensi
- Architecture doc: `docs/architecture/architecture-sales-order.md` § "Fase 169"
- Preseden: Fase 158 (Delivery Order membaca `sales-order/detail.do`, `architecture-delivery-order.md`)
- Scope engine: `docs/architecture/architecture-accurate-scope-engine.md`

## Keputusan Kecil Selama Eksekusi
- "Description" yang disebut user di antara kolom item = **Item Note** (`detailNotes`, deskripsi BARIS). Kolom "Description" level dokumen (`description`, header) tidak ikut syarat "kosong" dan tetap berlaku untuk seluruh order.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review dijalankan (skill `security-review`)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan)
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- **Bentuk respons `sales-quotation/detail.do` BELUM diverifikasi dengan respons asli** (spec tidak mendokumentasikannya). Parser mengikuti pola detail Sales Order yang sudah terbukti (`item.no`, `quantity`, `unitPrice`, `detailName`, `detailNotes`) + `itemUnit.name` untuk satuan (cadangan: `unit.name`, `itemUnitName`). Parser KETAT: baris yang kode barang/harga/qty/satuannya tidak terbaca membuat perluasan GAGAL dengan pesan jelas — tidak pernah mengirim data setengah. Verifikasi dengan 1 respons asli (penawaran ≥2 baris) sebelum dipakai customer.
- Perluasan hanya menyalin 6 kolom (kode, nama, harga, catatan, qty, satuan). Diskon/pajak/gudang/atribut BARIS PENAWARAN tidak ikut — kolom itu hanya dari Excel (berlaku ke semua baris hasil). Belum diketahui apakah Accurate menurunkannya sendiri lewat `salesQuotationNumber`.
- Penautan ke penawaran memakai kode barang saja (tidak ada nomor urut baris di API): penawaran dengan 2 baris barang sama bisa ambigu (kelas masalah sama dengan item kembar di Purchase Invoice). Belum diketahui apakah Accurate membatasi qty/harga terhadap penawaran.
- Scope `sales_quotation_view` WAJIB: customer Sales Order yang sudah terhubung diminta "Perbarui izin" sekali setelah rilis (otorisasi ulang mematikan token lama — jangan dilakukan saat ada import berjalan).
- Batas 500 baris per penawaran (security review).
- "Description" yang dimaksud user diasumsikan Item Note (deskripsi baris), bukan Description level dokumen.

## Ringkasan Hasil
Baris Sales Order dengan "Sales Quot No" terisi dan Item No/Item Name/Item Price/Item Note/Qty/Unit Name kosong semua kini diperluas jadi semua baris item penawaran dari Accurate; salah satu kolom terisi → semua dari Excel (penawaran 10, order 5 aman). Kolom lain berlaku ke semua baris hasil. Validasi "wajib" per baris (edit baris & edit massal, API + UI) dikecualikan untuk baris perluasan lewat satu fungsi sumber tunggal (`missingRequiredFieldsForRow`/`isQuotationExpansionRow`, dipakai ulang web). Scope `sales_quotation_view` ditambahkan ke registri `sales_order`. Typecheck 0 error; test baru: 6 (aturan & perluasan) + 4 (parser) + 1 (batas) + 2 (route edit). Security review: 1 Medium (batas baris) sudah diperbaiki, 0 Critical/High.
