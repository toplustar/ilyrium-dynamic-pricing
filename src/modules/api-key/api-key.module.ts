import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

import { AppLogger } from '~/common/services/app-logger.service';
import apiKeyConfig from '~/config/api-key.config';

import { ApiKey } from './entities/api-key.entity';
import { ApiKeyService } from './services/api-key.service';
import { ApiKeyMiddleware } from './middleware/api-key.middleware';

@Module({
  imports: [TypeOrmModule.forFeature([ApiKey]), ConfigModule.forFeature(apiKeyConfig)],
  providers: [
    {
      provide: AppLogger,
      useFactory: (): AppLogger => new AppLogger('ApiKeyModule'),
    },
    ApiKeyService,
    ApiKeyMiddleware,
  ],
  exports: [ApiKeyService, ApiKeyMiddleware],
})
export class ApiKeyModule {}
