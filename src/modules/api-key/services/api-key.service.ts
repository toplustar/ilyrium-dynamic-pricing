import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThanOrEqual, Not, IsNull } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

import { AppLogger } from '~/common/services/app-logger.service';

import { ApiKey } from '../entities/api-key.entity';

export interface CreateApiKeyResponse {
  id: string;
  fullKey: string;
  keyPrefix: string;
  expiresAt: Date;
  metadata?: {
    tier: string;
    duration: number;
    generatedAt: Date;
  };
}

export interface ApiKeyMetrics {
  totalKeys: number;
  activeKeys: number;
  expiredKeys: number;
  revokedKeys: number;
  keysGeneratedToday: number;
}

@Injectable()
export class ApiKeyService {
  private readonly logger: AppLogger;
  private readonly expiryDays: number;
  private readonly maxKeysPerUser: number;
  private readonly maxGenerationAttempts: number;

  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
    private readonly configService: ConfigService,
    logger: AppLogger,
  ) {
    this.logger = logger.forClass('ApiKeyService');
    this.expiryDays = this.configService.get<number>('apiKey.expiryDays', 365);
    this.maxKeysPerUser = this.configService.get<number>('apiKey.maxKeysPerUser', 20);
    this.maxGenerationAttempts = this.configService.get<number>('apiKey.maxGenerationAttempts', 10);
  }

  /**
   * Create a new API key with enhanced security and collision detection
   */
  async createApiKey(
    userId: string,
    name?: string,
    customExpiryDate?: Date,
    metadata?: { tier: string; duration: number },
  ): Promise<CreateApiKeyResponse> {
    this.logger.log('Creating API key', { userId, name, customExpiryDate, metadata });

    await this.enforceUserKeyLimits(userId);

    const keySecret = await this.generateUniqueKey();
    const keyHash = await bcrypt.hash(keySecret, 12);

    const expiresAt = customExpiryDate || this.getDefaultExpiryDate();

    const apiKey = this.apiKeyRepository.create({
      userId,
      keyHash,
      keyPrefix: keySecret.substring(0, 7),
      name,
      isActive: true,
      expiresAt,
    });

    const saved = await this.apiKeyRepository.save(apiKey);

    this.logger.log('API key created', {
      keyId: saved.id,
      userId,
      expiresAt,
      metadata,
    });

    return {
      id: saved.id,
      fullKey: keySecret,
      keyPrefix: saved.keyPrefix,
      expiresAt: saved.expiresAt,
      metadata: metadata
        ? {
            ...metadata,
            generatedAt: new Date(),
          }
        : undefined,
    };
  }

  /**
   * Generate a unique key with collision detection
   */
  private async generateUniqueKey(): Promise<string> {
    let attempts = 0;

    while (attempts < this.maxGenerationAttempts) {
      const keySecret = crypto.randomBytes(16).toString('hex');

      const existing = await this.apiKeyRepository.findOne({
        where: { keyPrefix: keySecret.substring(0, 7) },
      });

      if (!existing) {
        return keySecret;
      }

      attempts++;
      this.logger.warn('Key collision detected, retrying', {
        attempt: attempts,
        prefix: keySecret.substring(0, 7),
      });
    }

    throw new HttpException(
      'Failed to generate unique API key after maximum attempts',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  /**
   * Enforce user key limits - Allow multiple active subscriptions
   */
  private async enforceUserKeyLimits(userId: string): Promise<void> {
    const userKeyCount = await this.apiKeyRepository.count({
      where: { userId, isActive: true },
    });

    if (userKeyCount >= this.maxKeysPerUser) {
      throw new HttpException(
        `Maximum API key limit reached (${this.maxKeysPerUser}). Please revoke unused keys or wait for current subscriptions to expire.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Get default expiry date
   */
  private getDefaultExpiryDate(): Date {
    const defaultExpiry = new Date();
    defaultExpiry.setDate(defaultExpiry.getDate() + this.expiryDays);
    return defaultExpiry;
  }

  /**
   * Enhanced API key validation with security checks
   */
  async validateApiKey(
    fullKey: string,
    clientInfo?: {
      ip?: string;
      userAgent?: string;
      timestamp?: Date;
    },
  ): Promise<ApiKey | null> {
    if (!this.isValidKeyFormat(fullKey)) {
      this.logSecurityEvent('invalid_format', { fullKey: fullKey.substring(0, 8) + '...' });
      return null;
    }

    const keyPrefix = fullKey.substring(0, 7);
    const apiKeys = await this.apiKeyRepository.find({
      where: { keyPrefix, isActive: true },
    });

    for (const apiKey of apiKeys) {
      const isMatch = await bcrypt.compare(fullKey, apiKey.keyHash);

      if (isMatch) {
        if (apiKey.expiresAt < new Date()) {
          this.logSecurityEvent('expired_key', { keyId: apiKey.id });
          return null;
        }

        await this.apiKeyRepository.update(apiKey.id, {
          lastUsedAt: new Date(),
        });

        this.logger.debug('API key validated successfully', {
          keyId: apiKey.id,
          userId: apiKey.userId,
          clientInfo,
        });

        return apiKey;
      }
    }

    this.logSecurityEvent('invalid_key', { keyPrefix });
    return null;
  }

  /**
   * Validate key format
   */
  private isValidKeyFormat(key: string): boolean {
    return Boolean(key && /^[a-f0-9]{32}$/i.test(key));
  }

  /**
   * Log security events
   */
  private logSecurityEvent(event: string, data: any): void {
    this.logger.warn('API Key Security Event', { event, data });
  }

  /**
   * Get all API keys for a user
   */
  async getUserApiKeys(userId: string): Promise<ApiKey[]> {
    return await this.apiKeyRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Revoke an API key
   */
  async revokeApiKey(keyId: string): Promise<void> {
    const result = await this.apiKeyRepository.update(keyId, {
      isActive: false,
      revokedAt: new Date(),
    });

    if (result.affected === 0) {
      throw new HttpException('API key not found', HttpStatus.NOT_FOUND);
    }

    this.logger.log('API key revoked', { keyId });
  }

  /**
   * Get API key by ID
   */
  async getApiKeyById(keyId: string): Promise<ApiKey | null> {
    return await this.apiKeyRepository.findOne({
      where: { id: keyId },
    });
  }

  /**
   * Get API key metrics
   */
  async getMetrics(): Promise<ApiKeyMetrics> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [totalKeys, activeKeys, expiredKeys, revokedKeys, keysGeneratedToday] = await Promise.all(
      [
        this.apiKeyRepository.count(),
        this.apiKeyRepository.count({ where: { isActive: true } }),
        this.apiKeyRepository.count({ where: { expiresAt: LessThan(now) } }),
        this.apiKeyRepository.count({ where: { revokedAt: Not(IsNull()) } }),
        this.apiKeyRepository.count({
          where: { createdAt: MoreThanOrEqual(startOfDay) },
        }),
      ],
    );

    return {
      totalKeys,
      activeKeys,
      expiredKeys,
      revokedKeys,
      keysGeneratedToday,
    };
  }

  /**
   * Cleanup expired keys
   */
  async cleanupExpiredKeys(): Promise<number> {
    const result = await this.apiKeyRepository.update(
      { expiresAt: LessThan(new Date()), isActive: true },
      { isActive: false, revokedAt: new Date() },
    );

    if (result.affected && result.affected > 0) {
      this.logger.log(`Cleaned up ${result.affected} expired API keys`);
    }

    return result.affected || 0;
  }

  /**
   * Get API keys for a specific user
   * Note: Full key is only available at creation time, we can only show prefix and metadata
   */
  async getApiKeysForUser(userId: string): Promise<any[]> {
    const apiKeys = await this.apiKeyRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    return apiKeys.map(key => ({
      id: key.id,
      keyPrefix: key.keyPrefix,
      name: key.name,
      expiresAt: key.expiresAt,
      isActive: key.isActive,
      createdAt: key.createdAt,
      status: key.isActive && new Date() < key.expiresAt ? 'ACTIVE' : 'INACTIVE',
      note: 'Full key was only shown once at creation time',
    }));
  }

  /**
   * Get all API keys (for debugging)
   */
  async getAllApiKeys(): Promise<any[]> {
    const apiKeys = await this.apiKeyRepository.find({
      order: { createdAt: 'DESC' },
      take: 10,
    });

    return apiKeys.map(key => ({
      id: key.id,
      userId: key.userId,
      keyPrefix: key.keyPrefix,
      name: key.name,
      expiresAt: key.expiresAt,
      isActive: key.isActive,
      createdAt: key.createdAt,
      status: key.isActive && new Date() < key.expiresAt ? 'ACTIVE' : 'INACTIVE',
    }));
  }

  /**
   * Regenerate API key for a user (when original was lost)
   */
  async regenerateApiKey(userId: string, oldKeyId?: string): Promise<CreateApiKeyResponse> {
    if (oldKeyId) {
      await this.apiKeyRepository.update(oldKeyId, {
        isActive: false,
        revokedAt: new Date(),
      });
      this.logger.log('Deactivated old API key', { oldKeyId, userId });
    }

    const newKey = await this.createApiKey(userId, 'Regenerated API Key');

    this.logger.log('Regenerated API key', {
      newKeyId: newKey.id,
      userId,
      oldKeyId,
    });

    return newKey;
  }
}
