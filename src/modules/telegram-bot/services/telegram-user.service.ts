import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AppLogger } from '~/common/services/app-logger.service';

import { TelegramUser } from '../entities/telegram-user.entity';

@Injectable()
export class TelegramUserService {
  private readonly logger: AppLogger;

  constructor(
    @InjectRepository(TelegramUser)
    private readonly telegramUserRepository: Repository<TelegramUser>,
    logger: AppLogger,
  ) {
    this.logger = logger.forClass('TelegramUserService');
  }

  /**
   * Find or create a Telegram user
   */
  async findOrCreate(
    telegramId: string,
    username?: string,
    firstName?: string,
    lastName?: string,
  ): Promise<TelegramUser> {
    let user = await this.telegramUserRepository.findOne({
      where: { telegramId },
    });

    if (!user) {
      this.logger.log('Creating new Telegram user', { telegramId, username });

      user = this.telegramUserRepository.create({
        telegramId,
        username,
        firstName,
        lastName,
        isActive: true,
      });

      await this.telegramUserRepository.save(user);

      this.logger.log('Telegram user created', { userId: user.id, telegramId });
    } else {
      let updated = false;

      if (username && user.username !== username) {
        user.username = username;
        updated = true;
      }

      if (firstName && user.firstName !== firstName) {
        user.firstName = firstName;
        updated = true;
      }

      if (lastName && user.lastName !== lastName) {
        user.lastName = lastName;
        updated = true;
      }

      if (updated) {
        user.lastSeenAt = new Date();
        await this.telegramUserRepository.save(user);
        this.logger.debug('Telegram user updated', { userId: user.id });
      }
    }

    await this.updateLastSeen(user.id);

    return user;
  }

  /**
   * Get user by Telegram ID
   */
  async getUserByTelegramId(telegramId: string): Promise<TelegramUser | null> {
    return await this.telegramUserRepository.findOne({
      where: { telegramId },
    });
  }

  /**
   * Get user by internal ID
   */
  async getUserById(id: string): Promise<TelegramUser | null> {
    return await this.telegramUserRepository.findOne({
      where: { id },
    });
  }

  /**
   * Update last seen timestamp
   */
  async updateLastSeen(userId: string): Promise<void> {
    await this.telegramUserRepository.update(userId, {
      lastSeenAt: new Date(),
    });
  }

  /**
   * Deactivate a user
   */
  async deactivateUser(userId: string): Promise<void> {
    await this.telegramUserRepository.update(userId, {
      isActive: false,
    });
    this.logger.log('User deactivated', { userId });
  }

  /**
   * Get total user count
   */
  async getTotalUserCount(): Promise<number> {
    return await this.telegramUserRepository.count({
      where: { isActive: true },
    });
  }
}
