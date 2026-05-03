# Plan d'intégration des règles métiers — GeoFlood

> Sources des règles : zones inondables (connues) vs zones inondées (instant t),
> routes sûres, vérification terrain, photo satellite à chaque signalement,
> prédiction multi-paramètres.

---

## 1. Règles métiers cibles

| # | Règle | État actuel |
|---|-------|-------------|
| R1 | **Zones inondables** = connues, statiques (cartographie historique) | ✅ Existe — `FloodZoneEntity` (`flood_zones`) |
| R2 | **Zones inondées à l'instant t** = dynamiques, état courant (réalité terrain + capteurs) | ❌ Absent — `ReportEntity` ne stocke que des points, pas de géométries d'eau |
| R3 | **Routes sûres** = routing qui évite les zones **inondées (R2)**, pas R1 | ⚠️ Partiel — `routes.service` filtre sur `flood_zones.level=high` (R1), pas R2. Pas de moteur de routing réel |
| R4 | **Vérification terrain** = score basé sur **R1** (zones inondables) | ⚠️ Partiel — `terrain` module existe, score calculé en mock, pas de croisement PostGIS avec `flood_zones` |
| R5 | À chaque **signalement** d'un point → récupérer **photo satellite** de la zone à la date du signalement | ❌ Absent — aucun appel imagerie satellite |
| R6 | **Prédiction R1** basée sur : historique R1 + photos satellites + météo + drainage + occupation des sols + autres | ⚠️ Partiel — `predictions` appelle un service IA inexistant ; payload pauvre |

---

## 2. Architecture cible

```
┌────────────────┐    report (lat,lng,t)     ┌─────────────────┐
│  Mobile App    │ ────────────────────────▶ │  NestJS API     │
└────────────────┘                            │  reports.svc    │
                                              └────────┬────────┘
                                                       │ enqueue
                                                       ▼
                                              ┌─────────────────┐
                                              │  BullMQ Redis   │
                                              ├─────────────────┤
                                              │ satellite-fetch │  → Sentinel Hub / Copernicus
                                              │ flooded-detect  │  → ai-service /detect-water
                                              │ prediction-job  │  → ai-service /predict
                                              └────────┬────────┘
                                                       │ writes
                                                       ▼
                                              ┌─────────────────┐
                                              │ Postgres+PostGIS│
                                              │  flood_zones    │  R1
                                              │  flooded_areas  │  R2 (NEW)
                                              │  satellite_imgs │  (NEW)
                                              │  reports        │  +geom
                                              │  predictions    │  +features
                                              └─────────────────┘
```

---

## 3. Travaux par couche

### 3.1 Schéma DB (PostGIS) — migration TypeORM

#### A. Nouvelle entité `FloodedAreaEntity` (R2)
- Fichier : `src/modules/zones/entities/flooded-area.entity.ts`
- Table : `flooded_areas`
- Colonnes :
  - `id uuid PK`
  - `geometry geometry(Polygon, 4326) NOT NULL` (zone d'eau détectée)
  - `observedAt timestamptz NOT NULL` (instant t)
  - `expiresAt timestamptz NULL` (TTL — une zone inondée ne reste pas inondée éternellement)
  - `source enum('report', 'satellite', 'ai_inference', 'authority')`
  - `severity enum('low','medium','high','critical')`
  - `confidence numeric(3,2)` (0..1)
  - `sourceReportId uuid NULL FK → reports`
  - `sourceImageId uuid NULL FK → satellite_images`
  - `createdAt`, `updatedAt`
- Index : GiST sur `geometry`, btree sur `observedAt`, btree partiel `WHERE expiresAt IS NULL OR expiresAt > now()`

#### B. Nouvelle entité `SatelliteImageEntity` (R5, R6)
- Fichier : `src/modules/satellite/entities/satellite-image.entity.ts`
- Table : `satellite_images`
- Colonnes :
  - `id uuid PK`
  - `bbox geometry(Polygon, 4326) NOT NULL` (emprise)
  - `capturedAt timestamptz NOT NULL`
  - `provider enum('sentinel-2','sentinel-1','planet','landsat')`
  - `bands jsonb` (URLs S3 par bande, ou COG unique)
  - `cloudCoverPct numeric(5,2)`
  - `s3Key varchar(500)` (clé S3 du COG/PNG)
  - `relatedReportId uuid NULL FK → reports`
  - `relatedZoneId uuid NULL FK → flood_zones`
  - `createdAt`
- Index : GiST sur `bbox`, btree sur `capturedAt`

#### C. Modifications d'entités existantes
- `ReportEntity` :
  - ajouter `satelliteImageId uuid NULL FK → satellite_images`
  - ajouter `floodedAreaId uuid NULL FK → flooded_areas` (zone inférée à partir du point)
- `PredictionEntity` :
  - ajouter `features jsonb` (snapshot des features ML utilisées)
  - ajouter `modelVersion varchar(50)`
  - ajouter `horizonHours int` (horizon de prédiction)

#### D. Migrations
- Créer `src/migrations/<timestamp>-add-flooded-areas.ts`
- Créer `src/migrations/<timestamp>-add-satellite-images.ts`
- Créer `src/migrations/<timestamp>-extend-reports-predictions.ts`
- ⚠️ Désactiver `synchronize: true` en prod si pas déjà fait — basculer sur migrations explicites.

---

### 3.2 Module NestJS — `flooded-areas` (R2, R3)

**Nouveau module** : `src/modules/flooded-areas/`
- `flooded-area.service.ts` :
  - `findActiveAt(point, timestamp)` — zones inondées actives à `t`
  - `findActiveInBBox(bbox, timestamp)` — pour le routing
  - `upsertFromReport(report)` — créer/étendre une zone d'eau autour d'un signalement (buffer PostGIS configurable selon `waterLevel`)
  - `upsertFromSatellite(detection)` — appelé par job `flooded-detect`
  - `expireOlderThan(duration)` — cron qui marque expirées les zones non re-confirmées
- `flooded-area.controller.ts` :
  - `GET /v1/flooded-areas?at=ISO&bbox=…` (lecture publique)
  - `POST /v1/flooded-areas` (authority/admin uniquement)
- Migration des appels existants : tout ce qui parlait de "zones à éviter pour routing" doit passer de `flood_zones` à `flooded_areas`.

---

### 3.3 Routes sûres — refonte (R3)

Fichier : `src/modules/routes/route.service.ts`

**Étape 1 — court terme (sans moteur externe)**
- Remplacer le filtre `flood_zones.level='high'` par `flooded_areas.findActiveInBBox(bbox, now())`.
- Calcul de pénalité : ajouter un coût élevé si segment intersecte `flooded_areas`.
- Conserver la polyline mock le temps d'intégrer un vrai moteur.

**Étape 2 — moteur de routing**
- Choisir : OSRM (self-hosted, Docker), GraphHopper, ou Mapbox Directions API.
- Recommandation : **OSRM en Docker** pour la souveraineté + custom profile via Lua qui pénalise les arcs traversant `flooded_areas`.
- Workflow :
  1. Récupérer extrait OSM Sénégal (Geofabrik).
  2. Pré-process OSRM avec profil voiture/piéton.
  3. Au requêt : passer la liste des polygones `flooded_areas` actifs comme **avoid_polygons** (via `?exclude=` ou couche custom).
- Endpoint : `GET /v1/routes/safe?fromLat&fromLng&toLat&toLng&mode=driving|walking`.
- Réponse enrichie : segments traversant des zones inondées flaggés.

---

### 3.4 Vérification terrain — refonte (R4)

Fichier : `src/modules/terrain/terrain.service.ts`

- Croisement PostGIS réel :
  - `ST_Contains(flood_zones.polygon, point)` → `inFloodZone: true/false`, `level`
  - `ST_Distance(point, nearest flood_zone)` → distance à la zone connue la plus proche
  - Historique : compter `reports` dans un rayon (ex. 200 m) sur les 12 derniers mois
- Score `riskScore` recalculé à partir de ces signaux + appel `ai-service /terrain-score` (optionnel).
- Le module ne doit **pas** consulter `flooded_areas` (instant t) — c'est R1 strict.

---

### 3.5 Module satellite + job satellite-fetch (R5, R6)

**Nouveau module** : `src/modules/satellite/`

Composants :
- `satellite.service.ts` :
  - `fetchForPoint(lat, lng, date, bufferMeters)` — calcule la BBox, déclenche le job
  - `fetchForZone(zoneId, date)` — variante par zone connue
  - Adapter par fournisseur :
    - `providers/sentinel-hub.adapter.ts` (recommandé : Process API + token OAuth)
    - `providers/copernicus-dataspace.adapter.ts` (gratuit, alternative)
    - `providers/planet.adapter.ts` (en option, payant, haute résolution)
- Stockage S3 : bucket `geoflood-satellite-images` (réutiliser `AWS_*` du `.env`).
- Côté DB : INSERT dans `satellite_images`.

**Job BullMQ** : `satellite-fetch`
- Fichier : `src/queues/satellite-fetch.processor.ts`
- Déclenché depuis `reports.service.create()` après commit du report.
- Idempotent : clé `${reportId}` ; ne refait pas si déjà capturé pour ce report.
- Retry : 5 tentatives, backoff exponentiel (les images peuvent ne pas être disponibles immédiatement → rejouer +6h, +24h jusqu'à `maxAge=72h`).
- Sortie : enregistrement `satellite_images` + mise à jour `report.satelliteImageId`.

**Job BullMQ** : `flooded-detect`
- Déclenché à la fin de `satellite-fetch`.
- Appelle `ai-service POST /detect-water` avec l'URL de l'image (NDWI / SAR threshold / segmentation).
- Si polygone d'eau retourné : `floodedArea.upsertFromSatellite()`.

---

### 3.6 Service IA Python (ai-service)

**Le dossier `ai-service/` est vide aujourd'hui — à créer.**

Endpoints à implémenter dans `ai-service/main.py` :

| Endpoint | Entrée | Sortie | Méthode |
|---|---|---|---|
| `GET /health` | — | `{status:"ok"}` | — |
| `POST /detect-water` | `{imageUrl, bbox}` | `{polygons: GeoJSON[], confidence}` | NDWI sur bandes Sentinel-2 (B3, B8) ou seuil SAR Sentinel-1 |
| `POST /predict/flood-risk` | `{zoneId, features: {...}}` | `{floodProbability, severity, confidence, horizonHours}` | XGBoost / RandomForest sur features tabulaires + CNN sur tuile satellite |
| `POST /terrain-score` | `{lat, lng, features}` | `{riskScore, drainageScore, recommendation}` | Modèle simple combinant DEM + occupation sols |

**Features de la prédiction R6** (à assembler côté NestJS avant l'appel) :
- Historique : nombre de reports dans la zone sur 30/90/365 j
- Géom : surface, périmètre, présence cours d'eau (OSM)
- Météo : `WeatherSnapshot` du jour + cumul pluies 24h/72h/7j (API Open-Meteo recommandée — gratuite, fiable)
- Drainage : densité réseau hydrographique (à pré-calculer depuis OSM, table `drainage_density`)
- Occupation sols : pourcentage urbain/végétal/eau (Copernicus Land Cover ou ESA WorldCover)
- DEM : altitude moyenne + pente (SRTM ou Copernicus DEM 30m)
- Satellite : tuile la plus récente (NDWI, NDVI)

**Stack Python recommandée** : `fastapi`, `rasterio`, `shapely`, `geopandas`, `scikit-learn`, `xgboost`, `httpx` (appel Sentinel Hub).

---

### 3.7 Module météo (R6)

Fichier : `src/modules/weather/weather.service.ts`
- Intégrer un fournisseur réel (recommandation : **Open-Meteo** — gratuit, pas de clé API).
- Ajouter une méthode `getRainfallCumulative(lat, lng, hours)` utilisée par les features de prédiction.

---

### 3.8 Queues & worker

Fichier : `src/worker.ts` + nouveau dossier `src/queues/`
- Définir les queues : `satellite-fetch`, `flooded-detect`, `prediction-update`, `flooded-area-expiry`.
- Processors NestJS (`@Processor`) dans `src/queues/*.processor.ts`.
- Cron Bull :
  - `flooded-area-expiry` toutes les heures
  - `prediction-update` quotidien à 03:00 UTC pour les zones actives

---

### 3.9 API publique — résumé des nouveaux endpoints

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/v1/flooded-areas?at=&bbox=` | Carte temps réel |
| POST | `/v1/flooded-areas` | (admin/authority) injection manuelle |
| GET | `/v1/satellite-images/:id` | Métadonnées + URL signée S3 |
| GET | `/v1/reports/:id/satellite` | Image satellite associée à un report |
| GET | `/v1/routes/safe` | Modifié : utilise `flooded-areas` |
| GET | `/v1/terrain/check` | Modifié : croisement PostGIS réel |

---

## 4. Ordre d'implémentation recommandé

1. **Migrations DB** (R2 + satellite_images) — fondations.
2. **Module `flooded-areas`** + service de buffer depuis report (R2).
3. **Refonte `terrain`** (R4) — purement DB, vite testable.
4. **Refonte `routes/safe`** étape 1 (R3 light, sans OSRM).
5. **Module `satellite`** + adapter Sentinel Hub + job `satellite-fetch` (R5).
6. **Service IA Python `/detect-water`** (R5 → R2 par satellite).
7. **Module `weather` réel** (Open-Meteo) — préparation R6.
8. **Service IA Python `/predict/flood-risk`** + job `prediction-update` (R6).
9. **OSRM** + intégration `avoid_polygons` (R3 complet).
10. **Tests E2E** sur scénarios métier.

---

## 5. Configuration `.env` à étendre

```bash
# Sentinel Hub / Copernicus
SENTINELHUB_CLIENT_ID=
SENTINELHUB_CLIENT_SECRET=
SENTINELHUB_INSTANCE_ID=

# S3 satellite
AWS_S3_BUCKET_SATELLITE=geoflood-satellite-images

# Open-Meteo (pas de clé requise)
WEATHER_PROVIDER=open-meteo

# OSRM
OSRM_BASE_URL=http://osrm:5000

# AI service
AI_SERVICE_URL=http://ai-service:8000
AI_MODEL_VERSION=v1
```

---

## 6. Risques & points d'attention

- **Disponibilité des images satellite** : Sentinel-2 a une revisite ~5 jours, et la couverture nuageuse peut bloquer plusieurs semaines. Prévoir fallback Sentinel-1 (radar, traverse les nuages) pour la détection d'eau.
- **PostGIS 15 → 16** : actuellement les conteneurs tournent en 3.3 (PG15). Ne pas faire évoluer pendant l'intégration.
- **Charge BullMQ** : un report = au moins 2 jobs (satellite + detect). Prévoir limites de concurrence sur les workers.
- **Coût stockage** : COGs Sentinel-2 ≈ 100 Mo / scène. Politique de rétention + Glacier après 90 j.
- **RGPD / vie privée** : les reports contiennent un point GPS d'utilisateur. Le couplage avec une image satellite ne doit pas exposer l'identité du citoyen → image stockée par BBox (pas par userId), URL signée temporaire.
- **`synchronize: true` TypeORM** : à désactiver avant la première migration en prod.
