import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

import { AppLogger } from '~/common/services/app-logger.service';
import { TelegramUser } from './entities/telegram-user.entity';

import { TelegramBotService } from './services/telegram-bot.service';
import { TelegramUserService } from './services/telegram-user.service';
import { KeyboardBuilderService } from './services/keyboard-builder.service';
import { NotificationService } from './services/notification.service';

import { PaymentModule } from '../payment/payment.module';
import { PricingModule } from '../pricing/pricing.module';
import { ApiKeyModule } from '../api-key/api-key.module';
import telegramConfig from '~/config/telegram.config';

@Module({
  imports: [
    TypeOrmModule.forFeature([TelegramUser]),
    ConfigModule.forFeature(telegramConfig),
    forwardRef(() => PaymentModule),
    PricingModule,
    ApiKeyModule,
  ],
  providers: [
    {
      provide: AppLogger,
      useFactory: (): AppLogger => new AppLogger('TelegramBotModule'),
    },
    TelegramUserService,
    KeyboardBuilderService,
    TelegramBotService,
    NotificationService,
  ],
  exports: [TelegramBotService, TelegramUserService, NotificationService],
})
export class TelegramBotModule {}
