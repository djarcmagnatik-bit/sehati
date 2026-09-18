#!/bin/sh
# Nightly backup of the Sehati database and uploaded images, kept for KEEP_DAYS days.
#
#   sudo crontab -e   →   30 2 * * * /opt/sehati/backup.sh >> /opt/sehati/backups/backup.log 2>&1
#
# The copies stay on the same disk: also copy them off the server (download, or S3 with an IAM role).
set -eu

DIR=${BACKUP_DIR:-/opt/sehati/backups}
KEEP_DAYS=${KEEP_DAYS:-14}
STAMP=$(date +%Y%m%d-%H%M)
mkdir -p "$DIR"
chmod 700 "$DIR"

# Custom format: compressed, restorable table by table with pg_restore.
docker exec sehati-db pg_dump -U sehati -d sehati --format=custom > "$DIR/db-$STAMP.dump.partial"
mv "$DIR/db-$STAMP.dump.partial" "$DIR/db-$STAMP.dump"

docker run --rm -v sehati_media:/media:ro -v "$DIR":/backup busybox:1.37 \
  tar czf "/backup/media-$STAMP.tgz" -C /media .

find "$DIR" -type f \( -name 'db-*.dump' -o -name 'media-*.tgz' \) -mtime +"$KEEP_DAYS" -delete
echo "$(date -Iseconds) backup ok: db-$STAMP.dump media-$STAMP.tgz"
