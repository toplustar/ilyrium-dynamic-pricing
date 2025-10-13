import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { PaymentAttempt } from './payment-attempt.entity';

@Entity('payment_transactions')
@Index(['paymentAttemptId'])
@Index(['signature'], { unique: true })
@Index(['fromAddress'])
export class PaymentTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'payment_attempt_id', type: 'uuid' })
  paymentAttemptId: string;

  @Column({ unique: true })
  signature: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  amount: number;

  @Column({ name: 'from_address' })
  fromAddress: string;

  @Column({ type: 'int' })
  confirmations: number;

  @Column({ name: 'verified_at', type: 'timestamp' })
  verifiedAt: Date;

  @ManyToOne(() => PaymentAttempt, paymentAttempt => paymentAttempt.transactions)
  @JoinColumn({ name: 'payment_attempt_id' })
  paymentAttempt: PaymentAttempt;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
