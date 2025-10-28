import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { AppLogger } from '~/common/services/app-logger.service';
import solanaConfig from '~/config/solana.config';
import paymentConfig from '~/config/payment.config';

import { Purchase } from '../pricing/entities/purchase.entity';
import { PricingModule } from '../pricing/pricing.module';
import { ApiKeyModule } from '../api-key/api-key.module';
import { AnalyticsModule } from '../analytics/analytics.module';

import { PaymentAttempt } from './entities/payment-attempt.entity';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { SolanaService } from './services/solana.service';
import { PaymentService } from './services/payment.service';
import { TransactionMonitorService } from './services/transaction-monitor.service';
import { PaymentSweepService } from './services/payment-sweep.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentAttempt, PaymentTransaction, Purchase]),
    ConfigModule.forFeature(solanaConfig),
    ConfigModule.forFeature(paymentConfig),
    ScheduleModule.forRoot(),
    PricingModule,
    ApiKeyModule,
    AnalyticsModule,
  ],
  providers: [
    {
      provide: AppLogger,
      useFactory: (): AppLogger => new AppLogger('PaymentModule'),
    },
    SolanaService,
    PaymentService,
    TransactionMonitorService,
    PaymentSweepService,
  ],
  exports: [SolanaService, PaymentService, TransactionMonitorService, PaymentSweepService],
})
export class PaymentModule {}
