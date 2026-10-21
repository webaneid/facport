# Fase 206 — Efisiensi: Hitung Baris SR di Timeout Adaptif + Tinjau Chunk 500

**Status:** Done sisi kode (belum di-commit/dirilis); env produksi sudah disetel
**Mulai:** 2026-10-21
**Selesai:** 2026-10-21

## Tujuan
Dua perbaikan kecil pasca Fase 205 (kirim bertahap), hanya menyentuh
pengiriman/timeout — **bentuk & nomor dokumen pelanggan TIDAK berubah**.
Bagian duplikasi file dipisah ke Fase 207 (ditunda, menunggu client).

## Scope
- [x] Hitung baris `detailInvoice` Sales Receipt di timeout adaptif (log
      menunjukkan `lines:0` untuk SR, sehingga timeout terlalu pendek).
- [x] Tinjau ukuran chunk 500 dari data log produksi (tanpa ubah kode kecuali
      ada temuan jelas). Data: tryout 700 baris, 500 entri create SR = 240 s;
      koefisien 1.5e-3 sudah disetel di prod 2026-10-21.

## Referensi
- `docs/architecture/architecture-staged-send.md`, ADR-0051 (Fase 205)
- `docs/architecture/architecture-import-capacity.md`
- Fase 207: `docs/phases/phase-207-peringatan-unggah-dobel.md`

## Keputusan Kecil Selama Eksekusi
- `lines:0` pada dokumen kecil (1–4 KB) memang benar dan tidak berbahaya. Penyebab
  `lines:0` pada cicilan ±25–30 KB: ambang parse `PARSE_THRESHOLD_BYTES` 30 KB →
  diturunkan ke 2 KB (`apps/api/src/lib/accurate-http.ts`).
- Temuan log produksi (`worker-1021-1222.log`, panggilan `sales-receipt/save.do` ≥15 KB):
  15 KB = 76 dtk ok; 25 KB = 240 dtk ok; **16 KB = 360 dtk TIMEOUT** (batas minimum).
  Waktu Accurate sangat bervariasi, dan rumus linear 0,6 dtk/baris tidak mengikuti
  model kuadrat SR/PP. Dampak timeout: tidak merusak dokumen (kirim bertahap
  memverifikasi & kirim ulang idempoten, Fase 205), hanya buang waktu.
- Perbaikan kode: timeout `save.do` Sales Receipt & Purchase Payment = maks(linear,
  `IMPORT_STAGED_SECONDS_COEFF` × baris² × 1,5), dijepit batas atas. 500 baris dengan
  koefisien 1.5e-3 → 562,5 dtk (sebelumnya 360). Modul lain tidak berubah.
- Env produksi (tanpa rilis): `ACCURATE_SAVE_TIMEOUT_MIN_MS=900000` (15 menit, semua
  `save.do`), terverifikasi di api & worker 2026-10-21.
- Ukuran chunk 500 TIDAK diubah (bagian 3: tidak ada temuan yang cukup; tersedia
  `IMPORT_STAGED_CHUNK_ROWS` bila timeout tetap muncul).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error (`bun run typecheck`)
- [x] Security review: perubahan satu file murni kalkulasi timeout, tanpa endpoint/input/akses data baru (tidak ada permukaan serangan baru)
- [x] Temuan Critical/High: tidak ada
- [x] Temuan Medium/Low dicatat di `docs/lessons-learned.md` kalau ditunda
- [x] `docs/PROGRESS.md` diupdate

## Known Limitations
- Kode belum dirilis: sampai rilis berikutnya hanya env `ACCURATE_SAVE_TIMEOUT_MIN_MS=900000` yang melindungi dari timeout cicilan besar.
- Suite API 2589 pass/0 fail, typecheck bersih.

## Ringkasan Hasil (isi pas fase Done)
