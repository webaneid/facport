# Fase 88 — Audit & Perbaikan Bug Purchase Payment (Pra-Ekspansi)

**Status:** Done
**Mulai:** 2026-09-10
**Selesai:** 2026-09-10

## Tujuan
Sebelum membahas ekspansi field Purchase Payment (mirror Fase 85/86
Sales Receipt), audit kode aktual vs dokumentasi arsitektur untuk cari
gap/bug — pola yang sama dipakai Fase 84 (Sales Receipt) sebelum
ekspansinya sendiri.

## Scope
- [x] Baca `architecture-purchase-payment.md`, `purchase-payment.mapping.ts`,
      route, `accurate-purchase-payment.ts`, worker, 2 halaman frontend
      (upload + detail batch), `template-guide.ts`, `accurate-scopes.ts`,
      test file — bandingkan terhadap Sales Receipt sebagai referensi
      (karena "bayangan cermin PERSIS").
- [x] Perbaiki bug yang ditemukan (2 bug nyata).
- [x] Perbaiki komentar/dokumentasi basi yang ditemukan.
- [ ] Ekspansi field (18+1 field Fase 85/86 Sales Receipt) — DI LUAR
      SCOPE fase ini, dibahas terpisah setelah bug beres.

## Temuan & Perbaikan

**Bug 1 — dropdown mapping kolom manual TIDAK PUNYA opsi `paymentNumber`**
(`apps/web/app/app/(protected)/purchase-payment/import/page.tsx`).
Backend sudah dukung field ini sejak Fase 50 (kunci grouping multi-
faktur), tapi dropdown `ACCURATE_FIELDS` tidak pernah di-update — bug
SAMA PERSIS Fase 84 (Sales Receipt `receiptNumber`). Field cuma bisa
ke-mapping OTOMATIS kalau nama kolom Excel PERSIS "Purchase Payment
No" — client yang pakai nama kolom lain (mis. "No Pembayaran") tidak
bisa akses fitur gabung-banyak-faktur sama sekali lewat mapping manual.
**Fix**: opsi `paymentNumber` ditambahkan ke dropdown.

**Bug 2 — `transDate` TIDAK PERNAH dinormalisasi** (`purchase-payment.mapping.ts`).
`buildPurchasePaymentPayload` cuma `String(headerValues.transDate ?? "")`
tanpa konversi — beda dari Sales Receipt/Purchase Invoice yang sudah
punya `toAccurateDate()` (menangani angka serial Excel, object `Date`,
string ISO, dikonversi ke format wajib Accurate DD/MM/YYYY). Kalau
Excel client pakai kolom tanggal ASLI (tipe Date di Excel, bukan
diketik manual sebagai teks), SheetJS membaca nilainya sebagai angka
serial mentah (mis. `46284`) — dikirim apa adanya ke Accurate, PASTI
ditolak. Ini persis insiden yang sudah dicatat di `lessons-learned.md`
2026-08-19 ("field TANGGAL APAPUN, modul manapun ke depannya WAJIB
lewat normalisasi serupa") — tapi entah kenapa terlewat saat Purchase
Payment dibangun (Fase 33/50). **Fix**: `toAccurateDate()` (fungsi
identik modul lain) ditambahkan, diterapkan ke `transDate` di
`extractRowValues`.

**Komentar/dokumentasi basi diperbaiki** (tidak ada perubahan
perilaku, murni akurasi):
- `purchase-payment-import.route.ts` — masih bilang "TIDAK ada
  grouping", padahal Fase 50 sudah menambahkannya.
- `accurate-purchase-payment.ts` — masih bilang "save.do PER-BARIS",
  seharusnya PER-GRUP (1 grup bisa berisi banyak faktur).
- `components/purchase-payment/edit-row-dialog.tsx` — komentar lama
  rancu soal "TIDAK ada grouping" (sebenarnya membandingkan konteks
  BEDA — `siblingRowNumbers` PI/SI itu soal baris ITEM dalam 1 faktur,
  bukan soal grouping multi-faktur ala Fase 50) — diperjelas. Sekalian
  dicatat gap UX kecil (bukan bug): dialog ini belum kasih peringatan
  proaktif kalau edit `vendorNo` bikin tidak konsisten dengan baris
  lain di grup pembayaran yang sama — baru ketahuan lewat error server
  saat retry, bukan sebelum submit. Didokumentasikan, tidak dikerjakan
  (di luar scope perbaikan bug, murni UX polish).

## File yang Diubah
- `apps/api/src/lib/import-mapping/purchase-payment.mapping.ts` —
  `toAccurateDate`/`DATE_FIELDS` ditambahkan.
- `apps/api/src/lib/import-mapping/purchase-payment.mapping.test.ts` —
  3 test baru (serial Excel, ISO string, format manual tidak berubah).
- `apps/api/src/routes/purchase-payment-import.route.ts` — komentar
  diperbaiki.
- `apps/api/src/lib/accurate-purchase-payment.ts` — komentar diperbaiki.
- `apps/web/app/app/(protected)/purchase-payment/import/page.tsx` —
  opsi dropdown `paymentNumber` ditambahkan.
- `apps/web/components/purchase-payment/edit-row-dialog.tsx` —
  komentar diperjelas.
- `docs/architecture/architecture-purchase-payment.md` — update block
  baru.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Eksekusi kode (2 bug fix).
- [x] Test baru (3 test normalisasi tanggal).
- [x] Type check nol error (`bun run typecheck`).
- [x] Security review inline — perubahan mapping/dropdown murni,
      tidak ada endpoint/data flow baru. Tidak ada temuan.
- [x] `docs/PROGRESS.md` diupdate ke Done.

## Known Limitations
- Gap UX kecil di `edit-row-dialog.tsx` (tidak ada peringatan proaktif
  konsistensi vendor lintas-baris 1 grup pembayaran) — dicatat, tidak
  dikerjakan (di luar scope perbaikan bug).
- Ekspansi field (mirror Fase 85/86 Sales Receipt: description,
  branchName, currencyCode, rate, chequeNo/Date, paymentMethod,
  passValidateInvoiceDate, useCredit, per-invoice departmentName/
  paidPph/pphNumber, detailDiscount[], Tax ID validation) BELUM
  dikerjakan — menunggu diskusi/keputusan terpisah dengan user.

## Ringkasan Hasil
Audit pra-ekspansi menemukan 2 bug nyata (dropdown `paymentNumber`
hilang, `transDate` tidak dinormalisasi — yang kedua berpotensi
menggagalkan SETIAP import yang pakai kolom tanggal Excel asli) dan 3
komentar/dokumentasi basi — semua diperbaiki. `bun run typecheck` 0
error, `apps/api` 540 pass/0 fail (3 baru), `apps/web` 50 pass/0 fail.
Ekspansi field besar (mirror Sales Receipt) sengaja DITUNDA ke diskusi
terpisah, sesuai instruksi user "perbaiki bug dulu".
