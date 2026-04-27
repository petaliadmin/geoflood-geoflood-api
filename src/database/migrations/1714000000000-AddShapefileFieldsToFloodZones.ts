import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddShapefileFieldsToFloodZones1714000000000
  implements MigrationInterface
{
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

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_flood_zones_source ON flood_zones (source);
      CREATE INDEX IF NOT EXISTS idx_flood_zones_nature ON flood_zones (nature);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_flood_zones_nature;
      DROP INDEX IF EXISTS idx_flood_zones_source;
    `);

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
