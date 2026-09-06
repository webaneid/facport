# Fase 38 — Paritas Fitur Riwayat/Edit Baris/Hapus: Sales Receipt

**Status:** Done
**Mulai:** 2026-09-06
**Selesai:** 2026-09-06

## Tujuan
Batch ke-3 dari 4 (§ `docs/phases/phase-36-riwayat-vendor-payable-account.md`
untuk konteks penuh & rasional — TIDAK diulang di sini). Modul: Sales
Receipt.

## Scope
- [x] `apps/api/src/routes/sales-receipt-import.route.ts` — GET list
      +offset/+total, PUT `:batchId/rows/:rowId` (Edit Baris), DELETE
      `:batchId` (hapus lokal)
- [x] `apps/web/components/sales-receipt/delete-import-dialog.tsx` (baru)
- [x] `apps/web/components/sales-receipt/edit-row-dialog.tsx` (baru —
      `REQUIRED_INTERNAL_FIELDS`: customerNo/bankNo/chequeAmount/
      transDate/invoiceNo, `DATE_INTERNAL_FIELDS`: transDate)
- [x] `apps/web/app/app/(protected)/sales-receipt/import/riwayat/page.tsx` (baru)
- [x] `apps/web/app/app/(protected)/sales-receipt/import/[batchId]/page.tsx`
      — tambah kolom "Aksi"
- [x] `apps/web/app/app/(protected)/page.tsx` — tambah card "Import
      Terakhir" (icon `HandCoins`)
- [x] `apps/api/src/routes/sales-receipt-import.route.test.ts` — 10
      test baru

**TIDAK termasuk**: Batal Import — sudah didokumentasikan di
`architecture-sales-receipt.md` sejak Fase 34 (alasan sama Purchase
Payment).

## Referensi
- Template & rasional lengkap: Fase 36
- Audit pemicu: `docs/lessons-learned.md` 2026-09-06

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (api+web) — diverifikasi gabungan Fase 39
- [x] Lint nol error — diverifikasi gabungan Fase 39
- [x] Security review inline: mekanis, reuse pola teraudit. 0 temuan.
- [x] `docs/PROGRESS.md` diupdate

## Ringkasan Hasil
Sales Receipt sekarang punya paritas penuh dengan Purchase Invoice
(Riwayat, Edit Baris, Hapus, dashboard card), mengikuti template Fase
36 1:1. Detail hasil gabungan (test suite akhir, security review akhir)
dicatat di Fase 39.
