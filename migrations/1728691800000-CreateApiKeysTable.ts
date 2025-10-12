import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateApiKeysTable1728691800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "api_keys" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id" UUID NOT NULL,
        "key_hash" VARCHAR NOT NULL,
        "key_prefix" VARCHAR(10) NOT NULL,
        "name" VARCHAR NULL,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "expires_at" TIMESTAMP NOT NULL,
        "last_used_at" TIMESTAMP NULL,
        "revoked_at" TIMESTAMP NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_API_KEYS_USER_ID" ON "api_keys" ("user_id");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_API_KEYS_KEY_PREFIX" ON "api_keys" ("key_prefix");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_API_KEYS_IS_ACTIVE" ON "api_keys" ("is_active");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_API_KEYS_IS_ACTIVE";`);
    await queryRunner.query(`DROP INDEX "IDX_API_KEYS_KEY_PREFIX";`);
    await queryRunner.query(`DROP INDEX "IDX_API_KEYS_USER_ID";`);
    await queryRunner.query(`DROP TABLE "api_keys";`);
  }
}
