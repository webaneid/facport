# Fase 169 — Sales Order: Ambil Baris Item Otomatis dari Sales Quotation

**Status:** In Progress
**Mulai:** 2026-10-06
**Selesai:** —

## Tujuan
Sales Order adalah kelanjutan langsung Sales Quotation, tapi sampai sekarang kolom "Sales Quot No" hanya meneruskan NOMOR penawaran; Item No, harga, qty, dan satuan tetap wajib diketik ulang di Excel (spec Accurate mewajibkan `itemNo` & `unitPrice` di `detailItem`, jadi menautkan nomor saja tidak menarik isinya). Fase ini membuat Sales Order bisa MENARIK baris item dari Sales Quotation di Accurate.

## Aturan (diputuskan user 2026-10-06)
- Baris Excel dengan **Sales Quot No terisi DAN keenam kolom item kosong** (Item No, Item Name, Item Price, Item Note [deskripsi baris], Qty, Unit Name) → baris itu **diperluas menjadi SEMUA baris item penawaran** (itemNo, nama, harga, catatan, qty, satuan dari Accurate; tiap baris hasil membawa `salesQuotationNumber`).
- **Salah satu** dari keenam kolom terisi → **semua dari Excel** (perilaku sekarang, tanpa mengisi kolom kosong dari penawaran) — karena qty order bisa lebih kecil dari penawaran (penawaran 10, order 5).
- Kolom lain di baris itu (gudang, departemen, proyek, pajak, diskon, atribut/CLS, salesman) **berlaku ke semua baris hasil perluasan**.
- Scope OAuth `sales_quotation_view` **WAJIB** (opsi A, keputusan user): customer Sales Order yang ada akan diminta "Perbarui izin" sekali. Alasan user: customer masih sedikit, ingin benar sejak awal, pola ini akan dipakai modul lain.

## Scope
- [ ] Registri endpoint: `GET sales-quotation/detail.do` ditambahkan ke modul `sales_order` (scope `sales_quotation_view` turunan dari snapshot).
- [ ] `lib/accurate-sales-quotation.ts` — `getSalesQuotationLinesByNumber` (baca detail penawaran, parse ketat: baris tanpa itemNo/harga/qty/satuan terbaca → error jelas, TIDAK kirim data setengah).
- [ ] `sales-order.mapping.ts` — `isQuotationExpansionRow`, `missingRequiredFieldsForRow` (wajib per baris, dikecualikan untuk baris perluasan), `expandQuotationLines` (pure).
- [ ] Worker `processSalesOrderGroup` — perluas baris penawaran setelah build payload (cache per nomor penawaran).
- [ ] API route edit baris & edit massal — validasi "wajib" memakai `missingRequiredFieldsForRow`.
- [ ] Web — dialog edit baris & grid edit massal (wajib dinamis), label dropdown mapping, template guide.
- [ ] Test + dokumentasi (architecture-sales-order.md, scope engine, PROGRESS).

## Referensi
- Architecture doc: `docs/architecture/architecture-sales-order.md` § "Fase 169"
- Preseden: Fase 158 (Delivery Order membaca `sales-order/detail.do`, `architecture-delivery-order.md`)
- Scope engine: `docs/architecture/architecture-accurate-scope-engine.md`

## Keputusan Kecil Selama Eksekusi
- "Description" yang disebut user di antara kolom item = **Item Note** (`detailNotes`, deskripsi BARIS). Kolom "Description" level dokumen (`description`, header) tidak ikut syarat "kosong" dan tetap berlaku untuk seluruh order.

## Checklist Sebelum Ditutup (sesuai SOP)
- [ ] Type check nol error (`bun run typecheck`)
- [ ] Security review dijalankan (skill `security-review`)
- [ ] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan)
- [ ] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda
- [ ] `docs/PROGRESS.md` diupdate

## Known Limitations
(isi saat fase Done)

## Ringkasan Hasil (isi pas fase Done)
(isi saat fase Done)
