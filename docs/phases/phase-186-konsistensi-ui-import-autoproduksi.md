# Fase 186 — Konsistensi UI import Excel AutoProduksi + Import Formula asinkron
**Status:** Done (menunggu verifikasi manual pemilik sebelum rilis) · **Mulai:** 2026-10-09

## Tujuan
Alur import Excel AutoProduksi tampil dan berperilaku sama seperti import Excel modul Facport (hanya isi/progresnya yang boleh berbeda).

## Hasil audit (2026-10-09)
Halaman Upload, Hasil Import, dan Arsip sudah memakai komponen yang sama dengan Facport. Selisih nyata:
1. **Import Formula sinkron** (keputusan Fase 166): "Mulai Import" menahan permintaan sampai selesai; tidak ada status Memproses/progress bar; risiko timeout proxy untuk file besar (sampai 10.000 baris).
2. Teks/judul tidak seragam; penjelasan Import Produksi usang sejak Fase 184 ("namanya unik"); label mapping "Nama Resep/Formula" kepanjangan (kesalahan Fase 184).
3. "Batal Import" tidak ada (sengaja, di luar scope).

## Keputusan (pemilik, 2026-10-09)
- **A**: seragamkan teks (judul halaman/arsip/hasil, penjelasan, label mapping pendek).
- **B1**: Import Formula diproses lewat job queue (job baru, `retryLimit: 0` supaya tidak membuat Formula ganda; baris sukses tidak pernah diproses ulang). `confirm`/`retry` → status `processing` + enqueue; halaman Hasil polling + `ImportProgress`. Keputusan "sinkron" Fase 166 dicabut.

## Scope
- `lib/autoproduksi-formula-import.ts` (inti pemrosesan dipindah dari route), job `IMPORT_AUTOPRODUKSI_FORMULA` + worker, route confirm/retry/delete (BATCH_BUSY saat memproses).
- Web: halaman Hasil Formula (status Memproses + polling), teks A.
- Tes API & web; dokumen.

## Di luar scope
- Batal Import untuk AutoProduksi; perubahan alur Import Produksi.

## Ringkasan Hasil
- Job `IMPORT_AUTOPRODUKSI_FORMULA` + `lib/autoproduksi-formula-import.ts`; route confirm/retry → `processing`; retry/hapus saat memproses → 409; baris sukses ditandai di transaksi yang sama dengan insert Formula (idempoten).
- Web: status Memproses + polling + progress bar di halaman Hasil Formula; judul/teks diseragamkan ("Import … dari Excel", "Hasil Import", "Arsip Riwayat Import"); penjelasan & label mapping Import Produksi diperbaiki.
- Tes: API 2129, web 413 lulus (tes import formula diadaptasi: job dijalankan langsung, `boss.send` ditahan; tes baru idempotensi & BATCH_BUSY). Tanpa migrasi.
- Security review inline: payload job hanya `batchId` (data dimuat dari DB), kepemilikan batch tetap dicek per langganan di route, `retryLimit: 0`.

## Known Limitations
- Bila worker mati saat batch `processing`, batch menggantung sampai worker hidup lagi (sama seperti modul lain); retry diblokir selama status `processing`.
- "Batal Import" untuk AutoProduksi tetap tidak ada.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error
- [x] Lint nol error
- [x] Security review dijalankan
- [x] Temuan Critical/High diperbaiki
- [ ] Verifikasi manual pemilik sebelum merge ke `main`
- [x] `docs/PROGRESS.md` diupdate
