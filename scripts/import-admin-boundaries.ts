/**
 * Import Senegal administrative boundaries shapefiles into PostGIS.
 *
 * Usage:
 *   npm run seed:boundaries
 *
 * Requires: npm i -D shapefile proj4 @types/proj4
 *
 * Source shapefiles (EPSG:32628 - WGS84 UTM Zone 28N):
 *   Data/Régions/Region.shp
 *   Data/Départements_update/Départements_46_OK.shp
 *   Data/Limites_Communes/Limites_communes.shp
 *   Data/QUARTIERS SN/New_Shapefile.shp
 *
 * Reprojected to EPSG:4326 (WGS84 lat/lng) for PostGIS storage.
 *
 * Hierarchy (parentId) is reconstructed via ST_Within after insertion.
 */
import 'dotenv/config';
import { resolve } from 'path';
import { Client } from 'pg';

interface ShapefileRecord {
  type: 'Feature';
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: any;
  };
  properties: Record<string, any>;
}

type Level = 'region' | 'department' | 'commune' | 'quartier';

interface SourceConfig {
  level: Level;
  path: string;
  nameFields: string[]; // try in order
  codeFields: string[];
  parentLevel: Level | null;
}

const DATA_DIR = resolve(__dirname, '..', 'Data');

const SOURCES: SourceConfig[] = [
  {
    level: 'region',
    path: resolve(DATA_DIR, 'Régions', 'Region.shp'),
    nameFields: ['NOMREG', 'REGION', 'NAME', 'NOM'],
    codeFields: ['admi01_id', 'O_Adm01_ID', 'CODEREG', 'CODE'],
    parentLevel: null,
  },
  {
    level: 'department',
    path: resolve(DATA_DIR, 'Départements_update', 'Départements_46_OK.shp'),
    nameFields: ['admin2Name', 'NOMDEP', 'DEPARTEMEN', 'NAME', 'NOM'],
    codeFields: ['OBJECTID', 'CODEDEP', 'CODE'],
    parentLevel: 'region',
  },
  {
    level: 'commune',
    path: resolve(DATA_DIR, 'Limites_Communes', 'Limites_communes.shp'),
    nameFields: ['CCRCA', 'CCRCA_1', 'NOMCOM', 'COMMUNE', 'NAME', 'NOM'],
    codeFields: ['COD_ENTITE', 'COD_CCRCA', 'CODECOM', 'CODE'],
    parentLevel: 'department',
  },
  // Quartiers shapefile (Data/QUARTIERS SN/New_Shapefile.shp) has no name attribute
  // (only an Id field) and just 2 features — skipped intentionally.
];

// EPSG:32628 (WGS 84 / UTM Zone 28N) -> EPSG:4326 (WGS 84)
const SOURCE_CRS = '+proj=utm +zone=28 +datum=WGS84 +units=m +no_defs';
const TARGET_CRS = '+proj=longlat +datum=WGS84 +no_defs';

function pickField(props: Record<string, any>, candidates: string[]): string | null {
  for (const c of candidates) {
    const upper = c.toUpperCase();
    for (const key of Object.keys(props)) {
      if (key.toUpperCase() === upper && props[key] != null && String(props[key]).trim() !== '') {
        return String(props[key]).trim();
      }
    }
  }
  return null;
}

function reprojectCoords(coords: any, proj: any): any {
  if (typeof coords[0] === 'number') {
    const [x, y] = coords as [number, number];
    const [lng, lat] = proj.forward([x, y]);
    return [lng, lat];
  }
  return (coords as any[]).map(c => reprojectCoords(c, proj));
}

function toMultiPolygon(geom: { type: string; coordinates: any }) {
  if (geom.type === 'Polygon') {
    return { type: 'MultiPolygon', coordinates: [geom.coordinates] };
  }
  return geom;
}

async function importLevel(client: Client, src: SourceConfig, proj4: any) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const shapefile: any = require('shapefile');
  const projInstance = proj4(SOURCE_CRS, TARGET_CRS);

  console.log(`\n=== Importing ${src.level} from ${src.path} ===`);

  const source = await shapefile.open(src.path);
  let count = 0;
  let skipped = 0;

  while (true) {
    const result = await source.read();
    if (result.done) break;

    const feature = result.value as ShapefileRecord;
    if (!feature || !feature.geometry) {
      skipped++;
      continue;
    }

    const name = pickField(feature.properties, src.nameFields);
    if (!name) {
      skipped++;
      continue;
    }
    const code = pickField(feature.properties, src.codeFields);

    const reprojected = {
      type: feature.geometry.type,
      coordinates: reprojectCoords(feature.geometry.coordinates, projInstance),
    };
    const multiPoly = toMultiPolygon(reprojected);
    const geomJson = JSON.stringify(multiPoly);

    await client.query(
      `INSERT INTO administrative_boundaries (level, name, code, geometry, centroid, "createdAt")
       VALUES (
         $1, $2, $3,
         ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)),
         ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)),
         NOW()
       )`,
      [src.level, name, code, geomJson],
    );
    count++;
  }

  console.log(`  Inserted: ${count}   Skipped: ${skipped}`);
}

async function rebuildHierarchy(client: Client) {
  console.log('\n=== Rebuilding parent hierarchy via ST_Within(centroid) ===');

  const linkings: Array<{ child: Level; parent: Level }> = [
    { child: 'department', parent: 'region' },
    { child: 'commune', parent: 'department' },
  ];

  for (const { child, parent } of linkings) {
    const res = await client.query(
      `UPDATE administrative_boundaries c
         SET "parentId" = p.id
         FROM administrative_boundaries p
        WHERE c.level = $1
          AND p.level = $2
          AND ST_Within(c.centroid, p.geometry)`,
      [child, parent],
    );
    console.log(`  ${child} -> ${parent}: ${res.rowCount} linked`);
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL not set in environment');
  }

  const proj4 = (await import('proj4')).default;

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT COUNT(*)::int AS n FROM administrative_boundaries',
    );
    if (existing.rows[0].n > 0) {
      console.log(`Truncating existing ${existing.rows[0].n} boundaries...`);
      await client.query('TRUNCATE administrative_boundaries CASCADE');
    }

    for (const src of SOURCES) {
      await importLevel(client, src, proj4);
    }

    await rebuildHierarchy(client);

    const summary = await client.query(
      `SELECT level, COUNT(*)::int AS n
         FROM administrative_boundaries
        GROUP BY level
        ORDER BY level`,
    );
    console.log('\n=== Summary ===');
    for (const row of summary.rows) {
      console.log(`  ${row.level}: ${row.n}`);
    }

    await client.query('COMMIT');
    console.log('\nDone.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Import failed:', err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
