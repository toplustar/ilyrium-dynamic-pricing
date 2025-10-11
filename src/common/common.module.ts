import { Module, Global } from '@nestjs/common';

import { AppLogger } from './services/app-logger.service';
import { ConsoleLogger } from './services/console-logger.service';
import { AppCacheService } from './services/app-cache.service';

@Global()
@Module({
  providers: [
    ConsoleLogger,
    AppCacheService,
    {
      provide: AppLogger,
      useFactory: (): AppLogger => new AppLogger('CommonModule'),
    },
  ],
  exports: [AppLogger, ConsoleLogger, AppCacheService],
})
export class CommonModule {}
