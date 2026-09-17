# Fase 135 — Modul Item Requisition (Permintaan Barang)

**Status:** Done
**Mulai:** 2026-09-17
**Selesai:** 2026-09-17

## Tujuan
Modul KEDUA dari pasangan Item Transfer/Item Requisition (§ Fase 134,
`architecture-item-requisition.md`) — kembaran modul "Item Transfer",
sheet Excel-nya 25 kolom (sama seperti "Item Transfer" MINUS kolom "Item
Requisition No"). Endpoint Accurate, scope OAuth, dan seluruh struktur
kode mengikuti PERSIS pola Fase 134 (bukan riset ulang dari nol) —
dikerjakan LANGSUNG setelah Fase 134 tanpa jeda konfirmasi (sesuai izin
eksplisit user di prompt skill), jadi kedua fase praktis dibangun dalam 1
sesi eksekusi yang sama.

## Scope
- [x] Architecture doc `docs/architecture/architecture-item-requisition.md`
- [x] `apps/api/src/lib/import-mapping/item-requisition.mapping.ts` + test
      (reuse `saveItemTransfer` dari `lib/accurate-item-transfer.ts`, § Fase 134 — TIDAK bikin wrapper baru)
- [x] `apps/api/src/lib/import-mapping/template-guide.ts` — tambah `itemRequisitionTemplateGuide`
- [x] `apps/api/src/routes/item-requisition-import.route.ts` + test
- [x] `apps/api/src/lib/module-catalog.ts` — tambah entri `item_requisition`, kategori "Inventory"
- [x] `apps/api/src/lib/accurate-scopes.ts` — tambah entri `item_requisition` (isi SAMA `item_transfer`, entri terpisah — § architecture doc alasan tidak di-share pointer)
- [x] `apps/api/src/routes/admin/plans.route.ts` — tambah `t.Literal("item_requisition")`
- [x] `apps/api/src/app.ts` — register `itemRequisitionImportRoute`
- [x] `apps/api/src/workers/index.ts` — grouping, `ensureItemRequisitionDataClassifications`,
      `itemTransferTypeRowError` (diputuskan: DUPLIKAT kecil di mapping file sendiri, § Keputusan Kecil di bawah), `processItemRequisitionGroup`, dispatch block
- [x] `apps/web/lib/landing-content.ts` — icon + tagline
- [x] `apps/web/lib/module-import-routes.ts` — base path
- [x] `apps/web/components/app-shell/sidebar.tsx` — nav item kategori Inventory (setelah Item Transfer)
- [x] `apps/web/components/import-archive/import-batch-table.tsx` — delete dialog
- [x] `apps/web/app/admin/(protected)/import-batches/[batchId]/page.tsx` — view + title map
- [x] `apps/web/app/app/(protected)/item-requisition/import/page.tsx`
- [x] `apps/web/app/app/(protected)/item-requisition/import/riwayat/page.tsx`
- [x] `apps/web/app/app/(protected)/item-requisition/import/[batchId]/page.tsx`
- [x] `apps/web/components/item-requisition/delete-import-dialog.tsx`
- [x] `apps/web/components/item-requisition/edit-row-dialog.tsx`
- [x] Verifikasi checklist § 3b `architecture-accurate-integration.md` (diff-check, bukan cuma dibaca) — semua titik cocok

## Referensi
- Architecture doc: `docs/architecture/architecture-item-requisition.md`
- Modul kembaran (pola diikuti persis): `docs/phases/phase-134-modul-item-transfer.md`

## Keputusan Kecil Selama Eksekusi
- `itemTransferTypeRowError` DIDUPLIKAT (bukan reuse import dari
  `item-transfer.mapping.ts`) — `item-requisition.mapping.ts` punya
  fungsi sendiri dengan isi identik. Konsisten prinsip "3 file mirip
  lebih baik dari abstraksi prematur" yang sudah dipakai project ini
  untuk pasangan modul lain (Other Payment/Other Deposit dkk) — mapping
  file SELALU self-contained, tidak saling import satu sama lain.
  Satu-satunya kode yang benar-benar di-share adalah `saveItemTransfer()`
  (HTTP call wrapper, § `architecture-item-transfer.md` "Konteks").
- Di worker (`workers/index.ts`), fungsi yang diimpor dari
  `item-requisition.mapping.ts` diberi alias `...IR` (mis.
  `itemTransferTypeRowErrorIR`) supaya tidak bentrok nama dengan fungsi
  sejenis dari `item-transfer.mapping.ts` — pola sama seperti alias
  `...PO`/`...PR`/`...SQ`/`...SR` yang sudah dipakai modul-modul lain di
  file yang sama.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — api+web, 0 error
- [x] `bun run lint` — 0 error
- [x] Test suite penuh (`bun test` di apps/api) — 1179 pass, 0 fail
- [x] Diff-verification checklist § 3b `architecture-accurate-integration.md`
- [x] Security review dijalankan (subagent `security-auditor`, digabung
      dengan Fase 134 — 1 audit untuk kedua modul sekaligus) — 0
      Critical/High/Medium, 2 Low
- [x] Temuan Critical/High sudah diperbaiki — tidak ada temuan kategori itu
- [x] Temuan Low dicatat di `docs/lessons-learned.md` (2026-09-17, sama
      entri dengan Fase 134 — soal `accurateTransactionId` tidak unik
      lintas modul, relevan untuk KEDUA modul karena `saveItemTransfer()`
      di-share)
- [x] `docs/PROGRESS.md` diupdate jadi Done

## Known Limitations
Sama seperti Fase 134 (§ `architecture-item-transfer.md` § "Known
Limitations" dan `docs/phases/phase-134-modul-item-transfer.md` §
"Known Limitations") — payload yang dikirim ke Accurate strukturnya
identik, termasuk catatan security audit soal `accurateTransactionId`
dan belum adanya verifikasi visual browser sesi ini.

## Ringkasan Hasil
Dibangun bersamaan dengan Fase 134 (lihat
`docs/phases/phase-134-modul-item-transfer.md` § "Ringkasan Hasil" untuk
ringkasan gabungan) — modul KEDUA kategori "Inventory", replikasi
lengkap pola Fase 134 dengan 1 perbedaan struktural (sheet 25 kolom,
tanpa "Item Requisition No"). `itemTransferTypeRowError` diduplikasi
mandiri di mapping file sendiri (bukan reuse import lintas-modul),
konsisten prinsip project ini. `bun run typecheck`/`lint` 0 error, test
suite penuh 1179 pass, audit keamanan 0 temuan Critical/High/Medium.
