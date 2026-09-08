# Fase 66 — Fix: Tipe Data Boolean & Persen Diskon Salah Kirim ke Accurate (Sales Invoice + Purchase Invoice)

**Status:** Done
**Mulai:** 2026-09-08
**Selesai:** 2026-09-08

## Tujuan
Client evaluasi Sales Invoice poin 7: import gagal dengan pesan generik
"Faktur Penjualan tidak tepat" saat kolom Diskon dan kolom terkait
Pajak diisi — begitu kolom itu dihapus/dikosongkan, import berhasil.

## Root Cause
Dicek langsung ke `docs/referencehtml/accurate-openapi.json`, tipe JSON
yang WAJIB untuk field-field ini:
- `taxable`, `inclusiveTax`, `reverseInvoice`, `useTax1/2/3` (PPN/PPnBM/
  PPh23) — **WAJIB `boolean` MURNI** (`true`/`false`), bukan string.
- `cashDiscPercent`, `itemDiscPercent` — **WAJIB `string`** (support
  format diskon bertingkat "5 + 2"), BUKAN number — beda dari
  `cashDiscount`/`itemCashDiscount` yang justru WAJIB `number`.

`sales-invoice.mapping.ts`/`purchase-invoice.mapping.ts` (`extractRowValues`)
TIDAK melakukan konversi tipe apa pun untuk field-field ini — nilai
mentah dari parsing Excel (SheetJS) diteruskan apa adanya. Template kita
sendiri (`template-guide.ts`, `BOOLEAN_FORMAT`) menginstruksikan user
ketik teks **"TRUE"/"FALSE"** di kolom boolean — SheetJS membaca cell
teks sebagai STRING JS ("TRUE"), BUKAN boolean asli. Payload yang
terkirim jadi `"taxable": "TRUE"` (string) alih-alih `"taxable": true`
(boolean) — Accurate menolak dengan pesan CATCH-ALL generik yang tidak
menyebut field spesifik mana yang salah, membuat masalah ini sangat
sulit didiagnosis dari sisi user (persis situasi client).

Pola yang sama berlaku untuk `cashDiscPercent`/`itemDiscPercent`: kalau
user isi angka polos (mis. `5`) di Excel, SheetJS baca sebagai JS
`number`, dikirim sebagai number ke field yang expect string.

## Scope
- [x] `apps/api/src/lib/import-mapping/sales-invoice.mapping.ts` —
  `toAccurateBoolean()` + `BOOLEAN_FIELDS`, `PERCENT_STRING_FIELDS`,
  `extractRowValues` diperbarui menerapkan konversi
- [x] `apps/api/src/lib/import-mapping/purchase-invoice.mapping.ts` —
  fix identik (field & builder pattern sama persis, mirror 1:1)
- [x] `apps/api/src/lib/import-mapping/sales-invoice.mapping.test.ts` —
  4 test baru
- [x] `apps/api/src/lib/import-mapping/purchase-invoice.mapping.test.ts` —
  2 test baru

## Referensi
- `docs/referencehtml/accurate-openapi.json` — tipe field resmi yang jadi acuan fix

## Keputusan Kecil Selama Eksekusi
- `toAccurateBoolean()` menerima variasi teks truthy: "true"/"y"/"yes"/
  "1"/"ya" (case-insensitive) — bukan cuma "TRUE" literal, supaya lebih
  toleran terhadap variasi input user (Bahasa Indonesia "Ya" termasuk).
  Selain itu (termasuk "FALSE"/kosong/apa pun) dianggap `false`.
- `cashDiscount`/`itemCashDiscount` (nilai fix Rupiah) SENGAJA TIDAK
  ikut dikonversi — field ini justru WAJIB `number` di Accurate, kalau
  SheetJS sudah baca sebagai number (kasus normal), TIDAK perlu
  disentuh. Cuma field yang benar-benar salah tipe yang diperbaiki.
- HANYA Sales Invoice & Purchase Invoice yang punya field ini (dicek ke
  4 modul lain: Purchase Payment, Sales Receipt, Journal Voucher,
  Vendor Payable Account — TIDAK ADA field pajak/diskon sama sekali,
  tidak terpengaruh bug ini).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error
- [x] Security review — tidak relevan (konversi tipe data internal,
  bukan perubahan endpoint/validasi keamanan)
- [x] Temuan Critical/High sudah diperbaiki — 1 (bug produksi nyata
  yang bikin import gagal tanpa pesan jelas), diperbaiki di 2 modul
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Batch yang SUDAH gagal sebelumnya karena bug ini TIDAK diperbaiki
  secara retroaktif — user perlu retry manual (tombol retry yang sudah
  ada) setelah fix ini live.
- Tidak dicek apakah modul LAIN yang mungkin ditambah di masa depan
  bisa punya field serupa — kalau nambah field boolean/persen baru,
  WAJIB cek ulang tipe JSON resmi di spec sebelum asumsi string mentah
  aman diteruskan apa adanya.

## Ringkasan Hasil
Bug produksi nyata ditemukan & diperbaiki: field boolean (Taxable, PPN/
PPnBM/PPh23, dst) dan field persen diskon dikirim dengan tipe JSON yang
SALAH ke Accurate (string alih-alih boolean, number alih-alih string),
menyebabkan Accurate menolak transaksi dengan pesan generik "Faktur
Penjualan tidak tepat" yang tidak menyebut penyebab sebenarnya. Fix
diterapkan konsisten di Sales Invoice DAN Purchase Invoice (modul lain
tidak terpengaruh, tidak punya field ini).

Typecheck 0 error. Full suite `apps/api` 452 pass/0 fail (6 baru).
