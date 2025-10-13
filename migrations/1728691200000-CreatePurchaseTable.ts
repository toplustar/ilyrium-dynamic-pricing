import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePurchaseTable1728691200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable UUID extension if not already enabled
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    // Create purchases table
    await queryRunner.query(`
      CREATE TABLE "purchases" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "wallet_address" VARCHAR NOT NULL,
        "tier" VARCHAR NOT NULL,
        "rps_allocated" INTEGER NOT NULL,
        "price" DECIMAL(10, 6) NOT NULL,
        "duration" INTEGER NOT NULL DEFAULT 30,
        "expires_at" TIMESTAMP NOT NULL,
        "is_active" BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE INDEX "IDX_PURCHASES_WALLET_ADDRESS" ON "purchases" ("wallet_address");
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_PURCHASES_IS_ACTIVE" ON "purchases" ("is_active");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_PURCHASES_IS_ACTIVE";`);
    await queryRunner.query(`DROP INDEX "IDX_PURCHASES_WALLET_ADDRESS";`);
    await queryRunner.query(`DROP TABLE "purchases";`);
  }
}
