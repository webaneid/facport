# Fase 198 — Sales Invoice: tarik isi dari dokumen sumber (SQ / SO / DO) cukup dengan nomornya

**Status:** In Progress — Tahap A (Sales Quotation) selesai 2026-10-20, belum dirilis; Tahap B (SO) & C (DO) belum dimulai
**Mulai:** 2026-10-20
**Selesai:** -

## Tujuan
Permintaan client (2026-10-19): di Sales Invoice, user cukup mengisi SALAH SATU nomor dokumen sumber (Sales Quotation / Sales Order / Delivery Order); kolom item dikosongkan → isi dokumen sumber ditarik dari Accurate. Persis alur Sales Order ← Sales Quotation (Fase 169/172). BUKAN pengganti VLOOKUP/penautan baris (itu Fase 196, ditunda).

Saat ini kolom `Item: Delivery Order No / Sales Order No / Sales Quot No` (Fase 76) hanya meneruskan nomor ke `detailItem.*Number`; `itemNo` + `unitPrice` tetap wajib di Excel (spec Accurate).

## Aturan (diusulkan, mengikuti Fase 169/172 — MENUNGGU konfirmasi user)
- Baris dengan salah satu nomor sumber terisi DAN keenam kolom item kosong (Item No, Item Name, Item Price, Item Notes, Qty, Item Unit Name) → diperluas menjadi SEMUA baris item dokumen sumber.
- Salah satu kolom item terisi → seluruhnya dari Excel (faktur parsial; tidak ada "isi sebagian").
- Beberapa nomor sumber terisi → ambil sumber berprioritas DO > SO > SQ (aturan Accurate: hanya satu diproses); ketiga nomor tetap dikirim apa adanya.
- Isian Excel selalu menang; hanya kolom kosong diisi dari sumber. Kolom lain baris itu (gudang, pajak, diskon, dst.) berlaku ke semua baris hasil perluasan.
- Header (Pay Term, To Address, Description, Cash Discount, Currency) dan atribut baris (diskon, dept, proyek, salesman, PPN/PPh) ditarik seperti Fase 172; Beban (Expense) hanya bila Excel tidak punya baris Beban.
- Gagal jelas (tidak pernah kirim baris setengah) bila dokumen sumber tidak ketemu/tidak terbaca.

## Scope
**Tahap 0 — Verifikasi (read-only, tanpa ubah kode produksi)**
- [ ] 0.1 Bentuk respons `sales-order/detail.do` & `delivery-order/detail.do` TIDAK ada di spec (hanya SQ yang pernah dipindai, Fase 172). Probe read-only butuh database Accurate yang bisa dipakai — akun dev sudah tidak punya database (temuan Fase 196). Tanpa itu, parser SO/DO ditulis ketat + diuji dengan respons tiruan dan ditandai "belum diverifikasi respons asli".
- [ ] 0.2 Apakah baris DO membawa gudang (`warehouse.name`)? Menentukan apakah `warehouseName` (wajib di Sales Invoice) bisa dikecualikan untuk sumber DO.

**Tahap A — Sumber Sales Quotation (risiko terendah; parser sudah terverifikasi Fase 172)**
- [x] A1 Registri: tambah `GET sales-quotation/detail.do` ke modul `sales_invoice` (scope `sales_quotation_view`; customer Sales Invoice "Perbarui izin" sekali).
- [x] A2 Inti perluasan umum (`lib/import-mapping/source-expansion.ts`): `isSourceExpansionRow`, `expandSourceRowsInPayload` dengan tipe detail dokumen sumber netral; Sales Order TIDAK dimigrasikan di fase ini (Fase 169 stabil).
- [x] A3 Worker `processSalesInvoiceGroup`: perluas payload setelah build, SEBELUM auto-create customer/item.
- [x] A4 Pemetaan hasil Accurate → baris Excel memakai OFFSET perluasan (lihat § Risiko #1), bukan indeks baris.
- [x] A5 Validasi "wajib" dinamis (API: edit baris + edit massal; web: dialog + grid) lewat `missingRequiredFieldsForRow` versi Sales Invoice.
- [x] A6 Tes (perluasan, Excel menang, parsial, ganda nomor, gagal jelas, pemetaan offset) + panduan template + dokumen.

**Tahap B — Sumber Sales Order** (fetcher+parser baru dari `sales-order/detail.do`; endpoint registri `sales_invoice`; scope `sales_order_view`)
**Tahap C — Sumber Delivery Order** (fetcher+parser baru `delivery-order/detail.do`; scope BARU `delivery_order_view`; putuskan gudang dari 0.2)
**Tahap D — Penutup:** typecheck, suite penuh, security review, lessons-learned, PROGRESS.

## Keputusan Kecil Selama Eksekusi (Tahap A, 2026-10-20)
- **Jalur append DITOLAK jelas (bukan diperluas)** — mengoreksi usulan awal rencana. `appendToExistingSalesInvoice` mencocokkan duplikat per baris Excel (barang+harga+qty) agar retry aman; 1 baris → banyak baris sumber tidak cocok dengan logika itu dan berisiko ganda/salah-petakan. Baris perluasan pada nomor transaksi yang sudah ada di Accurate gagal dengan pesan: isi kolom item manual atau pakai nomor transaksi lain.
- **Pemetaan id detail = fungsi murni `mapDetailIdsToRows`** (offset, bukan indeks baris; baris perluasan menyimpan id detail PERTAMA) + menolak bila jumlah detail dari Accurate ≠ yang dikirim. Teruji (risiko #1).
- **Sumber berprioritas tinggi yang belum didukung tidak dilewati**: baris dengan SO/DO terisi (tahap B/C belum ada) + SQ terisi diperlakukan baris biasa (item wajib), supaya tidak menarik isi SQ padahal Accurate akan menautkan ke SO/DO. `SUPPORTED_SOURCE_KINDS` dilebarkan di tahap B/C.
- **`warehouseName` tetap wajib** untuk sumber SQ; `itemUnitName` memang tidak wajib di Sales Invoice, jadi hanya Item No/Harga/Qty yang dikecualikan.
- Sales Order TIDAK dimigrasikan; hanya `QUOTATION_HEADER_KEYS` diekspor dan `expandQuotationEntry` dipakai ulang.
- Dampak scope: modul `sales_invoice` kini membutuhkan `sales_quotation_view` → SEMUA customer Sales Invoice yang belum punya scope itu harus "Perbarui izin" sebelum import berikutnya (pengecekan scope saat penjadwalan), walau tidak memakai fitur ini. Sejalan keputusan Fase 169 (wajib, bukan opsional).

## Risiko / titik rawan yang ditemukan saat perencanaan
1. **Pemetaan baris↔id detail (RAWAN):** `processSalesInvoiceGroup` memetakan `result.detailItem[i]` ke baris Excel ke-i (`accurateDetailItemId` per baris). Satu baris Excel yang diperluas menjadi N baris membuat indeks bergeser → baris sesudahnya salah id. Id ini dipakai guard hapus faktur (semua baris wajib punya id). Solusi: simpan offset awal tiap baris Excel; baris perluasan menyimpan id detail PERTAMA hasil perluasannya. Wajib ada tes.
2. **Jalur `appendToExistingSalesInvoice`** (faktur dengan nomor referensi sama sudah ada di Accurate → baris ditambahkan): harus diputuskan — ikut diperluas, atau baris perluasan di jalur append ditolak jelas. Usulan awal: ikut diperluas dengan pemetaan yang sama; tes khusus.
3. **Faktur parsial dari DO/SO** (qty lebih kecil, atau sebagian pengiriman): baris perluasan = SEMUA baris sumber; untuk parsial user mengisi kolom item sendiri (aturan di atas). Dokumen sumber yang sudah pernah ditagih sebagian tidak dihitung ulang — keterbatasan yang harus dipahami client.
4. **Tautan di sisi Accurate belum terbukti** untuk baris hasil perluasan (`*Number` + item sama) — butuh uji nyata begitu ada database Accurate.
5. **`warehouseName` wajib** di Sales Invoice, sedangkan baris SQ/SO tidak membawa gudang → untuk sumber SQ/SO kolom gudang tetap diisi user (berlaku ke semua baris hasil); jangan dikecualikan dari validasi.

## Di luar scope
Penautan baris kembar / pengganti VLOOKUP (Fase 196); migrasi Sales Order ke inti umum; pecah-otomatis transaksi besar; modul selain Sales Invoice (Delivery Order ← SO sudah ada Fase 158/171; Purchase Invoice ← PO/Receive Item menunggu permintaan).

## Pertanyaan terbuka untuk user
1. Urutan tahap A→B→C disetujui? (SQ dulu karena parser sudah terverifikasi.)
2. Contoh file Excel asli client + dokumen sumber mana yang paling sering dipakai untuk faktur (SQ/SO/DO)?
3. Faktur parsial: cukup aturan "isi kolom item sendiri"? Atau client butuh perilaku lain (mis. qty dibatasi sisa yang belum ditagih)?
4. Ada database Accurate uji (trial milik FAC) untuk verifikasi 0.1/0.2 dan uji tautan?

## Referensi
- Architecture doc: `docs/architecture/architecture-sales-invoice.md` § "Fase 198 (rencana)"
- Preseden: `docs/architecture/architecture-sales-order.md` § Fase 169 & 172; `docs/phases/phase-169-*.md`, `phase-172-*.md`
- Scope engine: `docs/architecture/architecture-accurate-scope-engine.md`
- Terkait (ditunda): `docs/phases/phase-196-penautan-baris-dokumen-sumber-otomatis.md`

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (Tahap A; api + web)
- [x] Security review (Tahap A, inline): 0 Critical/High; Low dicatat (payload besar bila banyak SQ berbeda, dibatasi 500 baris/dokumen seperti Fase 169)
- [ ] Temuan Critical/High diperbaiki
- [ ] Temuan Medium/Low dicatat
- [ ] `docs/PROGRESS.md` diupdate

## Known Limitations
- Tahap A: hanya sumber Sales Quotation. Faktur parsial dari dokumen sumber → user mengisi kolom item sendiri. Baris perluasan tidak bisa ditambahkan ke nomor transaksi yang sudah ada di Accurate. Bentuk respons SO/DO belum terverifikasi; tautan di sisi Accurate untuk baris hasil perluasan belum terbukti (butuh database Accurate uji).

## Ringkasan Hasil
Tahap A selesai: `lib/import-mapping/source-expansion.ts` (+ tes 17), worker `processSalesInvoiceGroup`, validasi wajib dinamis di API/web, registri + panduan template. Suite API 2415 hijau, web 567 hijau, typecheck bersih. Tahap B/C menunggu.
