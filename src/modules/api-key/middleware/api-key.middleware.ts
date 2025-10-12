import { Injectable, NestMiddleware, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

import { AppLogger } from '~/common/services/app-logger.service';

import { ApiKeyService } from '../services/api-key.service';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    apiKeyId: string;
  };
}

@Injectable()
export class ApiKeyMiddleware implements NestMiddleware {
  constructor(
    private readonly apiKeyService: ApiKeyService,
    private readonly logger: AppLogger,
  ) {
    this.logger = logger.forClass('ApiKeyMiddleware');
  }

  async use(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      throw new HttpException('Header x-api-key required', HttpStatus.UNAUTHORIZED);
    }

    const validatedKey = await this.apiKeyService.validateApiKey(apiKey);

    if (!validatedKey) {
      this.logger.warn('Invalid API key attempt', { apiKey: apiKey.substring(0, 10) });
      throw new HttpException('Invalid API key', HttpStatus.UNAUTHORIZED);
    }

    req.user = {
      userId: validatedKey.userId,
      apiKeyId: validatedKey.id,
    };

    next();
  }
}
