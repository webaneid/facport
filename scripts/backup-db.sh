#!/bin/bash
# scripts/backup-db.sh
# Dijalankan via cron DI SERVER (bukan CI) — supaya backup tidak bergantung
# pada GitHub Actions/internet-nya GitHub, cuma bergantung server sendiri
# hidup. Lihat setup lengkap di docs/deployment-server-setup.md bagian
# "Setup Backup Otomatis".
#
# Backup 2 hal: Postgres (pg_dump) dan MinIO (mirror bucket via mc/rclone).
# Upload ke Google Drive lewat rclone remote bernama "gdrive" (dikonfigurasi
# sekali di awal, lihat docs). WAJIB beda tempat dari VPS — backup yang cuma
# nginap di VPS yang sama itu bukan backup sungguhan.

set -euo pipefail

# ── Konfigurasi (sesuaikan atau override lewat environment) ──
COMPOSE_FILE="${COMPOSE_FILE:-/opt/app/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-/opt/app/.env.production}"
BACKUP_DIR="${BACKUP_DIR:-/opt/app/backups}"
RCLONE_REMOTE="${RCLONE_REMOTE:-gdrive:backups/$(basename "$(dirname "$COMPOSE_FILE")")}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DATE=$(date +%F_%H%M)

mkdir -p "$BACKUP_DIR"
source "$ENV_FILE"

echo "▶ [$DATE] Mulai backup..."

# ── 1. Postgres ──
DUMP_FILE="$BACKUP_DIR/postgres_${DATE}.sql.gz"
docker compose -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$DUMP_FILE"
echo "  ✓ Postgres dump: $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))"

# ── 2. MinIO (mirror bucket ke folder lokal, lalu di-tar) ──
# Pakai mc (MinIO client) supaya konsisten object-level, bukan raw copy volume
# (raw copy volume Docker berisiko korup kalau ada write bersamaan).
MINIO_DUMP="$BACKUP_DIR/minio_${DATE}.tar.gz"
if command -v mc >/dev/null 2>&1; then
  mc alias set backup-src "http://localhost:${MINIO_PORT:-9000}" \
    "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY" >/dev/null
  TMP_MIRROR=$(mktemp -d)
  mc mirror --quiet backup-src "$TMP_MIRROR"
  tar -czf "$MINIO_DUMP" -C "$TMP_MIRROR" .
  rm -rf "$TMP_MIRROR"
  echo "  ✓ MinIO mirror: $MINIO_DUMP ($(du -h "$MINIO_DUMP" | cut -f1))"
else
  echo "  ⚠ 'mc' (MinIO client) tidak ditemukan di server, skip backup MinIO."
  echo "    Install: https://min.io/docs/minio/linux/reference/minio-mc.html"
fi

# ── 3. Upload ke Google Drive ──
rclone copy "$BACKUP_DIR" "$RCLONE_REMOTE" \
  --include "*_${DATE}*" --create-empty-src-dirs
echo "  ✓ Upload ke $RCLONE_REMOTE selesai"

# ── 4. Retensi — hapus backup LOKAL & REMOTE yang lebih tua dari RETENTION_DAYS ──
find "$BACKUP_DIR" -type f -mtime "+${RETENTION_DAYS}" -delete
rclone delete "$RCLONE_REMOTE" --min-age "${RETENTION_DAYS}d" 2>/dev/null || true
echo "  ✓ Retensi diterapkan (>${RETENTION_DAYS} hari dihapus, lokal & remote)"

echo "✅ [$DATE] Backup selesai."

# Opsional: ping dead-man's-switch monitoring (mis. healthchecks.io) di sini
# supaya kamu DAPAT NOTIFIKASI kalau cron berhenti jalan diam-diam, bukan cuma
# tahu backup gagal kalau lihat log manual:
# curl -fsS -m 10 --retry 3 "$HEALTHCHECK_PING_URL" || true
