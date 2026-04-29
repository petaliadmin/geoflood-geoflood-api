#!/usr/bin/env bash
set -euo pipefail

# Backup hebdomadaire de la DB Postgres tournant dans Docker sur EC2, upload S3.
# A executer sur l'EC2 (cron). Necessite : awscli installe + role IAM ou creds.
#
# Variables d'environnement (mettre dans /etc/geoflood-backup.env) :
#   S3_BUCKET           ex: geoflood-db-backups
#   S3_PREFIX           ex: prod/postgres   (def: postgres)
#   AWS_REGION          ex: eu-west-3
#
#   CONTAINER           def: geoflood-postgres
#   DB_USER             def: geoflood
#   DB_NAME             def: geoflood_db
#
#   RETENTION_DAYS      def: 90 (suppression des dumps S3 plus vieux)
#   LOCAL_TMP_DIR       def: /tmp

: "${S3_BUCKET:?S3_BUCKET manquant}"
: "${AWS_REGION:?AWS_REGION manquant}"

S3_PREFIX="${S3_PREFIX:-postgres}"
CONTAINER="${CONTAINER:-geoflood-postgres}"
DB_USER="${DB_USER:-geoflood}"
DB_NAME="${DB_NAME:-geoflood_db}"
RETENTION_DAYS="${RETENTION_DAYS:-90}"
LOCAL_TMP_DIR="${LOCAL_TMP_DIR:-/tmp}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_NAME="${DB_NAME}-${STAMP}.dump"
LOCAL_PATH="${LOCAL_TMP_DIR}/${DUMP_NAME}"
S3_KEY="s3://${S3_BUCKET}/${S3_PREFIX}/${DUMP_NAME}"

log() { echo "[$(date -u +%FT%TZ)] $*"; }

log "Dump ${DB_NAME} depuis ${CONTAINER}"
docker exec -t "$CONTAINER" \
  pg_dump -U "$DB_USER" -d "$DB_NAME" -F c -b -f "/tmp/${DUMP_NAME}"
docker cp "${CONTAINER}:/tmp/${DUMP_NAME}" "$LOCAL_PATH"
docker exec -t "$CONTAINER" rm -f "/tmp/${DUMP_NAME}"

log "Upload vers ${S3_KEY}"
aws s3 cp --region "$AWS_REGION" "$LOCAL_PATH" "$S3_KEY" \
  --storage-class STANDARD_IA \
  --metadata "db=${DB_NAME},container=${CONTAINER}"

log "Cleanup local"
rm -f "$LOCAL_PATH"

log "Retention : suppression S3 plus de ${RETENTION_DAYS}j"
CUTOFF=$(date -u -d "${RETENTION_DAYS} days ago" +%s)
aws s3 ls --region "$AWS_REGION" "s3://${S3_BUCKET}/${S3_PREFIX}/" | while read -r line; do
  file_date=$(echo "$line" | awk '{print $1" "$2}')
  file_name=$(echo "$line" | awk '{print $4}')
  [ -z "$file_name" ] && continue
  file_ts=$(date -u -d "$file_date" +%s 2>/dev/null || echo 0)
  if [ "$file_ts" -lt "$CUTOFF" ] && [ "$file_ts" -gt 0 ]; then
    log "  delete s3://${S3_BUCKET}/${S3_PREFIX}/${file_name}"
    aws s3 rm --region "$AWS_REGION" "s3://${S3_BUCKET}/${S3_PREFIX}/${file_name}"
  fi
done

log "OK"
