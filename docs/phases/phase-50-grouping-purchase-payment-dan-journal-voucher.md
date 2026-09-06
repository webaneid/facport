# Fase 50 — Grouping Multi-Baris (Purchase Payment & Journal Voucher)

**Status:** Done
**Mulai:** 2026-09-06
**Selesai:** 2026-09-06

## Tujuan
Lanjutan Fase 49. Audit kompetitor menemukan gap serupa:
1. Purchase Payment — 43% pembayaran kompetitor bayar >1 faktur sekaligus, kita cuma dukung 1 baris = 1 pembayaran.
2. Journal Voucher — format lebar (Opsi A) cuma bisa 2 akun/jurnal, 84% transaksi (1 sheet sampel) kompetitor butuh 3-6 akun.

User minta 2 modul ini pakai penamaan kolom ala kompetitor (client sudah familiar). Journal Voucher: dukung DUA format (lebar lama + panjang baru), bukan ganti total — hindari regresi ke customer lain yang mungkin sudah pakai format lebar.

Rencana lengkap: `/Users/webane/.claude/plans/sorted-inventing-volcano.md`.

## Scope
- [x] `purchase-payment.mapping.ts` — field `paymentNumber`, grouping, label kompetitor jadi alias utama
- [x] `journal-voucher.mapping.ts` — field set baru format "tall" (journalNumber/lineAccountNo/lineAmount/lineAmountType), `formatOf()` detector, builder bercabang
- [x] `workers/index.ts` — group processor baru utk kedua modul
- [x] `journal-voucher-import.route.ts` — validasi requiredFields kondisional per-format
- [x] `template-guide.ts` — update kedua modul
- [x] Architecture doc update (journal-voucher, purchase-payment)
- [x] Test baru/extend kedua modul, full suite tetap hijau

## Referensi
- Plan mode file (analisis lengkap): `/Users/webane/.claude/plans/sorted-inventing-volcano.md`
- Fase 49 (pola yang direplikasi): `docs/phases/phase-49-grouping-sales-receipt-dan-invoice.md`

## Keputusan Kecil Selama Eksekusi
- Journal Voucher: TIDAK ada endpoint template terpisah utk 2 format — 1 template guide, 2 opsi dijelaskan di deskripsi kolom.
- Purchase Payment tetap TANPA "Batal Import"/retry-cerdas-lintas-batch (sama seperti Sales Receipt).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review dijalankan (inline — lihat ringkasan di bawah)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — tidak ada temuan
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda — tidak ada temuan baru (pola sudah dicatat di entri Fase 49)
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Purchase Payment & Journal Voucher TETAP tidak dapat fitur "Batal Import"/retry-cerdas-lintas-batch (konsisten keputusan Sales Receipt Fase 49) — grouping murni create-only DALAM 1 batch.
- Journal Voucher format panjang: template download (`GET /journal-voucher/import/template`) menampilkan SEMUA kolom (Opsi A + Opsi B) dalam 1 sheet dengan catatan "pilih salah satu" di deskripsi — bukan 2 template terpisah (keputusan sengaja, hindari endpoint baru).
- Semua 5 modul import (PI, SI, SR, PP, JV) kini sudah diaudit terhadap data kompetitor — tidak ada gap grouping multi-baris lagi yang diketahui dari audit ini.

## Ringkasan Hasil
**Purchase Payment**: dapat kapasitas grouping baru — field opsional
`paymentNumber` (→ Accurate `number`) jadi kunci penggabungan banyak
baris jadi 1 `purchase-payment/save.do` dengan `detailInvoice[]` N
faktur. Label kolom default diganti mengikuti istilah kompetitor
("Purchase Payment No", "No. Supplier", "Payment", dst — BUKAN "Cheque
Amount" yang sering kosong di data asli), label Indonesia lama tetap
didukung sebagai alias.

**Journal Voucher**: dapat Opsi B (format panjang, grouping by
"Transaction Number") BERDAMPINGAN dengan Opsi A (format lebar) yang
sudah ada — dikonfirmasi user untuk TIDAK mengganti total, mencegah
regresi ke customer lain yang mungkin sudah pakai format lebar.
`formatOf()` mendeteksi format otomatis dari kolom yang di-mapping.
Validasi double-entry digeneralisasi: SUM semua baris DEBIT harus sama
dengan SUM semua baris CREDIT dalam 1 grup (bukan lagi cuma 2 angka).
Normalisasi tipe baris menerima "DEBIT"/"CREDIT" atau singkatan "D"/"K".

Kedua fix ZERO REGRESSION untuk mapping yang sudah ada. Full test suite
`apps/api`: 399 pass, 0 fail (naik dari 372, 27 test baru meliputi
`purchase-payment.mapping.test.ts` baru dan extend
`journal-voucher.mapping.test.ts`). Typecheck 0 error, security review
tanpa temuan.
