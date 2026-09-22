# Fase 149 — Modul Finished Good Slip (Penyelesaian Barang Jadi)

**Status:** Planned
**Mulai:** —
**Selesai:** —

## Tujuan
Bangun modul import Finished Good Slip end-to-end sesuai `docs/architecture/architecture-finished-good-slip.md`:
realisasi barang jadi yang diselesaikan dari Work Order, 1 panggilan `POST finished-good-slip/save.do`, dengan lookup
cabang DAN gudang (keduanya REQUIRED integer, § Quirk arsitektur). Sub-modul TERAKHIR dari 7 rencana total. Dependensi:
Work Order (Fase 147, sudah dibangun), disarankan dikerjakan SETELAH Material Slip (Fase 148) karena butuh generalisasi
helper lookup yang sama (`findByExactName`). Kategori "Manufacture".

## Scope (task)
- [ ] T1 `apps/api/src/lib/import-mapping/finished-good-slip.mapping.ts` (+ tes): grouping by "Trans No", validasi baris
      (itemNo/quantity/portion WAJIB bersama), payload builder
- [ ] T2 `apps/api/src/lib/accurate-finished-good-slip.ts` (`saveFinishedGoodSlip`) + generalisasi `findByExactName` di
      `accurate-work-order.ts` supaya menerima `"warehouse"` (REUSE, jangan duplikasi) + `resolveWarehouseId`
- [ ] T3 `apps/api/src/routes/finished-good-slip-import.route.ts` (+ tes), termasuk `checkSubscriptionScopes`
- [ ] T4 Registri endpoint & scope: entry `finished_good_slip` (`POST finished-good-slip/save.do`, `GET branch/list.do`
      REUSE, `GET warehouse/list.do` BARU + Kategori Keuangan 5 slot)
- [ ] T5 `processFinishedGoodSlipGroup` + `ensureFinishedGoodSlipDataClassifications` + dispatch di `workers/index.ts`
- [ ] T6 Titik registrasi checklist § 3b + trik verifikasi diff (bandingkan dengan Material Slip, BUKAN Roll Over —
      modul ini punya lookup, Material Slip tidak)
- [ ] T7 Web: 3 halaman + `delete-import-dialog` + `edit-row-dialog`
- [ ] T8 Typecheck + lint + tes penuh; security review; dokumen

## Referensi
- Architecture doc: `docs/architecture/architecture-finished-good-slip.md`
- Modul dependensi: `docs/architecture/architecture-work-order.md`, `docs/architecture/architecture-material-slip.md`

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
- ~~Skala portion belum dikonfirmasi~~ — RESOLVED 2026-09-22: data riil client (536 baris/252 dokumen, semua Portion=100) mengonfirmasi persen (0-100).
- **Grouping multi-baris-per-serial** (temuan data riil 2026-09-22, § architecture doc "Data Riil Client") — 1 barang jadi bisa punya banyak nomor seri
  yang ditulis di baris Excel TERPISAH (bukan 1 baris = 1 serial). T1 WAJIB mendesain grouping 2-level ini, bukan pola sederhana Roll Over.
- Belum diuji ke Accurate sungguhan, termasuk rantai Work Order → Finished Good Slip yang benar-benar terhubung.
- ~~Menunggu contoh Excel Material Slip terisi~~ — RESOLVED 2026-09-22, client sudah kirim (§ `architecture-material-slip.md` "Data Riil Client").

## Ringkasan Hasil (isi pas fase Done)
