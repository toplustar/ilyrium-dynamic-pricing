import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('usage_metrics')
@Index(['walletAddress'])
@Index(['createdAt'])
export class UsageMetrics {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'wallet_address' })
  walletAddress: string;

  @Column({ name: 'request_count', type: 'int', default: 0 })
  requestCount: number;

  @Column({ nullable: true })
  endpoint: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
