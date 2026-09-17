# Fase 134 — Modul Item Transfer (Pindah Gudang)

**Status:** Done
**Mulai:** 2026-09-17
**Selesai:** 2026-09-17

## Tujuan
Client mengirim 2 sheet Excel ("Item Requisition" dan "Item Transfer")
yang setelah diriset ternyata 100% mapping ke API Accurate yang SAMA
(`/api/item-transfer/save.do`, § `architecture-item-transfer.md`).
Keputusan eksplisit user: bangun sebagai **2 modul Facport terpisah**
(mengikuti request client apa adanya), bukan digabung jadi 1. Fase ini
membangun modul PERTAMA dari pasangan itu — **"Item Transfer"** (sheet
26 kolom, superset dari "Item Requisition"), sekaligus jadi modul
PERTAMA di kategori "Inventory" (kategori disiapkan sejak Fase 126,
sebelumnya 0 modul).

Dikerjakan lebih dulu dari "Item Requisition" (Fase 135) karena kolom
sheet-nya superset — mapping yang dibangun di sini jadi acuan langsung
untuk fase berikutnya (tinggal kurangi 1 kolom).

## Scope
- [x] Architecture doc `docs/architecture/architecture-item-transfer.md`
- [x] `apps/api/src/lib/import-mapping/item-transfer.mapping.ts` + test
- [x] `apps/api/src/lib/accurate-item-transfer.ts` (shared dengan Fase 135)
- [x] `apps/api/src/lib/import-mapping/template-guide.ts` — tambah `itemTransferTemplateGuide`
- [x] `apps/api/src/routes/item-transfer-import.route.ts` + test
- [x] `apps/api/src/lib/module-catalog.ts` — tambah entri `item_transfer`, kategori "Inventory"
- [x] `apps/api/src/lib/accurate-scopes.ts` — tambah entri `item_transfer`
- [x] `apps/api/src/routes/admin/plans.route.ts` — tambah `t.Literal("item_transfer")`
- [x] `apps/api/src/app.ts` — register `itemTransferImportRoute`
- [x] `apps/api/src/workers/index.ts` — grouping, `ensureItemTransferDataClassifications`,
      `itemTransferTypeRowError`, `processItemTransferGroup`, dispatch block
- [x] `apps/web/lib/landing-content.ts` — icon + tagline
- [x] `apps/web/lib/module-import-routes.ts` — base path
- [x] `apps/web/components/app-shell/sidebar.tsx` — nav item kategori Inventory
- [x] `apps/web/components/import-archive/import-batch-table.tsx` — delete dialog
- [x] `apps/web/app/admin/(protected)/import-batches/[batchId]/page.tsx` — view + title map
- [x] `apps/web/app/app/(protected)/item-transfer/import/page.tsx` (mapping UI)
- [x] `apps/web/app/app/(protected)/item-transfer/import/riwayat/page.tsx`
- [x] `apps/web/app/app/(protected)/item-transfer/import/[batchId]/page.tsx`
- [x] `apps/web/components/item-transfer/delete-import-dialog.tsx`
- [x] `apps/web/components/item-transfer/edit-row-dialog.tsx`
- [x] Verifikasi checklist § 3b `architecture-accurate-integration.md` (diff-check, bukan cuma dibaca) — semua titik cocok

## Referensi
- Architecture doc: `docs/architecture/architecture-item-transfer.md`
- Modul template terdekat (pola diikuti): Receive Item (Fase 121, item-based,
  grouping by field khusus), Other Deposit (Fase 128, grouping default ADR-0011),
  Purchase Return (Fase 122, pola validasi enum row-level `returnTypeRowError`)

## Keputusan Kecil Selama Eksekusi
- `saveItemTransfer()` (`lib/accurate-item-transfer.ts`) DI-SHARE literal
  dengan modul kembaran Item Requisition (Fase 135) — satu-satunya bagian
  kode yang tidak diduplikasi, karena endpoint API-nya LITERAL sama
  (§ `architecture-item-transfer.md` § Konteks, alasan lengkap kenapa ini
  beda dari preseden Other Payment/Other Deposit yang wrapper-nya
  terpisah).
- Grouping key "No. Item Transfer" (`number`) dipaksa REQUIRED di
  `requiredFields` Facport walau opsional di API asli — konsisten pola
  Other Deposit/Purchase Order, mencegah jebakan ADR-0011 "silent wrong
  data" kalau dikosongkan.
- "Item Requisition No" dan "Note Penting" (2 kolom tanpa padanan field
  API) digabung ke `description` — TIDAK masuk `fieldToAccuratePath`
  (§ `architecture-item-transfer.md`).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — api+web, 0 error
- [x] `bun run lint` — 0 error
- [x] Test suite penuh (`bun test` di apps/api) — 1179 pass, 0 fail (termasuk
      29 test mapping baru + 44 test route baru untuk kedua modul)
- [x] Diff-verification checklist § 3b `architecture-accurate-integration.md`
      dijalankan (bandingkan jumlah kemunculan `other_deposit` vs
      `item_transfer`/`item_requisition` di 9 file titik registrasi) — semua
      cocok, tidak ada titik yang kelewat
- [x] Security review dijalankan (subagent `security-auditor`, 1 audit
      untuk Fase 134+135 sekaligus karena dibangun bersamaan) — 0
      Critical/High/Medium, 2 Low
- [x] Temuan Critical/High sudah diperbaiki — tidak ada temuan kategori itu
- [x] Temuan Low dicatat di `docs/lessons-learned.md` (2026-09-17, soal
      `accurateTransactionId` tidak unik lintas `item_transfer`/`item_requisition`
      karena `saveItemTransfer()` di-share — catatan desain, bukan bug)
- [x] `docs/PROGRESS.md` diupdate jadi Done

## Known Limitations
Sama seperti draft di `architecture-item-transfer.md` § "Known
Limitations" — dikonfirmasi TETAP berlaku pasca-eksekusi (belum ada
test call nyata ke Accurate yang bisa memverifikasinya lebih jauh sesi
ini):
- Quirk arah `warehouseName`/`referenceWarehouseName` (makna terbalik
  tergantung `itemTransferType`) — Facport tidak swap otomatis.
- `detailSerialNumber[]` dibatasi 1 entri per baris Excel.
- `fromItemTransferNo` dikirim apa adanya, hubungan end-to-end dengan
  `itemTransferType` belum ditest.
- Tambahan dari security audit (Low, § lessons-learned 2026-09-17):
  `accurateTransactionId` yang tersimpan di `import_batch_rows` TIDAK
  unik lintas modul `item_transfer`/`item_requisition` (sama namespace
  ID Accurate, karena `saveItemTransfer()` di-share) — bukan celah
  keamanan, tapi perlu diingat kalau nanti ada fitur lookup generik
  berdasarkan ID itu saja.
- Belum ada verifikasi visual browser (customer upload+mapping+hasil
  import) — server dev tidak dijalankan sesi ini, diverifikasi lewat
  typecheck+lint+test suite penuh (1179 pass) + security audit saja,
  konsisten pola beberapa fase UI-adjacent sebelumnya yang juga
  mengandalkan code review saat verifikasi visual tidak feasible.

## Ringkasan Hasil
2 modul import Accurate baru dibangun SEKALIGUS (Fase 134 "Item
Transfer" + Fase 135 "Item Requisition", lihat juga
`docs/phases/phase-135-modul-item-requisition.md`) — modul PERTAMA di
kategori "Inventory" yang sebelumnya kosong sejak Fase 126. Keduanya
memanggil endpoint Accurate yang SAMA (`/api/item-transfer/save.do`)
lewat 1 fungsi HTTP yang di-share (`saveItemTransfer()`), tapi tetap 2
modul Facport terpisah total (menu, halaman, template Excel,
`import_batches.module`, entri scope OAuth) sesuai keputusan eksplisit
user mengikuti 2 sheet Excel client apa adanya. ~19 titik registrasi per
modul (38 total) diverifikasi lengkap via diff-check mekanis (bukan
cuma baca checklist). `bun run typecheck`/`lint` 0 error, test suite
penuh 1179 pass (termasuk 29 test mapping + 44 test route baru), audit
keamanan 0 temuan Critical/High/Medium.
