# Fase 55 — Atribut Tambahan (Data Classification) di Import Sales Invoice

**Status:** Done (kode) — **BELUM di-release ke production**
**Mulai:** 2026-09-08
**Selesai:** 2026-09-08

> **Status rilis (2026-09-08):** Kode sudah commit+push ke branch
> `develop` (commit `7a1774e`), CI `validate`/`build-and-push` hijau —
> TAPI SENGAJA belum di-PR/merge ke `main`, jadi belum ke-tag versi
> baru dan belum ke production. Menunggu file Excel asli dari client
> (dijanjikan sore hari yang sama) untuk konfirmasi nama kolom
> sungguhan sebelum rilis — kalau ternyata beda dari default "Karakter
> 1"-"Karakter 10", cukup disesuaikan (code change kecil di
> `defaultColumnMap` ATAU remap manual saat import, TIDAK perlu ubah
> `fieldToAccuratePath`) lalu digabung jadi 1 rilis, bukan 2 rilis
> terpisah. Update baris ini begitu benar-benar di-release.

## Tujuan
Client minta 10 kolom teks bebas tambahan ("Karakter 1" s/d "Karakter
10", istilah Accurate: "Atribut Tambahan" di menu Rancangan Formulir
Faktur Penjualan) bisa diisi lewat import Excel Sales Invoice.

Riset lengkap (temuan API, keputusan desain) → `docs/architecture/architecture-sales-invoice.md`
§ "Atribut Tambahan (Data Classification)".

## Ringkasan Temuan
- Field resmi Accurate: `detailItem[].dataClassification1Name` s/d
  `...10Name` (`POST /api/sales-invoice/save.do`), tipe string, per
  baris item — diverifikasi ke `docs/referencehtml/accurate-openapi.json`.
- Arsitektur mapping import sudah generik — tidak perlu migration DB,
  endpoint baru, atau perubahan frontend. Cukup tambah entri di
  `sales-invoice.mapping.ts`.
- Posisi/nama kolom Excel (`defaultColumnMap`) cuma default/auto-suggest
  — user tetap bisa remap manual per-import lewat UI yang sudah ada
  kalau nama kolom file client asli beda dari "Karakter 1"-"Karakter 10"
  (mis. sudah ikut label custom yang di-rename admin Accurate). **Keputusan
  sadar**: eksekusi kode dilakukan SEBELUM file Excel asli client
  diterima (client janji kirim sore ini) — karena field API-nya FIXED
  terlepas dari nama kolom apa pun yang dipakai, dan penyesuaian nama
  kolom (kalau ternyata beda) tidak butuh deploy ulang kode (remap
  manual di UI import), cukup jelaskan cara pakainya ke client/admin.

## Scope
- [x] `apps/api/src/lib/import-mapping/sales-invoice.mapping.ts` — 10 entri
      `fieldToAccuratePath` (`attribut1`..`attribut10` →
      `detailItem.dataClassification1Name`..`10Name`) + 10 entri
      `defaultColumnMap` ("Karakter 1".."Karakter 10")
- [x] `apps/api/src/lib/import-mapping/template-guide.ts` — 10 entri
      `salesInvoiceTemplateGuide` (dokumentasi kolom untuk user, muncul
      di halaman import/template download)
- [x] Test unit baru di `sales-invoice.mapping.test.ts` — verifikasi
      `buildDetailItemFromRow` map "Karakter N" → `dataClassificationNName`

## Referensi
- Architecture doc: `docs/architecture/architecture-sales-invoice.md` § "Atribut Tambahan (Data Classification)"
- Spec resmi: `docs/referencehtml/accurate-openapi.json` (`/api/sales-invoice/save.do`)

## Keputusan Kecil Selama Eksekusi
- Nama internal field: `attribut1`..`attribut10` (bukan `charI`/`karakter1` dst) — konsisten gaya kebab/camelCase field lain di file yang sama.
- Nama kolom default Excel: persis "Karakter 1"-"Karakter 10" (istilah asli Accurate) — BUKAN diterjemahkan/diberi nama bisnis, supaya cocok kalau client belum sempat rename label di Accurate-nya.
- TIDAK menunggu file client asli sebelum eksekusi kode (lihat Ringkasan Temuan di atas) — user (product owner) sendiri yang memutuskan ini setelah saya jelaskan risikonya rendah.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review dijalankan (inline — field opsional baru, tipe string biasa, tidak ada input sensitif/permission baru)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — 0 temuan
- [x] Temuan Medium/Low dicatat — tidak ada
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Nama kolom default ("Karakter 1"-"Karakter 10") KEMUNGKINAN tidak
  match persis dengan file Excel asli client (kalau mereka sudah rename
  label di Accurate, atau pakai istilah sendiri) — TIDAK BUTUH fix
  kode, cukup remap manual di UI saat konfirmasi import (mekanisme
  sudah ada). Kalau ternyata pola penamaan client jauh berbeda dan
  SERING dipakai berulang, pertimbangkan update `defaultColumnMap` di
  fase terpisah supaya auto-suggest lebih akurat (bukan wajib).
- Belum ada test end-to-end (kirim ke Accurate sungguhan) untuk field
  ini — diverifikasi lewat unit test mapping saja. Verifikasi
  end-to-end menyusul begitu ada data/akun Accurate nyata dengan
  Atribut Tambahan yang sudah dikonfigurasi untuk dites.

## Ringkasan Hasil
10 field "Atribut Tambahan" (Data Classification) Accurate untuk Sales
Invoice sekarang bisa diisi lewat import Excel — field resmi
`detailItem[].dataClassification1Name` s/d `...10Name`, per baris
item, tipe teks. Implementasi murni penambahan mapping (tidak ada
migration/endpoint/frontend baru) mengikuti arsitektur generik yang
sudah ada. Nama kolom default "Karakter 1"-"Karakter 10" bisa
disesuaikan bebas oleh user saat import kalau file client pakai nama
lain, tanpa perlu perubahan kode.

Test baru: 1 unit test `buildDetailItemFromRow`. Full suite `apps/api`
415 pass/0 fail. Typecheck 0 error. Security review inline: 0 temuan.
