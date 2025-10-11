import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSystemMetricsTable1728691300000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create system_metrics table
    await queryRunner.query(`
      CREATE TABLE "system_metrics" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "total_rps" INTEGER NOT NULL,
        "used_rps" INTEGER NOT NULL,
        "utilization" DECIMAL(5, 4) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create index on timestamp for efficient time-based queries
    await queryRunner.query(`
      CREATE INDEX "IDX_SYSTEM_METRICS_TIMESTAMP" ON "system_metrics" ("created_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_SYSTEM_METRICS_TIMESTAMP";`);
    await queryRunner.query(`DROP TABLE "system_metrics";`);
  }
}
