import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaymentAttemptsTable1728691600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "payment_attempts" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id" UUID NOT NULL,
        "memo" VARCHAR(10) UNIQUE NOT NULL,
        "tier" VARCHAR(50) NOT NULL,
        "duration" INTEGER NOT NULL,
        "amount_expected" DECIMAL(18, 6) NOT NULL,
        "amount_paid" DECIMAL(18, 6) NOT NULL DEFAULT 0,
        "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        "expires_at" TIMESTAMP NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_PAYMENT_ATTEMPTS_USER_ID" ON "payment_attempts" ("user_id");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_PAYMENT_ATTEMPTS_MEMO" ON "payment_attempts" ("memo");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_PAYMENT_ATTEMPTS_STATUS" ON "payment_attempts" ("status");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_PAYMENT_ATTEMPTS_STATUS";`);
    await queryRunner.query(`DROP INDEX "IDX_PAYMENT_ATTEMPTS_MEMO";`);
    await queryRunner.query(`DROP INDEX "IDX_PAYMENT_ATTEMPTS_USER_ID";`);
    await queryRunner.query(`DROP TABLE "payment_attempts";`);
  }
}
