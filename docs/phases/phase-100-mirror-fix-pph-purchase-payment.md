# Fase 100 — Mirror Speculative Fix PPh (`detailTax` di Root) ke Purchase Payment

**Status:** Done
**Mulai:** 2026-09-10
**Selesai:** 2026-09-10

## Tujuan
Setelah Fase 99 menutup gap PPh23 Sales Receipt berdasarkan jawaban
resmi Accurate Support, user minta fix yang SAMA diterapkan ke
Purchase Payment (struktur field PPh-nya identik: `detailInvoice[].paidPph`/
`pphNumber`, validasi "PPh ID" yang sama pola Fase 89). Jawaban Accurate
Support SPESIFIK untuk `sales-receipt/save.do`, TIDAK ada konfirmasi
tertulis terpisah untuk `purchase-payment/save.do` — user eksplisit
pilih (AskUserQuestion) tetap terapkan sekarang secara speculative,
bukan menunggu pertanyaan terpisah ke Accurate Support dulu.

## Scope
- [x] `purchase-payment.mapping.ts` — field baru `taxAmount` (→
      `detailTax[].taxAmount`, sebelumnya di-skip Fase 89). `taxId`
      dikoreksi dari "validasi-only" jadi dikirim (→ `detailTax[].taxId`,
      angka hasil resolve). `buildPurchasePaymentPayload` terima
      parameter baru `resolvedTaxIds: Map<string, number>`.
- [x] `workers/index.ts` — `validateTaxIdsForPurchasePayment` →
      rename+extend `resolveTaxIdsForPurchasePayment` (return Map).
- [x] `template-guide.ts` — kolom "PPh Amount" dikembalikan, deskripsi
      "PPh ID" diupdate, keduanya ditandai speculative/belum
      dikonfirmasi.
- [x] Test: rewrite `describe("buildPurchasePaymentPayload — Fase 89
      (PPh ID TIDAK PERNAH masuk payload)")` jadi describe Fase 100 (4
      test baru, mirror Fase 99).
- [x] Update `architecture-purchase-payment.md` (tabel Fase 89 + section
      "Fase 100" baru).

## Referensi
- Architecture doc: `docs/architecture/architecture-purchase-payment.md` § "Fase 100"
- Precedent yang di-mirror: `docs/phases/phase-99-fix-pph23-sales-receipt.md`
- Jawaban resmi Accurate Support (sumber struktur `detailTax`): § `architecture-sales-receipt.md` § "GAP DITUTUP (Fase 99)"

## Keputusan Kecil Selama Eksekusi
- SEMUA komentar kode & dokumentasi di fase ini eksplisit pakai kata
  "SPECULATIVE"/"BELUM dikonfirmasi" — supaya developer berikutnya
  (atau Claude sesi lain) TIDAK salah kira field ini sama tervalidasinya
  dengan versi Sales Receipt. Ini SENGAJA berbeda treatment dari field
  lain di modul ini yang semua sudah dikonfirmasi test call nyata (Fase
  90) atau spec resmi.
- TIDAK mengirim pertanyaan terpisah ke Accurate Support untuk endpoint
  ini sebelum implementasi (opsi yang TIDAK dipilih user) — trade-off:
  lebih cepat rilis, risiko gagal di retest client pertama kalau
  endpoint ini ternyata beda. Kegagalan kalau terjadi bersifat VISIBLE
  (baris gagal + errorMessage jelas), bukan silent — risiko diterima
  sadar.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — api+web, 0 error.
- [x] Security review dijalankan (skill `security-review`) — tidak ada
      temuan (termasuk analisis khusus "apakah speculative ini fail-safe",
      dikonfirmasi YA — try/catch generik sudah ada).
- [x] `docs/PROGRESS.md` diupdate.
- [x] `apps/api` test suite: 605 pass / 0 fail.
- [x] `bun run lint` — 0 error.

## Known Limitations
- **BELUM dikonfirmasi resmi oleh Accurate Support untuk endpoint
  `purchase-payment/save.do` secara spesifik** — ini BEDA dari Fase 99
  (Sales Receipt) yang sudah ada jawaban tertulis resmi. Kalau retest
  client gagal, kirim pertanyaan yang SAMA (mirror yang sudah dijawab
  untuk Sales Receipt) ke Accurate Support khusus Purchase Payment,
  JANGAN re-tebak lagi.
- Kalau Accurate menolak struktur ini, baris gagal dengan error jelas
  (tidak silent) — tapi user/client perlu tahu ini MUNGKIN terjadi,
  bukan dijamin 100% jalan seperti Sales Receipt.

## Ringkasan Hasil
Fix PPh23 yang sudah dikonfirmasi resmi untuk Sales Receipt (Fase 99)
di-mirror ke Purchase Payment atas permintaan eksplisit user, ditandai
jelas sebagai speculative/belum dikonfirmasi resmi untuk endpoint ini.
Semua test pass, typecheck 0 error, security review bersih (termasuk
analisis fail-safe behavior kalau asumsi ini salah). Menunggu retest
nyata client untuk konfirmasi akhir — kalau gagal, next step adalah
kirim pertanyaan terpisah ke Accurate Support untuk endpoint ini.
