# Fase 49 — Perbaiki Grouping Multi-Baris (Sales Receipt & Sales Invoice)

**Status:** Done
**Mulai:** 2026-09-06
**Selesai:** 2026-09-06

## Tujuan
Audit terhadap file Excel kompetitor (`docs/referencehtml/`) menemukan
gap grouping multi-baris di 2 modul:
1. Sales Invoice — grouping pakai "PO Number" yang di data ASLI 100%
   kosong, padahal 52% faktur kompetitor multi-item.
2. Sales Receipt — TIDAK ADA grouping sama sekali (1 baris = 1
   penerimaan = 1 faktur), padahal di data asli 100% struk penerimaan
   kompetitor multi-faktur.

Rencana lengkap: `/Users/webane/.claude/plans/sorted-inventing-volcano.md`.

## Scope
- [x] `sales-invoice.mapping.ts` — grouping prioritas "Trans No" (`number`), fallback "PO Number"
- [x] `sales-receipt.mapping.ts` — field baru `receiptNumber`, grouping baru, `buildSalesReceiptPayload` terima array baris
- [x] `workers/index.ts` — dispatch loop `sales_receipt` jadi per-grup (bukan per-baris generic), generalisasi `SalesInvoiceGroup`
- [x] `template-guide.ts` — update deskripsi kolom terkait
- [x] `architecture-sales-receipt.md` & `architecture-sales-invoice.md` — update Keputusan Desain
- [x] Test baru untuk kedua modul + full suite tetap hijau

## Referensi
- Plan mode file (analisis lengkap, angka temuan): `/Users/webane/.claude/plans/sorted-inventing-volcano.md`
- ADR-0011 (pola grouping asli, Purchase Invoice) — direplikasi, bukan diubah

## Keputusan Kecil Selama Eksekusi
- Sales Receipt TIDAK dapat fitur "Batal Import"/retry-cerdas-lintas-batch
  (sudah diputuskan sebelumnya di architecture doc, alasan tetap valid) —
  fix ini cuma grouping create-only dalam 1 batch.
- `receiptNumber` (SR) & prioritas "Trans No" (SI) keduanya OPSIONAL —
  user existing yang belum mapping kolom ini tetap dapat perilaku LAMA,
  zero regression.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review dijalankan (inline — lihat ringkasan di bawah)
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan) — tidak ada temuan
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda — dicatat sebagai entri baru (pencegahan untuk modul lain)
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Purchase Payment & Journal Voucher punya gap grouping SERUPA (ditemukan
  di audit yang sama) — BELUM diperbaiki, sengaja ditunda sesuai
  permintaan user ("perbaiki 2 dulu").
- Sales Receipt TETAP tidak dapat fitur "Batal Import"/retry-cerdas-lintas-batch
  (keputusan lama, tidak berubah) — grouping baru murni create-only
  DALAM 1 batch.

## Ringkasan Hasil
**Sales Invoice**: kunci grouping multi-item digeneralisasi — kolom yang
di-mapping ke "Trans No" (field `number`) sekarang DIUTAMAKAN, fallback
ke "PO Number" (perilaku lama). Tipe `SalesInvoiceGroup` diubah dari
`{poNumber}` jadi generic `{groupKey, groupColumn}`. Alasan: audit data
ASLI kompetitor menemukan PO Number 100% kosong di praktik, padahal 52%
faktur multi-item.

**Sales Receipt**: dapat kapasitas grouping BARU dari nol — field
opsional `receiptNumber` (→ Accurate `number`) jadi kunci penggabungan
banyak baris jadi 1 `sales-receipt/save.do` dengan `detailInvoice[]`
berisi N faktur (masing-masing `paymentAmount` sendiri), `chequeAmount`
total = SUM. Diproses per-grup (`processSalesReceiptGroup`, SEDERHANA
tanpa retry-cerdas-lintas-batch) bukan lagi generic per-baris.
Alasan: audit data ASLI kompetitor menemukan 100% struk penerimaan
multi-faktur.

Kedua fix ZERO REGRESSION untuk mapping yang sudah ada (field baru
opsional, fallback ke behavior lama kalau tidak dipakai). Tidak ada
perubahan di route/frontend — hasil import sudah generic (tampilkan
`accurateTransactionId` per baris, tidak ada teks agregat yang bisa
menyesatkan).

Full test suite `apps/api`: 372 pass, 0 fail (naik dari 357, 15 test
baru: 4 regresi Sales Invoice + test baru `sales-receipt.mapping.test.ts`
lengkap, file yang sebelumnya tidak ada). Typecheck 0 error.

Security review inline: tidak ada temuan Critical/High/Medium — grouping
tetap di-scope per subscription/batch (tidak ada kebocoran lintas-tenant),
validasi konsistensi customer per grup mencegah gabung data lintas-customer
diam-diam, query lookup existing invoice tetap parameterized (Drizzle
`sql` tag, tidak ada string concatenation baru).
