import { Injectable, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { EmbedBuilder } from 'discord.js';

import { AppLogger } from '~/common/services/app-logger.service';
import { PaymentService } from '~/modules/payment/services/payment.service';

import { DiscordBotService } from './discord-bot.service';
import { DiscordUserService } from './discord-user.service';

interface UserInteractionContext {
  userId: string;
  discordId: string;
  lastInteraction: any;
  timestamp: Date;
}

@Injectable()
export class DiscordNotificationService implements OnModuleInit {
  private readonly logger: AppLogger;
  private readonly userInteractionContexts: Map<string, UserInteractionContext> = new Map();

  constructor(
    @Inject(forwardRef(() => DiscordBotService))
    private readonly discordBotService: DiscordBotService,
    private readonly discordUserService: DiscordUserService,
    @Inject(forwardRef(() => PaymentService))
    private readonly paymentService: PaymentService,
    logger: AppLogger,
  ) {
    this.logger = logger.forClass('DiscordNotificationService');
  }

  onModuleInit(): void {
    this.paymentService.setNotificationService(this);
  }

  /**
   * Store user interaction context for ephemeral messages
   */
  storeUserInteraction(userId: string, discordId: string, interaction: unknown): void {
    this.userInteractionContexts.set(userId, {
      userId,
      discordId,
      lastInteraction: interaction,
      timestamp: new Date(),
    });
  }

  /**
   * Get user interaction context
   */
  private getUserInteractionContext(userId: string): UserInteractionContext | null {
    const context = this.userInteractionContexts.get(userId);
    if (!context) return null;

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (context.timestamp < fiveMinutesAgo) {
      this.userInteractionContexts.delete(userId);
      return null;
    }

    return context;
  }

  async notifyPaymentReceived(
    userId: string,
    amount: number,
    remainingAmount: number,
  ): Promise<void> {
    try {
      const user = await this.discordUserService.getUserById(userId);
      if (!user) {
        this.logger.warn('Discord user not found for payment notification', { userId });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('💰 Payment Received!')
        .setDescription('We detected your payment transaction.')
        .addFields(
          { name: '💳 Amount Received', value: `${amount} SOL`, inline: true },
          { name: '⏳ Remaining', value: `${remainingAmount.toFixed(6)} SOL`, inline: true },
        )
        .setTimestamp();

      if (remainingAmount <= 0) {
        embed.setDescription('🎉 **Payment Complete!** Processing your purchase...');
      }

      const context = this.getUserInteractionContext(userId);
      if (context?.lastInteraction) {
        try {
          await context.lastInteraction.followUp({
            content: '💰 **Payment Received!**',
            embeds: [embed],
            ephemeral: true,
          });
          this.logger.log('Payment received notification sent via ephemeral message', {
            userId,
            amount,
            remainingAmount,
          });
          return;
        } catch (error) {
          this.logger.warn('Failed to send ephemeral message, falling back to DM', {
            userId,
            error,
          });
        }
      }

      await this.discordBotService.sendDirectMessage(user.discordId, { embeds: [embed] });

      this.logger.log('Payment received notification sent via DM', {
        userId,
        amount,
        remainingAmount,
      });
    } catch (error) {
      this.logger.error(
        'PaymentReceivedNotificationError',
        'Failed to send payment received notification',
        { userId },
        error as Error,
      );
    }
  }

  async notifyPurchaseComplete(
    userId: string,
    tier: string,
    rpsAllocated: number,
    expiresAt: Date,
  ): Promise<void> {
    try {
      const user = await this.discordUserService.getUserById(userId);
      if (!user) {
        this.logger.warn('Discord user not found for purchase notification', { userId });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('🎉 Purchase Complete!')
        .setDescription('Your RPC access is now active!')
        .addFields(
          { name: '📊 Tier', value: tier, inline: true },
          { name: '⚡ RPS Allocated', value: `${rpsAllocated}`, inline: true },
          {
            name: '⏰ Expires',
            value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>`,
            inline: false,
          },
        )
        .setFooter({ text: 'Your API key will be sent here shortly! 🔑' })
        .setTimestamp();

      const context = this.getUserInteractionContext(userId);
      if (context?.lastInteraction) {
        try {
          await context.lastInteraction.followUp({
            content: '🎉 **Purchase Complete!**',
            embeds: [embed],
            ephemeral: true,
          });
          this.logger.log('Purchase completion notification sent via ephemeral message', {
            userId,
            tier,
            rpsAllocated,
          });
          return;
        } catch (error) {
          this.logger.warn('Failed to send ephemeral message, falling back to DM', {
            userId,
            error,
          });
        }
      }

      await this.discordBotService.sendDirectMessage(user.discordId, { embeds: [embed] });

      this.logger.log('Purchase completion notification sent via DM', {
        userId,
        tier,
        rpsAllocated,
      });
    } catch (error) {
      this.logger.error(
        'PurchaseNotificationError',
        'Failed to send purchase notification',
        { userId },
        error as Error,
      );
    }
  }

  async notifyApiKeyGenerated(
    userId: string,
    paymentAddress: string,
    apiKey: string,
    details: {
      tier: string;
      duration: number;
      expiresAt: Date;
      amountPaid: number;
      backendUrl: string;
    },
  ): Promise<void> {
    try {
      const user = await this.discordUserService.getUserById(userId);
      if (!user) {
        this.logger.warn('Discord user not found for API key notification', {
          userId,
          paymentAddress,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('🔑 Your API Key is Ready!')
        .setDescription(`\`\`\`${apiKey}\`\`\``)
        .addFields(
          { name: '📊 Tier', value: details.tier, inline: true },
          {
            name: '⏱️ Duration',
            value: `${details.duration} day${details.duration > 1 ? 's' : ''}`,
            inline: true,
          },
          { name: '💰 Amount Paid', value: `${details.amountPaid} SOL`, inline: true },
          {
            name: '⏰ Expires',
            value: `<t:${Math.floor(details.expiresAt.getTime() / 1000)}:F>`,
            inline: false,
          },
          { name: '🌐 Backend URL', value: `\`${details.backendUrl}\``, inline: false },
          {
            name: '📝 Usage Instructions',
            value: `Add this header to your requests:\n\`X-API-Key: YOUR_KEY_HERE\``,
            inline: false,
          },
          { name: '📍 Payment Address', value: `\`${paymentAddress}\``, inline: false },
        )
        .setFooter({
          text: "⚠️ Save this API key securely! This is the only time you'll see the full key.",
        })
        .setTimestamp();

      const context = this.getUserInteractionContext(userId);
      if (context?.lastInteraction) {
        try {
          await context.lastInteraction.followUp({
            content: '🔑 **Your API Key is Ready!**',
            embeds: [embed],
            ephemeral: true,
          });
          this.logger.log('🎉 API key sent automatically via ephemeral message!', {
            userId,
            discordId: user.discordId,
            paymentAddress,
            tier: details.tier,
            keyPrefix: apiKey.substring(0, 7) + '***',
          });
          return;
        } catch (error) {
          this.logger.warn('Failed to send ephemeral message, falling back to DM', {
            userId,
            error,
          });
        }
      }

      await this.discordBotService.sendDirectMessage(user.discordId, { embeds: [embed] });

      this.logger.log('🎉 API key sent automatically via DM!', {
        userId,
        discordId: user.discordId,
        paymentAddress,
        tier: details.tier,
        keyPrefix: apiKey.substring(0, 7) + '***',
      });
    } catch (error) {
      this.logger.error(
        'ApiKeyNotificationError',
        'Failed to send API key notification to purchase channel',
        { userId, paymentAddress },
        error as Error,
      );
    }
  }
}
