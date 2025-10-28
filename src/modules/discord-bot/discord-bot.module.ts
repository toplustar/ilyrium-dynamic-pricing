import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CommonModule } from '~/common/common.module';
import { PaymentModule } from '~/modules/payment/payment.module';
import { PricingModule } from '~/modules/pricing/pricing.module';
import { ApiKeyModule } from '~/modules/api-key/api-key.module';
import { AnalyticsModule } from '~/modules/analytics/analytics.module';

import { DiscordUser } from './entities/discord-user.entity';
import { DiscordBotService } from './services/discord-bot.service';
import { DiscordUserService } from './services/discord-user.service';
import { PurchaseService } from './services/purchase.service';
import { DiscordNotificationService } from './services/discord-notification.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DiscordUser]),
    CommonModule,
    forwardRef(() => PaymentModule),
    forwardRef(() => PricingModule),
    forwardRef(() => ApiKeyModule),
    forwardRef(() => AnalyticsModule),
  ],
  providers: [DiscordBotService, DiscordUserService, PurchaseService, DiscordNotificationService],
  exports: [DiscordBotService, DiscordUserService, DiscordNotificationService],
})
export class DiscordBotModule {}
