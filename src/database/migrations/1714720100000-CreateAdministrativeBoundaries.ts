import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdministrativeBoundaries1714720100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis;`);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE administrative_boundaries_level_enum
          AS ENUM ('region', 'department', 'commune', 'quartier');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS administrative_boundaries (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        level administrative_boundaries_level_enum NOT NULL,
        name varchar(200) NOT NULL,
        "parentId" uuid NULL REFERENCES administrative_boundaries(id) ON DELETE SET NULL,
        code varchar(50) NULL,
        geometry geometry(MultiPolygon, 4326) NOT NULL,
        centroid geometry(Point, 4326) NULL,
        "createdAt" timestamp NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_boundaries_level ON administrative_boundaries (level);
      CREATE INDEX IF NOT EXISTS idx_admin_boundaries_name ON administrative_boundaries (name);
      CREATE INDEX IF NOT EXISTS idx_admin_boundaries_parent ON administrative_boundaries ("parentId");
      CREATE INDEX IF NOT EXISTS idx_admin_boundaries_geometry
        ON administrative_boundaries USING GIST (geometry);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_admin_boundaries_geometry;
      DROP INDEX IF EXISTS idx_admin_boundaries_parent;
      DROP INDEX IF EXISTS idx_admin_boundaries_name;
      DROP INDEX IF EXISTS idx_admin_boundaries_level;
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS administrative_boundaries;`);
    await queryRunner.query(`DROP TYPE IF EXISTS administrative_boundaries_level_enum;`);
  }
}
