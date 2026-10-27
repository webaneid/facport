# Fase 210 — Nomor Customer dengan spasi di ujung ditolak ("belum ada di Accurate")

**Status:** Done sisi kode (belum dirilis)
**Mulai:** 2026-10-27
**Selesai:** 2026-10-27

## Gejala
Sales Invoice client (file "Master Template.xlsx"): 69 baris gagal dengan "Customer dengan nomor "CUST IN " belum ada di Accurate, dan kolom "Nama Customer" kosong", padahal customer ada di Accurate.

## Penyebab (terbukti)
- SQL production (baca saja): `raw_data."Cust No" = "CUST IN "` — ada spasi di ujung.
- Nomor tidak dipangkas: `extractRowValues` meneruskan nilai Excel apa adanya, lalu `findCustomerByNo` mencari `filter.no.val` dengan spasi itu.
- Uji baca di Accurate dev: pencarian nomor customer cocok PERSIS tetapi tidak peka huruf besar-kecil; "NO " dan " NO" TIDAK ketemu, "no" ketemu.

## Perbaikan
- `lib/accurate-no.ts` `normalizeAccurateNo` (trim + NBSP/zero-width jadi spasi lalu trim).
- Dipakai di `extractRowValues` Sales Invoice, Sales Quotation, Sales Order untuk field `customerNo` (jadi payload save.do, pencocokan faktur lama, dan pencarian customer semuanya konsisten), serta defensif di `findCustomerByNo`.
- Tes: helper + tiap builder.

## Keputusan Kecil
- Cakupan sengaja sempit (3 modul yang auto-create customer). Pola sama kemungkinan ada di Vendor (`vendorNo`), Item (`itemNo`), Delivery Order dan modul lain yang mengirim `customerNo` — dicatat sebagai follow-up, belum dikerjakan.
- Tidak ada endpoint Accurate baru, tidak ada scope baru.

## Setelah dirilis
69 baris yang gagal bisa di-Retry: payload dibangun ulang dari `raw_data` sehingga nomor otomatis dipangkas. Tidak perlu unggah ulang.

## Checklist (SOP)
- [x] Typecheck, lint nol error
- [x] Test (lihat ringkasan sesi)
- [x] Security review inline: hanya normalisasi string sebelum query/payload; tanpa endpoint, SQL, atau secret baru
- [x] PROGRESS, lessons-learned

## Known Limitations
- Modul lain (Vendor/Item/DO/dst) belum dinormalisasi.
- Belum diuji dengan Retry nyata di production.
