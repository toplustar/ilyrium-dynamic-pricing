import { Buffer } from 'buffer';
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';

import { PaymentTransaction } from './payment-transaction.entity';

export enum PaymentStatus {
  PENDING = 'PENDING',
  PARTIAL = 'PARTIAL',
  COMPLETED = 'COMPLETED',
  EXPIRED = 'EXPIRED',
}

@Entity('payment_attempts')
@Index(['userId'])
@Index(['memo'], { unique: true })
@Index(['paymentAddress'], { unique: true })
@Index(['status'])
export class PaymentAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ length: 10, unique: true, nullable: true })
  memo?: string;

  @Column({ name: 'payment_address', length: 44, unique: true, nullable: true })
  paymentAddress?: string;

  @Column({ name: 'payment_private_key', type: 'bytea', nullable: true })
  paymentPrivateKey?: Buffer;

  @Column({ type: 'varchar', length: 50 })
  tier: string;

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

  @OneToMany(
    () => PaymentTransaction,
    (transaction: PaymentTransaction) => transaction.paymentAttempt,
  )
  transactions: PaymentTransaction[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
