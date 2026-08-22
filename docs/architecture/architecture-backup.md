# Architecture — Backup

## Prinsip
Backup yang **cuma ada di VPS yang sama** dengan data aslinya bukan backup
sungguhan — kalau VPS kena serangan, disk corrupt, atau provider bermasalah,
backup ikut hilang bareng data asli. Backup WAJIB ada di tempat fisik/layanan
berbeda.

## Kenapa Google Drive (bukan S3/Backblaze/dst)
Dipilih karena preferensi tim (sudah punya akun Google Drive yang dipakai
sehari-hari, tidak perlu setup billing/provider baru). Trade-off yang perlu
disadari dibanding object storage S3-compatible (B2, S3, R2):
- ✅ Tidak ada biaya storage tambahan kalau masih di bawah kuota Drive yang
  sudah ada.
- ✅ Setup lebih cepat untuk skala kecil-menengah (tidak perlu bikin
  akses key/bucket policy).
- ❌ Tidak didesain untuk automation skala besar (rate limit API lebih ketat
  dibanding S3), tapi untuk backup harian 1 database ukuran kecil-menengah
  tidak masalah.
- ❌ Kalau nanti butuh restore cepat dalam skala besar/sering, S3-compatible
  lebih cocok. **Kalau kebutuhan berubah → revisit lewat ADR baru**, jangan
  diam-diam ganti tanpa dicatat (dampak ke `scripts/backup-db.sh` dan
  `scripts/restore-db.sh`, keduanya perlu diubah kalau ganti backend).

## Setup rclone ke Google Drive (SEKALI, manual, di komputer lokal)
`rclone` butuh autentikasi OAuth interaktif (buka browser) — ini **tidak bisa**
dilakukan langsung di VPS headless. Alurnya:

```bash
# 1. Di KOMPUTER LOKAL kamu (bukan di server):
rclone config
# > n (new remote) → name: gdrive → storage: Google Drive → ikuti wizard,
#   browser akan kebuka minta izin akses Google Drive kamu.

# 2. Setelah selesai, config tersimpan di:
#    ~/.config/rclone/rclone.conf   (Linux/Mac)

# 3. Copy config itu ke VPS (SEKALI ini aja manual):
scp ~/.config/rclone/rclone.conf user@ip-vps:~/.config/rclone/rclone.conf
```

Setelah ini, `rclone` di VPS bisa akses Google Drive **tanpa perlu login
ulang** — token refresh otomatis, cocok dipanggil dari cron non-interaktif.

> Install rclone di VPS: `curl https://rclone.org/install.sh | sudo bash`

## Apa yang Di-backup
1. **Postgres** — `pg_dump` terkompresi (`.sql.gz`), lewat `docker compose exec`
   (tidak perlu install `psql` di host, pakai yang ada di container).
2. **MinIO** — mirror object-level lewat `mc mirror` (MinIO client), bukan
   raw copy Docker volume (raw copy berisiko korup kalau ada write
   bersamaan saat backup jalan).

Detail implementasi → `scripts/backup-db.sh` (sudah jadi, tinggal jadwalkan).

## Jadwal (Cron di VPS)
```bash
# crontab -e di VPS, backup tiap hari jam 2 pagi
0 2 * * * /opt/app/scripts/backup-db.sh >> /var/log/app-backup.log 2>&1
```

## Retensi
Default **30 hari** (bisa diubah lewat env `RETENTION_DAYS` di
`scripts/backup-db.sh`) — file lokal DAN remote (Google Drive) yang lebih tua
otomatis dihapus, supaya tidak numpuk kuota tanpa batas selamanya.

## Restore
```bash
./scripts/restore-db.sh                    # pakai backup TERBARU otomatis
./scripts/restore-db.sh postgres_2026-08-17_0200.sql.gz   # pilih spesifik
```
Script minta konfirmasi eksplisit (ketik ulang nama database) sebelum
menimpa data — **ini operasi destruktif, tidak pernah dijalankan otomatis/CI**.

## Verifikasi Backup Beneran Jalan (jangan cuma percaya cron "kelihatannya" jalan)
- Cek log: `tail -f /var/log/app-backup.log`
- Cek isi remote: `rclone ls gdrive:backups/app`
- **Disarankan**: pakai dead-man's-switch monitoring gratis (mis.
  healthchecks.io free tier) — kirim ping tiap backup sukses, dan kamu dapat
  notifikasi otomatis kalau cron BERHENTI jalan diam-diam (bukan cuma tahu
  pas butuh restore dan ternyata backup terakhir sudah lama). Baris untuk ini
  sudah disiapkan (dikomentari) di akhir `scripts/backup-db.sh`.
- **Test restore minimal sekali** di lingkungan bukan production (mis. lokal)
  — backup yang belum pernah dicoba di-restore itu asumsi, bukan jaminan.

## Referensi
- `scripts/backup-db.sh`, `scripts/restore-db.sh`
- Setup lengkap step-by-step → `docs/deployment-server-setup.md`
