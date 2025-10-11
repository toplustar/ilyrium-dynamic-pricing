import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsageMetricsTable1728691400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create usage_metrics table
    await queryRunner.query(`
      CREATE TABLE "usage_metrics" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "wallet_address" VARCHAR NOT NULL,
        "request_count" INTEGER NOT NULL DEFAULT 0,
        "endpoint" VARCHAR NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE INDEX "IDX_USAGE_METRICS_WALLET_ADDRESS" ON "usage_metrics" ("wallet_address");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_USAGE_METRICS_TIMESTAMP" ON "usage_metrics" ("created_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_USAGE_METRICS_TIMESTAMP";`);
    await queryRunner.query(`DROP INDEX "IDX_USAGE_METRICS_WALLET_ADDRESS";`);
    await queryRunner.query(`DROP TABLE "usage_metrics";`);
  }
}
