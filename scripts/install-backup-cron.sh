#!/usr/bin/env bash
set -euo pipefail

# A executer UNE FOIS sur l'EC2 (en sudo) pour installer le cron hebdomadaire.
# Prerequis : awscli installe et IAM role attache a l'EC2 (ou ~/.aws/credentials).
#
# Edite /etc/geoflood-backup.env avec tes valeurs avant le premier run.

REPO_DIR="${REPO_DIR:-/home/ubuntu/geoflood-backend}"
ENV_FILE="/etc/geoflood-backup.env"
CRON_FILE="/etc/cron.d/geoflood-backup"
LOG_FILE="/var/log/geoflood-backup.log"

if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<'EOF'
# /etc/geoflood-backup.env
S3_BUCKET=geoflood-db-backups
S3_PREFIX=prod/postgres
AWS_REGION=eu-west-3
CONTAINER=geoflood-postgres
DB_USER=geoflood
DB_NAME=geoflood_db
RETENTION_DAYS=90
EOF
  chmod 600 "$ENV_FILE"
  echo "Cree $ENV_FILE -- edite-le avant le premier run."
fi

# Cron : tous les dimanches a 03:17 UTC (minute non ronde pour eviter les pics).
cat > "$CRON_FILE" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
17 3 * * 0 ubuntu set -a; . ${ENV_FILE}; set +a; ${REPO_DIR}/scripts/backup-to-s3.sh >> ${LOG_FILE} 2>&1
EOF
chmod 644 "$CRON_FILE"
touch "$LOG_FILE"
chown ubuntu:ubuntu "$LOG_FILE"

echo "Cron installe : $CRON_FILE"
echo "Logs : $LOG_FILE"
echo "Test manuel : sudo -u ubuntu bash -c 'set -a; . ${ENV_FILE}; set +a; ${REPO_DIR}/scripts/backup-to-s3.sh'"
