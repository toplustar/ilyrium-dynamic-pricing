import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

import { AppLogger } from '~/common/services/app-logger.service';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  constructor(private readonly logger: AppLogger) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const { method, originalUrl, headers } = req;
    const userAgent = headers['user-agent'] || 'unknown';
    const startTime = Date.now();

    this.logger.log(`Incoming Request: ${method} ${originalUrl} - User-Agent: ${userAgent}`);

    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - startTime;

      this.logger.log(
        `Response: ${method} ${originalUrl} - Status: ${statusCode} - Duration: ${duration}ms`,
      );
    });

    next();
  }
}
