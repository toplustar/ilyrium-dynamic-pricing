import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddApiKeyIdToUsageMetrics1728692000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "usage_metrics"
      ADD COLUMN "api_key_id" UUID NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_USAGE_METRICS_API_KEY_ID" ON "usage_metrics" ("api_key_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_USAGE_METRICS_API_KEY_ID";`);
    await queryRunner.query(`
      ALTER TABLE "usage_metrics"
      DROP COLUMN "api_key_id";
    `);
  }
}
