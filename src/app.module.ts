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
import { TierConfig } from '~/config/tier.config';
import { PricingConfig } from '~/config/pricing.config';
import { UrlsConfig } from '~/config/urls.config';
import solanaConfig from '~/config/solana.config';
import paymentConfig from '~/config/payment.config';
import apiKeyConfig from '~/config/api-key.config';
import discordConfig from '~/config/discord.config';
import rpcConfig from '~/config/rpc.config';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CommonModule } from './common/common.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { PaymentModule } from './modules/payment/payment.module';
import { ApiKeyModule } from './modules/api-key/api-key.module';
import { DiscordBotModule } from './modules/discord-bot/discord-bot.module';
import { RpcModule } from './modules/rpc/rpc.module';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { AppLogger } from './common/services/app-logger.service';
import { ApiKeyMiddleware } from './modules/api-key/middleware/api-key.middleware';

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
        TierConfig,
        PricingConfig,
        UrlsConfig,
        solanaConfig,
        paymentConfig,
        apiKeyConfig,
        discordConfig,
        rpcConfig,
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
        // Enable TLS for Upstash Redis
        tls: redisConfig.host?.includes('upstash.io') ? {} : undefined,
      }),
      inject: [RedisConfig.KEY],
    }),
    CommonModule,
    PricingModule,
    PaymentModule,
    ApiKeyModule,
    DiscordBotModule,
    RpcModule,
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

    // Apply API key middleware to RPC routes
    consumer.apply(ApiKeyMiddleware).forRoutes({ path: 'api/rpc*', method: RequestMethod.POST });
  }
}
