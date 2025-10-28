import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSystemEventsTable1761587223316 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable UUID extension if not already enabled
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    // Create system_events table
    await queryRunner.query(`
      CREATE TABLE "system_events" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "eventType" VARCHAR NOT NULL,
        "description" TEXT,
        "metadata" JSONB,
        "priceData" JSONB,
        "usageData" JSONB,
        "timestamp" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create enum constraint for eventType
    await queryRunner.query(`
      ALTER TABLE "system_events" 
      ADD CONSTRAINT "CHK_system_events_eventType" 
      CHECK ("eventType" IN ('websocket-log', 'rps-change', 'chain-activity-change', 'purchase', 'expiration', 'manual-adjust'));
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE INDEX "IDX_system_events_eventType_timestamp" ON "system_events" ("eventType", "timestamp");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_system_events_timestamp" ON "system_events" ("timestamp");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_system_events_timestamp";`);
    await queryRunner.query(`DROP INDEX "IDX_system_events_eventType_timestamp";`);
    await queryRunner.query(`DROP TABLE "system_events";`);
  }
}
