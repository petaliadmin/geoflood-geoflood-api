# Plan : Validation alertes, zones par découpage administratif & itinéraire amélioré

> À implémenter plus tard. Ce document décrit les règles métier et le plan d'implémentation
> pour : validation des alertes par admin, APIs zones (alertées + par région/ville/quartier),
> et amélioration du calcul d'itinéraire.

---

## Contexte

Le backend GeoFlood (NestJS + PostGIS) gère déjà alertes, zones inondables, prédictions IA, météo et calcul de routes. Les manques fonctionnels à combler :

1. **Validation des alertes** : aujourd'hui un utilisateur `authority` ou `admin` crée une alerte qui est diffusée immédiatement (`alerts.service.ts:117`). Il n'existe ni statut `pending`, ni `createdBy`/`validatedBy`, ni notification post-validation. Besoin métier : un **citoyen** peut désormais créer une alerte qui doit être validée par un **admin** ; l'alerte n'est diffusée (FCM + WebSocket) qu'après validation. Les alertes créées par `authority` ou `admin` restent auto-validées.
2. **APIs zones** :
   - récupérer les zones **alertées** (= zones liées à au moins une alerte active validée),
   - récupérer les zones **inondables** par **région / ville (commune) / quartier**. Les shapefiles officiels du Sénégal sont disponibles dans `Data/` (Régions, Départements, Communes, Quartiers) → import en table `administrative_boundaries` puis filtrage spatial PostGIS.
3. **Itinéraire amélioré** : aujourd'hui Haversine + bbox sur zones `level=high` (`route.service.ts:25-58`). Nouvelles règles métier :
   - **Alerte route traversant zone inondable** uniquement si **pluie en cours OU prévision de pluie** sur la zone.
   - **Alerte route traversant zone inondée confirmée** (alerte validée active OU prédiction IA `floodProbability >= seuil`).
   - Intégration **OSRM** + calcul de routes alternatives évitant les zones confirmées.

---

## Architecture cible (vue d'ensemble)

```
┌─────────────────────────────────────────────────────────┐
│ Citoyen → POST /alerts (status=pending)                 │
│ Authority/Admin → POST /alerts (status=validated)       │
│ Admin → POST /alerts/:id/validate → FCM + WS broadcast  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ AdministrativeBoundary (PostGIS) ← seed shapefiles      │
│   level: region | department | commune | quartier       │
│   GET /zones/by-area?region=&commune=&quartier=         │
│   GET /zones/alerted                                    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ RouteService → OSRM                                     │
│   1. Route principale OSRM                              │
│   2. Pour chaque zone traversée : flood-risk-evaluator  │
│      (météo + prédiction + alertes actives)             │
│   3. Si zone confirmée traversée → alternative OSRM     │
│      (avoid_polygons) ; sinon warnings                  │
└─────────────────────────────────────────────────────────┘
```

---

## 1. Validation des alertes par admin

### Fichiers à modifier
- `src/modules/zones/entities/zone.entity.ts:96-140` (AlertEntity)
- `src/modules/alerts/alerts.service.ts`
- `src/modules/alerts/alerts.controller.ts`
- `src/modules/alerts/alerts.module.ts`
- `src/modules/alerts/alerts.gateway.ts` (broadcast post-validation)
- `src/modules/notifications/notifications.service.ts` (ajouter envoi FCM)

### Modifications entité `AlertEntity`
Ajouter :
- `status: 'pending' | 'validated' | 'rejected'` (default `pending`)
- `createdBy: string` (FK user)
- `validatedBy: string | null` (FK user)
- `validatedAt: Date | null`
- `rejectionReason: string | null`

Migration TypeORM : `1714720000000-AddAlertValidation.ts`.

### Logique service
- `create(dto, user)` :
  - si `user.role` ∈ `{authority, admin}` → `status='validated'`, `validatedBy=user.id`, `validatedAt=now`, émet `alert.validated`
  - si `user.role === 'citizen'` → `status='pending'`, émet `alert.pending` (notif aux admins via FCM ciblé sur rôle)
- `validate(alertId, adminUser)` (nouveau) : passe `pending → validated`, émet `alert.validated`
- `reject(alertId, adminUser, reason)` (nouveau) : passe `pending → rejected`
- `findAll` : nouveau filtre `status` ; par défaut, public ne voit que `validated`. Admin voit tout via `?status=pending`.

### Endpoints
- `POST   /v1/alerts` ouvert à tous les rôles (JwtAuthGuard, sans RolesGuard restreignant)
- `POST   /v1/alerts/:id/validate` (admin uniquement)
- `POST   /v1/alerts/:id/reject` (admin uniquement, body `{reason}`)
- `GET    /v1/alerts/pending` (admin uniquement)

### Notifications post-validation
Étendre `NotificationsService` avec `sendToCity(city, payload)` et `sendToZone(zoneId, payload)` qui :
1. Récupère les `NotificationTokenEntity` des users dont `city` correspond (jointure `users.city`).
2. Appelle `firebase-admin.messaging().sendEachForMulticast(...)`.

Brancher un listener `@OnEvent('alert.validated')` qui :
- diffuse via WebSocket existant (`alerts.gateway.ts`)
- pousse FCM via le nouveau `sendToCity`/`sendToZone`

Dépendance à ajouter : `firebase-admin`. Variables d'env : `FIREBASE_SERVICE_ACCOUNT_JSON` (path) ou inline JSON.

---

## 2. Module Administrative Boundaries + APIs zones

### Nouveau module `src/modules/admin-boundaries/`
- `entities/administrative-boundary.entity.ts`
  ```
  id (uuid), level ('region'|'department'|'commune'|'quartier'),
  name, parentId (nullable), code, geometry (PostGIS MultiPolygon SRID 4326),
  centroid, createdAt
  ```
- Index GIST sur `geometry`.
- `admin-boundaries.service.ts` : `findByLevel`, `findByName`, `findContaining(lat,lng)`.

### Script seed shapefiles
Nouveau : `scripts/import-admin-boundaries.ts`
- Lit les shapefiles dans `Data/Régions/Region.shp`, `Data/Départements_update/Départements_46_OK.shp`, `Data/Limites_Communes/Limites_communes.shp`, `Data/QUARTIERS SN/New_Shapefile.shp`.
- Utilise `shapefile` (npm) + reprojection si nécessaire (`proj4`) vers EPSG:4326.
- Insère dans `administrative_boundaries`. Reconstitue la hiérarchie via `ST_Within` parent/child.
- Commande : `npm run seed:boundaries`.

### Nouveaux endpoints zones
Dans `src/modules/zones/zones.controller.ts` + `zones.service.ts`:

- `GET /v1/zones/by-area?region=Dakar&commune=Pikine&quartier=Thiaroye&level=high`
  - Résout chaque param en `boundary.geometry` (jointure par nom)
  - `SELECT zones WHERE ST_Intersects(zone.polygon, boundary.geometry)` (le plus profond fourni gagne)
  - Renvoie `{ area: {region, commune, quartier}, zones: [...] }`

- `GET /v1/zones/alerted`
  - Récupère toutes les zones liées à des alertes `status='validated'` non expirées
  - Jointure `AlertEntity.targetZoneId → FloodZoneEntity.id`
  - Optionnellement enrichit avec rayon impact si `area` donné mais pas `targetZoneId` (fallback : zones dont le centroïde est dans l'`area`).

---

## 3. Itinéraire amélioré (OSRM + règles métier)

### Nouveau service `RouteFloodRiskEvaluator`
`src/modules/routes/flood-risk-evaluator.service.ts`

Méthode `evaluateRoute(routeGeometry, options)` :
1. **Décode le polyline OSRM** → liste de coordonnées
2. **Trouve les zones traversées** : `ST_Intersects(routeGeom, zone.polygon)` via PostGIS
3. **Pour chaque zone**, classifie en :
   - `confirmed_flooded` : alerte validée active (`category` ∈ `{flood, roadBlocked}` ET `validatedAt > now-12h`) **OU** `PredictionEntity.floodProbability >= 0.7`
   - `flood_prone_with_rain` : zone inondable (`level >= medium`) ET pluie actuelle/prévue (WeatherService → `condition` ∈ `{rain, heavyRain, storm}` sur les 6h)
   - `safe` sinon
4. Retourne `{ zonesAlongRoute: [{zoneId, classification, reason}], hasConfirmedFlooding, hasFloodProneWithRain }`

### Refonte `RouteService.calculateSafeRoute`
1. Appelle **OSRM** `/route/v1/driving/{from};{to}?overview=full&geometries=polyline&alternatives=true`
2. Pour chaque itinéraire (principal + alternatives), appelle `evaluateRoute`
3. **Sélection** :
   - Si la route principale a `hasConfirmedFlooding=false` → la garder, ajouter warnings pour `flood_prone_with_rain`
   - Sinon, choisir l'alternative **sans** `confirmed_flooded`. À défaut, retry OSRM avec `exclude` polygons (zones confirmées) via paramètre `?exclude=` ou bbox detour.
4. Renvoie :
   ```
   { distance, duration, geometry, warnings: [...], avoidedZones: [...],
     alternatives: [...], primary: {...} }
   ```

### Interface météo abstraite
Créer `src/modules/weather/weather.provider.ts` (interface) :
```
interface IWeatherProvider {
  getCurrent(lat, lng): Promise<WeatherSnapshot>
  getForecast(lat, lng, hours): Promise<WeatherSnapshot[]>
}
```
Implémentations :
- `LocalDbWeatherProvider` (existant)
- `OpenWeatherMapProvider` (nouveau, branchable via `WEATHER_PROVIDER=openweathermap`, clé `OPENWEATHER_API_KEY`)

`WeatherService` orchestre : OpenWeatherMap d'abord, fallback local DB.

### Variables d'environnement à ajouter
- `OSRM_BASE_URL` (ex: `http://osrm:5000`)
- `OPENWEATHER_API_KEY`
- `WEATHER_PROVIDER` (`openweathermap` | `local`)
- `FLOOD_PROBABILITY_THRESHOLD` (default `0.7`)
- `ALERT_FRESHNESS_HOURS` (default `12`)

### Endpoints
- Conserver `POST /v1/routes/calculate` (signature étendue dans la réponse)
- Nouveau `POST /v1/routes/evaluate` : prend une `geometry` polyline déjà calculée et renvoie l'évaluation des zones (utile mobile).

---

## 4. Tests unitaires (services clés)

Fichiers à ajouter / étendre :
- `src/modules/alerts/alerts.service.spec.ts` (nouveau) : couvre `create` (citoyen=pending, admin=validated), `validate`, `reject`, émission events.
- `src/modules/routes/route.service.spec.ts` (nouveau) : mock OSRM + evaluator → vérifie sélection route, warnings, avoidedZones.
- `src/modules/routes/flood-risk-evaluator.service.spec.ts` (nouveau) : 3 cas (confirmed, prone+rain, safe) avec repos TypeORM mockés.
- `src/modules/zones/zones.service.spec.ts` (étendre) : `findByArea`, `findAlerted`.

Pas d'e2e dans ce lot.

---

## 5. Ordre d'exécution recommandé

1. **Module admin-boundaries** + script seed (prérequis pour APIs zones et impact futur des règles routage par découpage admin).
2. **APIs zones** (`/zones/by-area`, `/zones/alerted`) — quick win, dépend de (1).
3. **Validation alertes** : entité + statuts + endpoints + listener FCM/WS.
4. **Intégration FCM** dans NotificationsService (firebase-admin).
5. **Provider météo abstrait** + OpenWeatherMap.
6. **`FloodRiskEvaluator`** + intégration OSRM dans `RouteService`.
7. **Tests unitaires** au fil de l'eau pour chaque service touché.

---

## Fichiers critiques (récap)

| Fichier | Action |
|---|---|
| `src/modules/zones/entities/zone.entity.ts` | Étendre AlertEntity (status, createdBy, validatedBy…) |
| `src/modules/alerts/alerts.service.ts` | create/validate/reject + events |
| `src/modules/alerts/alerts.controller.ts` | nouveaux endpoints + retirer RolesGuard de POST |
| `src/modules/alerts/alerts.gateway.ts` | écouter `alert.validated` au lieu de `alert.created` |
| `src/modules/notifications/notifications.service.ts` | ajouter envoi FCM via firebase-admin |
| `src/modules/admin-boundaries/*` | nouveau module complet |
| `scripts/import-admin-boundaries.ts` | nouveau seed |
| `src/modules/zones/zones.controller.ts` + `.service.ts` | endpoints `/by-area`, `/alerted` |
| `src/modules/weather/weather.provider.ts` + `openweathermap.provider.ts` | interface + implémentation |
| `src/modules/weather/weather.service.ts` | orchestration providers |
| `src/modules/routes/flood-risk-evaluator.service.ts` | nouveau (règles métier) |
| `src/modules/routes/route.service.ts` | OSRM + alternatives + intégration evaluator |
| `src/modules/routes/routes.controller.ts` | endpoint `/evaluate` |
| `src/app.module.ts` | importer `AdminBoundariesModule` |

Migrations TypeORM :
- `AddAlertValidation`
- `CreateAdministrativeBoundaries`

---

## Vérification end-to-end

1. **Démarrer la stack** : `docker-compose -f docker-compose.dev.yml up -d` (PostGIS, Redis, OSRM si déjà présent ; sinon `docker run -p 5000:5000 osrm/osrm-backend` avec extract Sénégal).
2. **Migrations** : `npm run migration:run`
3. **Seed** : `npm run seed:boundaries` → vérifier `SELECT level, COUNT(*) FROM administrative_boundaries GROUP BY level;` (4 niveaux non-vides).
4. **Validation alertes** :
   - Login citoyen → `POST /v1/alerts` → vérifier `status=pending`, pas de WebSocket diffusé.
   - Login admin → `GET /v1/alerts/pending` voit l'alerte.
   - `POST /v1/alerts/:id/validate` → vérifier WS broadcast côté client connecté + log FCM envoyé.
5. **Zones par découpage** :
   - `GET /v1/zones/by-area?region=Dakar` → liste non vide.
   - `GET /v1/zones/by-area?commune=Pikine&quartier=Thiaroye` → sous-ensemble.
   - `GET /v1/zones/alerted` après validation alerte avec `targetZoneId` → la zone apparaît.
6. **Itinéraire** :
   - `POST /v1/routes/calculate` Dakar → Pikine en saison sèche : warnings vides ou `flood_prone` sans `with_rain`.
   - Insérer alerte `flood` validée sur une zone du trajet → relancer : la route alternative est choisie, `avoidedZones` contient la zone.
   - Mock météo `heavyRain` sur une zone inondable du trajet → warning `flood_prone_with_rain`.
7. **Tests unitaires** : `npm run test -- alerts.service flood-risk-evaluator route.service zones.service`.
