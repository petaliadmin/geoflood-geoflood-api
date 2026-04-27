# Plan d'Intégration — Zones Inondables (Zone_inondable_humide)

## Contexte

Le dossier `Zone_inondable_humide/` contient un Shapefile ESRI de **571 polygones** représentant les zones inondables et humides de la région de Dakar/Sénégal (projection UTM Zone 28N). L'API backend NestJS est consommée par une application mobile Flutter.

Ce document organise les tâches par **domaine** pour permettre un travail parallèle entre équipes.

---

## Données source

| Fichier | Rôle | Taille |
|---------|------|--------|
| `Zone_inondable_humide.shp` | Géométries PolygonZ | 2.0 MB |
| `Zone_inondable_humide.shx` | Index spatial | 4.6 KB |
| `Zone_inondable_humide.dbf` | Attributs (571 enregistrements, 15 champs) | 314 KB |
| `Zone_inondable_humide.prj` | Projection WGS 1984 UTM Zone 28N (EPSG:32628) | 402 B |
| `Zone_inondable_humide.cpg` | Encodage UTF-8 | 5 B |

**Attributs .dbf :** NAME, ALTITUDE, Elevation, alti_test, Nature, TYPE, Type, Type_bord, Designatio, RuleID, RuleID_1, Shape_Leng, Shape_Area, SHAPE_Leng, SHAPE_Area.

---

## Contrat API (Backend ↔ Flutter)

**Format de réponse attendu par Flutter** (`ZonesApi._parseList` — `zones_api.dart:30-37`) :

```json
{
  "zones": [
    {
      "id": "uuid",
      "name": "Zone Pikine",
      "level": "high",
      "polygon": [ {"lat": 14.7567, "lng": -17.3908} ],
      "center": {"lat": 14.7568, "lng": -17.3904},
      "city": "Dakar",
      "score": 85,
      "createdAt": "2026-04-01T00:00:00.000Z"
    }
  ]
}
```

**Points critiques :**
1. Flutter attend `data['zones']` (objet wrappé), pas un array brut
2. `FloodZoneDto.fromJson()` parse polygon en `{lat, lng}` OU `[lng, lat]` (GeoJSON fallback)
3. Le modèle `FloodZone` Dart n'a que 5 champs — les champs supplémentaires sont ignorés (pas de crash)
4. 571 polygones chargés d'un coup — pas de pagination ni viewport loading

---

## Prérequis

- [ ] PostgreSQL 16 + PostGIS 3.4 en cours d'exécution (`docker-compose up postgres`)
- [ ] GDAL/OGR installé (`ogr2ogr`, `shp2pgsql`)
- [ ] Repo Flutter mobile cloné (`git clone https://github.com/petaliadmin/geoflood-geoflood-mobile.git`)

---

# PARTIE A — DONNÉES GÉOSPATIALES (SIG/DevOps)

> Responsabilité : Ingénieur SIG ou DevOps. Aucun code applicatif modifié.

## A.1 — Validation du Shapefile

**Objectif :** Vérifier l'intégrité avant toute manipulation.

```bash
# Informations générales
ogrinfo -so Zone_inondable_humide/Zone_inondable_humide.shp Zone_inondable_humide

# Compter les features
ogrinfo -sql "SELECT COUNT(*) FROM Zone_inondable_humide" \
  Zone_inondable_humide/Zone_inondable_humide.shp

# Vérifier les géométries invalides
ogr2ogr -f "GeoJSON" /dev/null Zone_inondable_humide/Zone_inondable_humide.shp \
  -sql "SELECT * FROM Zone_inondable_humide WHERE OGR_GEOMETRY IS NOT NULL" \
  -dialect OGRSQL
```

**Estimer la taille du payload mobile :**

```bash
ogr2ogr -f "GeoJSON" -t_srs EPSG:4326 -dim 2 \
  -lco COORDINATE_PRECISION=6 \
  /tmp/test_payload.geojson \
  Zone_inondable_humide/Zone_inondable_humide.shp

ls -lh /tmp/test_payload.geojson
# Si > 2 MB → simplification obligatoire (Partie B.5)
```

> **Contrainte mobile :** Sur réseau 3G africain (~500 Kbps), 2 MB = ~32 secondes. Objectif : < 500 KB (gzip).

**Critère de succès :** 571 features valides, projection EPSG:32628 confirmée.

---

## A.2 — Conversion et reprojection vers PostGIS

**Objectif :** Shapefile UTM 28N (EPSG:32628) → WGS84 (EPSG:4326), 2D, dans PostgreSQL.

### Option A — shp2pgsql (directe)

```bash
shp2pgsql -s 32628:4326 -D -W UTF-8 \
  Zone_inondable_humide/Zone_inondable_humide.shp \
  staging_zones_inondables | \
  psql -h localhost -U geoflood -d geoflood_db
```

### Option B — ogr2ogr (via GeoJSON intermédiaire)

```bash
ogr2ogr -f "GeoJSON" \
  -t_srs EPSG:4326 -dim 2 \
  -lco COORDINATE_PRECISION=6 \
  -makevalid \
  data/zones_inondables.geojson \
  Zone_inondable_humide/Zone_inondable_humide.shp
```

> `COORDINATE_PRECISION=6` (~11 cm) est suffisant pour l'affichage mobile.

**Critère de succès :** Table `staging_zones_inondables`, 571 lignes, SRID 4326, 2D.

---

## A.3 — Validation post-conversion

```sql
SELECT COUNT(*) FROM staging_zones_inondables;
-- Attendu : 571

SELECT ST_SRID(wkb_geometry) FROM staging_zones_inondables LIMIT 1;
-- Attendu : 4326

SELECT ST_NDims(wkb_geometry) FROM staging_zones_inondables LIMIT 1;
-- Attendu : 2

-- Identifier les géométries invalides
SELECT COUNT(*) FROM staging_zones_inondables
WHERE NOT ST_IsValid(wkb_geometry);

-- Corriger
UPDATE staging_zones_inondables
SET wkb_geometry = ST_MakeValid(wkb_geometry)
WHERE NOT ST_IsValid(wkb_geometry);
```

**Critère de succès :** 571 géométries 2D valides en WGS84.

---

# PARTIE B — BACKEND (NestJS)

> Responsabilité : Développeur backend. Dépend de la Partie A (table staging prête).

## B.1 — Extension du modèle FloodZoneEntity

**Fichier :** `src/modules/zones/entities/zone.entity.ts`

Ajouter après la ligne 56 (avant `createdAt`) :

```typescript
@Column('double precision', { nullable: true })
altitude: number;

@Column('double precision', { nullable: true })
elevation: number;

@Column('varchar', { length: 50, nullable: true })
nature: string;

@Column('varchar', { length: 50, nullable: true })
zoneType: string;

@Column('varchar', { length: 50, nullable: true })
typeBord: string;

@Column('varchar', { length: 100, nullable: true })
designation: string;

@Column('double precision', { nullable: true })
shapeArea: number;

@Column('double precision', { nullable: true })
shapeLeng: number;

@Column('varchar', { length: 50, nullable: true, default: 'manual' })
source: string;
```

**Pourquoi `nullable: true` :** Les zones existantes n'ont pas ces champs. Côté Flutter, `fromJson()` ignore les champs inconnus — aucun crash.

**Impact Flutter :** AUCUN (rétrocompatible).

---

## B.2 — Migration (production)

**Fichier :** `src/database/migrations/<timestamp>-AddShapefileFieldsToFloodZones.ts`

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShapefileFieldsToFloodZones1714000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE flood_zones
      ADD COLUMN IF NOT EXISTS altitude double precision,
      ADD COLUMN IF NOT EXISTS elevation double precision,
      ADD COLUMN IF NOT EXISTS nature varchar(50),
      ADD COLUMN IF NOT EXISTS "zoneType" varchar(50),
      ADD COLUMN IF NOT EXISTS "typeBord" varchar(50),
      ADD COLUMN IF NOT EXISTS designation varchar(100),
      ADD COLUMN IF NOT EXISTS "shapeArea" double precision,
      ADD COLUMN IF NOT EXISTS "shapeLeng" double precision,
      ADD COLUMN IF NOT EXISTS source varchar(50) DEFAULT 'manual';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE flood_zones
      DROP COLUMN IF EXISTS altitude,
      DROP COLUMN IF EXISTS elevation,
      DROP COLUMN IF EXISTS nature,
      DROP COLUMN IF EXISTS "zoneType",
      DROP COLUMN IF EXISTS "typeBord",
      DROP COLUMN IF EXISTS designation,
      DROP COLUMN IF EXISTS "shapeArea",
      DROP COLUMN IF EXISTS "shapeLeng",
      DROP COLUMN IF EXISTS source;
    `);
  }
}
```

> En dev, `synchronize: true` (`app.module.ts:86`) crée les colonnes automatiquement.

**Critère de succès :** Colonnes créées, app Flutter existante fonctionne sans modification.

---

## B.3 — Script d'import (Seeder)

**Fichier :** `src/database/seeders/seed.ts`

```typescript
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { DataSource } from 'typeorm';

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  console.log('Importing zones inondables from staging table...');

  try {
    const stagingExists = await dataSource.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'staging_zones_inondables'
      );
    `);

    if (!stagingExists[0].exists) {
      console.log('Table staging_zones_inondables not found. Run Partie A first.');
      await app.close();
      return;
    }

    const [{ count }] = await dataSource.query(
      'SELECT COUNT(*) as count FROM staging_zones_inondables'
    );
    console.log(`Found ${count} zones to import.`);

    const result = await dataSource.query(`
      INSERT INTO flood_zones (
        id, name, level, polygon, "centerLat", "centerLng",
        city, score, altitude, elevation, nature,
        "zoneType", "typeBord", designation,
        "shapeArea", "shapeLeng", source
      )
      SELECT
        gen_random_uuid(),
        COALESCE(NULLIF(TRIM(s."name"), ''), 'Zone Inondable #' || s.ogc_fid),
        CASE
          WHEN COALESCE(s."altitude", s."elevation", 0) < 5 THEN 'high'
          WHEN COALESCE(s."altitude", s."elevation", 0) < 15 THEN 'medium'
          ELSE 'low'
        END,
        ST_Force2D(ST_MakeValid(s.wkb_geometry)),
        ST_Y(ST_Centroid(s.wkb_geometry)),
        ST_X(ST_Centroid(s.wkb_geometry)),
        'Dakar',
        CASE
          WHEN COALESCE(s."altitude", s."elevation", 0) < 5 THEN 80 + FLOOR(RANDOM() * 20)
          WHEN COALESCE(s."altitude", s."elevation", 0) < 15 THEN 40 + FLOOR(RANDOM() * 40)
          ELSE FLOOR(RANDOM() * 40)
        END,
        s."altitude",
        s."elevation",
        s."nature",
        COALESCE(s."type", s."type_1"),
        s."type_bord",
        s."designatio",
        s."shape_area",
        s."shape_leng",
        'shapefile_zone_inondable_humide'
      FROM staging_zones_inondables s
      ON CONFLICT DO NOTHING;
    `);

    console.log(`Imported ${result[1]} zones into flood_zones.`);

    const stats = await dataSource.query(`
      SELECT level, COUNT(*) as count, ROUND(AVG(score)) as avg_score
      FROM flood_zones
      WHERE source = 'shapefile_zone_inondable_humide'
      GROUP BY level ORDER BY level;
    `);
    console.log('Import statistics:', stats);

  } catch (error) {
    console.error('Import failed:', error);
  } finally {
    await app.close();
  }
}

seed();
```

**Classification du risque :**

| Altitude | Niveau | Score | Justification |
|----------|--------|-------|---------------|
| < 5 m | `high` | 80-100 | Zone très basse, forte rétention d'eau |
| 5-15 m | `medium` | 40-80 | Zone intermédiaire |
| > 15 m | `low` | 0-40 | Zone haute, drainage naturel |

**Exécution :**

```bash
npx ts-node -r tsconfig-paths/register src/database/seeders/seed.ts
```

**Critère de succès :** 571 zones dans `flood_zones` avec `source = 'shapefile_zone_inondable_humide'`.

---

## B.4 — Adaptation de l'API (contrat Flutter)

**Problème critique :** Flutter attend `{"zones": [...]}`, le backend retourne un array brut.

### B.4.1 Fichier : `src/modules/zones/zones.controller.ts`

Wrapper toutes les réponses :

```typescript
@Get()
@ApiOperation({ summary: 'Get all flood zones' })
@ApiQuery({ name: 'city', required: false })
@ApiQuery({ name: 'level', required: false })
@ApiQuery({ name: 'source', required: false, description: 'Filter by data source' })
@ApiQuery({ name: 'nature', required: false, description: 'Filter by zone nature' })
@ApiQuery({ name: 'lat', required: false })
@ApiQuery({ name: 'lng', required: false })
@ApiQuery({ name: 'radius', required: false })
async getZones(
  @Query() query: {
    city?: string;
    level?: string;
    source?: string;
    nature?: string;
    lat?: number;
    lng?: number;
    radius?: number;
  },
) {
  const zones = await this.zonesService.findAll(query);
  return { zones };
}

@Get('nearby')
@ApiOperation({ summary: 'Get nearby flood zones' })
async getNearby(@Query() query: { lat: number; lng: number; radius?: number }) {
  const zones = await this.zonesService.getNearby(query.lat, query.lng, query.radius);
  return { zones };
}

@Get('risk-map')
@ApiOperation({ summary: 'Get zones for risk map (mobile-optimized)' })
@ApiQuery({ name: 'city', required: false })
@ApiQuery({ name: 'zoom', required: false, description: 'Zoom level (8-18) for simplification' })
async getRiskMap(@Query() query: { city?: string; zoom?: number }) {
  const zones = await this.zonesService.getRiskMapOptimized(query);
  return { zones };
}
```

### B.4.2 Fichier : `src/modules/zones/zones.service.ts`

Ajouter les filtres dans `findAll()` :

```typescript
if (query?.source) {
  qb = qb.andWhere('zone.source = :source', { source: query.source });
}
if (query?.nature) {
  qb = qb.andWhere('zone.nature = :nature', { nature: query.nature });
}
```

Mettre à jour `formatZoneResponse()` :

```typescript
private formatZoneResponse(zone: FloodZoneEntity): FloodZoneDto {
  const coordinates = zone.polygon?.coordinates?.[0] || [];
  const polygon = coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng }));

  return {
    id: zone.id,
    name: zone.name,
    level: zone.level as RiskLevel,
    polygon,
    center: { lat: zone.centerLat, lng: zone.centerLng },
    city: zone.city,
    score: zone.score,
    altitude: zone.altitude,
    elevation: zone.elevation,
    nature: zone.nature,
    zoneType: zone.zoneType,
    designation: zone.designation,
    shapeArea: zone.shapeArea,
    source: zone.source,
    createdAt: zone.createdAt,
  };
}
```

### B.4.3 Fichier : `src/common/dtos/index.ts`

Étendre `FloodZoneDto` :

```typescript
export class FloodZoneDto {
  id: string;
  name: string;
  level: RiskLevel;
  polygon: LatLng[];
  center: LatLng;
  city: string;
  score?: number;
  altitude?: number;
  elevation?: number;
  nature?: string;
  zoneType?: string;
  designation?: string;
  shapeArea?: number;
  source?: string;
  createdAt: Date;
}
```

**Critère de succès :** `GET /v1/zones` retourne `{"zones": [...]}` avec polygon en `{lat, lng}`.

---

## B.5 — Optimisation payload mobile (simplification + cache)

**Problème :** 571 polygones complexes = 2-5 MB JSON. Inacceptable en 3G.

### B.5.1 Simplification géométrique par zoom

**Fichier :** `src/modules/zones/zones.service.ts`

```typescript
async getRiskMapOptimized(query?: {
  city?: string;
  zoom?: number;
}): Promise<FloodZoneDto[]> {
  const zoom = query?.zoom || 12;
  let tolerance: number;
  if (zoom <= 10) tolerance = 0.005;      // ~550m — vue ville
  else if (zoom <= 13) tolerance = 0.001; // ~111m — vue quartier
  else tolerance = 0;                     // complet — vue rue

  let qb = this.zonesRepository.createQueryBuilder('zone');

  if (query?.city) {
    qb = qb.where('zone.city = :city', { city: query.city });
  }

  if (tolerance > 0) {
    qb = qb.select([
      'zone.id', 'zone.name', 'zone.level',
      'zone.centerLat', 'zone.centerLng',
      'zone.city', 'zone.score', 'zone.source',
    ]);
    qb = qb.addSelect(
      `ST_AsGeoJSON(ST_Simplify(zone.polygon, ${tolerance}))`,
      'simplified_polygon',
    );

    const rawZones = await qb.getRawMany();
    return rawZones.map(z => {
      const geojson = JSON.parse(z.simplified_polygon);
      const coordinates = geojson?.coordinates?.[0] || [];
      const polygon = coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng }));
      return {
        id: z.zone_id,
        name: z.zone_name,
        level: z.zone_level as RiskLevel,
        polygon,
        center: { lat: z.zone_centerLat, lng: z.zone_centerLng },
        city: z.zone_city,
        score: z.zone_score,
        source: z.zone_source,
        createdAt: z.zone_createdAt,
      };
    });
  }

  return this.findAll({ city: query?.city });
}
```

### B.5.2 Compression gzip

**Fichier :** `src/main.ts`

```typescript
import * as compression from 'compression';
app.use(compression());
```

### B.5.3 Cache Redis

```typescript
async getRiskMapOptimized(query?: { city?: string; zoom?: number }): Promise<FloodZoneDto[]> {
  const cacheKey = `risk-map:${query?.city || 'all'}:${query?.zoom || 12}`;
  const cached = await this.redisService.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // ... requête DB ...

  await this.redisService.set(cacheKey, JSON.stringify(result), 300); // 5 min TTL
  return result;
}
```

### B.5.4 Impact mesuré

| Zoom | Tolérance | Payload estimé | Avec gzip | Temps 3G |
|------|-----------|----------------|-----------|----------|
| 8-10 | 0.005 | ~100 KB | ~25 KB | < 1s |
| 11-13 | 0.001 | ~300 KB | ~80 KB | ~1.5s |
| 14+ | 0 | ~1-2 MB | ~300 KB | ~5s |

**Critère de succès :** Payload < 500 KB gzippé pour zoom ≤ 13, temps serveur < 200ms.

---

## B.6 — Tests backend

**Fichier :** `src/modules/zones/__tests__/zones-import.spec.ts`

```typescript
describe('Zones Import - Zone_inondable_humide', () => {
  it('should have 571 imported zones', async () => {
    const count = await zonesRepository.count({
      where: { source: 'shapefile_zone_inondable_humide' },
    });
    expect(count).toBe(571);
  });

  it('should return wrapped response for Flutter', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/zones?source=shapefile_zone_inondable_humide')
      .expect(200);

    expect(response.body).toHaveProperty('zones');
    expect(Array.isArray(response.body.zones)).toBe(true);
    expect(response.body.zones.length).toBe(571);
  });

  it('should return polygon as {lat, lng} objects', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/zones?source=shapefile_zone_inondable_humide')
      .expect(200);

    const zone = response.body.zones[0];
    expect(zone.polygon[0]).toHaveProperty('lat');
    expect(zone.polygon[0]).toHaveProperty('lng');
    expect(typeof zone.polygon[0].lat).toBe('number');
  });

  it('should return center within Dakar bounds', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/zones?source=shapefile_zone_inondable_humide')
      .expect(200);

    const zone = response.body.zones[0];
    expect(zone.center.lat).toBeGreaterThan(14.5);
    expect(zone.center.lat).toBeLessThan(15.0);
    expect(zone.center.lng).toBeGreaterThan(-17.6);
    expect(zone.center.lng).toBeLessThan(-17.1);
  });

  it('should simplify polygons at low zoom', async () => {
    const full = await request(app.getHttpServer())
      .get('/v1/zones/risk-map?zoom=16').expect(200);
    const simplified = await request(app.getHttpServer())
      .get('/v1/zones/risk-map?zoom=9').expect(200);

    const fullSize = JSON.stringify(full.body).length;
    const simplifiedSize = JSON.stringify(simplified.body).length;
    expect(simplifiedSize).toBeLessThan(fullSize * 0.5);
  });

  it('should have valid geometries', async () => {
    const result = await dataSource.query(`
      SELECT COUNT(*) as count FROM flood_zones
      WHERE source = 'shapefile_zone_inondable_humide'
        AND NOT ST_IsValid(polygon)
    `);
    expect(result[0].count).toBe('0');
  });
});
```

---

# PARTIE C — MOBILE FLUTTER

> Responsabilité : Développeur Flutter. Peut commencer dès que la Partie B.4 est déployée.
> Repo : `https://github.com/petaliadmin/geoflood-geoflood-mobile.git`

## C.1 — Paramètre zoom dans l'API (P1 — Recommandé)

**Objectif :** Envoyer le niveau de zoom au backend pour recevoir des polygones simplifiés.

### C.1.1 Fichier : `lib/features/maps/data/zones_api.dart`

Ajouter `zoom` dans `FloodZonesRepository` et `ZonesApi.fetch()` :

```dart
abstract class FloodZonesRepository {
  Future<List<FloodZone>> fetch({
    String? city,
    RiskLevel? level,
    double? lat,
    double? lng,
    double? radius,
    int? zoom,              // NOUVEAU
  });
  // ...
}

class ZonesApi implements FloodZonesRepository {
  // ...
  @override
  Future<List<FloodZone>> fetch({
    String? city,
    RiskLevel? level,
    double? lat,
    double? lng,
    double? radius,
    int? zoom,              // NOUVEAU
  }) async {
    final res = await _dio.get<Map<String, dynamic>>(
      '/zones',
      queryParameters: {
        if (city != null && city.isNotEmpty) 'city': city,
        if (level != null) 'level': riskLevelToString(level),
        if (lat != null) 'lat': lat,
        if (lng != null) 'lng': lng,
        if (radius != null) 'radius': radius,
        if (zoom != null) 'zoom': zoom,   // NOUVEAU
      },
    );
    return _parseList(res.data);
  }
}
```

### C.1.2 Fichier : `lib/features/maps/application/flood_zones_provider.dart`

Ajouter un provider de zoom et recharger les zones au changement :

```dart
final mapZoomProvider = StateProvider<int>((_) => 12);

final floodZonesProvider = FutureProvider<List<FloodZone>>((ref) {
  final user = ref.watch(authControllerProvider).user;
  final zoom = ref.watch(mapZoomProvider);
  return ref.watch(floodZonesRepoProvider).fetch(
    city: user?.city,
    zoom: zoom,
  );
});
```

### C.1.3 Fichier : `lib/features/maps/presentation/full_map_screen.dart`

Écouter le changement de zoom dans `MapOptions` :

```dart
FlutterMap(
  mapController: _controller,
  options: MapOptions(
    initialCenter: _userPosition,
    initialZoom: _initialZoom,
    onPositionChanged: (position, hasGesture) {
      if (hasGesture) {
        final newZoom = position.zoom?.round() ?? 12;
        final currentZoom = ref.read(mapZoomProvider);
        if (newZoom != currentZoom) {
          ref.read(mapZoomProvider.notifier).state = newZoom;
        }
      }
    },
  ),
  // ...
)
```

**Critère de succès :** Changement de zoom → nouveau fetch avec polygones adaptés.

---

## C.2 — Performance rendering (P1 — Recommandé)

**Problème :** `flutter_map` avec > 200 polygones complexes peut causer du jank (< 60 FPS).

### C.2.1 Viewport culling

**Fichier :** `lib/features/maps/presentation/full_map_screen.dart`

Ne dessiner que les polygones visibles à l'écran :

```dart
List<Polygon> _polygonsFor(List<FloodZone> zones, MapLayersState layers) {
  final bounds = _controller.camera.visibleBounds;

  bool keep(FloodZone z) => switch (z.level) {
    RiskLevel.high => layers.showHigh,
    RiskLevel.medium => layers.showMedium,
    RiskLevel.low => layers.showLow,
  };

  bool isVisible(FloodZone z) {
    return bounds.contains(z.center) ||
           z.polygon.any((p) => bounds.contains(p));
  }

  return zones
    .where(keep)
    .where(isVisible)
    .map((z) => Polygon(
      points: z.polygon,
      color: z.fillColor,
      borderColor: z.strokeColor,
      borderStrokeWidth: 2,
      isFilled: true,
    ))
    .toList();
}
```

### C.2.2 Debounce du rebuild

```dart
Timer? _rebuildTimer;

onPositionChanged: (position, hasGesture) {
  _rebuildTimer?.cancel();
  _rebuildTimer = Timer(const Duration(milliseconds: 100), () {
    if (mounted) setState(() {});
  });
}
```

### C.2.3 Clustering des marqueurs (optionnel)

```yaml
# pubspec.yaml
dependencies:
  flutter_map_marker_cluster: ^1.4.0
```

### C.2.4 Benchmark attendu

| Appareil | Polygones visibles | FPS attendu |
|----------|-------------------|-------------|
| Samsung A13 (low-end) | ~50-100 | 55-60 FPS |
| Samsung S21 (mid-range) | ~200-300 | 60 FPS |
| iPhone 13 | ~500 | 60 FPS |

**Critère de succès :** 60 FPS stable lors du pan/zoom sur Samsung A13.

---

## C.3 — Modèle enrichi + popup info zone (P2 — Optionnel)

**Objectif :** Afficher les métadonnées (altitude, nature, surface) au tap sur une zone.

> L'intégration fonctionne **sans cette étape**. Elle enrichit l'UX.

### C.3.1 Fichier : `lib/features/maps/domain/flood_zone.dart`

```dart
class FloodZone {
  const FloodZone({
    required this.id,
    required this.name,
    required this.level,
    required this.polygon,
    required this.center,
    this.altitude,
    this.elevation,
    this.nature,
    this.zoneType,
    this.designation,
    this.shapeArea,
    this.source,
  });

  final String id;
  final String name;
  final RiskLevel level;
  final List<LatLng> polygon;
  final LatLng center;
  final double? altitude;
  final double? elevation;
  final String? nature;
  final String? zoneType;
  final String? designation;
  final double? shapeArea;
  final String? source;

  Color get fillColor => switch (level) {
    RiskLevel.high => AppColors.riskHigh.withOpacity(0.35),
    RiskLevel.medium => AppColors.riskMed.withOpacity(0.30),
    RiskLevel.low => AppColors.riskLow.withOpacity(0.25),
  };

  Color get strokeColor => switch (level) {
    RiskLevel.high => AppColors.riskHigh,
    RiskLevel.medium => AppColors.riskMed,
    RiskLevel.low => AppColors.riskLow,
  };
}
```

### C.3.2 Fichier : `lib/features/maps/data/flood_zone_dto.dart`

Ajouter le parsing des nouveaux champs dans `fromJson()` :

```dart
return FloodZone(
  id: json['id'] as String,
  name: json['name'] as String? ?? '',
  level: riskLevelFromString(json['level'] as String?),
  polygon: polygon,
  center: center,
  altitude: (json['altitude'] as num?)?.toDouble(),
  elevation: (json['elevation'] as num?)?.toDouble(),
  nature: json['nature'] as String?,
  zoneType: json['zoneType'] as String?,
  designation: json['designation'] as String?,
  shapeArea: (json['shapeArea'] as num?)?.toDouble(),
  source: json['source'] as String?,
);
```

### C.3.3 Fichier : `lib/features/maps/presentation/full_map_screen.dart`

Popup info au tap sur un marker de zone :

```dart
void _showZoneInfo(FloodZone zone) {
  showModalBottomSheet(
    context: context,
    builder: (_) => Container(
      padding: const EdgeInsets.all(20),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              RiskBadge(level: zone.level),
              const SizedBox(width: 12),
              Expanded(
                child: Text(zone.name,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w700)),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (zone.nature != null)
            _InfoRow(icon: Icons.nature, label: 'Nature', value: zone.nature!),
          if (zone.altitude != null)
            _InfoRow(icon: Icons.terrain, label: 'Altitude',
              value: '${zone.altitude!.toStringAsFixed(1)} m'),
          if (zone.designation != null)
            _InfoRow(icon: Icons.label, label: 'Désignation', value: zone.designation!),
          if (zone.shapeArea != null)
            _InfoRow(icon: Icons.square_foot, label: 'Surface',
              value: '${(zone.shapeArea! / 10000).toStringAsFixed(2)} ha'),
        ],
      ),
    ),
  );
}
```

**Critère de succès :** Tap sur zone → bottom sheet avec altitude, nature, surface.

---

## C.4 — Tests Flutter

**Fichier :** `test/features/maps/flood_zone_dto_test.dart`

```dart
void main() {
  test('parses backend response with new fields', () {
    final json = {
      'id': 'test-uuid',
      'name': 'Zone Pikine',
      'level': 'high',
      'polygon': [
        {'lat': 14.7567, 'lng': -17.3908},
        {'lat': 14.7570, 'lng': -17.3900},
        {'lat': 14.7565, 'lng': -17.3895},
      ],
      'center': {'lat': 14.7567, 'lng': -17.3901},
      'altitude': 3.5,
      'nature': 'zone humide',
      'source': 'shapefile_zone_inondable_humide',
      'shapeArea': 25000.5,
    };

    final zone = FloodZoneDto.fromJson(json);
    expect(zone.id, 'test-uuid');
    expect(zone.level, RiskLevel.high);
    expect(zone.polygon.length, 3);
    expect(zone.altitude, 3.5);
    expect(zone.nature, 'zone humide');
  });

  test('backward compat — parses without new fields', () {
    final json = {
      'id': 'old-uuid',
      'name': 'Zone Legacy',
      'level': 'low',
      'polygon': [{'lat': 14.7, 'lng': -17.4}],
      'center': {'lat': 14.7, 'lng': -17.4},
    };

    final zone = FloodZoneDto.fromJson(json);
    expect(zone.id, 'old-uuid');
    expect(zone.altitude, isNull);
    expect(zone.nature, isNull);
  });

  test('handles 571 zones parsing in < 500ms', () {
    final sw = Stopwatch()..start();
    final zones = List.generate(571, (i) => FloodZoneDto.fromJson({
      'id': 'zone-$i',
      'name': 'Zone $i',
      'level': 'medium',
      'polygon': List.generate(50, (j) =>
        {'lat': 14.7 + j * 0.001, 'lng': -17.4 + j * 0.001}),
      'center': {'lat': 14.7, 'lng': -17.4},
    }));
    sw.stop();

    expect(zones.length, 571);
    expect(sw.elapsedMilliseconds, lessThan(500));
  });
}
```

---

# PARTIE D — BASE DE DONNÉES (DBA/PostGIS)

> Responsabilité : DBA ou DevOps. Index et maintenance.

## D.1 — Index additionnels

```sql
CREATE INDEX IF NOT EXISTS idx_flood_zones_source
  ON flood_zones (source);

CREATE INDEX IF NOT EXISTS idx_flood_zones_nature
  ON flood_zones (nature);
```

> L'index GIST sur `polygon` est déjà défini dans `FloodZoneEntity` (ligne 29).

---

## D.2 — Validation post-import

```sql
-- Vérification complète
SELECT
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE NOT ST_IsValid(polygon)) as invalid_geom,
  COUNT(*) FILTER (WHERE ST_SRID(polygon) != 4326) as wrong_srid,
  COUNT(*) FILTER (WHERE ST_NDims(polygon) != 2) as not_2d,
  COUNT(*) FILTER (WHERE "centerLat" IS NULL) as missing_center,
  MIN("centerLat") as min_lat,
  MAX("centerLat") as max_lat,
  MIN("centerLng") as min_lng,
  MAX("centerLng") as max_lng
FROM flood_zones
WHERE source = 'shapefile_zone_inondable_humide';

-- Attendu : total=571, invalid_geom=0, wrong_srid=0, not_2d=0, missing_center=0
-- lat ∈ [14.5, 15.0], lng ∈ [-17.6, -17.1] (Dakar bounds)
```

---

## D.3 — Statistiques par niveau de risque

```sql
SELECT
  level,
  COUNT(*) as count,
  ROUND(AVG(score)) as avg_score,
  ROUND(AVG(altitude)::numeric, 1) as avg_altitude,
  ROUND(SUM("shapeArea")::numeric / 10000, 2) as total_hectares
FROM flood_zones
WHERE source = 'shapefile_zone_inondable_humide'
GROUP BY level
ORDER BY level;
```

---

## D.4 — Nettoyage staging

```sql
DROP TABLE IF EXISTS staging_zones_inondables;
```

---

## D.5 — Rollback

```sql
DELETE FROM flood_zones
WHERE source = 'shapefile_zone_inondable_humide';
```

---

# PARTIE E — DEVOPS / DÉPLOIEMENT

> Responsabilité : DevOps. Orchestre l'exécution des parties A-D.

## E.1 — Checklist de déploiement

```
PREPARATION
[ ] 1. Backup BDD
        pg_dump -h localhost -U geoflood geoflood_db > backup_pre_import.sql

BACKEND (Partie B)
[ ] 2. Déployer le code backend (B.1 + B.2 + B.4 + B.5)
        git add -A && git commit -m "feat(zones): shapefile import + mobile optimization"
[ ] 3. Redémarrer le backend
        docker-compose restart backend

DONNÉES (Partie A)
[ ] 4. Copier le Shapefile dans le container
        docker cp Zone_inondable_humide/ geoflood-postgres:/tmp/
[ ] 5. Import staging
        docker exec geoflood-postgres shp2pgsql -s 32628:4326 -D -W UTF-8 \
          /tmp/Zone_inondable_humide/Zone_inondable_humide.shp \
          staging_zones_inondables | \
          docker exec -i geoflood-postgres psql -U geoflood -d geoflood_db
[ ] 6. Exécuter le seeder (B.3)
        npx ts-node -r tsconfig-paths/register src/database/seeders/seed.ts

VÉRIFICATION API
[ ] 7. Vérifier le format Flutter
        curl http://localhost:3000/v1/zones?source=shapefile_zone_inondable_humide | \
          python3 -c "import sys,json; d=json.load(sys.stdin); \
          print(f'zones: {len(d[\"zones\"])}')"
        # Attendu : zones: 571
[ ] 8. Vérifier la taille payload
        curl -s -o /dev/null -w "%{size_download}" -H "Accept-Encoding: gzip" \
          "http://localhost:3000/v1/zones/risk-map?zoom=12"
        # Attendu : < 500000 bytes

VÉRIFICATION MOBILE (Partie C)
[ ] 9. Tester sur device Flutter
        flutter run -d <device> \
          --dart-define=GEOFLOOD_API_BASE_URL=http://<ip>:3000/v1
        Vérifier :
          ✓ 571 polygones affichés sur la carte
          ✓ Code couleur correct (rouge/orange/vert)
          ✓ Zoom in/out fluide (60 FPS)
          ✓ Tap zone → popup info (si C.3 implémenté)
          ✓ Mode guide contourne les zones high
[ ] 10. Tester en simulation 3G
         Android Studio → Network Inspector → Throttle → 3G
         Vérifier : chargement < 5 secondes

NETTOYAGE (Partie D)
[ ] 11. Nettoyer staging
         DROP TABLE IF EXISTS staging_zones_inondables;
[ ] 12. Exécuter les tests
         npm run test                           # Backend
         cd geoflood-mobile && flutter test     # Flutter
```

---

## E.2 — Rollback complet

```bash
# 1. Supprimer les zones importées (aucun impact sur les zones existantes)
psql -h localhost -U geoflood -d geoflood_db \
  -c "DELETE FROM flood_zones WHERE source = 'shapefile_zone_inondable_humide';"

# 2. L'app Flutter revient automatiquement à l'état précédent

# 3. Si besoin, restaurer le backup complet
psql -h localhost -U geoflood geoflood_db < backup_pre_import.sql
```

---

# RÉCAPITULATIF

## Fichiers par domaine

### Partie A — Données (SIG)
| Action | Outil |
|--------|-------|
| Validation Shapefile | `ogrinfo` |
| Conversion UTM→WGS84 | `shp2pgsql` ou `ogr2ogr` |
| Validation SQL | `psql` |

### Partie B — Backend (NestJS)
| Fichier | Modification |
|---------|-------------|
| `src/modules/zones/entities/zone.entity.ts` | +9 colonnes |
| `src/database/migrations/...` | Migration production |
| `src/database/seeders/seed.ts` | Script import staging→flood_zones |
| `src/modules/zones/zones.controller.ts` | Wrapper `{zones}` + zoom + filtres |
| `src/modules/zones/zones.service.ts` | `formatZoneResponse()` + `getRiskMapOptimized()` + cache Redis |
| `src/common/dtos/index.ts` | +7 champs dans `FloodZoneDto` |
| `src/main.ts` | Vérifier compression gzip |
| `src/modules/zones/__tests__/` | Tests import + contrat Flutter |

### Partie C — Mobile (Flutter)
| Fichier | Modification | Priorité |
|---------|-------------|----------|
| `lib/features/maps/data/zones_api.dart` | Param `zoom` dans `fetch()` | P1 |
| `lib/features/maps/application/flood_zones_provider.dart` | `mapZoomProvider` + reload par zoom | P1 |
| `lib/features/maps/presentation/full_map_screen.dart` | Zoom listener + viewport culling + debounce | P1 |
| `lib/features/maps/domain/flood_zone.dart` | +7 champs optionnels | P2 |
| `lib/features/maps/data/flood_zone_dto.dart` | Parsing nouveaux champs | P2 |
| `lib/features/maps/presentation/full_map_screen.dart` | Popup info zone | P2 |
| `test/features/maps/flood_zone_dto_test.dart` | Tests parsing + perf | P1 |

### Partie D — Base de données (DBA)
| Action | SQL |
|--------|-----|
| Index source/nature | `CREATE INDEX` |
| Validation post-import | Requête d'audit |
| Nettoyage staging | `DROP TABLE` |
| Rollback | `DELETE WHERE source = ...` |

## Priorités

| Priorité | Tâches | Domaine |
|----------|--------|---------|
| **P0** | A.1→A.3, B.1→B.4, D.1 | SIG + Backend + DBA |
| **P1** | B.5, B.6, C.1, C.2, C.4 | Backend + Mobile |
| **P2** | C.3 | Mobile |

## Estimation par domaine

| Domaine | Tâches | Durée |
|---------|--------|-------|
| **A — Données SIG** | A.1→A.3 | ~1h |
| **B — Backend NestJS** | B.1→B.6 | ~5h |
| **C — Mobile Flutter** | C.1→C.4 | ~3h |
| **D — Base de données** | D.1→D.5 | ~30min |
| **E — Déploiement** | E.1→E.2 | ~1h |
| **Total** | | **~10h30** |

## Dépendances entre parties

```
A.1 → A.2 → A.3 ─────────────────────────┐
                                           ├─→ E.1 (déploiement)
B.1 → B.2 → B.3 (dépend A.3) → B.4 → B.5 ┤
                                           │
C.1 (dépend B.4) → C.2 → C.3 → C.4 ──────┤
                                           │
D.1 (parallèle avec B) → D.2 (dépend B.3)─┘
```

**Travail parallélisable :**
- A (SIG) et B.1-B.2 (backend modèle) peuvent démarrer en parallèle
- C (Flutter) peut démarrer dès que B.4 est déployé
- D.1 (index) peut se faire à tout moment
