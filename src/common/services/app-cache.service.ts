import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import * as appInsights from 'applicationinsights';

import { ConsoleLogger } from './console-logger.service';

@Injectable()
export class AppCacheService {
  private readonly redisTarget: string;
  private readonly keyPrefix: string;
  private readonly consoleLogger = new ConsoleLogger();

  constructor(
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly configService: ConfigService,
  ) {
    const host = this.configService.get('redis.host') || this.configService.get('REDIS_HOST');
    const port = this.configService.get('redis.port') || this.configService.get('REDIS_PORT');
    const database =
      this.configService.get('redis.database') ?? this.configService.get('REDIS_DATABASE') ?? 0;

    if (!host) {
      throw new Error('REDIS_HOST is required but not configured');
    }
    if (!port) {
      throw new Error('REDIS_PORT is required but not configured');
    }

    this.keyPrefix =
      this.configService.get('redis.keyPrefix') || this.configService.get('REDIS_KEY_PREFIX') || '';
    this.redisTarget = `${host}:${port}/${database}`;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const startTime = Date.now();
    try {
      const result = await this.cacheManager.get<T>(key);
      const duration = Date.now() - startTime;

      const commandData = `GET ${this.keyPrefix}${key}`;
      appInsights.defaultClient?.trackDependency({
        target: this.redisTarget,
        name: commandData,
        data: commandData,
        duration,
        resultCode: result ? 'HIT' : 'MISS',
        success: true,
        dependencyTypeName: 'Redis',
      });

      this.logRedisQuery('GET', key, duration, result ? 'HIT' : 'MISS');

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      const commandData = `GET ${this.keyPrefix}${key}`;
      appInsights.defaultClient?.trackDependency({
        target: this.redisTarget,
        name: commandData,
        data: commandData,
        duration,
        resultCode: 'ERROR',
        success: false,
        dependencyTypeName: 'Redis',
      });

      this.logRedisQuery('GET', key, duration, 'ERROR');

      throw error;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const startTime = Date.now();
    try {
      await this.cacheManager.set(key, value, ttl);
      const duration = Date.now() - startTime;

      const commandData = `SET ${this.keyPrefix}${key} [REDACTED]${ttl ? ` EX ${ttl}` : ''}`;
      appInsights.defaultClient?.trackDependency({
        target: this.redisTarget,
        name: commandData,
        data: commandData,
        duration,
        resultCode: 'SUCCESS',
        success: true,
        dependencyTypeName: 'Redis',
      });

      this.logRedisQuery('SET', key, duration, undefined, value, ttl);
    } catch (error) {
      const duration = Date.now() - startTime;

      const commandData = `SET ${this.keyPrefix}${key} [REDACTED]${ttl ? ` EX ${ttl}` : ''}`;
      appInsights.defaultClient?.trackDependency({
        target: this.redisTarget,
        name: commandData,
        data: commandData,
        duration,
        resultCode: 'ERROR',
        success: false,
        dependencyTypeName: 'Redis',
      });

      this.logRedisQuery('SET', key, duration, 'ERROR');

      throw error;
    }
  }

  async del(key: string): Promise<void> {
    const startTime = Date.now();
    try {
      await this.cacheManager.del(key);
      const duration = Date.now() - startTime;

      const commandData = `DEL ${this.keyPrefix}${key}`;
      appInsights.defaultClient?.trackDependency({
        target: this.redisTarget,
        name: commandData,
        data: commandData,
        duration,
        resultCode: 'SUCCESS',
        success: true,
        dependencyTypeName: 'Redis',
      });

      this.logRedisQuery('DEL', key, duration);
    } catch (error) {
      const duration = Date.now() - startTime;

      const commandData = `DEL ${this.keyPrefix}${key}`;
      appInsights.defaultClient?.trackDependency({
        target: this.redisTarget,
        name: commandData,
        data: commandData,
        duration,
        resultCode: 'ERROR',
        success: false,
        dependencyTypeName: 'Redis',
      });

      this.logRedisQuery('DEL', key, duration, 'ERROR');

      throw error;
    }
  }

  get store(): any {
    return this.cacheManager.store;
  }

  private logRedisQuery<T>(
    operation: string,
    key: string,
    duration: number,
    result?: string,
    value?: T,
    ttl?: number,
  ): void {
    const fullKey = `${this.keyPrefix}${key}`;
    let query = `${operation} ${fullKey}`;

    if (operation === 'SET' && value !== undefined) {
      const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
      query += ` ${valueStr}`;
      if (ttl) {
        query += ` EX ${ttl}`;
      }
    }

    this.consoleLogger.redisQuery(query, duration, result);
  }
}
