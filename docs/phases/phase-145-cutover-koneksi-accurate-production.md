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

## Scope (task) — status per 2026-09-22 (legenda: `[x]` selesai · `[ ]` belum · `[~]` dibatalkan)
Bagian A — kode & dokumen:
- [~] T1 `planCarryOver` — DIBATALKAN (putus total, ADR-0037 #11)
- [~] T2 `db:carry-over-accurate` — DIBATALKAN
- [~] T3 `db:notify-accurate-cutover` — DIBATALKAN (pengumuman lewat menu Pengumuman admin)
- [ ] T4 SQL pack verifikasi/pemantauan harian — SEBAGIAN: dua pemeriksaan pasca-migrasi sudah dipakai saat deploy; paket pemantauan T+1…T+7 belum dibuat
- [x] T5 Runbook (disederhanakan menjadi putus total; dipakai saat deploy `v2.7.0`)
- [~] T6 Gladi carry-over di DB dev — DIBATALKAN; pengganti: migrasi 0030 + tes (`putus-total-0030.test.ts`) dan uji UI penuh di dev dengan Accurate asli
- [~] T7 Tinjau keamanan skrip token customer — DIBATALKAN (tidak ada skrip); audit keamanan Fase 143 sudah dilakukan terpisah
- [x] Pengganti yang dikerjakan: migrasi `0030_putus_total_koneksi_lama`, job refresh hanya koneksi berakun, narasi `migrated` dari pointer lama
Bagian B — pelaksanaan production:
- [x] T8a Pra-cek (batch berjalan = 0, backup `postgres_2026-09-21_2210.sql.gz`)
- [ ] T8b Pengumuman ke customer (menu Pengumuman admin; email bila `RESEND_API_KEY` terisi) — BELUM
- [x] T9a Rilis `v2.7.0` → deploy Full → `db:migrate` (0027–0030) → verifikasi server (koneksi lama dicabut = 0, Data Usaha menunjuk koneksi = 0, image `web/api/worker` `:v2.7.0`, health ok)
- [ ] T9b Uji browser production (login pemilik → popup → hubungkan ulang → pilih database → "Terhubung") + cek `COOKIE_DOMAIN`/redirect URI production — BELUM
- [ ] T10 Pemantauan T+1…T+7 (SQL harian, Sentry) — BELUM
Bagian C — kontrak (rilis TERPISAH, ≥ T+7, perlu "rilis" eksplisit + backup):
- [ ] T11 Hapus `subscriptions.accurate_connection_id`, `accurate_connections.accurate_db_id/alias`, baris koneksi lama `revoked`; buang endpoint tanpa pemakai; lessons-learned — BELUM

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
