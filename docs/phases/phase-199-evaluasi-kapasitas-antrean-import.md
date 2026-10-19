# Fase 199 — Evaluasi kapasitas & ketahanan import (antrean, throughput, transaksi besar)

**Status:** In Progress — evaluasi selesai; C1 (metrik + timeout adaptif), C2 (verifikasi setelah timeout, Sales Receipt), C3 (jalur besar), C4a (expire dinamis) SELESAI di `develop` (2026-10-20, belum dirilis; perlu verifikasi pasca-deploy di Bun 1.4.3); sisa: C4b paralel + uji beban, perluasan C2 ke modul bernomor lain
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
- [x] A3 Riwayat Sales Receipt: model biaya Accurate ±0,25–0,28 dtk/baris, linear (arsitektur § 1 "Hasil pengukuran A3").
- [ ] A4 Telusuri anomali: Batal Import 57 menit, Purchase Payment 32 menit, Work Order gagal 3 detik.
- [ ] A5 Uji di Accurate demo (butuh akun/database uji): waktu proses N baris, perilaku saat klien memutus, update bertahap.
**Tahap B — Keputusan desain (ADR-0049 sudah dicadangkan Fase 196 → pakai nomor berikutnya)**
- [ ] B1 Pilih kombinasi opsi A–G (lihat arsitektur § 4) berdasarkan A3–A5.
**Tahap C — Implementasi bertahap**
- [x] C1 `lib/accurate-http.ts` `accurateFetch`: satu pintu semua panggilan `ctx.host` (45 titik/28 file), timeout eksplisit (save.do adaptif = baris × 600 ms, 6–60 menit; lain 360 dtk), metrik log `accurate_request`, `AccurateTimeoutError` (pesan menyebut menit & baris), env 4 variabel, tes (14) + tes pagar.
- [x] C1a **Temuan uji penting:** `AbortSignal.timeout(lebih-panjang)` SAJA dan `timeout: <ms>` TIDAK mengalahkan default runtime Bun (tetap terputus 300 dtk); yang bekerja `timeout: false` + `signal` sendiri (terbukti: signal 5 dtk terputus di 5 dtk; signal 900 dtk tidak terputus sampai 330 dtk). Tanpa uji ini perubahan akan diam-diam tidak berefek.
- [ ] C1b **Verifikasi pasca-deploy di Bun 1.4.3 production** (default 360): probe `timeout:false` + signal panjang di container worker, amati > 420 dtk tanpa terputus.
- [x] C2 Verifikasi setelah timeout untuk Sales Receipt bernomor (`lib/accurate-verify.ts`, `accurate-timeout-settle.ts`, `getSalesReceiptByNumber`): ditemukan → SUKSES; tidak terlihat → GAGAL dengan pesan pasti; gagal cek → perilaku lama. Tanpa scope baru (sales_receipt_view sudah termasuk modul). Modul bernomor lain menyusul bila diminta.
- [x] C3 Jalur terpisah batch besar (`import-to-accurate-large`, ambang 1.500 baris, slot sendiri, handler sama) — ADR-0050; diuji ke pg-boss asli.
- [x] C4a `expireInSeconds` dinamis per job (clamp(baris × 0,6 + 900, 7200, 86400)).
- [ ] C4b Paralel dalam satu job (modul satu-baris-satu-dokumen) + uji beban 3–10 koneksi.
**Urutan awal (lama):** (urutan awal yang disarankan: G metrik → B verifikasi setelah timeout → A timeout eksplisit → E kapasitas → C/F bila terbukti).
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
