# Fase 148 — Modul Material Slip (Pengambilan Bahan Baku)

**Status:** Done
**Mulai:** 2026-09-22
**Selesai:** 2026-09-22

## Tujuan
Bangun modul import Material Slip end-to-end sesuai `docs/architecture/architecture-material-slip.md`: realisasi
pengambilan/pengembalian bahan baku dari Work Order, 1 panggilan `POST material-slip/save.do`. Sub-modul ke-6 dari
7 rencana total (5 Fase 136 + 2 tambahan Manufacture); dependensi Work Order (Fase 147) sudah dibangun (di `develop`,
belum dirilis saat dokumen ini dibuat). Kategori "Manufacture".

## Scope (task)
- [x] T1 `apps/api/src/lib/import-mapping/material-slip.mapping.ts` (+ tes): dictionary `materialSlipType`
      (ITEM_PICK/ITEM_RETURN), grouping by "Trans No" (DEFAULT ADR-0011), validasi baris (itemNo wajib), payload builder
      (TANPA lookup branchId/warehouseId — § Quirk arsitektur)
- [x] T2 `apps/api/src/lib/accurate-material-slip.ts` (`saveMaterialSlip`)
- [x] T3 `apps/api/src/routes/material-slip-import.route.ts` (+ tes), termasuk `checkSubscriptionScopes`
- [x] T4 Registri endpoint & scope: entry `material_slip` (`POST material-slip/save.do` + Kategori Keuangan 5 slot)
- [x] T5 `processMaterialSlipGroup` + `ensureMaterialSlipDataClassifications` + dispatch di `workers/index.ts`
- [x] T6 Titik registrasi checklist § 3b (template-guide, module-catalog, plans.route, app.ts, landing-content, sidebar,
      module-import-routes, import-batch-table, halaman admin batch-detail) + trik verifikasi diff
- [x] T7 Web: 3 halaman (`import`, `import/[batchId]`, `import/riwayat`) + `delete-import-dialog` + `edit-row-dialog`
- [x] T8 Typecheck + lint + tes penuh; security review; dokumen (architecture, lessons-learned, PROGRESS)

## Referensi
- Architecture doc: `docs/architecture/architecture-material-slip.md`
- Modul dependensi: `docs/architecture/architecture-work-order.md`

## Keputusan Kecil Selama Eksekusi
(isi saat eksekusi)
-

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review dijalankan
- [x] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan)
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- ~~BLOCKED — menunggu data riil client~~ — **RESOLVED 2026-09-22**: client kirim contoh terisi (`material-slip-temp-v1 (1) (1).xlsx`,
  2 baris, 1 dokumen 2 barang) — mengonfirmasi `materialSlipType` enum literal (`"ITEM_PICK"`) dan grouping multi-item per dokumen.
- ~~Kolom Excel "Dept Name" tidak ada field API yang cocok~~ — KOREKSI 2026-09-22: field `departmentName` TERNYATA ADA, sebelumnya salah baca portal
  (§ architecture doc). Dipetakan normal.
- **Pola grouping serial multi-baris** (mirror Finished Good Slip) — BELUM ada contoh nyata untuk Material Slip spesifik (contoh client cuma 2 baris
  manual, bukan ekspor bervolume), tapi kode dirancang generik (grouping 2-level, § architecture doc "Keputusan Desain (lanjutan)") supaya aman untuk
  kedua pola.
- Belum diuji ke Accurate sungguhan.

## Ringkasan Hasil
Modul Material Slip lengkap: modul grouping 2-level bersama `manufacture-slip-shared.ts` (+7 tes) dipakai berdua dengan Finished Good
Slip, mapping (+12 tes), client Accurate `saveMaterialSlip` (+1 tes), worker `processMaterialSlipGroup`, route (+22 tes), registri
scope (`material_slip_save` + Kategori Keuangan 5 slot, TANPA lookup cabang/gudang), 11 titik registrasi §3b (diff identik Roll Over
kecuali modul bersama baru), 5 berkas web. Typecheck 0 error, lint bersih, API 1612 pass, web 97 pass; data tes dibersihkan. Security
review: paritas guard/moduleAccess/validasi/scope check persis Roll Over (route referensi), tanpa temuan.
