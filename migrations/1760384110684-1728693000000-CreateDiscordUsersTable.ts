import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateDiscordUsersTable1760384110684 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'discord_users',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'discord_id',
            type: 'varchar',
            isUnique: true,
          },
          {
            name: 'username',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'global_name',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'discriminator',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'last_interaction_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'discord_users',
      new TableIndex({
        name: 'IDX_discord_users_discord_id',
        columnNames: ['discord_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('discord_users');
  }
}
