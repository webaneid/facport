# Fase 179 — Koreksi langganan tahunan 360 hari

**Status:** Done (skrip siap; BELUM dijalankan di production) · **Mulai:** 2026-10-07 · **Selesai:** 2026-10-07 · ADR-0041

## Tujuan
Pelanggan yang membeli "1 tahun" sebelum 2026-10-06 mendapat 360 hari (12×30, kesalahan produk Fase 43). Perubahan paket (migrasi 0041) hanya berlaku untuk pembelian BARU; langganan yang sudah berjalan tetap membawa `end_at` lama. Koreksi SATU KALI: `end_at` digenapi menjadi `start_at` + N×12 bulan kalender (zona perusahaan) — hanya menambah, tidak pernah memotong.

## Scope
- [x] `lib/legacy-year-correction.ts`: `legacyYearCorrection` (murni), `findLegacyYearCandidates`, `applyLegacyYearCorrections` (satu transaksi, tiap baris dikunci `FOR UPDATE` & divalidasi ULANG, idempoten, audit log per baris)
- [x] Skrip `src/scripts/correct-legacy-year-subscriptions.ts` — DEFAULT DRY-RUN (tabel kandidat: user, paket, mulai, berakhir sekarang → sesudah koreksi, tambahan hari); `--commit` untuk menerapkan
- [x] Tes: aturan kandidat (murni & DB), 29 Feb, kelipatan tahun lama, "berubah di tengah jalan dilewati", idempoten
- [ ] DIJALANKAN di production oleh pemilik (runbook di bawah) — setelah rilis memuat skrip ini

## Aturan kandidat (konservatif)
Status `active`, BUKAN trial, `end_at` masih di masa depan, `end_at − start_at` = N×360 hari (±1 hari, N=1..5), BELUM punya jangkar periode (langganan Fase 174+ tidak disentuh), belum pernah diperpanjang (`subscription_renewals`). Tidak dikoreksi: yang sudah berakhir (tidak ada yang bisa diberikan lagi), tanggal kustom admin (mis. 400 hari), langganan 365 hari.

## Efek koreksi per langganan
`end_at` = `start_at` + N×12 bulan (jam dinding sama, tanggal dijepit akhir bulan; +5 hari, +6 di tahun kabisat), `period_anchor_at` = `start_at`, `period_months` = N×12 (perpanjangan berikutnya akurat tanpa geser), `last_reminder_threshold_days` direset (pengingat berlaku lagi untuk akhir baru), `audit_logs` (alasan `fase-179-koreksi-tahun-360-hari`, tanggal lama→baru). Tanggal di invoice ikut (live join).

## Runbook production (kamu menjalankan; satu perintah per langkah)
1. **Backup** database seperti biasa (`pg_dump` ke `~/pre-vX.Y.Z.dump`) — wajib sebelum `--commit`.
2. **Dry-run** (tidak mengubah apa pun), di folder `/opt/facport`:
   `docker compose -f docker-compose.prod.yml -f docker-compose.override.yml --env-file .env.production --env-file .env.deploy exec api bun run src/scripts/correct-legacy-year-subscriptions.ts`
3. Periksa tabel: tiap baris harus tahun-360-hari yang wajar (tambahan 5 atau 6 hari; N=2 → ±10–11 hari). Tempel hasilnya untuk dicek bersama.
4. **Terapkan**: perintah yang sama ditambah ` --commit` di akhir. Hasil: `SELESAI — dikoreksi: N, dilewati: 0`.
5. Jalankan dry-run lagi: `Kandidat: 0` (idempoten). Cek 1–2 langganan di admin (tanggal berakhir baru) dan `/billing` pelanggan.
Pengumuman ke pelanggan tidak wajib; bila ingin: "Langganan tahunan Anda diperpanjang beberapa hari agar tepat satu tahun kalender."

## Keputusan Kecil Selama Eksekusi
- Skrip (bukan migrasi otomatis): koreksi menyentuh hak pelanggan nyata, jadi harus lewat dry-run + review + perintah `--commit` yang disengaja, bukan ikut `db:migrate` saat deploy.
- Kandidat memakai rentang `end_at − start_at`, bukan `invoice_items.duration_days`, karena langganan buatan admin (tanpa invoice item) juga perlu terjangkau; tanggal kustom admin yang kebetulan ≈360 hari akan tampil di dry-run untuk direview.
- Hanya menambah: bila hasil koreksi tidak lebih lambat dari `end_at` lama, baris dilewati.

## Ringkasan Hasil
6 tes baru lulus; dry-run diuji di DB dev (daftar tampil benar, data dev tidak diubah). Typecheck bersih.

## Known Limitations
- Belum dijalankan di production. Langganan tahunan yang sudah berakhir sebelum koreksi tidak diganti rugi (di luar scope).

## Checklist Sebelum Ditutup (sesuai SOP)
- [x] Type check nol error
- [x] Security review (manual): tanpa endpoint baru; skrip CLI dengan akses DB server; default dry-run; transaksi + row lock + validasi ulang; hanya menambah masa aktif; audit log per baris
- [x] Temuan Medium/Low dicatat bila ditunda (tidak ada)
- [x] `docs/PROGRESS.md` diupdate
