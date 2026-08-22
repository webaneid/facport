#!/bin/bash
# scripts/restore-db.sh
# Restore Postgres dari backup Google Drive. Dijalankan MANUAL saja
# (tidak pernah lewat cron/CI) — ini operasi destruktif, WAJIB ada manusia
# yang sadar sebelum menimpa data production.
#
# Pemakaian: ./scripts/restore-db.sh [nama-file-backup.sql.gz]
#            (kosongkan argumen untuk pakai backup TERBARU otomatis)

set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-/opt/app/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-/opt/app/.env.production}"
RCLONE_REMOTE="${RCLONE_REMOTE:-gdrive:backups/$(basename "$(dirname "$COMPOSE_FILE")")}"
TMP_DIR=$(mktemp -d)
source "$ENV_FILE"

if [ -n "${1:-}" ]; then
  BACKUP_NAME="$1"
else
  echo "▶ Cari backup Postgres terbaru di $RCLONE_REMOTE ..."
  BACKUP_NAME=$(rclone lsf "$RCLONE_REMOTE" --include "postgres_*.sql.gz" | sort | tail -1)
fi

if [ -z "$BACKUP_NAME" ]; then
  echo "❌ Tidak ada file backup ditemukan." >&2
  exit 1
fi

echo "▶ Download $BACKUP_NAME ..."
rclone copy "$RCLONE_REMOTE/$BACKUP_NAME" "$TMP_DIR"

echo ""
echo "⚠️  KONFIRMASI — Ini akan MENIMPA seluruh database '$DB_NAME' saat ini"
echo "    dengan isi dari: $BACKUP_NAME"
echo "    Data yang ada SEKARANG (kalau berbeda dari backup ini) akan HILANG."
read -rp "Ketik nama database ('$DB_NAME') untuk konfirmasi lanjut: " CONFIRM
if [ "$CONFIRM" != "$DB_NAME" ]; then
  echo "Dibatalkan — input tidak cocok."
  rm -rf "$TMP_DIR"
  exit 1
fi

echo "▶ Restore berjalan..."
gunzip -c "$TMP_DIR/$BACKUP_NAME" | \
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
  psql -U "$DB_USER" -d "$DB_NAME"

rm -rf "$TMP_DIR"
echo "✅ Restore selesai. Verifikasi data & restart apps/api kalau perlu:"
echo "   docker compose -f $COMPOSE_FILE restart api"
