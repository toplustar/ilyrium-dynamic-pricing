import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum SystemEventType {
  WEBSOCKET_LOG = 'websocket-log',
  RPS_CHANGE = 'rps-change',
  CHAIN_ACTIVITY_CHANGE = 'chain-activity-change',
  PURCHASE = 'purchase',
  EXPIRATION = 'expiration',
  MANUAL_ADJUST = 'manual-adjust',
}

@Entity('system_events')
@Index(['eventType', 'timestamp'])
@Index(['timestamp'])
export class SystemEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: SystemEventType,
  })
  eventType: SystemEventType;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  priceData: {
    currentPrice: number;
    utilization: number;
    onChainActivity: number;
    tierPrices: Array<{ tier: string; price: number }>;
  };

  @Column({ type: 'jsonb', nullable: true })
  usageData: {
    totalRequests: number;
    activeUsers: number;
    averageRps: number;
    peakRps: number;
    totalRpsAllocated: number;
    utilizationPercentage: number;
    topEndpoints: Array<{ endpoint: string; requests: number }>;
  };

  @CreateDateColumn()
  timestamp: Date;
}
