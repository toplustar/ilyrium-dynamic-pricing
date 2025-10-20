import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveTelegramUsersTable1760988996961 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop telegram_users table if it exists
    await queryRunner.query(`
            DROP TABLE IF EXISTS "telegram_users";
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate telegram_users table (if needed for rollback)
    await queryRunner.query(`
            CREATE TABLE "telegram_users" (
                "id" SERIAL NOT NULL,
                "telegram_id" bigint NOT NULL,
                "username" character varying,
                "first_name" character varying,
                "last_name" character varying,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_telegram_users" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_telegram_users_telegram_id" UNIQUE ("telegram_id")
            );
        `);
  }
}
