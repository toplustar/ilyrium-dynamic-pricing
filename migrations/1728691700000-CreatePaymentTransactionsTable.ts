import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaymentTransactionsTable1728691700000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "payment_transactions" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "payment_attempt_id" UUID NOT NULL,
        "signature" VARCHAR UNIQUE NOT NULL,
        "amount" DECIMAL(18, 6) NOT NULL,
        "from_address" VARCHAR NOT NULL,
        "confirmations" INTEGER NOT NULL,
        "verified_at" TIMESTAMP NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY ("payment_attempt_id") REFERENCES "payment_attempts"("id") ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_PAYMENT_TRANSACTIONS_PAYMENT_ATTEMPT_ID" ON "payment_transactions" ("payment_attempt_id");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_PAYMENT_TRANSACTIONS_SIGNATURE" ON "payment_transactions" ("signature");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_PAYMENT_TRANSACTIONS_FROM_ADDRESS" ON "payment_transactions" ("from_address");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_PAYMENT_TRANSACTIONS_FROM_ADDRESS";`);
    await queryRunner.query(`DROP INDEX "IDX_PAYMENT_TRANSACTIONS_SIGNATURE";`);
    await queryRunner.query(`DROP INDEX "IDX_PAYMENT_TRANSACTIONS_PAYMENT_ATTEMPT_ID";`);
    await queryRunner.query(`DROP TABLE "payment_transactions";`);
  }
}
