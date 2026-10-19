# Fase 197 — Fix: cabut guard batas baris per transaksi (Fase 195)

**Status:** Done (2026-10-19, belum dirilis)
**Mulai:** 2026-10-19
**Selesai:** 2026-10-19

## Tujuan
Laporan client 2026-10-19: import Sales Receipt dengan 1 nomor berisi 2.019 baris (batch 5.570 baris) ditolak seluruhnya ("Satu transaksi … melebihi batas 1.000 baris"), padahal Jumat sebelumnya bisa. Penyebab: guard Fase 195 — batas 1000 adalah tebakan kita sendiri dari satu insiden timeout (bukan batas Accurate) dan berupa penolakan keras yang menutup alur user.

## Scope
- [x] Hapus 22 panggilan `assertGroupSizeWithinLimit` di `workers/index.ts`; hapus guard, `GroupTooLargeError`, parser batas, env `MAX_ROWS_PER_TRANSACTION` (+ 3 contoh env), tes batas & tes pagar.
- [x] Pertahankan `describeAccurateFailure` (pesan timeout bermakna dari Fase 195).
- [x] Catatan koreksi di `docs/lessons-learned.md`; Fase 195 ditandai sebagian digantikan.

## Di luar scope (opsi lanjutan, menunggu keputusan/data)
Desain guard yang MENGATUR ALUR, bukan menolak: (1) peringatan lunak di preview untuk nomor berukuran besar; (2) timeout adaptif sesuai jumlah baris; (3) pecah-otomatis per N baris (mengubah catatan akuntansi — butuh persetujuan client); (4) verifikasi ke Accurate setelah timeout (cek apakah transaksi sudah tersimpan) agar tidak ada status gagal palsu/duplikat. Pengukuran batas nyata dari data prod (`processed_at` per batch) belum dilakukan.

## Keputusan Kecil Selama Eksekusi
- Dicabut total (bukan dilonggarkan lewat env): batas apa pun tanpa dasar dari Accurate berisiko memblokir alur yang berhasil.

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error
- [x] Tes `accurate-group-guard.test.ts` hijau (3 tes)
- [x] Security review: perubahan hanya menghapus pemeriksaan ukuran; tidak ada input/endpoint/query baru
- [x] `docs/PROGRESS.md`, lessons-learned

## Known Limitations
- Transaksi sangat besar tetap bisa timeout di Accurate; pesan timeout mengarahkan cek Accurate dulu. Deploy ke server masih manual; jangan restart worker saat ada batch `processing`.

## Ringkasan Hasil
Transaksi bernomor sama kini dikirim ke Accurate berapa pun jumlah barisnya (perilaku sebelum Fase 195), dengan pesan timeout yang bermakna tetap aktif.
