import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppLogger } from './services/app-logger.service';
import { ConsoleLogger } from './services/console-logger.service';
import { AppCacheService } from './services/app-cache.service';
import { Purchase } from '~/modules/pricing/entities/purchase.entity';
import { ApiKey } from '~/modules/api-key/entities/api-key.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Purchase, ApiKey])],
  providers: [
    ConsoleLogger,
    AppCacheService,
    {
      provide: AppLogger,
      useFactory: (): AppLogger => new AppLogger('CommonModule'),
    },
  ],
  exports: [AppLogger, ConsoleLogger, AppCacheService, TypeOrmModule],
})
export class CommonModule {}
