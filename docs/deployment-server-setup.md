# Deployment Server Setup — VPS Hostinger

> Ini RUNBOOK one-time (dikerjakan manual sekali di awal, atau tiap ganti
> server), bukan sesuatu yang Claude jalankan otomatis. Beda dari
> `docs/architecture/architecture-deployment.md` yang jelasin KONSEP
> alurnya — ini langkah CONCRETE di VPS Hostinger kamu.

## 1. Install Docker di VPS
SSH ke VPS Hostinger kamu, lalu:
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# logout-login lagi biar grup docker kepakai
```

## 2. Siapkan folder deploy
```bash
sudo mkdir -p /opt/app
sudo chown $USER:$USER /opt/app
cd /opt/app
```

## 3. Copy file yang dibutuhkan ke server (SEKALI ini aja manual, selanjutnya otomatis lewat CI)
Dari komputer lokal kamu:
```bash
scp docker-compose.prod.yml Caddyfile user@ip-vps:/opt/app/
scp .env.production.example user@ip-vps:/opt/app/.env.production
```
Lalu di server, edit `.env.production` isi nilai asli (password DB, MinIO
keys, JWT secret, domain) — JANGAN pakai nilai default/contoh.

## 4. Buka firewall port yang perlu
```bash
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP (buat Caddy redirect ke HTTPS)
sudo ufw allow 443   # HTTPS
sudo ufw enable
```
Port Postgres (5432) dan MinIO (9000/9001) **TIDAK** perlu dibuka ke publik —
itu sengaja cuma bisa diakses dari dalam Docker network internal (lihat
komentar di `docker-compose.prod.yml`).

## 5. Arahkan domain ke VPS
Di DNS provider domain kamu, buat A record:
```
app.namadomain.com   → IP VPS Hostinger
api.namadomain.com   → IP VPS Hostinger
```
Caddy otomatis urus HTTPS begitu domain ini resolve ke VPS dan container jalan.

## 6. Setup GitHub Secrets (biar CI bisa SSH deploy otomatis)
Generate SSH key khusus buat deploy (jangan pakai key pribadi kamu):
```bash
ssh-keygen -t ed25519 -f deploy_key -N ""
# deploy_key.pub → tambahkan ke ~/.ssh/authorized_keys di VPS
# deploy_key (private) → masukin ke GitHub repo secret
```
Di GitHub repo → Settings → Secrets and variables → Actions, tambahkan:

| Secret            | Isi                                  | Dipakai di |
|--------------------|----------------------------------------|--------------|
| `SERVER_HOST`      | IP VPS Hostinger kamu                  | `deploy.yml`, `deploy-staging.yml` |
| `SERVER_USER`      | user SSH (biasanya `root` di Hostinger, tapi lebih aman bikin user baru non-root) | `deploy.yml`, `deploy-staging.yml` |
| `SERVER_SSH_KEY`   | isi file `deploy_key` (private key)    | `deploy.yml`, `deploy-staging.yml` |

> `deploy-staging.yml` (branch `develop`) pakai secret **yang sama** dengan
> production — sama-sama SSH ke VPS yang sama, cuma beda compose file/project
> name. Tidak perlu bikin secret baru khusus staging kecuali kamu memang
> pisah VPS untuk staging (lihat catatan di
> `docs/decisions/adr-0003-staging-environment.md`).

## 7. First deploy (manual sekali, buat mastiin semua bener sebelum serahin ke CI)
```bash
cd /opt/app
docker compose -f docker-compose.prod.yml --env-file .env.production pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
docker compose -f docker-compose.prod.yml ps   # pastikan semua "healthy"/"running"
```

## 8. Setelah ini, semua otomatis
Push ke `main` → `release.yml` bikin versi baru → `deploy.yml` otomatis
SSH ke VPS dan `docker compose pull && up -d`. Kamu nggak perlu SSH manual lagi
kecuali buat maintenance/rollback.

## Rollback Manual (kalau perlu cepat, sebelum CI sempat jalan lagi)
```bash
ssh user@ip-vps
cd /opt/app
IMAGE_TAG=v0.2.9 docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

## Kalau Nanti Pindah Provider (bukan Hostinger lagi)
Setup ini **portable** — semua langkah di atas cuma butuh "VPS dengan SSH +
Docker", nggak ada yang Hostinger-spesifik. Cukup ulang langkah 1-6 di server
baru, update `SERVER_HOST` secret, dan arahkan DNS ke IP baru.

## 9. Setup Staging Environment
> Konsep & rasional lengkap → `docs/decisions/adr-0003-staging-environment.md`.
> Ini langkah CONCRETE menjalankannya di VPS yang sama dengan production.

```bash
# Di VPS, sekali saja — bikin network shared supaya Caddy production
# bisa reverse-proxy ke container staging juga:
docker network create edge

# Copy env staging (isi nilai asli, JANGAN pakai kredensial production):
scp .env.staging.example user@ip-vps:/opt/app/.env.staging
# lalu edit .env.staging di server, isi nilai asli

# First deploy staging manual (setelahnya otomatis lewat deploy-staging.yml
# tiap push ke branch develop):
cd /opt/app
docker compose -f docker-compose.staging.yml -p app-staging \
  --env-file .env.staging pull
docker compose -f docker-compose.staging.yml -p app-staging \
  --env-file .env.staging up -d
```

Arahkan DNS tambahan (selain domain production di langkah 5):
```
app-staging.namadomain.com   → IP VPS (sama dengan production)
api-staging.namadomain.com   → IP VPS (sama dengan production)
```
Caddy production otomatis urus HTTPS untuk domain staging ini juga begitu
DNS resolve (lihat blok tambahan di `Caddyfile`) — **restart Caddy production**
setelah nambah domain baru: `docker compose -f docker-compose.prod.yml restart caddy`.

## 10. Setup Backup Otomatis (Google Drive)
> Detail lengkap & rasional → `docs/architecture/architecture-backup.md`.

```bash
# 1. Install rclone & mc (MinIO client) di VPS:
curl https://rclone.org/install.sh | sudo bash
curl https://dl.min.io/client/mc/release/linux-amd64/mc -o /usr/local/bin/mc
chmod +x /usr/local/bin/mc

# 2. rclone config Google Drive HARUS dibuat di KOMPUTER LOKAL dulu (butuh
#    browser untuk OAuth), baru di-copy ke sini — lihat langkah lengkap di
#    docs/architecture/architecture-backup.md:
scp ~/.config/rclone/rclone.conf user@ip-vps:~/.config/rclone/rclone.conf

# 3. Jadwalkan cron (backup harian jam 2 pagi):
crontab -e
# tambahkan baris:
# 0 2 * * * /opt/app/scripts/backup-db.sh >> /var/log/app-backup.log 2>&1
```

## Backup — jangan lupa cek berkala
Backup sudah otomatis lewat `scripts/backup-db.sh` (langkah 10 di atas) —
tapi **cron yang berhenti jalan diam-diam** itu risiko nyata. Sesekali cek:
```bash
tail -20 /var/log/app-backup.log
rclone ls gdrive:backups/app
```
Detail retensi, restore, dan monitoring (disarankan dead-man's-switch) →
`docs/architecture/architecture-backup.md`.
