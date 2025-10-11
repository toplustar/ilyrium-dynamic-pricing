import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import { Cache } from 'cache-manager';

const RATE_LIMIT_KEY = 'rateLimit';
const DEFAULT_TTL = 60;
const DEFAULT_LIMIT = 100;

export interface RateLimitOptions {
  ttl?: number;
  limit?: number;
}

export const RateLimit = (options: RateLimitOptions = {}): MethodDecorator => {
  return (_target, _propertyKey, descriptor) => {
    Reflect.defineMetadata(RATE_LIMIT_KEY, options, descriptor.value as object);
    return descriptor;
  };
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.get<RateLimitOptions>(RATE_LIMIT_KEY, context.getHandler());

    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const identifier = this.getIdentifier(request);
    const key = `rate-limit:${identifier}:${context.getClass().name}:${context.getHandler().name}`;

    const ttl = (options.ttl ?? DEFAULT_TTL) * 1000;
    const limit = options.limit ?? DEFAULT_LIMIT;

    const current = (await this.cacheManager.get<number>(key)) ?? 0;

    if (current >= limit) {
      throw new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }

    await this.cacheManager.set(key, current + 1, ttl);

    return true;
  }

  private getIdentifier(request: { user?: { id?: string }; ip?: string }): string {
    return request.user?.id ?? request.ip ?? 'anonymous';
  }
}
