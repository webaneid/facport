# Fase 119 — Arsitektur 5 Sub-Modul Baru: Purchase Order, Receive Item, Purchase Return, Sales Quotation, Sales Return

**Status:** Done
**Mulai:** 2026-09-15
**Selesai:** 2026-09-15

## Tujuan
Client sudah siapkan panduan (Excel `developmen-15-september-2026.xlsx`,
per-sheet per-modul) untuk 5 sub-modul baru yang akan digarap: Purchase
Order, Receive Item, Purchase Return (kategori "Purchase"), Sales
Quotation, Sales Return (kategori "Sales") — melengkapi 5 dari 15 modul
tersisa dari 21 katalog Accurate (6 sudah Done). Fase ini KHUSUS bikin
architecture doc per modul (riset field API resmi + mapping Excel client
+ keputusan desain), BELUM eksekusi kode — mengikuti pola SOP "arsitektur
dulu, baru implementasi" yang sudah terbukti untuk Purchase Payment/Sales
Receipt/Journal Voucher (Fase 33-35).

## Scope
- [x] `docs/architecture/architecture-purchase-order.md`
- [x] `docs/architecture/architecture-receive-item.md`
- [x] `docs/architecture/architecture-purchase-return.md`
- [x] `docs/architecture/architecture-sales-quotation.md`
- [x] `docs/architecture/architecture-sales-return.md`
- [x] Konfirmasi user atas keputusan scope (§ Keputusan Kecil di bawah)
- [x] Update root `CLAUDE.md` Peta Dokumen (5 baris baru)
- [x] `docs/glossary.md` — tidak perlu, `returnType` sudah cukup
      dijelaskan di tiap architecture doc, tidak ada istilah lintas-doc
      yang perlu disambiguasi global

**TIDAK termasuk scope fase ini** (eksekusi kode, fase terpisah nanti
per modul — pola "satu-satu" konsisten Fase 33-35): schema
`import_batches` entry baru, route `*-import.route.ts`, worker
processing, `module-catalog.ts` entry, halaman frontend, test.

## Referensi
- Panduan client (⚠️ GITIGNORED, JANGAN PERNAH commit):
  `docs/referencehtml/facport/developmen-15-september-2026.xlsx`
  (verifikasi ulang: `git check-ignore -v docs/referencehtml` HARUS
  match pola `docs/referencehtml/` di `.gitignore`)
- Spec resmi Accurate (juga di folder gitignored):
  `docs/referencehtml/accurate-openapi.json`
- Architecture doc masing-masing modul (§ Scope di atas)
- Pola grouping multi-item: ADR-0011
- Preseden Branch Wajib: `docs/architecture/architecture-purchase-payment.md` § "Fase 90"

## Keputusan Kecil Selama Eksekusi (Riset)
Riset OpenAPI spec resmi menemukan beberapa `returnType` enum value
yang BELUM bisa didukung Facport dengan modul yang sudah/sedang
dibangun:
1. **Purchase Return**: `INVOICE_DP` belum didukung (Facport belum
   punya fitur "buat Invoice DP" — TAPI Accurate PUNYA endpoint resmi
   untuk ini, `/api/purchase-invoice/create-down-payment.do`, jadi ini
   soal urutan prioritas kerja, BUKAN batas teknis permanen — § catatan
   di bawah). `INVOICE` dan `RECEIVE` didukung sekarang.
2. **Sales Return**: `DELIVERY` (Accurate PUNYA modul Delivery Order
   resmi, `/api/delivery-order/save.do` — belum masuk 21 katalog yang
   pernah disepakati, TAPI bisa ditambahkan sebagai modul baru kapan
   pun dibutuhkan) dan `INVOICE_DP` (sama alasan Purchase Return) belum
   didukung. `INVOICE` dan `NO_INVOICE` didukung sekarang.
3. **Sales Order** (kelanjutan alami Sales Quotation) SENGAJA tidak
   masuk 5 modul fase ini — ✅ **dikonfirmasi user** memang belum
   disiapkan panduannya, ditunda ke fase terpisah nanti.

**Prinsip scope yang dikonfirmasi user (2026-09-15)**: cakupan Facport
TIDAK terpaku ke yang sudah dibangun dari awal — kalau client butuh
sesuatu dan Accurate Online mendukungnya (API resmi tersedia), itu akan
dikerjakan. `INVOICE_DP`/`DELIVERY` di atas berstatus "belum jadi
prioritas sekarang", bukan "ditolak selamanya" — masuk antrean kerja
begitu client konfirmasi butuh.

Detail lengkap tiap keputusan → masing-masing architecture doc §
"Keputusan Scope"/"Known Limitations".

## ✅ Temuan Penting (2026-09-15): Custom Character/Number/Date SUDAH Terjawab
Sempat dikira field ini "tidak ada di API" (absen dari OpenAPI spec
resmi untuk kelima endpoint) — client mengoreksi: mekanisme ini SUDAH
pernah dipecahkan tuntas saat membangun Purchase Invoice/Sales Invoice
(Fase 64/71-73), lewat tiket resmi Accurate Support (#357901,
2026-04-24) yang eksplisit menyatakan **field ini konsisten lintas
jenis transaksi**. Field resmi: Header `charField1-10`/
`numericField1-10`/`dateField1-2`; Item (`detailItem[]`) field SAMA
tapi Karakter sampai 15 slot. Ke-5 architecture doc SUDAH diupdate
dengan mapping ini (§ masing-masing "Atribut Tambahan"). Sisa yang
perlu diverifikasi: 1x test call nyata PER endpoint (bukan meragukan
mekanismenya, cuma konfirmasi literal berlaku di 5 endpoint BARU ini
juga) — dilakukan saat eksekusi tiap modul, bukan sebelum eksekusi.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Konfirmasi user atas keputusan scope Sales Order (dikonfirmasi
      2026-09-15). Keputusan `INVOICE_DP`/`DELIVERY` reframed sebagai
      "belum prioritas" (bukan "tidak didukung"), prinsip scope
      dikonfirmasi user — tidak butuh persetujuan tambahan per modul,
      cukup diajukan client kalau dibutuhkan nanti.
- [x] Type check nol error — N/A, tidak ada kode diubah fase ini
- [x] Security review — N/A, tidak ada kode diubah fase ini
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- 5 architecture doc ini murni RENCANA berdasar spec resmi + panduan
  client + 1 tiket Accurate Support lama (Purchase Invoice/Sales
  Invoice) — BELUM diverifikasi test call nyata LITERAL ke 5 endpoint
  BARU ini. Konsisten kebiasaan project: TIAP modul WAJIB 1x verifikasi
  test call nyata saat eksekusi, bukan asumsi dokumen ini 100% benar
  tanpa dicek (preseden Fase 90/99 — spec/asumsi bisa meleset di detail
  kecil meski arahnya benar).
- `INVOICE_DP` (Purchase Return & Sales Return) dan `DELIVERY` (Sales
  Return) belum didukung — BUKAN batas permanen, tinggal antre kerja
  begitu client butuh (§ "Keputusan Kecil" di atas).

## Ringkasan Hasil
Fase ini menghasilkan 5 architecture doc lengkap (Purchase Order,
Receive Item, Purchase Return, Sales Quotation, Sales Return) — field
mapping Excel client ke API resmi Accurate, termasuk mekanisme "Atribut
Tambahan" (Custom Character/Number/Date) yang ternyata sudah pernah
dipecahkan tuntas di modul lain (bukan riset baru dari nol). Prinsip
scope Facport diklarifikasi eksplisit oleh user: berkembang sesuai
kebutuhan client selama Accurate mendukung, bukan terpaku ke modul yang
sudah ada. 0 kode diubah — eksekusi tiap modul jadi fase terpisah,
menunggu arahan urutan pengerjaan dari user.
