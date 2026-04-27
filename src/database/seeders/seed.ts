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
      console.log(
        'Table staging_zones_inondables not found. Import the shapefile first:',
      );
      console.log(
        '  shp2pgsql -s 32628:4326 -D -W UTF-8 Zone_inondable_humide/Zone_inondable_humide.shp staging_zones_inondables | psql ...',
      );
      await app.close();
      return;
    }

    const [{ count }] = await dataSource.query(
      'SELECT COUNT(*) as count FROM staging_zones_inondables',
    );
    console.log(`Found ${count} zones to import.`);

    if (parseInt(count, 10) === 0) {
      console.log('Staging table is empty. Nothing to import.');
      await app.close();
      return;
    }

    const existing = await dataSource.query(`
      SELECT COUNT(*) as count FROM flood_zones
      WHERE source = 'shapefile_zone_inondable_humide';
    `);

    if (parseInt(existing[0].count, 10) > 0) {
      console.log(
        `Already ${existing[0].count} zones imported from this source. Skipping.`,
      );
      console.log(
        'To re-import, first run: DELETE FROM flood_zones WHERE source = \'shapefile_zone_inondable_humide\';',
      );
      await app.close();
      return;
    }

    console.log('Fixing invalid geometries...');
    await dataSource.query(`
      UPDATE staging_zones_inondables
      SET geom = ST_MakeValid(ST_Force2D(geom))
      WHERE NOT ST_IsValid(geom) OR ST_NDims(geom) > 2;
    `);

    console.log('Inserting into flood_zones...');
    const result = await dataSource.query(`
      INSERT INTO flood_zones (
        id, name, level, polygon, "centerLat", "centerLng",
        city, score, altitude, elevation, nature,
        "zoneType", "typeBord", designation,
        "shapeArea", "shapeLeng", source
      )
      SELECT
        gen_random_uuid(),
        COALESCE(NULLIF(TRIM(s."name"), ''), 'Zone Inondable #' || s.gid),
        (CASE
          WHEN COALESCE(s."altitude", s."elevation", 0) < 5 THEN 'high'
          WHEN COALESCE(s."altitude", s."elevation", 0) < 15 THEN 'medium'
          ELSE 'low'
        END)::flood_zones_level_enum,
        (ST_Dump(ST_Force2D(ST_MakeValid(s.geom)))).geom,
        ST_Y(ST_Centroid(s.geom)),
        ST_X(ST_Centroid(s.geom)),
        'Dakar',
        CASE
          WHEN COALESCE(s."altitude", s."elevation", 0) < 5 THEN 80 + FLOOR(RANDOM() * 20)
          WHEN COALESCE(s."altitude", s."elevation", 0) < 15 THEN 40 + FLOOR(RANDOM() * 40)
          ELSE FLOOR(RANDOM() * 40)
        END,
        s."altitude",
        s."elevation",
        s."nature",
        COALESCE(s."type", s."type2"),
        s."type_bord",
        s."designatio",
        s."shape_area",
        s."shape_leng",
        'shapefile_zone_inondable_humide'
      FROM staging_zones_inondables s
      WHERE s.geom IS NOT NULL
        AND ST_IsValid(ST_Force2D(s.geom));
    `);

    const imported = Array.isArray(result) ? result[1] : result.rowCount ?? 0;
    console.log(`Imported ${imported} zones into flood_zones.`);

    const stats = await dataSource.query(`
      SELECT level, COUNT(*) as count, ROUND(AVG(score)) as avg_score
      FROM flood_zones
      WHERE source = 'shapefile_zone_inondable_humide'
      GROUP BY level ORDER BY level;
    `);
    console.table(stats);

    console.log('Import completed successfully.');
  } catch (error) {
    console.error('Import failed:', error);
    process.exitCode = 1;
  } finally {
    await app.close();
  }
}

seed();
