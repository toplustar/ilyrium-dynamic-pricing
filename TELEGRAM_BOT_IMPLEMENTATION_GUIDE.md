# Telegram Bot with Solana Payment - Complete Implementation Guide

This guide provides step-by-step instructions to implement a Telegram bot that accepts Solana USDC payments and manages API keys for RPC node access.

## Table of Contents
1. [Database Schema](#database-schema)
2. [Entity Creation](#entity-creation)
3. [Migration Files](#migration-files)
4. [Configuration Setup](#configuration-setup)
5. [Core Services](#core-services)
6. [Telegram Bot Module](#telegram-bot-module)
7. [Payment Module](#payment-module)
8. [API Key Module](#api-key-module)
9. [Middleware Integration](#middleware-integration)
10. [Testing](#testing)

---

## 1. Database Schema

### New Tables Overview

#### `telegram_users`
Stores Telegram user information linked to the system.

```sql
CREATE TABLE telegram_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    telegram_id BIGINT UNIQUE NOT NULL,
    telegram_username VARCHAR(255),
    telegram_first_name VARCHAR(255) NOT NULL,
    telegram_last_name VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_telegram_users_telegram_id ON telegram_users(telegram_id);
```

#### `payment_attempts`
Tracks payment attempts with unique memos.

```sql
CREATE TABLE payment_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES telegram_users(id) ON DELETE CASCADE,
    memo VARCHAR(10) UNIQUE NOT NULL,
    tier VARCHAR(50) NOT NULL,
    duration INTEGER NOT NULL,
    amount_expected DECIMAL(18, 6) NOT NULL,
    amount_paid DECIMAL(18, 6) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',
    expires_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_payment_attempts_user_id ON payment_attempts(user_id);
CREATE INDEX idx_payment_attempts_memo ON payment_attempts(memo);
CREATE INDEX idx_payment_attempts_status ON payment_attempts(status);
```

Status enum: `pending`, `partial`, `completed`, `expired`, `cancelled`

#### `payment_transactions`
Records individual Solana transactions for payment attempts.

```sql
CREATE TABLE payment_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    payment_attempt_id UUID NOT NULL REFERENCES payment_attempts(id) ON DELETE CASCADE,
    tx_signature VARCHAR(255) UNIQUE NOT NULL,
    from_wallet VARCHAR(255) NOT NULL,
    amount DECIMAL(18, 6) NOT NULL,
    confirmations INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'pending',
    confirmed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_payment_transactions_payment_attempt_id ON payment_transactions(payment_attempt_id);
CREATE INDEX idx_payment_transactions_tx_signature ON payment_transactions(tx_signature);
```

Status enum: `pending`, `confirmed`, `failed`

#### `api_keys`
Stores hashed API keys for users.

```sql
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES telegram_users(id) ON DELETE CASCADE,
    key_name VARCHAR(255) NOT NULL,
    api_key_hash VARCHAR(255) NOT NULL,
    api_key_prefix VARCHAR(16) NOT NULL,
    last_used_at TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(api_key_prefix);
```

#### Update `purchases` table

```sql
ALTER TABLE purchases ADD COLUMN user_id UUID REFERENCES telegram_users(id);
ALTER TABLE purchases ADD COLUMN payment_attempt_id UUID REFERENCES payment_attempts(id);

CREATE INDEX idx_purchases_user_id ON purchases(user_id);
```

#### Update `usage_metrics` table

```sql
ALTER TABLE usage_metrics ADD COLUMN api_key_id UUID REFERENCES api_keys(id);

CREATE INDEX idx_usage_metrics_api_key_id ON usage_metrics(api_key_id);
```

---

## 2. Entity Creation

### Step 2.1: Create TelegramUser Entity

**File:** `src/modules/telegram-bot/entities/telegram-user.entity.ts`

```typescript
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';

import { Purchase } from '~/modules/pricing/entities/purchase.entity';

@Entity('telegram_users')
@Index(['telegramId'])
export class TelegramUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'telegram_id', type: 'bigint', unique: true })
  telegramId: number;

  @Column({ name: 'telegram_username', nullable: true })
  telegramUsername: string | null;

  @Column({ name: 'telegram_first_name' })
  telegramFirstName: string;

  @Column({ name: 'telegram_last_name', nullable: true })
  telegramLastName: string | null;

  @OneToMany(() => Purchase, purchase => purchase.telegramUser)
  purchases: Purchase[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

### Step 2.2: Create PaymentAttempt Entity

**File:** `src/modules/payment/entities/payment-attempt.entity.ts`

```typescript
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';

import { TelegramUser } from '~/modules/telegram-bot/entities/telegram-user.entity';
import { PaymentTransaction } from './payment-transaction.entity';

export enum PaymentStatus {
  PENDING = 'pending',
  PARTIAL = 'partial',
  COMPLETED = 'completed',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

export enum TierType {
  STARTER = 'Starter',
  DEVELOPER = 'Developer',
  PROFESSIONAL = 'Professional',
  ENTERPRISE = 'Enterprise',
}

@Entity('payment_attempts')
@Index(['userId'])
@Index(['memo'])
@Index(['status'])
export class PaymentAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => TelegramUser, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: TelegramUser;

  @Column({ length: 10, unique: true })
  memo: string;

  @Column({ type: 'varchar', length: 50 })
  tier: TierType;

  @Column({ type: 'int' })
  duration: number;

  @Column({ name: 'amount_expected', type: 'decimal', precision: 18, scale: 6 })
  amountExpected: number;

  @Column({ name: 'amount_paid', type: 'decimal', precision: 18, scale: 6, default: 0 })
  amountPaid: number;

  @Column({ type: 'varchar', length: 20, default: PaymentStatus.PENDING })
  status: PaymentStatus;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @OneToMany(() => PaymentTransaction, transaction => transaction.paymentAttempt)
  transactions: PaymentTransaction[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

### Step 2.3: Create PaymentTransaction Entity

**File:** `src/modules/payment/entities/payment-transaction.entity.ts`

```typescript
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { PaymentAttempt } from './payment-attempt.entity';

export enum TransactionStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
}

@Entity('payment_transactions')
@Index(['paymentAttemptId'])
@Index(['txSignature'])
export class PaymentTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'payment_attempt_id', type: 'uuid' })
  paymentAttemptId: string;

  @ManyToOne(() => PaymentAttempt, attempt => attempt.transactions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payment_attempt_id' })
  paymentAttempt: PaymentAttempt;

  @Column({ name: 'tx_signature', unique: true })
  txSignature: string;

  @Column({ name: 'from_wallet' })
  fromWallet: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  amount: number;

  @Column({ type: 'int', default: 0 })
  confirmations: number;

  @Column({ type: 'varchar', length: 20, default: TransactionStatus.PENDING })
  status: TransactionStatus;

  @Column({ name: 'confirmed_at', type: 'timestamp', nullable: true })
  confirmedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

### Step 2.4: Create ApiKey Entity

**File:** `src/modules/api-key/entities/api-key.entity.ts`

```typescript
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { TelegramUser } from '~/modules/telegram-bot/entities/telegram-user.entity';

@Entity('api_keys')
@Index(['userId'])
@Index(['apiKeyPrefix'])
export class ApiKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => TelegramUser, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: TelegramUser;

  @Column({ name: 'key_name' })
  keyName: string;

  @Column({ name: 'api_key_hash' })
  apiKeyHash: string;

  @Column({ name: 'api_key_prefix', length: 16 })
  apiKeyPrefix: string;

  @Column({ name: 'last_used_at', type: 'timestamp', nullable: true })
  lastUsedAt: Date | null;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
```

### Step 2.5: Update Purchase Entity

**File:** `src/modules/pricing/entities/purchase.entity.ts`

Add these fields to the existing Purchase entity:

```typescript
import { TelegramUser } from '~/modules/telegram-bot/entities/telegram-user.entity';
import { PaymentAttempt } from '~/modules/payment/entities/payment-attempt.entity';

// Add to existing Purchase entity:

@Column({ name: 'user_id', type: 'uuid', nullable: true })
userId: string | null;

@ManyToOne(() => TelegramUser, user => user.purchases, { nullable: true })
@JoinColumn({ name: 'user_id' })
telegramUser: TelegramUser | null;

@Column({ name: 'payment_attempt_id', type: 'uuid', nullable: true })
paymentAttemptId: string | null;

@ManyToOne(() => PaymentAttempt, { nullable: true })
@JoinColumn({ name: 'payment_attempt_id' })
paymentAttempt: PaymentAttempt | null;
```

### Step 2.6: Update UsageMetrics Entity

**File:** `src/modules/pricing/entities/usage-metrics.entity.ts`

Add this field to the existing UsageMetrics entity:

```typescript
import { ApiKey } from '~/modules/api-key/entities/api-key.entity';

// Add to existing UsageMetrics entity:

@Column({ name: 'api_key_id', type: 'uuid', nullable: true })
apiKeyId: string | null;

@ManyToOne(() => ApiKey, { nullable: true })
@JoinColumn({ name: 'api_key_id' })
apiKey: ApiKey | null;
```

---

## 3. Migration Files

### Step 3.1: Create TelegramUsers Migration

**File:** `migrations/[timestamp]-CreateTelegramUsersTable.ts`

```typescript
import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateTelegramUsersTable1234567890001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'telegram_users',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'telegram_id',
            type: 'bigint',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'telegram_username',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'telegram_first_name',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'telegram_last_name',
            type: 'varchar',
            length: '255',
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
      'telegram_users',
      new TableIndex({
        name: 'idx_telegram_users_telegram_id',
        columnNames: ['telegram_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('telegram_users');
  }
}
```

### Step 3.2: Create PaymentAttempts Migration

**File:** `migrations/[timestamp]-CreatePaymentAttemptsTable.ts`

```typescript
import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreatePaymentAttemptsTable1234567890002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'payment_attempts',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'memo',
            type: 'varchar',
            length: '10',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'tier',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'duration',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'amount_expected',
            type: 'decimal',
            precision: 18,
            scale: 6,
            isNullable: false,
          },
          {
            name: 'amount_paid',
            type: 'decimal',
            precision: 18,
            scale: 6,
            default: 0,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            default: "'pending'",
          },
          {
            name: 'expires_at',
            type: 'timestamp',
            isNullable: false,
          },
          {
            name: 'completed_at',
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
      'payment_attempts',
      new TableIndex({
        name: 'idx_payment_attempts_user_id',
        columnNames: ['user_id'],
      }),
    );

    await queryRunner.createIndex(
      'payment_attempts',
      new TableIndex({
        name: 'idx_payment_attempts_memo',
        columnNames: ['memo'],
      }),
    );

    await queryRunner.createIndex(
      'payment_attempts',
      new TableIndex({
        name: 'idx_payment_attempts_status',
        columnNames: ['status'],
      }),
    );

    await queryRunner.createForeignKey(
      'payment_attempts',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'telegram_users',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('payment_attempts');
  }
}
```

### Step 3.3: Create PaymentTransactions Migration

**File:** `migrations/[timestamp]-CreatePaymentTransactionsTable.ts`

```typescript
import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreatePaymentTransactionsTable1234567890003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'payment_transactions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'payment_attempt_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'tx_signature',
            type: 'varchar',
            length: '255',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'from_wallet',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'amount',
            type: 'decimal',
            precision: 18,
            scale: 6,
            isNullable: false,
          },
          {
            name: 'confirmations',
            type: 'int',
            default: 0,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            default: "'pending'",
          },
          {
            name: 'confirmed_at',
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
      'payment_transactions',
      new TableIndex({
        name: 'idx_payment_transactions_payment_attempt_id',
        columnNames: ['payment_attempt_id'],
      }),
    );

    await queryRunner.createIndex(
      'payment_transactions',
      new TableIndex({
        name: 'idx_payment_transactions_tx_signature',
        columnNames: ['tx_signature'],
      }),
    );

    await queryRunner.createForeignKey(
      'payment_transactions',
      new TableForeignKey({
        columnNames: ['payment_attempt_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'payment_attempts',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('payment_transactions');
  }
}
```

### Step 3.4: Create ApiKeys Migration

**File:** `migrations/[timestamp]-CreateApiKeysTable.ts`

```typescript
import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateApiKeysTable1234567890004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'api_keys',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'key_name',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'api_key_hash',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'api_key_prefix',
            type: 'varchar',
            length: '16',
            isNullable: false,
          },
          {
            name: 'last_used_at',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'expires_at',
            type: 'timestamp',
            isNullable: false,
          },
          {
            name: 'revoked_at',
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
      'api_keys',
      new TableIndex({
        name: 'idx_api_keys_user_id',
        columnNames: ['user_id'],
      }),
    );

    await queryRunner.createIndex(
      'api_keys',
      new TableIndex({
        name: 'idx_api_keys_prefix',
        columnNames: ['api_key_prefix'],
      }),
    );

    await queryRunner.createForeignKey(
      'api_keys',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'telegram_users',
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('api_keys');
  }
}
```

### Step 3.5: Update Purchases Table Migration

**File:** `migrations/[timestamp]-UpdatePurchasesTable.ts`

```typescript
import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class UpdatePurchasesTable1234567890005 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'purchases',
      new TableColumn({
        name: 'user_id',
        type: 'uuid',
        isNullable: true,
      }),
    );

    await queryRunner.addColumn(
      'purchases',
      new TableColumn({
        name: 'payment_attempt_id',
        type: 'uuid',
        isNullable: true,
      }),
    );

    await queryRunner.createIndex(
      'purchases',
      new TableIndex({
        name: 'idx_purchases_user_id',
        columnNames: ['user_id'],
      }),
    );

    await queryRunner.createForeignKey(
      'purchases',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'telegram_users',
        onDelete: 'SET NULL',
      }),
    );

    await queryRunner.createForeignKey(
      'purchases',
      new TableForeignKey({
        columnNames: ['payment_attempt_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'payment_attempts',
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('purchases');
    const userForeignKey = table?.foreignKeys.find(fk => fk.columnNames.indexOf('user_id') !== -1);
    const paymentForeignKey = table?.foreignKeys.find(
      fk => fk.columnNames.indexOf('payment_attempt_id') !== -1,
    );

    if (userForeignKey) {
      await queryRunner.dropForeignKey('purchases', userForeignKey);
    }
    if (paymentForeignKey) {
      await queryRunner.dropForeignKey('purchases', paymentForeignKey);
    }

    await queryRunner.dropColumn('purchases', 'user_id');
    await queryRunner.dropColumn('purchases', 'payment_attempt_id');
  }
}
```

### Step 3.6: Update UsageMetrics Table Migration

**File:** `migrations/[timestamp]-UpdateUsageMetricsTable.ts`

```typescript
import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey, TableIndex } from 'typeorm';

export class UpdateUsageMetricsTable1234567890006 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'usage_metrics',
      new TableColumn({
        name: 'api_key_id',
        type: 'uuid',
        isNullable: true,
      }),
    );

    await queryRunner.createIndex(
      'usage_metrics',
      new TableIndex({
        name: 'idx_usage_metrics_api_key_id',
        columnNames: ['api_key_id'],
      }),
    );

    await queryRunner.createForeignKey(
      'usage_metrics',
      new TableForeignKey({
        columnNames: ['api_key_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'api_keys',
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('usage_metrics');
    const foreignKey = table?.foreignKeys.find(fk => fk.columnNames.indexOf('api_key_id') !== -1);

    if (foreignKey) {
      await queryRunner.dropForeignKey('usage_metrics', foreignKey);
    }

    await queryRunner.dropColumn('usage_metrics', 'api_key_id');
  }
}
```

---

## 4. Configuration Setup

### Step 4.1: Create Solana Configuration

**File:** `src/config/solana.config.ts`

```typescript
import { registerAs } from '@nestjs/config';

export const SolanaConfig = registerAs('solana', () => ({
  rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
  paymentWallet: process.env.SOLANA_PAYMENT_WALLET,
  usdcMint: process.env.SOLANA_USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  confirmationCount: parseInt(process.env.SOLANA_CONFIRMATION_COUNT || '32', 10),
}));

export const SolanaConfig_KEY = 'solana';
```

### Step 4.2: Create Telegram Configuration

**File:** `src/config/telegram.config.ts`

```typescript
import { registerAs } from '@nestjs/config';

export const TelegramConfig = registerAs('telegram', () => ({
  botToken: process.env.TELEGRAM_BOT_TOKEN,
}));

export const TelegramConfig_KEY = 'telegram';
```

### Step 4.3: Create Payment Configuration

**File:** `src/config/payment.config.ts`

```typescript
import { registerAs } from '@nestjs/config';

export const PaymentConfig = registerAs('payment', () => ({
  pollInterval: parseInt(process.env.PAYMENT_POLL_INTERVAL || '10000', 10),
  memoExpiryDays: parseInt(process.env.PAYMENT_MEMO_EXPIRY_DAYS || '7', 10),
}));

export const PaymentConfig_KEY = 'payment';
```

### Step 4.4: Create API Key Configuration

**File:** `src/config/api-key.config.ts`

```typescript
import { registerAs } from '@nestjs/config';

export const ApiKeyConfig = registerAs('apiKey', () => ({
  prefix: process.env.API_KEY_PREFIX || 'il_',
  expiryDays: parseInt(process.env.API_KEY_EXPIRY_DAYS || '365', 10),
}));

export const ApiKeyConfig_KEY = 'apiKey';
```

### Step 4.5: Update AppModule to Load Configs

**File:** `src/app.module.ts`

```typescript
import { SolanaConfig } from '~/config/solana.config';
import { TelegramConfig } from '~/config/telegram.config';
import { PaymentConfig } from '~/config/payment.config';
import { ApiKeyConfig } from '~/config/api-key.config';

// In ConfigModule.forRoot:
ConfigModule.forRoot({
  isGlobal: true,
  envFilePath: ['.env'],
  load: [
    AppConfig,
    DatabaseConfig,
    RedisConfig,
    MonitoringConfig,
    SolanaConfig,
    TelegramConfig,
    PaymentConfig,
    ApiKeyConfig,
  ],
}),
```

---

## 5. Core Services

This guide continues in Part 2 with detailed service implementations for:
- Solana blockchain interaction
- Payment monitoring
- Telegram bot handlers
- API key management
- Middleware integration

Due to file size limits, the remaining sections (Core Services, Telegram Bot Module, Payment Module, API Key Module, Middleware Integration, and Testing) will be provided in separate files:

- `TELEGRAM_BOT_IMPLEMENTATION_GUIDE_PART2.md` - Solana Service & Payment Service
- `TELEGRAM_BOT_IMPLEMENTATION_GUIDE_PART3.md` - Telegram Bot Handlers
- `TELEGRAM_BOT_IMPLEMENTATION_GUIDE_PART4.md` - API Key Service & Middleware
- `TELEGRAM_BOT_IMPLEMENTATION_GUIDE_PART5.md` - Testing & Deployment

---

## Quick Start Commands

```bash
# 1. Run migrations
npm run db:migration:run

# 2. Start development server
npm run start:dev

# 3. Test Telegram bot
# Send /start to your bot on Telegram

# 4. Monitor payments
# Check logs for transaction monitoring

# 5. Test API key
curl -H "X-API-Key: il_your_key_here" http://localhost:3000/api/pricing/tiers
```

---

## Troubleshooting

### Migration Errors
- Ensure PostgreSQL UUID extension is enabled: `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`
- Check TypeORM connection configuration
- Verify all entities are imported in the module

### Telegram Bot Not Responding
- Verify `TELEGRAM_BOT_TOKEN` is correct
- Check bot is started: Look for "Bot started successfully" in logs
- Test bot token: `curl https://api.telegram.org/bot<TOKEN>/getMe`

### Payment Monitoring Not Working
- Verify Solana RPC URL is accessible
- Check payment wallet address is correct
- Ensure USDC mint address matches your network (mainnet/devnet)
- Monitor logs for transaction polling errors

### API Key Not Working
- Verify middleware is registered in AppModule
- Check API key format: should start with configured prefix
- Ensure API key is not expired or revoked
- Check database connection for API key lookup

---

**Next Steps:** Continue with Part 2 to implement the core services.
