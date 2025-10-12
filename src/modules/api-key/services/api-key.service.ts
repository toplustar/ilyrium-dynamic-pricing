import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { nanoid } from 'nanoid';
import * as bcrypt from 'bcryptjs';

import { AppLogger } from '~/common/services/app-logger.service';

import { ApiKey } from '../entities/api-key.entity';

export interface CreateApiKeyResponse {
  id: string;
  fullKey: string;
  keyPrefix: string;
  expiresAt: Date;
}

@Injectable()
export class ApiKeyService {
  private readonly logger: AppLogger;
  private readonly keyPrefix: string;
  private readonly expiryDays: number;

  constructor(
    @InjectRepository(ApiKey)
    private readonly apiKeyRepository: Repository<ApiKey>,
    private readonly configService: ConfigService,
    logger: AppLogger,
  ) {
    this.logger = logger.forClass('ApiKeyService');
    this.keyPrefix = this.configService.get<string>('apiKey.prefix', 'il_');
    this.expiryDays = this.configService.get<number>('apiKey.expiryDays', 365);
  }

  /**
   * Create a new API key for a user
   */
  async createApiKey(userId: string, name?: string): Promise<CreateApiKeyResponse> {
    this.logger.log('Creating API key', { userId, name });

    const keySecret = nanoid(40);
    const fullKey = `${this.keyPrefix}${keySecret}`;

    const keyHash = await bcrypt.hash(keySecret, 10);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.expiryDays);

    const apiKey = this.apiKeyRepository.create({
      userId,
      keyHash,
      keyPrefix: `${this.keyPrefix}${keySecret.substring(0, 7)}`,
      name,
      isActive: true,
      expiresAt,
    });

    const saved = await this.apiKeyRepository.save(apiKey);

    this.logger.log('API key created', {
      keyId: saved.id,
      userId,
      expiresAt,
    });

    return {
      id: saved.id,
      fullKey,
      keyPrefix: saved.keyPrefix,
      expiresAt: saved.expiresAt,
    };
  }

  /**
   * Validate an API key
   */
  async validateApiKey(fullKey: string): Promise<ApiKey | null> {
    if (!fullKey?.startsWith(this.keyPrefix)) {
      return null;
    }

    const keySecret = fullKey.substring(this.keyPrefix.length);
    const keyPrefix = `${this.keyPrefix}${keySecret.substring(0, 7)}`;

    const apiKeys = await this.apiKeyRepository.find({
      where: {
        keyPrefix,
        isActive: true,
      },
    });

    for (const apiKey of apiKeys) {
      const isMatch = await bcrypt.compare(keySecret, apiKey.keyHash);

      if (isMatch) {
        if (apiKey.expiresAt < new Date()) {
          this.logger.warn('API key expired', { keyId: apiKey.id });
          return null;
        }

        await this.apiKeyRepository.update(apiKey.id, {
          lastUsedAt: new Date(),
        });

        this.logger.debug('API key validated', { keyId: apiKey.id, userId: apiKey.userId });
        return apiKey;
      }
    }

    return null;
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
}
