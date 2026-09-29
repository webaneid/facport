# Fase 162 — AutoProduksi: Quick Win UI (Search Formula, Filter Cabang, Gudang Bahan Baku)

**Status:** Done
**Mulai:** 2026-09-29
**Selesai:** 2026-09-29

## Tujuan
Evaluasi pemakaian nyata AutoProduksi dari client — 3 poin quick-win yang
tidak butuh arsitektur baru: (5) search nama Formula, (6) filter Cabang di
`/autoproduksi/formulas`, (7) input Gudang Bahan Baku per baris (field
`autoproduksi_formula_items.warehouseName` sudah ada di backend sejak Fase
159, cuma belum dimunculkan di form). Bagian 1 dari 2 fase (Bagian 2 =
Fase 163, live-search Accurate — arsitektur baru, dikerjakan setelah ini
ditutup).

Rencana lengkap (Plan Mode, disetujui user 2026-09-29): `.claude/plans/ancient-floating-glacier.md`.

## Scope
- [x] `formulas/page.tsx` — kolom input "Gudang Bahan Baku" per baris item
- [x] `formulas/page.tsx` — search box nama Formula (client-side filter)
- [x] `formulas/page.tsx` — filter dropdown Cabang (client-side filter)
- [x] Fungsi filter murni diekstrak (`lib/filter-formulas.ts`) + unit test
- [x] `docs/architecture/architecture-autoproduksi.md` — update Known Limitations
- [x] Security review (skill `security-review`) — 0 temuan
- [x] Browser-test manual
- [x] `docs/PROGRESS.md` status Done

## Referensi
- Architecture doc: `docs/architecture/architecture-autoproduksi.md`
- Rencana lengkap (Plan Mode): `.claude/plans/ancient-floating-glacier.md`
- Evaluasi client asli: pesan user 2026-09-29 (8 poin, lihat riwayat sesi)

## Keputusan Kecil Selama Eksekusi
- Grid baris Bahan Baku diubah dari `grid-cols-[2fr_1fr_1fr_auto]` jadi
  `grid-cols-[1.6fr_0.8fr_0.8fr_1.2fr_auto]` (5 kolom) — proporsi disusut
  supaya kolom baru "Gudang" tetap muat tanpa bikin baris terlalu padat.
- Filter Cabang pakai `Combobox` yang sudah ada (bukan `<select>` polos)
  konsisten konvensi `apps/web/CLAUDE.md` — opsi diambil dari
  `[...new Set(formulas.map(f => f.branchName))]` (data yang SUDAH
  di-fetch), bukan fetch daftar Cabang baru dari Accurate.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`) — web 0 error
- [x] Lint bersih (`bun run lint`)
- [x] Test: web 299 pass/0 fail (+5 test baru: `filter-formulas.test.ts`)
- [x] Security review dijalankan (skill `security-review`) — 0 temuan
- [x] Temuan Critical/High sudah diperbaiki (tidak ada temuan)
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Nama Barang Jadi/Bahan Baku/Akun Perantara MASIH kode manual (bukan
  hasil lookup Accurate) — itu scope Fase 163, bukan fase ini.

## Ringkasan Hasil
Ketiga quick-win selesai: search nama Formula + filter Cabang (client-side,
`lib/filter-formulas.ts`, fungsi murni ditest terpisah dari komponen "use
client"), dan kolom "Gudang Bahan Baku" per baris item (field backend
`warehouseName` sudah ada sejak Fase 159, cuma ditambahkan `<Input>`-nya
di form — tidak ada perubahan backend/schema sama sekali).

**Browser-test manual end-to-end SUKSES** (akun QA lokal, dev DB): buat 2
Formula beda Cabang (JAKARTA/SURABAYA) dengan Gudang Bahan Baku diisi
("Gudang Telur") → search "bolu" menyaring dengan benar → filter Cabang
"SURABAYA" menyaring dengan benar → buka kembali lewat Edit, "Gudang Telur"
termuat ulang persis seperti disimpan. Data uji dibersihkan setelah selesai.

**Catatan environment (bukan bug produk)**: sempat dapat 403
`DATA_USAHA_FORBIDDEN`/`MODULE_NOT_SUBSCRIBED` saat verifikasi pertama —
akar masalah cookie `active_data_usaha_id` browser lokal nyangkut ke Data
Usaha akun dev SEBELUMNYA (browser yang sama dipakai bergantian banyak
akun QA sepanjang sesi ini) — bukan bug di kode Fase 162 (guard
`moduleAccess`/`hasAccessToDataUsaha` tidak disentuh fase ini, dan logic-nya
sendiri benar). Diperbaiki dengan logout+clear cookie penuh lalu login
ulang bersih — konsisten `feedback_browser_verification_env_quirks.md`
(coba 2 fix sebelum fallback).

Typecheck 0 error, lint bersih, test web 299 pass/0 fail. Security review:
0 temuan (murni frontend, tidak ada endpoint/data baru terekspos).
