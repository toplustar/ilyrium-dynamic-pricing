import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppLogger } from '~/common/services/app-logger.service';

import { Purchase } from './entities/purchase.entity';
import { UsageMetrics } from './entities/usage-metrics.entity';
import { SystemMetrics } from './entities/system-metrics.entity';
import { PricingEngineService } from './services/pricing-engine.service';
import { PurchaseService } from './services/purchase.service';
import { UsageService } from './services/usage.service';
import { PricingController } from './controllers/pricing.controller';
import { PurchaseController } from './controllers/purchase.controller';
import { UsageController } from './controllers/usage.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Purchase, UsageMetrics, SystemMetrics])],
  controllers: [PricingController, PurchaseController, UsageController],
  providers: [
    {
      provide: AppLogger,
      useFactory: (): AppLogger => new AppLogger('PricingModule'),
    },
    PricingEngineService,
    PurchaseService,
    UsageService,
  ],
  exports: [PricingEngineService, PurchaseService, UsageService],
})
export class PricingModule {}
