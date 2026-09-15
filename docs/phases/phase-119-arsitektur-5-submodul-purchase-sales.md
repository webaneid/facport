# Fase 119 — Arsitektur 5 Sub-Modul Baru: Purchase Order, Receive Item, Purchase Return, Sales Quotation, Sales Return

**Status:** Planned
**Mulai:** 2026-09-15
**Selesai:**

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
- [ ] Konfirmasi user atas 3 keputusan scope yang butuh persetujuan
      (§ Keputusan Kecil di bawah) SEBELUM eksekusi kode modul manapun
- [ ] Update root `CLAUDE.md` Peta Dokumen (5 baris baru)
- [ ] Update `docs/glossary.md` kalau ada istilah baru yang perlu
      disambiguasi (`returnType`, dst)

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

## Keputusan Kecil Selama Eksekusi (Riset) — BUTUH KONFIRMASI USER
Riset OpenAPI spec resmi menemukan beberapa `returnType` enum value
yang TIDAK BISA didukung Facport dengan modul yang sudah/akan ada:
1. **Purchase Return**: `INVOICE_DP` tidak didukung (Facport tidak
   punya konsep invoice DP terpisah). `INVOICE` dan `RECEIVE` didukung.
2. **Sales Return**: `DELIVERY` (butuh modul Delivery Order — TIDAK
   ADA di 21 katalog Accurate yang dijual Facport sama sekali) dan
   `INVOICE_DP` tidak didukung. Cuma `INVOICE` dan `NO_INVOICE`
   didukung.
3. **Sales Order** (kelanjutan alami Sales Quotation) SENGAJA tidak
   masuk 5 modul fase ini — client belum siapkan panduannya (beda dari
   4 modul lain yang statusnya "Proses" di sheet Note, Sales
   Order/Sales Quotation kosong statusnya).

Detail lengkap tiap keputusan → masing-masing architecture doc §
"Keputusan Scope"/"Known Limitations".

## Checklist Sebelum Ditutup (sesuai SOP)
- [ ] Konfirmasi user atas 3 poin di atas (WAJIB sebelum status jadi Done)
- [ ] Type check nol error — N/A, tidak ada kode diubah fase ini
- [ ] Security review — N/A, tidak ada kode diubah fase ini
- [ ] `docs/PROGRESS.md` diupdate

## Known Limitations
- 5 architecture doc ini murni RENCANA berdasar spec resmi + panduan
  client — BELUM diverifikasi test call nyata ke Accurate (beda dari
  kebiasaan "test call dulu baru simpulkan" — konsisten pola Fase 99
  yang sempat salah tanpa test call, TIAP modul WAJIB verifikasi test
  call nyata saat eksekusi, bukan asumsi dokumen ini 100% benar).
- Beberapa kolom Excel client (`Custom Character/Number/Date 1-10`
  di beberapa modul, `Header - CF/DF` di Sales Return) tidak ada
  padanan di schema resmi `save.do` — didokumentasikan sebagai "skip"
  di tiap architecture doc, TAPI perlu 1x test call nyata untuk
  memastikan bukan salah baca spec.

## Ringkasan Hasil (isi pas fase Done — setelah user konfirmasi 3 poin scope)
