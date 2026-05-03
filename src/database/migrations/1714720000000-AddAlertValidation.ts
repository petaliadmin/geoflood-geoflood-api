import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAlertValidation1714720000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Status enum + column
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE alerts_status_enum AS ENUM ('pending', 'validated', 'rejected');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE alerts
      ADD COLUMN IF NOT EXISTS status alerts_status_enum NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS "createdBy" uuid,
      ADD COLUMN IF NOT EXISTS "validatedBy" uuid,
      ADD COLUMN IF NOT EXISTS "validatedAt" timestamp,
      ADD COLUMN IF NOT EXISTS "rejectionReason" text;
    `);

    // 2. Backfill: every existing alert is treated as already validated
    await queryRunner.query(`
      UPDATE alerts
      SET status = 'validated',
          "validatedAt" = COALESCE("validatedAt", "createdAt")
      WHERE status = 'pending' AND "validatedAt" IS NULL;
    `);

    // 3. Indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts (status);
      CREATE INDEX IF NOT EXISTS idx_alerts_created_by ON alerts ("createdBy");
      CREATE INDEX IF NOT EXISTS idx_alerts_validated_at ON alerts ("validatedAt");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_alerts_validated_at;
      DROP INDEX IF EXISTS idx_alerts_created_by;
      DROP INDEX IF EXISTS idx_alerts_status;
    `);

    await queryRunner.query(`
      ALTER TABLE alerts
      DROP COLUMN IF EXISTS "rejectionReason",
      DROP COLUMN IF EXISTS "validatedAt",
      DROP COLUMN IF EXISTS "validatedBy",
      DROP COLUMN IF EXISTS "createdBy",
      DROP COLUMN IF EXISTS status;
    `);

    await queryRunner.query(`DROP TYPE IF EXISTS alerts_status_enum;`);
  }
}
