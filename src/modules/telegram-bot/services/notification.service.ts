import { Injectable, OnModuleInit, Inject, forwardRef } from '@nestjs/common';

import { AppLogger } from '~/common/services/app-logger.service';
import { PaymentService } from '~/modules/payment/services/payment.service';

import { TelegramBotService } from './telegram-bot.service';
import { TelegramUserService } from './telegram-user.service';

@Injectable()
export class NotificationService implements OnModuleInit {
  private readonly logger: AppLogger;

  constructor(
    private readonly telegramBotService: TelegramBotService,
    private readonly telegramUserService: TelegramUserService,
    @Inject(forwardRef(() => PaymentService))
    private readonly paymentService: PaymentService,
    logger: AppLogger,
  ) {
    this.logger = logger.forClass('NotificationService');
  }

  onModuleInit(): void {
    this.paymentService.setNotificationService(this);
  }

  async notifyPaymentReceived(
    userId: string,
    amount: number,
    remainingAmount: number,
  ): Promise<void> {
    try {
      const user = await this.telegramUserService.getUserById(userId);
      if (!user) {
        this.logger.warn('User not found for notification', { userId });
        return;
      }

      const message = `
💰 *Payment Received!*

Amount: *${amount} USDC*
${remainingAmount > 0 ? `Remaining: *${remainingAmount} USDC*` : '✅ Payment Complete!'}

${remainingAmount === 0 ? 'Your access is now active! Use /createkey to generate an API key.' : 'Send the remaining amount to activate your access.'}
      `.trim();

      await this.telegramBotService.sendNotification(user.telegramId, message);

      this.logger.log('Payment notification sent', { userId, amount });
    } catch (error) {
      this.logger.error(
        'PaymentNotificationError',
        'Failed to send payment notification',
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
      const user = await this.telegramUserService.getUserById(userId);
      if (!user) {
        this.logger.warn('User not found for notification', { userId });
        return;
      }

      const message = `
🎉 *Purchase Complete!*

Tier: *${tier}*
RPS Allocated: *${rpsAllocated}*
Expires: ${expiresAt.toLocaleDateString()}

Your RPC access is now active! 🚀

Check your next message for your API key! 🔑
      `.trim();

      await this.telegramBotService.sendNotification(user.telegramId, message);

      this.logger.log('Purchase notification sent', { userId, tier, rpsAllocated });
    } catch (error) {
      this.logger.error(
        'PurchaseNotificationError',
        'Failed to send purchase notification',
        { userId },
        error as Error,
      );
    }
  }

  // 🚀 NEW METHOD: Auto-send API key when payment completes!
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
      const user = await this.telegramUserService.getUserById(userId);
      if (!user) {
        this.logger.warn('User not found for API key notification', { userId, paymentAddress });
        return;
      }

      const message = `
🔑 *Your API Key is Ready!*

\`${apiKey}\`

📊 *Purchase Details:*
• Tier: *${details.tier}*
• Duration: *${details.duration} day${details.duration > 1 ? 's' : ''}*
• Amount Paid: *${details.amountPaid} SOL*
• Expires: ${details.expiresAt.toLocaleDateString()}

🌐 *Backend URL:*
\`${details.backendUrl}\`

📝 *Usage Instructions:*
Add this header to your requests:
\`X-API-Key: ${apiKey}\`

⚠️ *Important:* Save this API key securely! This is the only time you'll see the full key.

Payment Address: \`${paymentAddress}\`
      `.trim();

      await this.telegramBotService.sendNotification(user.telegramId, message);

      this.logger.log('🎉 API key sent automatically!', {
        userId,
        paymentAddress,
        tier: details.tier,
        keyPrefix: apiKey.substring(0, 7) + '***',
      });
    } catch (error) {
      this.logger.error(
        'ApiKeyNotificationError',
        'Failed to send API key notification',
        { userId, paymentAddress },
        error as Error,
      );
    }
  }

  async notifyKeyExpiring(userId: string, keyPrefix: string, daysRemaining: number): Promise<void> {
    try {
      const user = await this.telegramUserService.getUserById(userId);
      if (!user) return;

      const message = `
⚠️ *API Key Expiring Soon*

Key: \`${keyPrefix}***\`
Days Remaining: *${daysRemaining}*

Use /createkey to generate a new key before this one expires.
      `.trim();

      await this.telegramBotService.sendNotification(user.telegramId, message);

      this.logger.log('Key expiry notification sent', { userId, keyPrefix, daysRemaining });
    } catch (error) {
      this.logger.error(
        'KeyExpiryNotificationError',
        'Failed to send key expiry notification',
        { userId },
        error as Error,
      );
    }
  }

  async notifyPurchaseExpiring(userId: string, tier: string, daysRemaining: number): Promise<void> {
    try {
      const user = await this.telegramUserService.getUserById(userId);
      if (!user) return;

      const message = `
⚠️ *RPC Access Expiring Soon*

Tier: *${tier}*
Days Remaining: *${daysRemaining}*

Use /buy to renew your access before it expires.
      `.trim();

      await this.telegramBotService.sendNotification(user.telegramId, message);

      this.logger.log('Purchase expiry notification sent', { userId, tier, daysRemaining });
    } catch (error) {
      this.logger.error(
        'PurchaseExpiryNotificationError',
        'Failed to send purchase expiry notification',
        { userId },
        error as Error,
      );
    }
  }
}
