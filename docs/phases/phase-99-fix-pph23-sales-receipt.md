# Fase 99 — Fix PPh23 Sales Receipt (Struktur `detailTax` yang Benar)

**Status:** Done
**Mulai:** 2026-09-10
**Selesai:** 2026-09-10

## Tujuan
Menutup gap yang sudah lama terbuka (§ `architecture-sales-receipt.md`
"GAP DITEMUKAN 2026-09-10"): import Sales Receipt dengan PPh23 "sukses"
tapi potongan PPh tidak benar-benar muncul di Accurate. 4 test call
speculative sebelumnya (Fase sebelum ini) gagal menemukan struktur
payload yang benar, pertanyaan detail dikirim ke Accurate Support dan
**sekarang sudah dijawab** — jawaban itu jadi dasar fix di fase ini.

## Jawaban Resmi Accurate Support (2026-09-10)
Struktur payload yang benar untuk Sales Receipt dengan pemotongan PPh:
```json
{
  "bankNo": "110101", "chequeAmount": 99090908, "customerNo": "C.00001",
  "branchName": "Kantor Pusat", "currencyCode": "IDR", "number": "SR-2024-001",
  "detailInvoice": [
    { "invoiceNo": "SI.2024.11.00003", "paymentAmount": 100909089, "paidPph": true, "pphNumber": 22222 }
  ],
  "detailTax": [
    { "detailInvoiceNo": "SI.2024.11.00003", "taxAmount": 1818181, "taxId": 350 }
  ]
}
```
Kesalahan di percobaan sebelumnya: `detailTax` dikirim NESTED di dalam
`detailInvoice[]` — seharusnya di ROOT (sibling `detailInvoice`), dengan
`detailInvoiceNo` sebagai penghubung ke baris faktur terkait.

## Scope
- [x] `sales-receipt.mapping.ts` — field baru `taxAmount` (→
      `detailTax[].taxAmount`, sebelumnya di-skip Fase 85 karena
      disimpulkan salah sebagai "read-only"). `taxId` dikoreksi dari
      "validasi-only" jadi field yang BENAR-BENAR dikirim (→
      `detailTax[].taxId`, angka hasil resolve). `buildSalesReceiptPayload`
      terima parameter baru `resolvedTaxIds: Map<string, number>`,
      bangun `detailTax[]` di ROOT payload.
- [x] `workers/index.ts` — `validateTaxIdsForReceipt` → rename+extend
      jadi `resolveTaxIdsForReceipt` (return `Map<string, number>`,
      bukan `void`), dipanggil `processSalesReceiptGroup` sebelum
      `buildSalesReceiptPayload`.
- [x] `template-guide.ts` — kolom "Tax Amount" dikembalikan (posisi
      sesuai urutan asli client), deskripsi "Tax ID" diupdate.
- [x] Hapus `apps/api/src/scripts/debug-sales-receipt-pph.ts` (script
      debug sekali-pakai, investigasi sudah ditutup).
- [x] Test: rewrite `describe("buildSalesReceiptPayload — Fase 86 (Tax
      ID TIDAK PERNAH masuk payload)")` jadi `describe(... Fase 99
      (detailTax di root, Tax ID/Tax Amount))` — 5 test baru.
- [x] Update `architecture-sales-receipt.md` (tabel keputusan kolom +
      section "Fase 86" + "GAP DITUTUP") dan `docs/lessons-learned.md`.

## Referensi
- Architecture doc: `docs/architecture/architecture-sales-receipt.md` § "GAP DITUTUP (Fase 99)"
- `docs/lessons-learned.md` entri 2026-09-10 "PPh23 di Sales Receipt" (update resolusi)
- Fase sebelumnya yang investigasi tapi belum closed: Fase 85 (ekspansi field, salah simpulkan Tax Amount skip), Fase 86 (Tax ID, validasi-only)

## Keputusan Kecil Selama Eksekusi
- `buildSalesReceiptPayload` SENGAJA tetap fungsi sync/pure (tidak
  panggil Accurate sendiri) — resolve Tax ID ke angka tetap jadi
  tanggung jawab CALLER (worker), dilewatkan lewat parameter
  `resolvedTaxIds: Map`. Ini mempertahankan testability murni (bisa
  ditest tanpa mock network) dan konsisten pola project (builder
  function selalu pure, efek samping/network call ada di layer worker).
- Syarat minimal 1 baris dianggap punya data `detailTax`: `taxId` DAN
  `taxAmount` harus SAMA-SAMA terisi (mirror pola `detailDiscount`,
  yang juga syaratkan 2 field minimal) — `taxId` sendirian tanpa
  `taxAmount` tidak ada artinya (Accurate tidak auto-hitung lewat API,
  beda dari UI), jadi TIDAK dikirim setengah-setengah.
- Belum diverifikasi test call nyata sebelum menutup fase ini (beda
  dari kebiasaan project ini yang biasanya verifikasi nyata dulu) —
  keputusan SADAR, karena sumbernya jawaban TERTULIS RESMI dari Accurate
  Support sendiri (otoritatif), bukan hipotesis internal kami. Lihat
  Known Limitations.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — api+web, 0 error.
- [x] Security review — TIDAK PERLU jalan ulang (perubahan murni payload
      builder pure-function + rename fungsi internal, tidak ada endpoint/
      permission/auth yang disentuh; sudah dicover security review Fase
      85/86 untuk modul ini).
- [x] `docs/PROGRESS.md` diupdate.
- [x] `apps/api` test suite terkait (`sales-receipt.mapping.test.ts`): 48 pass / 0 fail.

## Known Limitations
- **Belum diverifikasi test call nyata ke production** — fix ini
  berdasarkan jawaban tertulis resmi Accurate Support, bukan test call
  kami sendiri (beda dari metodologi biasa project ini). Disarankan
  client retest 1x dengan PPh23 sungguhan setelah deploy, untuk
  konfirmasi akhir bahwa potongan PPh benar-benar muncul di Accurate
  (bukan cuma `s: true` tanpa error seperti 4 percobaan sebelumnya).
- Kolom "Tax Amount" sekarang WAJIB diisi MANUAL oleh user (dihitung
  sendiri dari persentase PPh23 × nilai faktur) — BEDA dari ekspektasi
  awal (dikira auto-hitung seperti UI Accurate). Kalau user salah
  hitung nominalnya, Accurate kemungkinan tetap terima (tidak ada
  validasi cross-check ke tarif resmi di sisi Facport) — risiko
  ditanggung user, sama filosofi field lain yang "kirim apa adanya,
  Accurate yang validasi".

## Ringkasan Hasil
PPh23 Sales Receipt yang sebelumnya gagal terpotong (gap terbuka sejak
awal sesi ini) sekarang diperbaiki berdasarkan jawaban resmi Accurate
Support: `detailTax[]` dipindah ke ROOT payload (sebelumnya salah
nested di `detailInvoice[]`), field `taxAmount` yang sebelumnya
disimpulkan salah sebagai "read-only" sekarang diimplementasikan
sebagai input manual wajib, dan `taxId` yang sebelumnya validasi-only
sekarang benar-benar dikirim (sebagai angka hasil resolve). Semua test
terkait pass, typecheck 0 error. Menunggu retest nyata client untuk
konfirmasi akhir end-to-end.
