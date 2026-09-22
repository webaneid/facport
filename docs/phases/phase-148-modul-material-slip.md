# Fase 148 — Modul Material Slip (Pengambilan Bahan Baku)

**Status:** Planned
**Mulai:** —
**Selesai:** —

## Tujuan
Bangun modul import Material Slip end-to-end sesuai `docs/architecture/architecture-material-slip.md`: realisasi
pengambilan/pengembalian bahan baku dari Work Order, 1 panggilan `POST material-slip/save.do`. Sub-modul ke-6 dari
7 rencana total (5 Fase 136 + 2 tambahan Manufacture); dependensi Work Order (Fase 147) sudah dibangun (di `develop`,
belum dirilis saat dokumen ini dibuat). Kategori "Manufacture".

## Scope (task)
- [ ] T1 `apps/api/src/lib/import-mapping/material-slip.mapping.ts` (+ tes): dictionary `materialSlipType`
      (ITEM_PICK/ITEM_RETURN), grouping by "Trans No" (DEFAULT ADR-0011), validasi baris (itemNo wajib), payload builder
      (TANPA lookup branchId/warehouseId — § Quirk arsitektur)
- [ ] T2 `apps/api/src/lib/accurate-material-slip.ts` (`saveMaterialSlip`)
- [ ] T3 `apps/api/src/routes/material-slip-import.route.ts` (+ tes), termasuk `checkSubscriptionScopes`
- [ ] T4 Registri endpoint & scope: entry `material_slip` (`POST material-slip/save.do` + Kategori Keuangan 5 slot)
- [ ] T5 `processMaterialSlipGroup` + `ensureMaterialSlipDataClassifications` + dispatch di `workers/index.ts`
- [ ] T6 Titik registrasi checklist § 3b (template-guide, module-catalog, plans.route, app.ts, landing-content, sidebar,
      module-import-routes, import-batch-table, halaman admin batch-detail) + trik verifikasi diff
- [ ] T7 Web: 3 halaman (`import`, `import/[batchId]`, `import/riwayat`) + `delete-import-dialog` + `edit-row-dialog`
- [ ] T8 Typecheck + lint + tes penuh; security review; dokumen (architecture, lessons-learned, PROGRESS)

## Referensi
- Architecture doc: `docs/architecture/architecture-material-slip.md`
- Modul dependensi: `docs/architecture/architecture-work-order.md`

## Keputusan Kecil Selama Eksekusi
(isi saat eksekusi)
-

## Checklist Sebelum Ditutup (sesuai SOP)
- [ ] Type check nol error (`bun run typecheck`)
- [ ] Security review dijalankan
- [ ] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan)
- [ ] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda
- [ ] `docs/PROGRESS.md` diupdate

## Known Limitations
- **BLOCKED — menunggu data riil client** (2026-09-22): file contoh yang dikirim masih 1 baris uji tanpa Item No/Qty/Tipe. Eksekusi fase ini DITUNDA
  sampai client kirim Excel Material Slip yang benar-benar terisi (keputusan user 2026-09-22: "kita tidak eksekusi sampai dapat semua kolom").
- `materialSlipType` dictionary belum diverifikasi ke isi Excel riil client.
- ~~Kolom Excel "Dept Name" tidak ada field API yang cocok~~ — KOREKSI 2026-09-22: field `departmentName` TERNYATA ADA, sebelumnya salah baca portal
  (§ architecture doc). Dipetakan normal.
- **Curiga pola grouping serial multi-baris** (mirror temuan Finished Good Slip, § architecture doc) — perlu dicek begitu data riil tersedia, JANGAN
  asumsikan 1 baris = 1 serial.
- Belum diuji ke Accurate sungguhan.

## Ringkasan Hasil (isi pas fase Done)
