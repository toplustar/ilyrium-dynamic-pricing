import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import * as bcrypt from 'bcryptjs';

import { Purchase } from '~/modules/pricing/entities/purchase.entity';
import { ApiKey } from '~/modules/api-key/entities/api-key.entity';
import { AppLogger } from '~/common/services/app-logger.service';

@Injectable()
export class TierBasedRateLimitGuard implements CanActivate {
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @InjectRepository(Purchase)
    private readonly purchaseRepository: Repository<Purchase>,
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
    private readonly logger: AppLogger,
  ) {
    this.logger = logger.forClass('TierBasedRateLimitGuard');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // First, try to get userId from middleware (if middleware has run)
    let userId = request.user?.userId;

    // If not available, authenticate the API key directly
    if (!userId) {
      userId = await this.authenticateApiKey(request);
    }

    try {
      // Get user's active purchase with highest RPS allocation
      const activePurchase = await this.purchaseRepository.findOne({
        where: {
          userId,
          isActive: true,
          expiresAt: MoreThan(new Date()), // Not expired
        },
        order: { rpsAllocated: 'DESC' }, // Get highest tier
      });

      if (!activePurchase) {
        throw new HttpException('No active subscription found', HttpStatus.FORBIDDEN);
      }

      // Check if subscription is expired
      if (activePurchase.expiresAt < new Date()) {
        throw new HttpException('Subscription expired', HttpStatus.FORBIDDEN);
      }

      // Get user's RPS limit from their tier
      const rpsLimit = activePurchase.rpsAllocated;
      const timeWindow = 1; // 1 second window for RPS
      const cacheKey = `rate-limit:user:${userId}:tier:${activePurchase.tier}`;

      // Get current request count
      const currentCount = (await this.cacheManager.get<number>(cacheKey)) ?? 0;

      // Check if user has exceeded their tier limit
      if (currentCount >= rpsLimit) {
        this.logger.warn('Rate limit exceeded for user', {
          userId,
          tier: activePurchase.tier,
          rpsLimit,
          currentCount,
        });

        throw new HttpException(
          `Rate limit exceeded. Your ${activePurchase.tier} tier allows ${rpsLimit} requests per second.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      // Increment counter with TTL
      await this.cacheManager.set(cacheKey, currentCount + 1, timeWindow * 1000);

      // Log successful request
      this.logger.debug('Rate limit check passed', {
        userId,
        tier: activePurchase.tier,
        rpsLimit,
        currentCount: currentCount + 1,
      });

      return true;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(
        'Rate limit check failed',
        'TierBasedRateLimitGuard',
        { userId },
        error as Error,
      );
      throw new HttpException('Rate limit check failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Authenticate API key and set user info on request
   */
  private async authenticateApiKey(request: any): Promise<string> {
    const apiKey = request.headers['x-api-key'] as string;

    if (!apiKey) {
      throw new HttpException('Header x-api-key required', HttpStatus.UNAUTHORIZED);
    }

    // Validate API key format
    if (!this.isValidKeyFormat(apiKey)) {
      throw new HttpException('Invalid API key format', HttpStatus.UNAUTHORIZED);
    }

    // Find and validate API key
    const keyPrefix = apiKey.substring(0, 7);
    const apiKeys = await this.apiKeyRepository.find({
      where: { keyPrefix, isActive: true },
    });

    let validApiKey = null;
    for (const key of apiKeys) {
      const isMatch = await bcrypt.compare(apiKey, key.keyHash);

      if (isMatch) {
        // Check expiry
        if (key.expiresAt < new Date()) {
          throw new HttpException('API key expired', HttpStatus.UNAUTHORIZED);
        }

        validApiKey = key;
        break;
      }
    }

    if (!validApiKey) {
      throw new HttpException('Invalid API key', HttpStatus.UNAUTHORIZED);
    }

    // Set user info on request for consistency
    request.user = {
      userId: validApiKey.userId,
      apiKeyId: validApiKey.id,
    };

    return validApiKey.userId;
  }

  /**
   * Validate key format
   */
  private isValidKeyFormat(key: string): boolean {
    return Boolean(key && /^[a-f0-9]{32}$/i.test(key));
  }
}
