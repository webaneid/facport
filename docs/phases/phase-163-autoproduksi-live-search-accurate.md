# Fase 163 — AutoProduksi: Live-Search Accurate (Item/Bahan Baku/Akun Perantara)

**Status:** Planned
**Mulai:** -
**Selesai:** -

## Tujuan
Bagian 2 dari evaluasi client AutoProduksi (Bagian 1 = Fase 162, quick-win
UI). Poin #1/#2/#3: search-as-you-type ke Accurate langsung dari form
Formula (Barang Jadi, Bahan Baku, Akun Perantara), autofill kode+satuan+nama
begitu dipilih. Pola PERTAMA di Facport — panggilan Accurate SINKRON dari
HTTP route (bukan job worker), sengaja ditunda sampai Fase 162 selesai &
ditutup rapi (SOP "bertahap").

Rencana lengkap (Plan Mode, disetujui user 2026-09-29): `.claude/plans/ancient-floating-glacier.md`.

## Scope
- [ ] ADR baru: keputusan arsitektur "live-search Accurate dari route"
- [ ] Migration: `autoproduksiFormulas.finishedGoodItemName`/`adjustmentAccountName`, `autoproduksiFormulaItems.itemName`
- [ ] Endpoint baru `GET /accurate/items/search`, `GET /accurate/glaccounts/search` + rate limit + daftar di `accurate-endpoint-registry.ts`
- [ ] Frontend: `Combobox` (reuse komponen yang sudah ada) ganti 3 `<Input>` di Formula form
- [ ] Test call NYATA ke Accurate sandbox
- [ ] Security review
- [ ] Browser-test manual
- [ ] Docs + `docs/PROGRESS.md` status Done

## Referensi
- Architecture doc: `docs/architecture/architecture-autoproduksi.md`
- Rencana lengkap (Plan Mode): `.claude/plans/ancient-floating-glacier.md`
- Fase sebelumnya (Bagian 1): `docs/phases/phase-162-autoproduksi-quick-win-formulas-ui.md`

## Keputusan Kecil Selama Eksekusi
-

## Checklist Sebelum Ditutup (sesuai SOP)
- [ ] Type check nol error (`bun run typecheck`)
- [ ] Security review dijalankan (skill `security-review`)
- [ ] Temuan Critical/High sudah diperbaiki (atau tidak ada temuan)
- [ ] `docs/PROGRESS.md` diupdate

## Known Limitations
-

## Ringkasan Hasil (isi pas fase Done)
