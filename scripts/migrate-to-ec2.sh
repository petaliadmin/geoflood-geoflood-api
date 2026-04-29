#!/usr/bin/env bash
set -euo pipefail

# Migration de la base PostgreSQL/PostGIS locale (Docker) vers l'instance Docker sur EC2.
#
# Variables d'environnement requises :
#   EC2_HOST            ex: 51.x.x.x ou ec2-xx.eu-west-3.compute.amazonaws.com
#   SSH_KEY             chemin vers la cle .pem (ex: ~/.ssh/geoflood.pem)
#   EC2_USER            par defaut: ubuntu
#
#   LOCAL_CONTAINER     conteneur postgres local (def: geoflood-postgres)
#   LOCAL_DB_USER       def: geoflood
#   LOCAL_DB_NAME       def: geoflood_db
#
#   REMOTE_CONTAINER    conteneur postgres EC2 (def: geoflood-postgres)
#   REMOTE_DB_USER      def: geoflood
#   REMOTE_DB_NAME      def: geoflood_db
#
#   RECREATE_DB         "true" pour DROP/CREATE la DB cible avant restore (def: false)
#
# Usage : ./scripts/migrate-to-ec2.sh

: "${EC2_HOST:?EC2_HOST manquant}"
: "${SSH_KEY:?SSH_KEY manquant}"
EC2_USER="${EC2_USER:-ubuntu}"

LOCAL_CONTAINER="${LOCAL_CONTAINER:-geoflood-postgres}"
LOCAL_DB_USER="${LOCAL_DB_USER:-geoflood}"
LOCAL_DB_NAME="${LOCAL_DB_NAME:-geoflood_db}"

REMOTE_CONTAINER="${REMOTE_CONTAINER:-geoflood-postgres}"
REMOTE_DB_USER="${REMOTE_DB_USER:-geoflood}"
REMOTE_DB_NAME="${REMOTE_DB_NAME:-geoflood_db}"

RECREATE_DB="${RECREATE_DB:-false}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_NAME="geoflood-${STAMP}.dump"
LOCAL_DUMP_DIR="$(pwd)/backups"
mkdir -p "$LOCAL_DUMP_DIR"
LOCAL_DUMP_PATH="${LOCAL_DUMP_DIR}/${DUMP_NAME}"

SSH="ssh -i ${SSH_KEY} -o StrictHostKeyChecking=accept-new ${EC2_USER}@${EC2_HOST}"
SCP="scp -i ${SSH_KEY} -o StrictHostKeyChecking=accept-new"

# Note: les chemins dans le conteneur sont prefixes par // pour empecher
# Git Bash (MSYS) de les convertir en chemins Windows.
echo "==> 1/4 Dump local depuis ${LOCAL_CONTAINER} (${LOCAL_DB_NAME})"
docker exec -t "$LOCAL_CONTAINER" \
  pg_dump -U "$LOCAL_DB_USER" -d "$LOCAL_DB_NAME" -F c -b -f "//tmp/${DUMP_NAME}"
docker cp "${LOCAL_CONTAINER}:/tmp/${DUMP_NAME}" "$LOCAL_DUMP_PATH"
docker exec -t "$LOCAL_CONTAINER" rm -f "//tmp/${DUMP_NAME}"
echo "    dump: $LOCAL_DUMP_PATH ($(du -h "$LOCAL_DUMP_PATH" | cut -f1))"

echo "==> 2/4 Transfert vers ${EC2_USER}@${EC2_HOST}"
$SCP "$LOCAL_DUMP_PATH" "${EC2_USER}@${EC2_HOST}:/home/${EC2_USER}/${DUMP_NAME}"

echo "==> 3/4 Copie du dump dans le conteneur ${REMOTE_CONTAINER}"
$SSH "docker cp /home/${EC2_USER}/${DUMP_NAME} ${REMOTE_CONTAINER}:/tmp/${DUMP_NAME}"

if [ "$RECREATE_DB" = "true" ]; then
  echo "==> 3b/4 Recreation de la DB ${REMOTE_DB_NAME}"
  $SSH "docker exec -i ${REMOTE_CONTAINER} psql -U ${REMOTE_DB_USER} -d postgres -c \"DROP DATABASE IF EXISTS ${REMOTE_DB_NAME};\""
  $SSH "docker exec -i ${REMOTE_CONTAINER} psql -U ${REMOTE_DB_USER} -d postgres -c \"CREATE DATABASE ${REMOTE_DB_NAME};\""
  $SSH "docker exec -i ${REMOTE_CONTAINER} psql -U ${REMOTE_DB_USER} -d ${REMOTE_DB_NAME} -c \"CREATE EXTENSION IF NOT EXISTS postgis;\""
fi

echo "==> 4/4 pg_restore dans ${REMOTE_DB_NAME}"
$SSH "docker exec -i ${REMOTE_CONTAINER} pg_restore -U ${REMOTE_DB_USER} -d ${REMOTE_DB_NAME} --no-owner --no-acl -v /tmp/${DUMP_NAME}"
$SSH "docker exec -i ${REMOTE_CONTAINER} rm -f /tmp/${DUMP_NAME}"
$SSH "rm -f /home/${EC2_USER}/${DUMP_NAME}"

echo "==> Termine."
