import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { APP_FILTER } from '@nestjs/core';
import { ioRedisStore } from '@tirke/node-cache-manager-ioredis';

import { AppConfig } from '~/config/app.config';
import { DatabaseConfig } from '~/config/database.config';
import { RedisConfig } from '~/config/redis.config';
import { MonitoringConfig } from '~/config/monitoring.config';
import solanaConfig from '~/config/solana.config';
import telegramConfig from '~/config/telegram.config';
import paymentConfig from '~/config/payment.config';
import apiKeyConfig from '~/config/api-key.config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CommonModule } from './common/common.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { PaymentModule } from './modules/payment/payment.module';
import { ApiKeyModule } from './modules/api-key/api-key.module';
import { TelegramBotModule } from './modules/telegram-bot/telegram-bot.module';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { AppLogger } from './common/services/app-logger.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
      load: [
        AppConfig,
        DatabaseConfig,
        RedisConfig,
        MonitoringConfig,
        solanaConfig,
        telegramConfig,
        paymentConfig,
        apiKeyConfig,
      ],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService): TypeOrmModuleOptions => {
        const config = configService.get<TypeOrmModuleOptions>('database');
        if (!config) {
          throw new Error('Database configuration not found');
        }
        return config;
      },
      inject: [ConfigService],
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: (redisConfig: {
        host: string;
        port: number;
        password: string;
        database: number;
        ttl: number;
        keyPrefix: string;
      }) => ({
        store: ioRedisStore,
        host: redisConfig.host,
        port: redisConfig.port,
        password: redisConfig.password || undefined,
        db: redisConfig.database,
        ttl: redisConfig.ttl,
        keyPrefix: redisConfig.keyPrefix,
      }),
      inject: [RedisConfig.KEY],
    }),
    CommonModule,
    PricingModule,
    PaymentModule,
    ApiKeyModule,
    TelegramBotModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: AppLogger,
      useFactory: (): AppLogger => new AppLogger('AppModule'),
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggerMiddleware).forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
