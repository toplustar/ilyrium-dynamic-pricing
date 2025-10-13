import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTelegramUsersTable1728691500000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "telegram_users" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "telegram_id" VARCHAR UNIQUE NOT NULL,
        "username" VARCHAR NULL,
        "first_name" VARCHAR NULL,
        "last_name" VARCHAR NULL,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "last_seen_at" TIMESTAMP NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_TELEGRAM_USERS_TELEGRAM_ID" ON "telegram_users" ("telegram_id");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_TELEGRAM_USERS_IS_ACTIVE" ON "telegram_users" ("is_active");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_TELEGRAM_USERS_IS_ACTIVE";`);
    await queryRunner.query(`DROP INDEX "IDX_TELEGRAM_USERS_TELEGRAM_ID";`);
    await queryRunner.query(`DROP TABLE "telegram_users";`);
  }
}
