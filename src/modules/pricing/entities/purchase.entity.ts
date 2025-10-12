import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('purchases')
@Index(['walletAddress'])
@Index(['userId'])
@Index(['isActive'])
export class Purchase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId?: string;

  @Column({ name: 'payment_attempt_id', type: 'uuid', nullable: true })
  paymentAttemptId?: string;

  @Column({ name: 'wallet_address' })
  walletAddress: string;

  @Column()
  tier: string;

  @Column({ name: 'rps_allocated', type: 'int' })
  rpsAllocated: number;

  @Column({ type: 'decimal', precision: 10, scale: 6 })
  price: number;

  @Column({ type: 'int', default: 30 })
  duration: number;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
