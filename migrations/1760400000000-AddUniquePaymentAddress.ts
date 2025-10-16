import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniquePaymentAddress1760400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add payment_address column
    await queryRunner.query(`
      ALTER TABLE "payment_attempts"
      ADD COLUMN "payment_address" VARCHAR(44) NULL;
    `);

    // Add payment_private_key column
    await queryRunner.query(`
      ALTER TABLE "payment_attempts"
      ADD COLUMN "payment_private_key" BYTEA NULL;
    `);

    // Make memo nullable (for backward compatibility)
    await queryRunner.query(`
      ALTER TABLE "payment_attempts"
      ALTER COLUMN "memo" DROP NOT NULL;
    `);

    // Create unique index on payment_address
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_PAYMENT_ATTEMPTS_PAYMENT_ADDRESS"
      ON "payment_attempts" ("payment_address")
      WHERE "payment_address" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop unique index
    await queryRunner.query(`
      DROP INDEX "IDX_PAYMENT_ATTEMPTS_PAYMENT_ADDRESS";
    `);

    // Restore memo as NOT NULL
    await queryRunner.query(`
      ALTER TABLE "payment_attempts"
      ALTER COLUMN "memo" SET NOT NULL;
    `);

    // Drop payment_private_key column
    await queryRunner.query(`
      ALTER TABLE "payment_attempts"
      DROP COLUMN "payment_private_key";
    `);

    // Drop payment_address column
    await queryRunner.query(`
      ALTER TABLE "payment_attempts"
      DROP COLUMN "payment_address";
    `);
  }
}
