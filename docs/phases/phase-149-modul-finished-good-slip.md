# Fase 149 — Modul Finished Good Slip (Penyelesaian Barang Jadi)

**Status:** Done
**Mulai:** 2026-09-22
**Selesai:** 2026-09-22

## Tujuan
Bangun modul import Finished Good Slip end-to-end sesuai `docs/architecture/architecture-finished-good-slip.md`:
realisasi barang jadi yang diselesaikan dari Work Order, 1 panggilan `POST finished-good-slip/save.do`, dengan lookup
cabang DAN gudang (keduanya REQUIRED integer, § Quirk arsitektur). Sub-modul TERAKHIR dari 7 rencana total. Dependensi:
Work Order (Fase 147, sudah dibangun), disarankan dikerjakan SETELAH Material Slip (Fase 148) karena butuh generalisasi
helper lookup yang sama (`findByExactName`). Kategori "Manufacture".

## Scope (task)
- [x] T1 `apps/api/src/lib/import-mapping/finished-good-slip.mapping.ts` (+ tes): grouping by "Trans No", validasi baris
      (itemNo/quantity/portion WAJIB bersama), payload builder
- [x] T2 `apps/api/src/lib/accurate-finished-good-slip.ts` (`saveFinishedGoodSlip`) + generalisasi `findByExactName` di
      `accurate-work-order.ts` supaya menerima `"warehouse"` (REUSE, jangan duplikasi) + `resolveWarehouseId`
- [x] T3 `apps/api/src/routes/finished-good-slip-import.route.ts` (+ tes), termasuk `checkSubscriptionScopes`
- [x] T4 Registri endpoint & scope: entry `finished_good_slip` (`POST finished-good-slip/save.do`, `GET branch/list.do`
      REUSE, `GET warehouse/list.do` BARU + Kategori Keuangan 5 slot)
- [x] T5 `processFinishedGoodSlipGroup` + `ensureFinishedGoodSlipDataClassifications` + dispatch di `workers/index.ts`
- [x] T6 Titik registrasi checklist § 3b + trik verifikasi diff (bandingkan dengan Material Slip, BUKAN Roll Over —
      modul ini punya lookup, Material Slip tidak)
- [x] T7 Web: 3 halaman + `delete-import-dialog` + `edit-row-dialog`
- [x] T8 Typecheck + lint + tes penuh; security review; dokumen

## Referensi
- Architecture doc: `docs/architecture/architecture-finished-good-slip.md`
- Modul dependensi: `docs/architecture/architecture-work-order.md`, `docs/architecture/architecture-material-slip.md`

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
- ~~Skala portion belum dikonfirmasi~~ — RESOLVED 2026-09-22: data riil client (536 baris/252 dokumen, semua Portion=100) mengonfirmasi persen (0-100).
- **Grouping multi-baris-per-serial** (temuan data riil 2026-09-22, § architecture doc "Data Riil Client") — 1 barang jadi bisa punya banyak nomor seri
  yang ditulis di baris Excel TERPISAH (bukan 1 baris = 1 serial). T1 WAJIB mendesain grouping 2-level ini, bukan pola sederhana Roll Over.
- Belum diuji ke Accurate sungguhan, termasuk rantai Work Order → Finished Good Slip yang benar-benar terhubung.
- **Ditemukan & diperbaiki saat eksekusi**: `finishedGoodSlipRowError` awalnya mewajibkan itemNo/quantity/portion di SEMUA baris tanpa syarat
  — akan salah menolak baris "lanjutan" nomor seri (yang sah tanpa quantity/portion) kalau baris itu diedit sendirian lewat endpoint edit
  satu-baris (tidak tahu konteks grup). Diperbaiki jadi continuation-row-aware (baris tanpa quantity/portion TAPI ada Serial No = sah).
- ~~Menunggu contoh Excel Material Slip terisi~~ — RESOLVED 2026-09-22, client sudah kirim (§ `architecture-material-slip.md` "Data Riil Client").

## Ringkasan Hasil
Modul Finished Good Slip lengkap: mapping (+10 tes, memakai data produksi RIIL client), client Accurate `saveFinishedGoodSlip` +
`resolveWarehouseId` (generalisasi `findByExactName` dari Work Order, +3 tes), worker `processFinishedGoodSlipGroup` (lookup cabang
DAN gudang per barang), route (+22 tes), registri scope (`finished_good_slip_save` + `branch_view` REUSE + `warehouse_view` BARU +
Kategori Keuangan 5 slot), 11 titik registrasi §3b (diff identik Work Order kecuali modul bersama baru), 5 berkas web. Typecheck 0
error, lint bersih, API 1612 pass, web 97 pass; data tes dibersihkan. Security review: paritas persis Work Order/Roll Over, tanpa
temuan. 1 bug desain ditemukan & diperbaiki sebelum ship (§ Known Limitations).
