# Fase 202 — Paralel dalam satu job import (C4b Fase 199), dark launch

**Status:** Done sisi kode (2026-10-20, belum dirilis; default OFF) — peluncuran bertahap & uji terhadap Accurate asli menunggu keputusan user
**Mulai:** 2026-10-20
**Selesai:** 2026-10-20 (kode); peluncuran: -

## Tujuan
Throughput satu job berurutan ±3 baris/dtk ≈ kecepatan Accurate per permintaan (±0,3 dtk); Accurate mengizinkan 8 paralel/8 req/dtk per token. Memparalelkan grup dalam satu job menaikkan throughput impor besar dan mengurangi waktu menahan slot worker. Detail & bukti: `docs/architecture/architecture-import-capacity.md` § 1, § 11.

## Scope
- [x] `lib/group-concurrency.ts`: `forEachGroupConcurrent` + `parseGroupParallelism` (env `IMPORT_GROUP_PARALLELISM`, default 1, 1–6). 22 loop grup di handler impor dialihkan (satu `continue` → `return`); pagar tes mencegah loop mentah/`continue`.
- [x] `lib/keyed-lock.ts` `runExclusive` + 5 `findOrCreate*` (pelanggan, vendor, barang, klasifikasi, PIC Work Order) dikunci per (sesi Accurate, jenis, id ternormalisasi) — mencegah balapan "sama-sama membuat".
- [x] Metrik: log "Import batch selesai" + `module`, `parallelism`, `durationMs`.
- [x] Tes (13): urutan/bound paralelisme, galat, paralel nyata, kunci per-kunci (termasuk simulasi balapan find-or-create), pembersihan kunci, pagar worker.
- [ ] Peluncuran bertahap di production (OFF → 2 → 3) + pengukuran — menunggu keputusan user (arsitektur § 11).
- [ ] Uji terhadap Accurate asli/database uji.

## Keputusan Kecil Selama Eksekusi
- Default 1 (perilaku lama persis) — mencegah perubahan perilaku tak terukur tanpa database uji.
- Kunci per-kunci (bukan single-flight/cache): menjaga semantik berurutan (yang kedua tetap menjalankan fungsinya sendiri), mis. pembaruan akun pelanggan bila createFields berbeda.
- Pembatas per koneksi tidak diubah: sudah menjaga ≤ 8 paralel & 8/dtk lintas semua job/jalur pada koneksi yang sama.
- AutoProduksi & cabang per-baris bawaan sengaja tidak diparalelkan.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error
- [x] Suite API 2504 hijau; data uji dibersihkan
- [x] Security review inline: tanpa endpoint/query/secret baru; kunci memuat id sesi (tidak bocor lintas-database); env di-parse & dijepit
- [x] `docs/PROGRESS.md`, lessons-learned

## Known Limitations
- Belum terbukti Accurate menskalakan penulisan paralel (bisa menserialisasi); belum ada uji beban 3–10 koneksi.
- Dengan paralelisme > 1, urutan penyelesaian grup tidak sama dengan urutan Excel (hasil per baris tetap benar).

## Ringkasan Hasil
Paralel dalam satu job tersedia sebagai saklar env (default OFF) dengan pengaman balapan data master dan metrik untuk mengukur dampaknya.
