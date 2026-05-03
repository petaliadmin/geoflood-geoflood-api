# Migration manuelle DB locale → EC2

Guide pas-à-pas pour générer un dump PostgreSQL/PostGIS de la base locale `geoflood` (Docker, container `geoflood-postgres-dev`) et le restaurer sur l'instance EC2 (container `geoflood-postgres`, base `geoflood_db`).

## Pré-requis

- Docker actif en local avec le container `geoflood-postgres-dev` qui tourne (`docker compose -f docker-compose.dev.yml up -d postgres`)
- Accès SSH à l'EC2 (clé `.pem`, hostname/IP, user `ubuntu`)
- Sur EC2 : container `geoflood-postgres` qui tourne (lancé par `docker-compose.deploy.yml`)

Variables à adapter avant de lancer les commandes :

| Variable          | Valeur                |
|-------------------|-----------------------|
| `EC2_HOST`        | _IP ou DNS EC2_       |
| `SSH_KEY`         | _chemin de la clé .pem_ |
| `LOCAL_CONTAINER` | `geoflood-postgres-dev` |
| `LOCAL_DB`        | `geoflood`            |
| `REMOTE_CONTAINER`| `geoflood-postgres`   |
| `REMOTE_DB`       | `geoflood_db`         |
| `DB_USER`         | `geoflood`            |

---

## Étape 1 — Générer le dump local

Depuis Git Bash dans `C:\Developement\geoflood\geoflood-backend` :

```bash
TS=$(date -u +%Y%m%dT%H%M%SZ)
DUMP=backups/geoflood-${TS}.dump

mkdir -p backups

docker exec geoflood-postgres-dev \
  pg_dump -U geoflood -d geoflood -F c --no-owner --no-acl \
  > "$DUMP"

ls -lh "$DUMP"
```

Le dump est au format **custom** (`-F c`) — il sera restauré avec `pg_restore`.
Taille typique attendue : ~5–6 MB (boundaries + zones + alerts + users).

### Vérifier le dump avant transfert

```bash
docker run --rm -i postgis/postgis:15-3.3 \
  pg_restore -l < "$DUMP" | head -40
```

Tu dois voir les tables `administrative_boundaries`, `alerts`, `zones`, `users`, `typeorm_migrations`, etc.

---

## Étape 2 — Transférer le dump sur EC2

```bash
scp -i ~/.ssh/geoflood.pem \
  "$DUMP" \
  ubuntu@<EC2_HOST>:/home/ubuntu/geoflood-${TS}.dump
```

Remplace `<EC2_HOST>` et le chemin de la clé par tes valeurs.

---

## Étape 3 — Se connecter à EC2

```bash
ssh -i ~/.ssh/geoflood.pem ubuntu@<EC2_HOST>
```

Toutes les commandes qui suivent s'exécutent **sur EC2**.

### 3.1 — Vérifier le container postgres

```bash
docker ps --format '{{.Names}}\t{{.Status}}' | grep postgres
```

Tu dois voir `geoflood-postgres` en status `Up ... (healthy)`.

### 3.2 — (optionnel) Sauvegarder la base existante avant DROP

> ⚠️ Étape recommandée si la base EC2 contient déjà des données prod que tu veux pouvoir restaurer en cas de pépin.

```bash
TS=$(date -u +%Y%m%dT%H%M%SZ)
docker exec geoflood-postgres \
  pg_dump -U geoflood -d geoflood_db -F c --no-owner --no-acl \
  > /home/ubuntu/geoflood_db-backup-${TS}.dump

ls -lh /home/ubuntu/geoflood_db-backup-${TS}.dump
```

### 3.3 — Copier le dump dans le container

```bash
DUMP_FILE=$(ls -t /home/ubuntu/geoflood-*.dump | head -1)
echo "Dump à restaurer : $DUMP_FILE"

docker cp "$DUMP_FILE" geoflood-postgres:/tmp/geoflood.dump
```

### 3.4 — DROP + CREATE de la base cible

> ⚠️ **Cette étape supprime toutes les données existantes de `geoflood_db`.**
> Assure-toi d'avoir fait l'étape 3.2 si nécessaire.

```bash
docker exec -i geoflood-postgres \
  psql -U geoflood -d postgres -c "DROP DATABASE IF EXISTS geoflood_db;"

docker exec -i geoflood-postgres \
  psql -U geoflood -d postgres -c "CREATE DATABASE geoflood_db OWNER geoflood;"

docker exec -i geoflood-postgres \
  psql -U geoflood -d geoflood_db -c "CREATE EXTENSION IF NOT EXISTS postgis;"
```

### 3.5 — Restore

```bash
docker exec -i geoflood-postgres \
  pg_restore -U geoflood -d geoflood_db \
  --no-owner --no-acl -j 2 -v /tmp/geoflood.dump
```

> Le flag `-j 2` parallélise sur 2 workers. `-v` donne le détail.
> Quelques warnings sur les extensions (`postgis` déjà présente) sont normaux.

### 3.6 — Vérifications

```bash
# Compter les boundaries
docker exec -i geoflood-postgres psql -U geoflood -d geoflood_db -c \
  "SELECT level, COUNT(*) FROM administrative_boundaries GROUP BY level ORDER BY level;"

# Attendu :
#  region     : 14
#  department : 46
#  commune    : 552

# Lister les migrations appliquées
docker exec -i geoflood-postgres psql -U geoflood -d geoflood_db -c \
  "SELECT id, name FROM typeorm_migrations ORDER BY id;"

# Attendu (au moins) :
#  - AddAlertValidation1714720000000
#  - CreateAdministrativeBoundaries1714720100000

# Compter zones, alerts, users (sanity check)
docker exec -i geoflood-postgres psql -U geoflood -d geoflood_db -c \
  "SELECT 'zones' AS t, COUNT(*) FROM zones
   UNION ALL SELECT 'alerts', COUNT(*) FROM alerts
   UNION ALL SELECT 'users', COUNT(*) FROM users;"
```

### 3.7 — Cleanup

```bash
docker exec -i geoflood-postgres rm -f /tmp/geoflood.dump
rm -f /home/ubuntu/geoflood-*.dump
```

> Garde le backup de l'étape 3.2 (`geoflood_db-backup-*.dump`) au moins 24 h, le temps de valider que l'app tourne correctement.

---

## Étape 4 — Redémarrer l'API

Toujours sur EC2, dans le dossier de déploiement :

```bash
cd /path/to/geoflood-backend   # adapter

# Vérifier que DATABASE_URL pointe bien vers geoflood_db
grep DATABASE_URL .env
# Attendu : DATABASE_URL=postgresql://geoflood:<pwd>@postgres:5432/geoflood_db

docker compose -f docker-compose.deploy.yml restart api

# Suivre les logs au démarrage
docker compose -f docker-compose.deploy.yml logs -f api
```

> Si l'app tente de relancer les migrations au boot et qu'elles existent déjà dans `typeorm_migrations`, elles seront ignorées. Si TypeORM refuse de démarrer à cause d'une divergence de schéma, c'est qu'`synchronize: true` est activé en prod — à désactiver dans `app.module.ts` pour la prod.

---

## Étape 5 — Validation fonctionnelle (smoke tests)

Depuis n'importe où, contre l'API publique :

```bash
# Health
curl -s https://<EC2_HOST>/api/health | jq

# Boundaries — régions
curl -s "https://<EC2_HOST>/api/admin-boundaries?level=region" | jq '. | length'
# Attendu : 14

# Boundaries — recherche par point (Dakar centre)
curl -s "https://<EC2_HOST>/api/admin-boundaries/at?lat=14.7167&lng=-17.4677" | jq
```

---

## Rollback rapide

Si quelque chose tourne mal après le restore et que tu as fait l'étape 3.2 :

```bash
# Sur EC2
docker cp /home/ubuntu/geoflood_db-backup-<TS>.dump \
  geoflood-postgres:/tmp/rollback.dump

docker exec -i geoflood-postgres psql -U geoflood -d postgres -c \
  "DROP DATABASE IF EXISTS geoflood_db;"
docker exec -i geoflood-postgres psql -U geoflood -d postgres -c \
  "CREATE DATABASE geoflood_db OWNER geoflood;"
docker exec -i geoflood-postgres psql -U geoflood -d geoflood_db -c \
  "CREATE EXTENSION IF NOT EXISTS postgis;"

docker exec -i geoflood-postgres \
  pg_restore -U geoflood -d geoflood_db --no-owner --no-acl -j 2 -v /tmp/rollback.dump

docker compose -f docker-compose.deploy.yml restart api
```

---

## Annexe — Pourquoi pas le script `scripts/migrate-to-ec2.sh` ?

Le script automatise les étapes 1–3 d'un coup, mais nécessite que les valeurs `LOCAL_CONTAINER`, `LOCAL_DB_NAME`, `REMOTE_DB_NAME` et `RECREATE_DB` soient passées en variables d'environnement. Si tu préfères tout automatiser :

```bash
EC2_HOST=<host> \
SSH_KEY=~/.ssh/geoflood.pem \
EC2_USER=ubuntu \
LOCAL_CONTAINER=geoflood-postgres-dev \
LOCAL_DB_USER=geoflood \
LOCAL_DB_NAME=geoflood \
REMOTE_CONTAINER=geoflood-postgres \
REMOTE_DB_USER=geoflood \
REMOTE_DB_NAME=geoflood_db \
RECREATE_DB=true \
./scripts/migrate-to-ec2.sh
```

Le mode manuel décrit dans ce guide est préférable pour une **première migration** car il permet de valider chaque étape (notamment le backup pré-DROP en 3.2) avant de continuer.
