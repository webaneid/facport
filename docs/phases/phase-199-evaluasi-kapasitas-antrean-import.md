# Fase 199 — Evaluasi kapasitas & ketahanan import (antrean, throughput, transaksi besar)

**Status:** Planned (2026-10-20) — evaluasi terukur selesai sebagian; desain menunggu pengukuran sisa & persetujuan user
**Mulai:** 2026-10-20
**Selesai:** -

## Tujuan
Tujuan utama Facport = impor data besar ke Accurate dengan andal, juga ketika 3–10 pengguna mengimpor paralel. Insiden 2026-10-19: 11 batch Sales Receipt (±62.000 baris) gagal 100% karena timeout 360 detik (default HTTP client, bukan Accurate), menahan slot antrean berjam-jam. Fase ini mengevaluasi sistem KITA (bukan batas Accurate) dengan bukti, lalu merancang perbaikan. Detail & bukti: `docs/architecture/architecture-import-capacity.md`.

## Mode kerja
Besar & berisiko (menyentuh jalur kirim ke Accurate, antrean, scope) → evaluasi + pengukuran dulu, ADR setelah ukuran ada, implementasi bertahap. Tidak ada perubahan kode di tahap ini.

## Scope
**Tahap A — Pengukuran (read-only)**
- [x] A1 Timeout default runtime production (Bun 1.4.3 = 360 dtk) — probe di container worker.
- [x] A2 Antrean & throughput hari insiden (`pgboss.job`, `import_batch_rows`).
- [ ] A3 Riwayat Sales Receipt 10–19 Okt: ukuran grup sukses terbesar + durasi.
- [ ] A4 Telusuri anomali: Batal Import 57 menit, Purchase Payment 32 menit, Work Order gagal 3 detik.
- [ ] A5 Uji di Accurate demo (butuh akun/database uji): waktu proses N baris, perilaku saat klien memutus, update bertahap.
**Tahap B — Keputusan desain (ADR-0049 sudah dicadangkan Fase 196 → pakai nomor berikutnya)**
- [ ] B1 Pilih kombinasi opsi A–G (lihat arsitektur § 4) berdasarkan A3–A5.
**Tahap C — Implementasi bertahap** (urutan awal yang disarankan: G metrik → B verifikasi setelah timeout → A timeout eksplisit → E kapasitas → C/F bila terbukti).
**Tahap D — Penutup** (typecheck, suite penuh, security review, lessons-learned, uji beban 3–10 koneksi paralel).

## Di luar scope
Mengubah batas 8 request/detik milik Accurate; Fase 196 (penautan baris, tetap ditunda).

## Keputusan Kecil Selama Eksekusi
- Mitigasi segera untuk pelanggan (tanpa kode): cek Accurate untuk nomor yang gagal, JANGAN retry file yang sama, pecah nomor menjadi ≤ 1.000–1.500 baris bila belum ada di Accurate.

## Checklist Sebelum Ditutup (sesuai SOP)
- [ ] Type check nol error
- [ ] Security review
- [ ] Temuan Critical/High diperbaiki
- [ ] Temuan Medium/Low dicatat
- [ ] `docs/PROGRESS.md` diupdate

## Known Limitations
(isi saat Done)

## Ringkasan Hasil
(isi saat Done)
