# Fase 145 — Cutover Koneksi Accurate ke Production (Carry-over, Pemberitahuan, Runbook, Kontrak)

**Status:** In Progress (cutover dirilis sebagai v2.7.0 pada 2026-09-22; tersisa verifikasi browser, pengumuman pasca, pemantauan, dan kontrak)
**Mulai:** 2026-09-22
**Selesai:** —

> **AMANDEMEN 2026-09-22:** user memutuskan PUTUS TOTAL (tanpa carry-over/pengumuman T-3). Task T1–T3 (skrip carry-over & notify) **DIBATALKAN**;
> digantikan migrasi `0030_putus_total_koneksi_lama` + guard job refresh + `migrated` dari pointer lama (selesai, lihat ADR-0037 #11). Sisa fase:
> runbook (T5 disederhanakan), pra-cek/backup, deploy, verifikasi, pengumuman pasca, kontrak (T11).

## Tujuan
Merilis Fase 143+144 ke production TANPA memutus customer yang koneksinya masih hidup: koneksi lama yang hidup dipindahkan ke
model baru (carry-over baca-saja), yang mati diarahkan sekali lewat popup, customer diberi tahu lebih dulu, dan ada rollback
yang jelas. Rancangan lengkap (strategi, skrip, runbook, SQL pack, rollback, narasi, risiko):
`docs/architecture/architecture-accurate-cutover.md`. Melengkapi ADR-0037.

## Scope (task)
Bagian A — kode & dokumen (dikerjakan di `develop`, tanpa rilis):
- [~] DIBATALKAN T1 `planCarryOver` (fungsi murni: keputusan `carry_over`/`skip_dead`/`skip_owner_mismatch`/`skip_account_conflict`/`skip_db_conflict`/`skip_db_ambiguous`/`skip_error`) + tes unit menyeluruh
- [~] DIBATALKAN T2 `db:carry-over-accurate` (dry-run default, `--apply`, transaksi per koneksi, panggilan Accurate baca-saja lewat rate limiter, keluaran tanpa token & email disamarkan) + tes integrasi dengan mock Accurate & DB
- [~] DIBATALKAN T3 `db:notify-accurate-cutover` (`--phase pre|post`, dry-run default, in-app + email, idempotent per user+fase) + tes
- [ ] T4 SQL pack verifikasi pasca-deploy (perintah `docker exec ... psql -c "..."` siap tempel, satu per pesan) di dokumen runbook
- [ ] T5 Runbook T-3 → T0 → T+7 final (perintah persis, urutan, pra-cek, kriteria lanjut/berhenti) + jalur `db:migrate` manual bila gagal
- [ ] T6 Uji gladi di DB dev dengan data hasil-meniru production (koneksi hidup/mati/multi-Data-Usaha/transfer) — carry-over dry-run & apply, lalu gerbang UI benar
- [ ] T7 Tinjau keamanan (skrip menyentuh token customer: baca-saja, tidak dicetak/disimpan, dry-run default)
Bagian B — pelaksanaan production (HANYA atas perintah "rilis" eksplisit; dilakukan user lewat SSH, Claude memberi perintah persis):
- [ ] T8 Pra-cek (RESEND_API_KEY, batch berjalan = 0, disk) + pengumuman T-3/T-1
- [ ] T9 Backup → rilis → deploy Full → migrasi → carry-over (dry-run lalu apply) → verifikasi (SQL pack + uji browser) → pemberitahuan pasca
- [ ] T10 Pemantauan T+1…T+7 (SQL pack harian, Sentry)
Bagian C — kontrak (rilis TERPISAH, ≥ T+7, perlu "rilis" eksplisit + backup):
- [ ] T11 Migrasi hapus `subscriptions.accurate_connection_id`, `accurate_connections.accurate_db_id/alias`, baris koneksi lama tak terpakai; buang endpoint tanpa pemakai; lessons-learned

## Keputusan yang dibutuhkan dari user (default yang disarankan)
1. **Carry-over memakai token customer secara BACA-SAJA** (`auth-info.do`, `approved-scope.do`; tanpa refresh/otorisasi baru) — disarankan YA.
   Alternatif: semua customer hubungkan ulang (tanpa skrip, tetapi yang hidup ikut terputus).
2. **Lead time pengumuman** — disarankan 3 hari + pengingat 1 hari; jendela deploy Minggu malam (jam sepi).
3. **Kanal** — email + in-app bila `RESEND_API_KEY` terisi di production; kalau tidak, in-app + kontak langsung (9 customer).

## Di luar scope
Zero-downtime migration; UI admin baru; otomatisasi customer multi-akun-Accurate.

## Keputusan Kecil (isi saat eksekusi)
- **2026-09-22 — dirilis `v2.7.0`** (PR #68). Runbook Full: backup `postgres_2026-09-21_2210.sql.gz` (MinIO dilewati: `mc` tidak terpasang di server, masalah lama) → pra-cek batch berjalan = 0 → pull → up → `db:migrate` (0027–0030, sukses) → verifikasi: koneksi lama belum dicabut = 0, Data Usaha masih menunjuk koneksi = 0 → `web/api/worker` semua `:v2.7.0`, health ok.
- **CI menolak rilis pertama** (gitleaks): dua nilai UUID di tes galat token adalah refresh token DEV yang sudah tidak berlaku; diganti penanda palsu dan dua fingerprint commit lama diabaikan secara sempit di `.gitleaksignore` (riwayat bersama tidak ditulis ulang).
- Rilis sebelumnya `v2.6.1` (3 modul + fix Fase 140) dilepas lewat branch `release/fase-137-140` agar cutover tidak ikut lebih awal.


## Known Limitations

## Ringkasan Hasil
