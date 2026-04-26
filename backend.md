# Prompt premium pour Claude / IA code generator — Créer le Backend complet de GeoFlood

Tu es un **Senior Backend Architect + Senior NestJS Engineer + DevOps Engineer + Geospatial Systems Expert + Scalable Startup CTO**.

Ta mission : concevoir et coder le **backend complet, moderne, scalable et production-ready** de **GeoFlood**, startup ClimateTech spécialisée dans la prévention intelligente des inondations en Afrique.

Je veux un backend niveau startup financée, robuste, sécurisé, propre, prêt à supporter millions d'utilisateurs.

> **IMPORTANT** — Ce prompt est synchronisé avec l'application mobile Flutter (`geoflood-mobile`).
> Chaque modèle, endpoint et enum ci-dessous correspond exactement aux structures Dart côté client.
> Toute modification doit rester compatible avec le mobile.

---

# 🌊 Contexte Produit

GeoFlood aide :

## Citoyens

* recevoir alertes inondation en temps réel
* vérifier terrain avant achat (scoring IA)
* signaler zones inondées avec photos
* consulter cartes de risque interactives
* navigation guidée sécurisée (éviter zones inondées)

## Autorités

* dashboard temps réel (KPI, heatmap, graphiques)
* quartiers critiques avec alertes prioritaires
* interventions prioritaires et évacuations
* prédiction pluie / inondation
* modération signalements citoyens

## Entreprises

* immobilier (scoring terrain)
* assurances (évaluation risque)
* banques (vérification pré-prêt)
* logistique (routes sécurisées)

---

# 🎯 Stack imposée

## Backend principal

* NestJS latest
* TypeScript strict
* Clean Architecture
* REST API + WebSocket (alertes temps réel)

## Base de données

* PostgreSQL
* PostGIS (géospatial obligatoire)

## Cache / Queue

* Redis
* BullMQ

## Microservices IA

* Python
* FastAPI

## Infra

* Docker
* Nginx
* CI/CD
* monitoring

---

# 🎯 Objectif backend

Créer API complète qui gère :

* authentification (JWT + OTP + refresh tokens)
* utilisateurs (profil, préférences, avatar)
* zones à risque (polygones GeoJSON)
* alertes push (temps réel WebSocket + push mobile)
* signalements citoyens (photos, géolocalisation)
* scoring terrain (IA + altitude + drainage + historique)
* cartographie géospatiale (PostGIS queries)
* météo temps réel (intégration externe)
* prédiction inondation (microservice Python)
* dashboards admin (KPI, statistiques horaires, export)
* analytics (historique inondations par année/zone)
* guide mode (routes sécurisées évitant zones inondées)
* notifications multicanal (push, SMS, email, WebSocket)
* text-to-speech weather summaries (pre-rendered)

---

# 📦 Architecture demandée

Créer architecture microservices propre :

```text
apps/api-gateway
apps/worker
apps/notifications
apps/python-risk-engine
libs/common
libs/database
libs/geospatial
infra/docker
```

---

# 🧱 Modules NestJS obligatoires

Créer modules complets :

## Core

* AuthModule (JWT, refresh, OTP, Google OAuth)
* UserModule (profil, préférences, avatar upload)
* RoleModule (RBAC guards)
* HealthModule
* SettingsModule (préférences utilisateur : thème, locale, notifications)

## Product

* FloodZoneModule (polygones PostGIS, niveaux de risque, filtrage par couche)
* AlertModule (CRUD + WebSocket broadcast + mark-as-read)
* TerrainCheckModule (analyse complète avec scoring)
* WeatherModule (intégration API externe + snapshots)
* PredictionModule (interface avec microservice Python)
* ReportModule (signalements citoyens avec photos)
* NotificationModule (push FCM + SMS + email + canaux séparés)
* RouteModule (calcul routes sécurisées, intégration OSRM)
* HistoryModule (statistiques historiques par zone/année)

## Admin

* DashboardModule (KPI temps réel, heatmap data)
* AnalyticsModule (stats horaires, zones les plus touchées, export)
* ModerationModule (validation signalements)

---

# 🔐 Auth complet

Je veux :

* JWT access token (15min)
* refresh token (7 jours, rotation)
* OTP téléphone (6 digits, expiration 5min)
* email + password login
* Google OAuth login
* forgot password + reset token
* RBAC avec guards NestJS

Rôles (synchronisés avec `UserRole` enum Flutter) :

```text
citizen    — utilisateur standard (défaut à l'inscription)
authority  — agent gouvernemental / autorité locale
admin      — administrateur système
```

> Note : Le mobile utilise 3 rôles. Les rôles `agent`, `government`, `enterprise`
> peuvent être ajoutés côté backend comme sous-rôles mais l'API doit toujours
> retourner un des 3 rôles ci-dessus dans le champ `role`.

---

# 🗺️ Base de données complète

Créer schema SQL / Prisma complet.

## users

Synchronisé avec `AppUser` Dart :

| Champ | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| full_name | VARCHAR(100) | NOT NULL |
| email | VARCHAR(255) | UNIQUE, NOT NULL |
| phone | VARCHAR(20) | NOT NULL |
| role | ENUM('citizen','authority','admin') | DEFAULT 'citizen' |
| password_hash | VARCHAR(255) | |
| avatar_url | VARCHAR(500) | nullable |
| city | VARCHAR(100) | DEFAULT 'Dakar' |
| locale | VARCHAR(5) | DEFAULT 'fr' |
| push_alerts_enabled | BOOLEAN | DEFAULT true |
| location_alerts_enabled | BOOLEAN | DEFAULT true |
| theme_mode | VARCHAR(10) | DEFAULT 'system' |
| otp_code | VARCHAR(6) | nullable, expirable |
| otp_expires_at | TIMESTAMP | nullable |
| reset_token | VARCHAR(255) | nullable |
| reset_token_expires_at | TIMESTAMP | nullable |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

## flood_zones

Synchronisé avec `FloodZone` Dart :

| Champ | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| name | VARCHAR(100) | NOT NULL (ex: "Pikine — Guédiawaye") |
| level | ENUM('high','medium','low') | RiskLevel |
| polygon | GEOMETRY(Polygon, 4326) | PostGIS, liste de LatLng |
| center_lat | DOUBLE | centre du polygone |
| center_lng | DOUBLE | centre du polygone |
| city | VARCHAR(100) | |
| score | INT | 0-100, optionnel |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

## alerts

Synchronisé avec `Alert` Dart :

| Champ | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| title | VARCHAR(200) | NOT NULL |
| message | TEXT | NOT NULL |
| category | ENUM('rain','flood','evacuation','roadBlocked','info') | AlertCategory |
| level | ENUM('high','medium','low') | RiskLevel (sévérité) |
| area | VARCHAR(200) | nom de la zone concernée |
| created_at | TIMESTAMP | |

## alert_reads (table pivot)

| Champ | Type | Notes |
|-------|------|-------|
| user_id | UUID | FK → users |
| alert_id | UUID | FK → alerts |
| read_at | TIMESTAMP | |

> L'app gère `read` comme booléen par utilisateur, pas global.

## reports

Synchronisé avec `FloodReport` Dart :

| Champ | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| user_id | UUID | FK → users |
| lat | DOUBLE | NOT NULL |
| lng | DOUBLE | NOT NULL |
| location | GEOMETRY(Point, 4326) | PostGIS, calculé depuis lat/lng |
| water_level | ENUM('ankle','knee','waist','above') | WaterLevel |
| road_blocked | BOOLEAN | DEFAULT false |
| comment | TEXT | |
| photo_paths | TEXT[] | array max 3 URLs S3/MinIO |
| status | ENUM('pending','verified','rejected') | modération admin |
| created_at | TIMESTAMP | |

## terrain_checks

Synchronisé avec `TerrainReport` Dart :

| Champ | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| user_id | UUID | FK → users |
| address | VARCHAR(300) | NOT NULL |
| lat | DOUBLE | NOT NULL |
| lng | DOUBLE | NOT NULL |
| location | GEOMETRY(Point, 4326) | PostGIS |
| risk_score | INT | 0-100 |
| altitude_meters | DOUBLE | |
| drainage_score | INT | 0-100 (100 = excellent) |
| historical_floods | INT | nombre d'épisodes passés |
| recommendation | TEXT | texte explicatif IA |
| created_at | TIMESTAMP | |

## weather_snapshots

| Champ | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| city | VARCHAR(100) | NOT NULL |
| temp_c | DOUBLE | température Celsius |
| condition | ENUM('sunny','cloudy','rain','heavyRain','storm') | WeatherCondition |
| rain_chance | INT | 0-100 % |
| humidity | INT | 0-100 % |
| wind_kmh | DOUBLE | km/h |
| forecast_date | DATE | |
| created_at | TIMESTAMP | |

## predictions

| Champ | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| zone_id | UUID | FK → flood_zones |
| flood_probability | DOUBLE | 0.0-1.0 |
| severity | ENUM('high','medium','low') | |
| confidence | DOUBLE | 0.0-1.0 |
| created_at | TIMESTAMP | |

## notification_tokens (push mobile)

| Champ | Type | Notes |
|-------|------|-------|
| id | UUID | PK |
| user_id | UUID | FK → users |
| fcm_token | VARCHAR(500) | Firebase Cloud Messaging |
| platform | ENUM('android','ios') | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

---

# 🌍 Fonctionnalités géospatiales

Utiliser PostGIS pour :

* point in polygon (déterminer zone de risque d'un utilisateur)
* nearest zone (zones proches d'un point GPS)
* distance route (calcul distance entre points)
* area calculations (surface des zones)
* heatmaps data (densité de signalements pour admin dashboard)
* flood overlays (polygones pour couche carte)
* safe route filtering (exclure zones à risque du calcul de route)

Créer queries optimisées avec index spatiaux.

---

# 📡 APIs obligatoires

> Tous les endpoints retournent des structures compatibles avec les modèles Dart.
> Les noms de champs JSON utilisent camelCase (aligné sur Dart/freezed).

## Auth

```http
POST /auth/register
  body: { fullName, email, phone, password }
  response: { user: AppUser, accessToken, refreshToken }

POST /auth/login
  body: { email, password }
  response: { user: AppUser, accessToken, refreshToken }

POST /auth/refresh
  body: { refreshToken }
  response: { accessToken, refreshToken }

POST /auth/verify-otp
  body: { email, code }
  response: { user: AppUser, accessToken, refreshToken }

POST /auth/send-otp
  body: { phone }
  response: { message: "OTP envoyé" }

POST /auth/forgot-password
  body: { email }
  response: { message: "Lien de réinitialisation envoyé" }

POST /auth/reset-password
  body: { resetToken, newPassword }
  response: { message: "Mot de passe mis à jour" }

POST /auth/google
  body: { idToken }
  response: { user: AppUser, accessToken, refreshToken }
```

## User / Profile

```http
GET /users/me
  response: AppUser

PATCH /users/me
  body: { fullName?, email?, phone?, city?, avatarUrl? }
  response: AppUser

PATCH /users/me/settings
  body: { locale?, themeMode?, pushAlerts?, locationAlerts? }
  response: { success: true }

POST /users/me/avatar
  multipart: { file }
  response: { avatarUrl: string }

DELETE /users/me
  response: { success: true }
```

## Dashboard

```http
GET /dashboard
  query: { city?, lat?, lng? }
  response: {
    weather: Weather,
    neighborhoodRisk: RiskLevel,
    activeAlerts: int,
    riskScore: int
  }
```

> Retourne la structure `DashboardData` complète du mobile.

## Carte / Flood Zones

```http
GET /zones
  query: { lat?, lng?, radius?, level? }
  response: FloodZone[]

GET /zones/:id
  response: FloodZone

GET /zones/risk-map
  query: { city?, bounds? }
  response: FloodZone[] (polygones GeoJSON)

GET /zones/nearby
  query: { lat, lng, radius? }
  response: FloodZone[]
```

> Chaque `FloodZone` inclut : id, name, level, polygon (liste de {lat, lng}), center ({lat, lng}).
> Le mobile calcule `fillColor` et `strokeColor` côté client depuis `level`.

## Alerts

```http
GET /alerts
  query: { limit?, offset?, category?, level? }
  response: { alerts: Alert[], total: int }

GET /alerts/:id
  response: Alert

PATCH /alerts/:id/read
  response: { success: true }

POST /alerts/mark-all-read
  response: { success: true }

GET /alerts/unread-count
  response: { count: int }

# Admin only
POST /alerts
  body: { title, message, category, level, area, targetZoneId? }
  response: Alert
```

> Chaque `Alert` retournée inclut un champ `read: bool` calculé pour l'utilisateur courant
> via la table `alert_reads`.

## Reports (Signalements)

```http
GET /reports
  query: { limit?, offset?, status? }
  response: { reports: FloodReport[], total: int }

POST /reports
  multipart: { lat, lng, waterLevel, roadBlocked, comment, photos[] (max 3) }
  response: FloodReport

GET /reports/:id
  response: FloodReport

GET /reports/nearby
  query: { lat, lng, radius? }
  response: FloodReport[]

# Admin only
PATCH /reports/:id/status
  body: { status: 'verified' | 'rejected' }
  response: FloodReport
```

> `waterLevel` enum values : ankle, knee, waist, above.
> `photo_paths` = URLs vers stockage S3/MinIO après upload.

## Terrain Check

```http
POST /terrain/check
  body: { address, lat, lng }
  response: TerrainReport

GET /terrain/checks
  query: { limit?, offset? }
  response: TerrainReport[] (historique de l'utilisateur)

GET /terrain/checks/:id
  response: TerrainReport

GET /terrain/checks/:id/pdf
  response: binary PDF
```

> `TerrainReport` inclut : address, lat, lng, riskScore (0-100),
> altitudeMeters, drainageScore (0-100), historicalFloods (count),
> recommendation (texte).
> Le mobile calcule `level` (RiskLevel) depuis `riskScore` :
> ≥70 = high, ≥40 = medium, <40 = low.

## Weather

```http
GET /weather
  query: { city? }
  response: Weather

GET /weather/forecast
  query: { city?, days? }
  response: Weather[]
```

> `Weather` inclut : city, tempC, condition, rainChance, humidity, wind.
> `condition` enum values : sunny, cloudy, rain, heavyRain, storm.

## Predictions

```http
GET /predictions/zone/:zoneId
  response: Prediction

GET /predictions/city/:cityName
  response: Prediction[]

GET /predictions/my-zone
  query: { lat, lng }
  response: Prediction
```

## History / Statistics

```http
GET /history/floods
  query: { city?, startYear?, endYear? }
  response: { byYear: [{ year: int, count: int }] }

GET /history/top-zones
  query: { city?, limit? }
  response: [{ zoneName: string, episodeCount: int }]
```

> Utilisé par `HistoryScreen` : bar chart par année + classement zones.

## Admin Dashboard

```http
GET /admin/dashboard
  response: {
    criticalZones: int,
    reports24h: int,
    evacuationsActive: int,
    closedRoads: int,
    recentReports: FloodReport[],
    zonesWithRisk: FloodZone[]
  }

GET /admin/statistics
  query: { startDate?, endDate?, granularity? }
  response: {
    reportsByHour: [{ hour: int, count: int }],
    reportsByZone: [{ zoneName: string, count: int }]
  }

POST /admin/export
  body: { format: 'csv' | 'json', dateRange? }
  response: binary file
```

## Routes sécurisées

```http
GET /routes/safe
  query: { fromLat, fromLng, toLat, toLng }
  response: {
    distance: double (km),
    duration: double (min),
    geometry: string (encoded polyline),
    avoidedZones: string[]
  }
```

> Le mobile utilise actuellement OSRM directement.
> Ce endpoint backend permet de filtrer les routes passant par des zones à risque
> élevé avant de retourner l'itinéraire.

## Notifications / Push tokens

```http
POST /notifications/register-token
  body: { fcmToken, platform: 'android' | 'ios' }
  response: { success: true }

DELETE /notifications/unregister-token
  body: { fcmToken }
  response: { success: true }
```

## WebSocket (alertes temps réel)

```text
WS /ws/alerts
  auth: Bearer token dans query param ou handshake
  events:
    → server: { type: 'newAlert', alert: Alert }
    → server: { type: 'riskUpdate', zone: FloodZone }
    → server: { type: 'weatherUpdate', weather: Weather }
```

> Le mobile utilise `FloodAlertMonitor` qui polling toutes les 5 min en mode mock.
> En production, remplacer par WebSocket persistent.
> Canaux de notification mobile :
> - `flood_alerts` (importance max)
> - `weather_updates` (importance haute)
> - `route_alerts` (importance haute)

---

# 🤖 IA Flood Engine (Python)

Créer microservice :

```http
POST /predict/flood-risk
  body: { zoneId, weather, altitude, historicalData, drainage, rainfallForecast }
  response: { floodProbability: float, severity: string, confidence: float }

POST /predict/terrain-score
  body: { lat, lng, altitude, drainage, historicalFloods, nearestZoneRisk }
  response: {
    riskScore: int (0-100),
    altitudeMeters: float,
    drainageScore: int (0-100),
    historicalFloods: int,
    recommendation: string (texte en français)
  }

GET /health
  response: { status: "ok" }
```

> La réponse de `/predict/terrain-score` doit correspondre exactement
> à la structure `TerrainReport` du mobile.
> Le `recommendation` est un texte en français décrivant le risque.

Inputs :

* météo (données WeatherSnapshot)
* altitude (DEM/SRTM data)
* historique (nombre d'épisodes passés)
* drainage (score calculé)
* pluie forecast (prochaines 48h)

Outputs :

* flood probability % (0.0-1.0)
* severity (high/medium/low — aligné sur RiskLevel)
* confidence (0.0-1.0)

---

# 🚨 Notifications

Créer système complet :

* push mobile FCM (3 canaux : flood_alerts, weather_updates, route_alerts)
* SMS ready (OTP + alertes critiques)
* email ready (reset password, rapports terrain PDF)
* websocket live alerts (broadcast par zone géographique)

Scénario :

```text
Pluie extrême détectée
→ zone Pikine
→ push automatique habitants concernés (via flood_alerts channel)
→ WebSocket broadcast aux clients connectés
→ SMS aux utilisateurs dans la zone (si activé)
→ TTS summary pré-généré pour le dashboard mobile
```

---

# 🌍 Localisation

L'app mobile supporte 3 langues :

* **Français** (fr) — défaut
* **Anglais** (en)
* **Wolof** (wo) — langue sénégalaise

L'API doit :
* stocker la locale préférée de l'utilisateur (champ `locale`)
* retourner les textes dynamiques (recommendations terrain, alertes)
  dans la langue de l'utilisateur quand possible
* les enums (`RiskLevel`, `WaterLevel`, etc.) restent en anglais
  côté API — le mobile traduit côté client

---

# ⚡ Performance / Scalabilité

Préparer pour :

* 5 millions users
* 100k requêtes/jour
* realtime alerts (WebSocket broadcast)
* cache Redis (weather, dashboard, zones)
* queue workers (notifications push, PDF generation, image processing)
* horizontal scaling
* responses JSON compactes (faible bande passante Afrique)
* pagination systématique (limit/offset)
* compression gzip

---

# 🔒 Sécurité

* Helmet
* rate limit (auth endpoints : 5 req/min, API : 60 req/min)
* CORS (whitelist mobile app domains)
* SQL injection safe (Prisma parameterized queries)
* audit logs (actions admin tracées)
* encrypted secrets
* role guards (citizen, authority, admin)
* admin traceability (qui a fait quoi)
* file upload validation (type, taille max 5MB, antivirus)
* OTP brute-force protection (max 5 tentatives / 15 min)

---

# 🧪 Tests

Créer :

* unit tests (services, guards, pipes)
* integration tests (endpoints avec DB test)
* e2e tests NestJS (scénarios complets)
* load test scripts (artillery / k6)

---

# 🐳 Docker

Créer :

```text
docker-compose.dev.yml
docker-compose.prod.yml
```

Services :

* api (NestJS)
* postgres (+ PostGIS extension)
* redis
* worker (BullMQ)
* python-engine (FastAPI)
* nginx (reverse proxy + SSL)
* minio (stockage photos/fichiers — compatible S3)

---

# 🚀 CI/CD

Créer pipeline :

* lint (ESLint + Prettier)
* tests (unit + integration)
* build (Docker images)
* deploy staging
* deploy production

GitHub Actions.

---

# 📈 Monitoring

Ajouter :

* Prometheus (métriques API)
* Grafana (dashboards)
* Sentry (error tracking)
* Winston logs (structured JSON)

---

# 📁 Code attendu

Je veux fichiers réels :

```text
src/modules/auth/auth.controller.ts
src/modules/auth/auth.service.ts
src/modules/auth/guards/roles.guard.ts
src/modules/users/users.controller.ts
src/modules/users/users.service.ts
src/modules/zones/zones.controller.ts
src/modules/zones/zones.service.ts
src/modules/alerts/alerts.controller.ts
src/modules/alerts/alerts.service.ts
src/modules/alerts/alerts.gateway.ts (WebSocket)
src/modules/reports/reports.controller.ts
src/modules/reports/reports.service.ts
src/modules/terrain/terrain.controller.ts
src/modules/terrain/terrain.service.ts
src/modules/weather/weather.service.ts
src/modules/dashboard/dashboard.controller.ts
src/modules/admin/admin.controller.ts
src/modules/notifications/notifications.service.ts
src/modules/routes/routes.service.ts
src/modules/history/history.controller.ts
prisma/schema.prisma
docker-compose.yml
python/main.py
python/models/flood_predictor.py
python/models/terrain_scorer.py
```

---

# 🌍 Optimisé Afrique

Important :

* faible bande passante → réponses JSON compactes, pagination, compression
* mobiles Android modestes → pas de payloads lourds, images optimisées
* trafic irrégulier → queue system pour absorber pics
* coûts cloud faibles → MinIO au lieu S3, services self-hosted
* notifications efficaces → FCM batching, SMS groupés
* offline-first friendly → ETags, cache headers, delta sync

---

# 🎯 Niveau attendu

Agis comme CTO construisant un backend pour lever 2 millions $.

Pas pseudo code.
Pas structure amateur.
Je veux du solide enterprise startup.

---

# 🎁 Bonus demandé

Ajouter :

* event-driven architecture (EventEmitter NestJS pour alertes → notifications)
* webhook support (notifications vers systèmes tiers)
* public API future (versionné /v1/, documentation Swagger)
* multi-country ready (champ city extensible, timezone support)
* multilingual ready (fr, en, wo — textes dynamiques traduits)
* rate limiting par rôle (enterprise > citizen)
* API key system pour partenaires B2B

---

# 📋 Correspondance Mobile ↔ Backend

| Modèle Dart | Table DB | Endpoint principal |
|---|---|---|
| `AppUser` | users | GET /users/me |
| `FloodZone` | flood_zones | GET /zones |
| `Alert` | alerts + alert_reads | GET /alerts |
| `FloodReport` | reports | POST /reports |
| `TerrainReport` | terrain_checks | POST /terrain/check |
| `Weather` | weather_snapshots | GET /weather |
| `DashboardData` | (agrégé) | GET /dashboard |
| `RiskLevel` enum | ENUM('high','medium','low') | champ `level` |
| `AlertCategory` enum | ENUM('rain','flood','evacuation','roadBlocked','info') | champ `category` |
| `WaterLevel` enum | ENUM('ankle','knee','waist','above') | champ `water_level` |
| `WeatherCondition` enum | ENUM('sunny','cloudy','rain','heavyRain','storm') | champ `condition` |
| `UserRole` enum | ENUM('citizen','authority','admin') | champ `role` |
| `SettingsState` | users (colonnes settings) | PATCH /users/me/settings |

---

# Sortie attendue

Répondre par :

1. architecture
2. schema DB (Prisma avec PostGIS)
3. code NestJS (tous les modules)
4. microservice Python (FastAPI)
5. docker (dev + prod)
6. CI/CD (GitHub Actions)
7. hardening production

Si trop long, continue automatiquement jusqu'à finir.

Commence maintenant.
