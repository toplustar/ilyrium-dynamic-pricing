import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AppLogger } from '~/common/services/app-logger.service';

import { DiscordUser } from '../entities/discord-user.entity';

@Injectable()
export class DiscordUserService {
  private readonly logger: AppLogger;

  constructor(
    @InjectRepository(DiscordUser)
    private readonly discordUserRepository: Repository<DiscordUser>,
    logger: AppLogger,
  ) {
    this.logger = logger.forClass('DiscordUserService');
  }

  async findOrCreate(
    discordId: string,
    username?: string,
    globalName?: string,
    discriminator?: string,
  ): Promise<DiscordUser> {
    let user = await this.discordUserRepository.findOne({
      where: { discordId },
    });

    if (!user) {
      user = this.discordUserRepository.create({
        discordId,
        username,
        globalName,
        discriminator,
        lastInteractionAt: new Date(),
      });
      await this.discordUserRepository.save(user);
      this.logger.log('New Discord user created', { discordId, username });
    } else {
      user.lastInteractionAt = new Date();
      if (username) user.username = username;
      if (globalName) user.globalName = globalName;
      if (discriminator) user.discriminator = discriminator;
      await this.discordUserRepository.save(user);
    }

    return user;
  }

  async getUserByDiscordId(discordId: string): Promise<DiscordUser | null> {
    return await this.discordUserRepository.findOne({
      where: { discordId },
    });
  }

  async getUserById(id: string): Promise<DiscordUser | null> {
    return await this.discordUserRepository.findOne({
      where: { id },
    });
  }
}
