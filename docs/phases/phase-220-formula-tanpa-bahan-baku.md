# Fase 220 — Formula tanpa Bahan Baku

**Status:** Done sisi kode 2026-11-17 (belum rilis); terverifikasi ke Accurate nyata
**Rencana induk:** `docs/phases/evaluasi-client-2026-11-16-rencana.md` (butir 4)

## Scope
- [x] Uji nyata Accurate: IN tanpa `unitCost` → diterima tapi bernilai 0; IN dengan `unitCost` → bernilai benar (dokumen uji dihapus)
- [x] `requiresStandardCost()` (murni) + rute POST/PUT: `items` boleh kosong, 422 `STANDARD_COST_REQUIRED`
- [x] Penyisipan item dilewati bila kosong (rute POST/PUT, Import Formula)
- [x] Import Excel: BB opsional, Unit Cost BJ wajib > 0 bila tanpa BB; panduan template diperbarui
- [x] Form web: Bahan Baku opsional, Standard Cost wajib bila tanpa bahan (label dinamis + pesan)
- [x] Tes: payload (1 baris IN), `requiresStandardCost`, mapping (valid/ditolak/record), rute (POST/PUT, 0 baris item); 50 tes rute lulus; typecheck api+web nol; eslint halaman lulus
- [x] Data uji DB dev dibersihkan (backup `pg_dump` dulu)
- [ ] Rilis atas permintaan eksplisit; verifikasi visual form di browser belum

## Keamanan
Tidak ada permukaan baru: validasi tetap di skema Elysia + cek bisnis server (bukan hanya UI); ownership/gate modul tidak berubah.

## Di luar scope
Mewajibkan Harga Standar untuk Formula DENGAN bahan (perilaku lama dipertahankan).
