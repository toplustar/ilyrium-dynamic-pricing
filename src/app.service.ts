import { execSync } from 'child_process';

import { Injectable, Inject } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { DataSource } from 'typeorm';
import { Cache } from 'cache-manager';

import { AppLogger } from '~/common/services/app-logger.service';

export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  startupTimestamp: string;
  environment: string;
  commitId: string;
  checks: {
    database: HealthCheckDetail;
    redis: HealthCheckDetail;
  };
  uptime: number;
}

export interface HealthCheckDetail {
  status: 'up' | 'down';
  responseTime?: number;
  error?: string;
}

@Injectable()
export class AppService {
  private readonly startTime: number;
  private readonly startupTimestamp: string;
  private readonly logger: AppLogger;
  private commitId: string = 'unknown';

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    logger: AppLogger,
  ) {
    this.startTime = Date.now();
    this.startupTimestamp = new Date().toISOString();
    this.logger = logger.forClass('AppService');
    this.loadCommitId();
  }

  getHello(): string {
    return 'Welcome to Ilyrium Dynamic Pricing API';
  }

  async getHealth(): Promise<HealthCheckResponse> {
    this.logger.log('Performing health check');

    const timestamp = new Date().toISOString();
    const environment = process.env.NODE_ENV || 'unknown';
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);

    // Check database connectivity
    const databaseCheck = await this.checkDatabase();

    // Check Redis connectivity
    const redisCheck = await this.checkRedis();

    // Determine overall status
    const allUp = databaseCheck.status === 'up' && redisCheck.status === 'up';
    const allDown = databaseCheck.status === 'down' && redisCheck.status === 'down';
    const status = allUp ? 'healthy' : allDown ? 'unhealthy' : 'degraded';

    this.logger.log('Health check completed', {
      status,
      databaseStatus: databaseCheck.status,
      redisStatus: redisCheck.status,
    });

    return {
      status,
      timestamp,
      startupTimestamp: this.startupTimestamp,
      environment,
      commitId: this.commitId,
      checks: {
        database: databaseCheck,
        redis: redisCheck,
      },
      uptime,
    };
  }

  private loadCommitId(): void {
    try {
      // Get the current Git commit hash
      const commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
      this.commitId = commitHash || 'unknown';
      this.logger.debug('Loaded commit ID', { commitId: this.commitId });
    } catch (error) {
      this.logger.warn('Failed to load commit ID from git', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Fallback to environment variable
      this.commitId = process.env.GIT_COMMIT_ID || process.env.COMMIT_SHA || 'unknown';
    }
  }

  private async checkDatabase(): Promise<HealthCheckDetail> {
    const startTime = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      const responseTime = Date.now() - startTime;
      this.logger.debug('Database health check passed', { responseTime });
      return {
        status: 'up',
        responseTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn('Database health check failed', { error: errorMessage });
      return {
        status: 'down',
        error: errorMessage,
      };
    }
  }

  private async checkRedis(): Promise<HealthCheckDetail> {
    const startTime = Date.now();
    try {
      const testKey = 'health-check-test';
      const testValue = Date.now().toString();

      // Try to set and get a value
      await this.cacheManager.set(testKey, testValue, 5000);
      const result = await this.cacheManager.get(testKey);

      if (result === testValue) {
        const responseTime = Date.now() - startTime;
        // Clean up test key
        await this.cacheManager.del(testKey);
        this.logger.debug('Redis health check passed', { responseTime });
        return {
          status: 'up',
          responseTime,
        };
      } else {
        this.logger.warn('Redis health check failed: value mismatch');
        return {
          status: 'down',
          error: 'Redis value mismatch',
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn('Redis health check failed', { error: errorMessage });
      return {
        status: 'down',
        error: errorMessage,
      };
    }
  }
}
