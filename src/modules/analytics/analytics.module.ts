import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

import { CommonModule } from '~/common/common.module';
import { PricingModule } from '~/modules/pricing/pricing.module';
import { DiscordBotModule } from '~/modules/discord-bot/discord-bot.module';
import { UsageMetrics } from '~/modules/pricing/entities/usage-metrics.entity';
import { Purchase } from '~/modules/pricing/entities/purchase.entity';
import { SystemEvent } from './entities/system-event.entity';

import { AnalyticsService } from './services/analytics.service';
import { AnalyticsController } from './controllers/analytics.controller';
import { DiscordAnalyticsService } from './services/discord-analytics.service';
import { WebSocketService } from './services/websocket.service';
import { AnalyticsSchedulerService } from './services/analytics-scheduler.service';
import { HistoricalDataLogger } from './services/historical-data-logger.service';
import { SolanaWebSocketService } from './services/solana-websocket.service';
import { PurchaseExpirationMonitorService } from './services/purchase-expiration-monitor.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([UsageMetrics, Purchase, SystemEvent]),
    ScheduleModule.forRoot(),
    CommonModule,
    PricingModule,
    forwardRef(() => DiscordBotModule),
  ],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    DiscordAnalyticsService,
    WebSocketService,
    AnalyticsSchedulerService,
    HistoricalDataLogger,
    SolanaWebSocketService,
    PurchaseExpirationMonitorService,
  ],
  exports: [
    AnalyticsService,
    DiscordAnalyticsService,
    WebSocketService,
    AnalyticsSchedulerService,
    HistoricalDataLogger,
    SolanaWebSocketService,
    PurchaseExpirationMonitorService,
  ],
})
export class AnalyticsModule {}
