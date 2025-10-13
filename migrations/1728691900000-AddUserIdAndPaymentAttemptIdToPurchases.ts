import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserIdAndPaymentAttemptIdToPurchases1728691900000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "purchases"
      ADD COLUMN "user_id" UUID NULL,
      ADD COLUMN "payment_attempt_id" UUID NULL;
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_PURCHASES_USER_ID" ON "purchases" ("user_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_PURCHASES_USER_ID";`);
    await queryRunner.query(`
      ALTER TABLE "purchases"
      DROP COLUMN "user_id",
      DROP COLUMN "payment_attempt_id";
    `);
  }
}
