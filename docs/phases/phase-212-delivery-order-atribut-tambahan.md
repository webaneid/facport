# Fase 212 — Delivery Order: Atribut Tambahan (Custom Character/Number/Date) header + item

**Status:** Done sisi kode (belum dirilis)
**Mulai:** 2026-10-29
**Selesai:** 2026-10-29

## Tujuan
Client ingin kolom Excel "Custom Character 1-10 / Custom Number 1-10 / Custom Date 1-2" (level header) dan "ITEM: Custom Character 1-10 / Custom Number 1-10 / Custom Date 1-2" (level item) bisa diimpor di Delivery Order. Kolom ini BUKAN Kategori Keuangan (CLS, Fase 209).

## Bukti Visibilitas (uji nyata 2026-10-29, database demo "Data Sample")
Spesifikasi resmi `delivery-order/save.do` TIDAK mencantumkan `charField`/`numericField`/`dateField` (sama seperti SELURUH endpoint `save.do` di spesifikasi, padahal terbukti jalan di Sales Invoice, Receive Item, dst — lihat lessons-learned 2026-09-09). Maka diuji langsung: kirim 2 DO (A kontrol tanpa field kustom, B dengan field kustom header + item), lalu baca `detail.do`.
- Header `charField1/10`, `numericField1/10`, `dateField1/2` -> tersimpan dan terbaca balik sama.
- Item `detailItem[].charField1/10`, `numericField1/10`, `dateField1/2` -> tersimpan dan terbaca balik sama. `detail.do` item juga menampilkan `charField11..15` (15 slot karakter level item).
- Kontrol A kembali kosong. Dua DO uji dihapus lewat `delete.do`; daftar DO database demo kembali kosong.
- Format tanggal `dd/mm/yyyy` diterima.

## Scope
- [x] `fieldToAccuratePath`: 22 field header (`attributHeaderKarakter1-10`, `attributHeaderAngka1-10`, `attributHeaderTanggal1-2`) + 22 field item (`attributItemKarakter1-10`, `attributItemAngka1-10`, `attributItemTanggal1-2` -> `detailItem.*`), nama internal sama dengan Receive Item/Sales Invoice
- [x] `defaultColumnMap`: auto-suggest "Custom Character 1" dst dan "ITEM: Custom Character 1" dst (nama berbeda antara header dan item, jadi TIDAK ambigu seperti CLS)
- [x] `DATE_FIELDS` memuat 4 field tanggal baru (konversi serial Excel -> dd/MM/yyyy)
- [x] Template unduhan (`deliveryOrderTemplateGuide`) + dropdown Cocokkan Kolom + dialog edit baris (daftar tanggal)
- [x] Tes mapping; `architecture-delivery-order.md` dikoreksi (klaim lama "DO tidak punya charField*" keliru)

## Di Luar Scope
- Slot karakter level item 11-15 (Excel client hanya memakai 10; API menyediakan 15).
- Auto-suggest kolom CLS (tetap menunggu konfirmasi, Fase 209).

## Referensi
- `docs/architecture/architecture-delivery-order.md`, `docs/architecture/architecture-receive-item.md` (pola yang sama)
- `docs/lessons-learned.md` 2026-09-09 (spesifikasi tidak lengkap untuk keluarga Atribut Tambahan)

## Keputusan Kecil Selama Eksekusi
- Fase 171 (resolver Sales Order Detail ID) membaca `charField1` dari Sales Order sebagai kunci pencarian; fase ini menulis `charField*` ke Delivery Order. Dua hal terpisah, tidak saling mengubah.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error
- [x] Lint nol error
- [x] Test API/web
- [x] Security review
- [x] `docs/PROGRESS.md` diupdate

## Ringkasan Hasil
- 44 field baru di `delivery-order.mapping.ts` (22 header + 22 item), auto-suggest nama kolom, konversi 4 field tanggal, panduan template (44 kolom), dropdown Cocokkan Kolom + dialog edit baris (daftar tanggal disinkronkan).
- 7 tes baru di `delivery-order.mapping.test.ts` (jumlah field, auto-suggest tidak tertukar, header->root vs item->detailItem, konversi tanggal, sel kosong tidak dikirim, per-baris item, CLS tidak terganggu).
- Hasil: typecheck nol error, lint bersih, `bun run test` 2672 (API) + 600 (web) lolos, security review tanpa temuan (tidak ada endpoint/DB/auth baru), database dev dibersihkan.
- Tidak ada migrasi, scope OAuth, atau endpoint Accurate baru.

## Known Limitations
- Slot karakter level item 11-15 belum dipetakan (Excel client hanya memakai 10).
- Belum diuji ujung-ke-ujung lewat alur unggah Excel -> worker (yang diuji nyata: payload langsung ke `save.do`; mapping diuji unit). Disarankan satu unggah uji dengan Excel client setelah rilis.
- Angka kustom dikirim apa adanya (tidak ada konversi koma desimal/teks angka), sama dengan Receive Item.
- Excel referensi `FACPORT_Delivery Order_v8.xlsx` belum diperbarui.
