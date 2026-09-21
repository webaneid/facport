# Fase 139 — Modul Job Costing

**Status:** Done
**Mulai:** 2026-09-21
**Selesai:** 2026-09-21

## Tujuan
Bangun modul import Job Costing (Pekerjaan Pesanan) end-to-end, sesuai
`docs/architecture/architecture-job-costing.md` yang sudah diverifikasi
field-per-field ke portal developer Accurate live. Modul PALING KOMPLEKS
dari 3 modul fase ini (Sales Order → Inventory Adjustment → Job Costing) —
BUKAN 1 transaksi API, tapi 2 panggilan berurutan
(`job-order/save.do` lalu `material-adjustment/save.do`). Fase KETIGA/
terakhir yang dieksekusi berurutan atas otorisasi eksplisit user.
Modul PERTAMA kategori "Manufacture" (0% sebelumnya).

## Scope
- [x] `apps/api/src/lib/import-mapping/job-costing.mapping.ts` (+ `.test.ts`, 17 test)
- [x] `apps/api/src/lib/accurate-job-costing.ts` (2 fungsi: `saveJobOrder` + `saveMaterialAdjustment`)
- [x] `apps/api/src/routes/job-costing-import.route.ts` (+ `.test.ts`, 21 test)
- [x] `apps/web/app/app/(protected)/job-costing/import/page.tsx`
- [x] `apps/web/app/app/(protected)/job-costing/import/[batchId]/page.tsx`
- [x] `apps/web/app/app/(protected)/job-costing/import/riwayat/page.tsx`
- [x] `apps/web/components/job-costing/delete-import-dialog.tsx`
- [x] `apps/web/components/job-costing/edit-row-dialog.tsx`
- [x] Semua 11 titik registrasi existing (scopes, template-guide, module-catalog,
      plans.route, app.ts, workers/index.ts, landing-content.ts, sidebar.tsx,
      module-import-routes.ts, import-batch-table.tsx, admin batch-detail page)
- [x] `processJobCostingGroup` (workers/index.ts) — orkestrasi 2 panggilan API berurutan
- [x] Trik verifikasi diff (checklist § 3b) — 0 gap
- [x] `bun run typecheck` — 0 error (diverifikasi ULANG independen 2x:
      sebelum & sesudah perbaikan HIGH)
- [x] `bun run test` — full suite 1313 pass/0 fail (38 test baru),
      diverifikasi ULANG independen setelah perbaikan HIGH
- [x] `bun run db:cleanup-test-data` — data test dev DB dibersihkan
- [x] Security review via subagent `security-auditor` — 1 HIGH
      ditemukan & **DIPERBAIKI** (§ di bawah)

## Referensi
- Architecture doc: `docs/architecture/architecture-job-costing.md`
- Pola row→2-array (RM/Expense dari 1 grup): `apps/api/src/lib/import-mapping/purchase-invoice.mapping.ts`
- Pola detailSerialNumber+warehouseName+grouping DEFAULT: `apps/api/src/lib/import-mapping/inventory-adjustment.mapping.ts` (Fase 138)
- Pola route sederhana (tanpa validasi enum row-type): `apps/api/src/routes/item-transfer-import.route.ts`

## Keputusan Kecil Selama Eksekusi
- **2 panggilan API berurutan, 1 fungsi worker** (`processJobCostingGroup`)
  — `job-order/save.do` DULU (header + `detailExpense[]`), baru
  `material-adjustment/save.do` (RM, pakai `jobOrderNumber` = `number`
  dari RESPONS panggilan pertama, BUKAN nilai Excel mentah — penting
  karena Accurate generate nomor otomatis kalau kolom "No. Job Order"
  dikosongkan).
- **`materialAdjustmentAccountNo` REUSE nilai "Job Account No"** yang
  sama dengan `jobAccountNo` — ASUMSI belum dikonfirmasi client (Excel
  cuma punya 1 kolom akun). **Risiko utama tersisa**, § Known Limitations.
- **Kegagalan parsial**: kalau `job-order/save.do` sukses tapi
  `material-adjustment/save.do` gagal, TIDAK ada rollback (Accurate
  tidak punya API rollback lintas transaksi) — pesan error WAJIB
  menyebutkan nomor Job Order yang sudah terlanjur dibuat, supaya user
  tahu ada dokumen "orphan" di Accurate. Diimplementasikan via try/catch
  di `processJobCostingGroup`, pesan error masuk `importBatchRows.errorMessage`
  (tidak perlu kolom DB baru — mengalir lewat mekanisme error-reporting
  yang sudah ada).
- **✅ RESOLVED (security-auditor HIGH, diperbaiki 2026-09-21 sebelum
  fase ditutup)**: implementasi AWAL cuma menyelesaikan "laporan ke
  user" dari kegagalan parsial, TAPI TIDAK mencegah Job Order duplikat
  saat RETRY — tiap retry akan memanggil `saveJobOrder` lagi dari nol
  (karena `number` opsional, Accurate generate nomor baru tiap kali),
  Job Order orphan lama tidak pernah dipakai ulang, menumpuk tiap user
  menekan Retry sebelum akar masalah `material-adjustment` diperbaiki.
  **Fix**: `processJobCostingGroup` sekarang cek dulu `accurateTransactionId`
  baris-baris grup di awal — kalau SUDAH ada nilai (job order berhasil
  dibuat di attempt sebelumnya), SKIP `saveJobOrder`, langsung reuse
  nomor itu untuk `saveMaterialAdjustment`. Nomor Job Order disimpan ke
  `accurateTransactionId` SEGERA setelah `saveJobOrder` sukses (bukan
  nunggu seluruh grup selesai) — reuse kolom yang sudah ada di skema
  `importBatchRows` (tidak perlu migration baru). `JobCostingGroupResult.jobOrderId`
  (number, internal Accurate id) diganti `jobOrderNumber` (string, "No
  Pekerjaan #") supaya konsisten dipakai di kedua jalur (baru & reuse).
  Diverifikasi: `bun run typecheck` 0 error, `bun test` 1313 pass/0 fail
  (tidak ada regresi).
- **TIDAK auto-create bahan baku** — beda dari instruksi awal (yang
  menduga mirror Item Transfer yang auto-create), TAPI setelah dicek
  ulang Excel client Job Costing TIDAK punya kolom "RM Item Name" (SAMA
  situasi persis Inventory Adjustment Fase 138) — `findOrCreateItem`
  akan gagal di baris pertama barang baru karena mewajibkan nama.
  Keputusan: `itemNo` dikirim apa adanya, Accurate yang validasi
  eksistensi (konsisten Inventory Adjustment, BUKAN Item Transfer).
- **1 baris Excel bisa isi kolom RM SAJA, Expense SAJA, atau keduanya**
  — field dengan prefix beda (`detailItem.`/`detailExpense.`) masuk
  array beda berdasarkan APAKAH kolom kuncinya (RM_Item No / Expense No)
  terisi di baris itu, BUKAN row-type flag terpisah — pola sama
  `buildPurchaseInvoicePayload`.
- **Route TIDAK punya validasi enum row-type khusus** (beda dari
  Inventory Adjustment/Item Transfer) — Job Costing tidak punya field
  enum literal yang perlu dictionary lookup, `requiredFields` standar
  sudah cukup.
- **Kategori Keuangan RM_CLS1-3** — 3 slot (mirror Item Transfer, BUKAN
  10 slot seperti Sales Order), auto-create via `ensureJobCostingDataClassifications`.
- **Icon sidebar/landing**: `Factory` (belum dipakai modul manapun,
  cocok tema "Manufacture").
- **`JobCostingView` (admin batch-detail)**: mirror PERSIS
  `InventoryAdjustmentView` (row-view sederhana) — 2 panggilan API tidak
  terlihat di tampilan admin ini, murni detail backend.
- **Grouping "No. Job Order" OPSIONAL** (pola ADR-0011 standar,
  konsisten Inventory Adjustment/Other Deposit).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — 0 error, diverifikasi
      independen 2x (sebelum & sesudah perbaikan HIGH)
- [x] Security review via subagent `security-auditor` (dipanggil sesi
      utama setelah eksekusi selesai). Hasil AWAL: **0 Critical, 1
      HIGH, 2 Medium, 2 Low**.
- [x] Temuan Critical/High — **1 HIGH: retry setelah kegagalan parsial
      bisa bikin Job Order DUPLIKAT di Accurate** (tiap retry panggil
      `saveJobOrder` dari nol, orphan lama tidak pernah dipakai ulang)
      — **DIPERBAIKI SEKARANG** (§ "Keputusan Kecil" di atas), bukan
      ditunda, sesuai SOP. Diverifikasi ulang: typecheck 0 error, test
      1313 pass/0 fail.
- [x] Temuan Medium/Low — 2 Medium + 2 Low (di bawah), TIDAK perlu
      perbaikan kode tambahan (1 Medium = asumsi bisnis yang sudah
      tercatat, 1 Medium = komentar dokumentasi menyesatkan — SUDAH
      diperbaiki sekalian; 2 Low = keputusan sengaja/pola pre-existing)
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- **`materialAdjustmentAccountNo` = `jobAccountNo` (REUSE)** — ASUMSI
  belum dikonfirmasi client. Excel cuma punya 1 kolom akun ("Job
  Account No"), API mewajibkan 2 field akun terpisah secara konsep
  (akun pekerjaan vs akun penyesuaian bahan baku). **Risiko UTAMA**
  yang tersisa dari seluruh fase ini — kalau salah, SEMUA import Job
  Costing akan gagal di panggilan kedua (`material-adjustment/save.do`)
  dengan Job Order yang sudah terlanjur dibuat (§ pesan error kegagalan
  parsial di atas). WAJIB dikonfirmasi ke client SEBELUM retest pertama.
- **Kegagalan parsial + retry-safety (Job Order sukses, Material
  Adjustment gagal, lalu di-retry)** TIDAK diuji dengan test call nyata
  ke Accurate — logic try/catch + skip-`saveJobOrder`-kalau-sudah-ada
  sudah ada dan lolos typecheck/unit test (bukan integrasi Accurate
  sungguhan), perlu retest client pertama untuk validasi end-to-end
  (termasuk verifikasi TIDAK ADA Job Order duplikat setelah retry).
- 2 Medium tambahan dari security review: (a) `materialAdjustmentAccountNo`
  reuse (sama poin di atas, ditegaskan ulang auditor); (b) komentar
  dokumentasi di `job-costing.mapping.ts` yang salah soal auto-create
  item — SUDAH diperbaiki saat fase ini (§ koreksi komentar). 2 Low:
  scope `item_save` disiapkan tapi belum dipakai (sengaja, least-privilege
  utuh saat fitur auto-create beneran ada), dan error Accurate diteruskan
  apa adanya ke user (pola project-wide, aman — tidak bocorkan token/payload).
- **Posisi kolom "Note" terakhir** (apakah `detailExpense[].expenseNotes`
  atau catatan level dokumen lain) — masih asumsi dari architecture doc,
  perlu dikonfirmasi ulang lewat Excel asli client.
- `bulk-save.do` ADA di kedua endpoint (job-order & material-adjustment)
  tapi TIDAK diimplementasikan — konsisten keputusan arsitektur project.
- Field mapping BELUM pernah dites via test call nyata ke akun
  Accurate client sungguhan — arsitektur sudah 100% cocok dokumentasi
  API (§ Fase 136, termasuk endpoint kedua yang ditemukan via portal
  developer live), tapi belum ada transaksi asli yang berhasil masuk.
- Ini modul PERTAMA kategori "Manufacture" — taksonomi
  `MODULE_CATEGORIES` sudah support (disiapkan sejak Fase 126), belum
  di-spot-check visual browser sungguhan.

## Ringkasan Hasil
Modul Job Costing dibangun end-to-end — modul PALING KOMPLEKS dari 3
modul fase ini, BUKAN 1 transaksi API tapi 2 panggilan berurutan
(`job-order/save.do` lalu `material-adjustment/save.do`, orkestrasi di
`processJobCostingGroup`/workers/index.ts, nomor Job Order diambil dari
RESPONS panggilan pertama). Semua 19 titik registrasi (8 file baru + 11
titik existing) tersentuh, diverifikasi via trik diff checklist § 3b —
0 gap ditemukan. Typecheck 0 error, test suite API penuh **1313
pass/0 fail** (38 test baru: 17 unit mapping + 21 integrasi route).
Test data dev DB dibersihkan via `bun run db:cleanup-test-data`.

Keputusan desain terpenting: (1) TIDAK auto-create bahan baku (Excel
tidak punya kolom nama, konsisten Inventory Adjustment); (2)
`materialAdjustmentAccountNo` REUSE "Job Account No" — ASUMSI risiko
utama tersisa, WAJIB konfirmasi client; (3) penanganan kegagalan
parsial via pesan error eksplisit menyebut nomor Job Order yang
terlanjur dibuat, TANPA rollback.

Security review via subagent `security-auditor`: **0 Critical, 1 HIGH,
2 Medium, 2 Low**. HIGH (retry pasca-kegagalan-parsial bisa bikin Job
Order duplikat di Accurate) **DIPERBAIKI SEKARANG** sebelum fase
ditutup — `processJobCostingGroup` sekarang retry-safe (cek
`accurateTransactionId` dulu, skip `saveJobOrder` kalau job order grup
itu sudah pernah berhasil dibuat). 1 Medium (komentar dokumentasi
menyesatkan) juga diperbaiki sekalian. Diverifikasi ulang independen
setelah perbaikan: typecheck 0 error, test suite 1313 pass/0 fail — 0
regresi. **Fase ditutup Done**, security review lengkap (bukan
"belum dijalankan" seperti draf awal dokumen ini).
