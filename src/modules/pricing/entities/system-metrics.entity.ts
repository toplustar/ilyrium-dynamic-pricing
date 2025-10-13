import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('system_metrics')
@Index(['createdAt'])
export class SystemMetrics {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'total_rps', type: 'int' })
  totalRps: number;

  @Column({ name: 'used_rps', type: 'int' })
  usedRps: number;

  @Column({ type: 'decimal', precision: 5, scale: 4 })
  utilization: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
