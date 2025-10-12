import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Context, Telegraf } from 'telegraf';
import { Update } from 'telegraf/typings/core/types/typegram';

import { AppLogger } from '~/common/services/app-logger.service';
import { TelegramUserService } from './telegram-user.service';
import { KeyboardBuilderService } from './keyboard-builder.service';
import { PaymentService } from '~/modules/payment/services/payment.service';
import { PricingEngineService } from '~/modules/pricing/services/pricing-engine.service';
import { ApiKeyService } from '~/modules/api-key/services/api-key.service';
import { UsageService } from '~/modules/pricing/services/usage.service';

@Injectable()
export class TelegramBotService implements OnModuleInit {
  private bot: Telegraf<Context<Update>>;
  private readonly logger: AppLogger;

  constructor(
    private readonly configService: ConfigService,
    private readonly telegramUserService: TelegramUserService,
    private readonly keyboardBuilder: KeyboardBuilderService,
    private readonly paymentService: PaymentService,
    private readonly pricingEngineService: PricingEngineService,
    private readonly apiKeyService: ApiKeyService,
    private readonly usageService: UsageService,
    logger: AppLogger,
  ) {
    this.logger = logger.forClass('TelegramBotService');
  }

  onModuleInit(): void {
    const botToken = this.configService.get<string>('telegram.botToken');

    if (!botToken) {
      this.logger.warn('TELEGRAM_BOT_TOKEN not configured - bot will not start');
      return;
    }

    this.bot = new Telegraf(botToken);
    this.setupCommands();
    this.setupCallbackHandlers();
    this.setupMessageHandlers();

    this.bot.launch();
    this.logger.log('Telegram bot started successfully');

    process.once('SIGINT', () => this.bot.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
  }

  private setupCommands(): void {
    this.bot.command('start', ctx => this.handleStart(ctx));
    this.bot.command('tiers', ctx => this.handleTiers(ctx));
    this.bot.command('buy', ctx => this.handleBuy(ctx));
    this.bot.command('status', ctx => this.handleStatus(ctx));
    this.bot.command('balance', ctx => this.handleBalance(ctx));
    this.bot.command('keys', ctx => this.handleKeys(ctx));
    this.bot.command('createkey', ctx => this.handleCreateKey(ctx));
    this.bot.command('revokekey', ctx => this.handleRevokeKey(ctx));
    this.bot.command('usage', ctx => this.handleUsage(ctx));
    this.bot.command('help', ctx => this.handleHelp(ctx));
  }

  private setupCallbackHandlers(): void {
    this.bot.action(/^tier:(.+)$/, ctx => this.handleTierSelection(ctx));
    this.bot.action(/^duration:(.+):(\d+)$/, ctx => this.handleDurationSelection(ctx));
    this.bot.action(/^check:(.+)$/, ctx => this.handleCheckPayment(ctx));
    this.bot.action('cancel:payment', ctx => this.handleCancelPayment(ctx));
    this.bot.action('key:create', ctx => this.handleCreateKey(ctx));
    this.bot.action('key:revoke', ctx => this.handleRevokeKey(ctx));
    this.bot.action(/^revoke:(.+)$/, ctx => this.handleConfirmRevoke(ctx));
    this.bot.action(/^usage:(.+)$/, ctx => this.handleUsagePeriod(ctx));
    this.bot.action('back:main', ctx => this.handleStart(ctx));
    this.bot.action('back:tiers', ctx => this.handleTiers(ctx));
    this.bot.action('back:keys', ctx => this.handleKeys(ctx));
  }

  private setupMessageHandlers(): void {
    this.bot.hears('📊 View Tiers', ctx => this.handleTiers(ctx));
    this.bot.hears('💳 Buy Access', ctx => this.handleBuy(ctx));
    this.bot.hears('🔑 My API Keys', ctx => this.handleKeys(ctx));
    this.bot.hears('📈 Usage Stats', ctx => this.handleUsage(ctx));
    this.bot.hears('💰 Balance', ctx => this.handleBalance(ctx));
    this.bot.hears('❓ Help', ctx => this.handleHelp(ctx));
  }

  private async handleStart(ctx: any): Promise<void> {
    try {
      const telegramId = ctx.from.id.toString();
      const username = ctx.from.username;
      const firstName = ctx.from.first_name;
      const lastName = ctx.from.last_name;

      const user = await this.telegramUserService.findOrCreate(telegramId, username, firstName, lastName);

      const welcomeMessage = `
🎉 *Welcome to Ilyrium Dynamic RPC Pricing Bot!*

Hello ${firstName}! 👋

This bot allows you to:
• 📊 View available RPC access tiers
• 💳 Purchase RPC access with Solana USDC
• 🔑 Manage your API keys
• 📈 Track your usage statistics

Use the menu below or type /help to see all commands.
      `.trim();

      await ctx.reply(welcomeMessage, {
        parse_mode: 'Markdown',
        ...this.keyboardBuilder.buildMainMenu(),
      });

      this.logger.log('User started bot', { userId: user.id, telegramId });
    } catch (error) {
      this.logger.error('StartCommandError', 'Failed to handle start command', {}, error as Error);
      await ctx.reply('Sorry, something went wrong. Please try again later.');
    }
  }

  private async handleTiers(ctx: any): Promise<void> {
    try {
      const tiers = this.pricingEngineService.getTiers();
      const usedRps = await this.pricingEngineService.getCurrentUtilization();
      const totalRps = this.pricingEngineService.getTotalRps();
      const basePrice = this.pricingEngineService.calculateDynamicPrice({
        usedRps,
        totalRps,
        priceMin: this.pricingEngineService.getPriceMin(),
        priceMax: this.pricingEngineService.getPriceMax(),
      });

      let message = `📊 *Available RPC Access Tiers*\n\n`;
      message += `Current Base Price: *$${basePrice.toFixed(4)}* per RPS/day\n`;
      message += `Capacity Used: *${usedRps}/${totalRps}* RPS (${((usedRps / totalRps) * 100).toFixed(1)}%)\n\n`;

      for (const tier of tiers) {
        const monthlyPrice = (basePrice * tier.rps * 30).toFixed(2);
        message += `*${this.getTierEmoji(tier.name)} ${tier.name}*\n`;
        message += `• RPS: ${tier.rps}\n`;
        message += `• ~$${monthlyPrice}/month\n\n`;
      }

      message += `Tap a tier below to purchase:`;

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...this.keyboardBuilder.buildTierSelection(),
      });
    } catch (error) {
      this.logger.error('TiersCommandError', 'Failed to handle tiers command', {}, error as Error);
      await ctx.reply('Failed to load tiers. Please try again.');
    }
  }

  private async handleTierSelection(ctx: any): Promise<void> {
    try {
      const tier = ctx.match[1];

      const message = `
You selected: *${this.getTierEmoji(tier)} ${tier}*

Please select the duration:
      `.trim();

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        ...this.keyboardBuilder.buildDurationSelection(tier),
      });

      await ctx.answerCbQuery();
    } catch (error) {
      this.logger.error('TierSelectionError', 'Failed to handle tier selection', {}, error as Error);
      await ctx.answerCbQuery('Failed to process selection');
    }
  }

  private async handleDurationSelection(ctx: any): Promise<void> {
    try {
      const tier = ctx.match[1];
      const duration = parseInt(ctx.match[2], 10);

      const telegramId = ctx.from.id.toString();
      const user = await this.telegramUserService.getUserByTelegramId(telegramId);

      if (!user) {
        await ctx.answerCbQuery('User not found. Please start the bot with /start');
        return;
      }

      const payment = await this.paymentService.createPaymentAttempt({
        userId: user.id,
        tier: tier as any,
        duration,
      });

      const message = `
💳 *Payment Details*

Tier: *${tier}*
Duration: *${duration} days*
Amount: *${payment.amountExpected} USDC*

📝 *Payment Instructions:*
1. Send *exactly ${payment.amountExpected} USDC* to:
   \`${payment.walletAddress}\`

2. Include this memo in your transaction:
   \`${payment.memo}\`

3. Payment expires: ${payment.expiresAt.toLocaleString()}

⚠️ *Important:*
• You can split the payment across multiple transactions
• All payments must be completed within 7 days
• Payment memo is case-sensitive

Click "Check Payment Status" after sending USDC.
      `.trim();

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        ...this.keyboardBuilder.buildPaymentConfirmation(payment.id),
      });

      await ctx.answerCbQuery('Payment created!');

      this.logger.log('Payment attempt created via bot', {
        userId: user.id,
        paymentId: payment.id,
        tier,
        duration,
        amount: payment.amountExpected,
      });
    } catch (error) {
      this.logger.error('DurationSelectionError', 'Failed to create payment', {}, error as Error);
      await ctx.answerCbQuery('Failed to create payment');
      await ctx.reply('Sorry, failed to create payment. Please try again.');
    }
  }

  private async handleBuy(ctx: any): Promise<void> {
    await this.handleTiers(ctx);
  }

  private async handleStatus(ctx: any): Promise<void> {
    try {
      const telegramId = ctx.from.id.toString();
      const user = await this.telegramUserService.getUserByTelegramId(telegramId);

      if (!user) {
        await ctx.reply('Please start the bot with /start first.');
        return;
      }

      const payments = await this.paymentService.getUserPaymentStatus(user.id);

      if (payments.length === 0) {
        await ctx.reply('You have no payment attempts yet. Use /buy to purchase access.');
        return;
      }

      let message = `💳 *Your Payment Status*\n\n`;

      for (const payment of payments.slice(0, 5)) {
        message += `📋 Payment #${payment.memo}\n`;
        message += `Status: ${this.getStatusEmoji(payment.status)} ${payment.status}\n`;
        message += `Amount: ${payment.amountPaid}/${payment.amountExpected} USDC\n`;
        message += `Tier: ${payment.tier}\n`;
        message += `Created: ${payment.createdAt.toLocaleDateString()}\n\n`;
      }

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      this.logger.error('StatusCommandError', 'Failed to get payment status', {}, error as Error);
      await ctx.reply('Failed to load payment status. Please try again.');
    }
  }

  private async handleCheckPayment(ctx: any): Promise<void> {
    try {
      const paymentId = ctx.match[1];

      const payment = await this.paymentService.getPaymentAttemptById(paymentId);

      if (!payment) {
        await ctx.answerCbQuery('Payment not found');
        return;
      }

      const statusMessage = `
💳 *Payment Status Update*

Memo: \`${payment.memo}\`
Status: ${this.getStatusEmoji(payment.status)} *${payment.status}*
Amount Paid: *${payment.amountPaid}/${payment.amountExpected} USDC*
Expires: ${payment.expiresAt.toLocaleString()}

${payment.status === 'COMPLETED' ? '✅ Your access is now active!' : '⏳ Waiting for payment confirmation...'}
      `.trim();

      await ctx.editMessageText(statusMessage, {
        parse_mode: 'Markdown',
        ...this.keyboardBuilder.buildPaymentConfirmation(paymentId),
      });

      await ctx.answerCbQuery('Status updated');
    } catch (error) {
      this.logger.error('CheckPaymentError', 'Failed to check payment', {}, error as Error);
      await ctx.answerCbQuery('Failed to check payment');
    }
  }

  private async handleBalance(ctx: any): Promise<void> {
    try {
      const telegramId = ctx.from.id.toString();
      const user = await this.telegramUserService.getUserByTelegramId(telegramId);

      if (!user) {
        await ctx.reply('Please start the bot with /start first.');
        return;
      }

      const purchases = await this.usageService.getActivePurchases(user.id);

      if (purchases.length === 0) {
        await ctx.reply('You have no active purchases. Use /buy to get started!');
        return;
      }

      const totalRps = purchases.reduce((sum: number, p) => sum + p.rpsAllocated, 0);

      let message = `💰 *Your RPS Balance*\n\n`;
      message += `Total Allocated RPS: *${totalRps}*\n\n`;

      for (const purchase of purchases) {
        message += `${this.getTierEmoji(purchase.tier)} *${purchase.tier}*\n`;
        message += `• RPS: ${purchase.rpsAllocated}\n`;
        message += `• Expires: ${purchase.expiresAt.toLocaleDateString()}\n\n`;
      }

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      this.logger.error('BalanceCommandError', 'Failed to get balance', {}, error as Error);
      await ctx.reply('Failed to load balance. Please try again.');
    }
  }

  private async handleKeys(ctx: any): Promise<void> {
    try {
      const telegramId = ctx.from.id.toString();
      const user = await this.telegramUserService.getUserByTelegramId(telegramId);

      if (!user) {
        await ctx.reply('Please start the bot with /start first.');
        return;
      }

      const keys = await this.apiKeyService.getUserApiKeys(user.id);

      let message = `🔑 *Your API Keys*\n\n`;

      if (keys.length === 0) {
        message += 'You have no API keys yet.\n';
        message += 'Click "Create New Key" to generate one.';
      } else {
        for (const key of keys) {
          message += `📋 *${key.name || 'Unnamed Key'}*\n`;
          message += `Prefix: \`${key.keyPrefix}\`\n`;
          message += `Status: ${key.isActive ? '✅ Active' : '❌ Revoked'}\n`;
          message += `Expires: ${key.expiresAt.toLocaleDateString()}\n\n`;
        }
      }

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        ...this.keyboardBuilder.buildApiKeyActions(),
      });
    } catch (error) {
      this.logger.error('KeysCommandError', 'Failed to list API keys', {}, error as Error);
      await ctx.reply('Failed to load API keys. Please try again.');
    }
  }

  private async handleCreateKey(ctx: any): Promise<void> {
    try {
      const telegramId = ctx.from.id.toString();
      const user = await this.telegramUserService.getUserByTelegramId(telegramId);

      if (!user) {
        await ctx.reply('Please start the bot with /start first.');
        return;
      }

      const purchases = await this.usageService.getActivePurchases(user.id);
      if (purchases.length === 0) {
        await ctx.reply('You need an active purchase to create API keys. Use /buy to get started!');
        return;
      }

      const apiKey = await this.apiKeyService.createApiKey(user.id);

      const message = `
🔑 *New API Key Created!*

Your API Key:
\`${apiKey.fullKey}\`

⚠️ *IMPORTANT:*
• Copy this key NOW - it won't be shown again
• This message will be deleted in 60 seconds
• Use this key in X-API-Key header

Key Details:
• Prefix: \`${apiKey.keyPrefix}\`
• Expires: ${apiKey.expiresAt.toLocaleDateString()}
      `.trim();

      const sentMessage = await ctx.reply(message, { parse_mode: 'Markdown' });

      setTimeout(async () => {
        try {
          await ctx.telegram.deleteMessage(ctx.chat.id, sentMessage.message_id);
        } catch (error) {
          this.logger.warn('Failed to delete API key message', { error });
        }
      }, 60000);

      this.logger.log('API key created via bot', {
        userId: user.id,
        keyId: apiKey.id,
      });

      if ('answerCbQuery' in ctx) {
        await ctx.answerCbQuery('API key created!');
      }
    } catch (error) {
      this.logger.error('CreateKeyError', 'Failed to create API key', {}, error as Error);
      await ctx.reply('Failed to create API key. Please try again.');
    }
  }

  private async handleRevokeKey(ctx: any): Promise<void> {
    try {
      const telegramId = ctx.from.id.toString();
      const user = await this.telegramUserService.getUserByTelegramId(telegramId);

      if (!user) {
        await ctx.reply('Please start the bot with /start first.');
        return;
      }

      const keys = await this.apiKeyService.getUserApiKeys(user.id);
      const activeKeys = keys.filter(k => k.isActive);

      if (activeKeys.length === 0) {
        await ctx.reply('You have no active API keys to revoke.');
        return;
      }

      const keyList = activeKeys.map(k => ({
        id: k.id,
        name: k.name || 'Unnamed',
        prefix: k.keyPrefix,
      }));

      const message = '🗑️ *Select a key to revoke:*';

      if ('editMessageText' in ctx) {
        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          ...this.keyboardBuilder.buildKeyRevocationList(keyList),
        });
        await ctx.answerCbQuery();
      } else {
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          ...this.keyboardBuilder.buildKeyRevocationList(keyList),
        });
      }
    } catch (error) {
      this.logger.error('RevokeKeyError', 'Failed to list keys for revocation', {}, error as Error);
      await ctx.reply('Failed to load API keys. Please try again.');
    }
  }

  private async handleConfirmRevoke(ctx: any): Promise<void> {
    try {
      const keyId = ctx.match[1];

      await this.apiKeyService.revokeApiKey(keyId);

      await ctx.editMessageText('✅ API key has been revoked successfully.', {
        ...this.keyboardBuilder.buildBackButton('back:keys'),
      });

      await ctx.answerCbQuery('Key revoked');

      this.logger.log('API key revoked via bot', { keyId });
    } catch (error) {
      this.logger.error('ConfirmRevokeError', 'Failed to revoke key', {}, error as Error);
      await ctx.answerCbQuery('Failed to revoke key');
    }
  }

  private async handleUsage(ctx: any): Promise<void> {
    try {
      const message = '📈 *Select time period for usage stats:*';

      if ('editMessageText' in ctx && 'answerCbQuery' in ctx) {
        await ctx.editMessageText(message, {
          parse_mode: 'Markdown',
          ...this.keyboardBuilder.buildUsagePeriodSelection(),
        });
        await ctx.answerCbQuery();
      } else {
        await ctx.reply(message, {
          parse_mode: 'Markdown',
          ...this.keyboardBuilder.buildUsagePeriodSelection(),
        });
      }
    } catch (error) {
      this.logger.error('UsageCommandError', 'Failed to show usage menu', {}, error as Error);
      await ctx.reply('Failed to load usage menu. Please try again.');
    }
  }

  private async handleUsagePeriod(ctx: any): Promise<void> {
    try {
      const period = ctx.match[1];
      const telegramId = ctx.from.id.toString();
      const user = await this.telegramUserService.getUserByTelegramId(telegramId);

      if (!user) {
        await ctx.answerCbQuery('User not found');
        return;
      }

      let days: number | null = null;
      if (period !== 'all') {
        days = parseInt(period, 10);
      }

      const usage = await this.usageService.getUserUsage(user.id, days);

      let message = `📈 *Usage Statistics*\n\n`;
      message += `Period: ${period === 'all' ? 'All Time' : `Last ${period} day(s)`}\n\n`;

      if (usage.totalRequests === 0) {
        message += 'No usage data available for this period.';
      } else {
        message += `Total Requests: *${usage.totalRequests}*\n`;
        message += `Cached Requests: *${usage.cachedRequests}*\n`;
        message += `Cache Hit Rate: *${((usage.cachedRequests / usage.totalRequests) * 100).toFixed(1)}%*\n`;
      }

      await ctx.editMessageText(message, {
        parse_mode: 'Markdown',
        ...this.keyboardBuilder.buildBackButton('back:main'),
      });

      await ctx.answerCbQuery();
    } catch (error) {
      this.logger.error('UsagePeriodError', 'Failed to get usage stats', {}, error as Error);
      await ctx.answerCbQuery('Failed to load usage stats');
    }
  }

  private async handleCancelPayment(ctx: any): Promise<void> {
    await ctx.editMessageText('❌ Payment cancelled.', {
      ...this.keyboardBuilder.buildBackButton('back:main'),
    });
    await ctx.answerCbQuery('Payment cancelled');
  }

  private async handleHelp(ctx: any): Promise<void> {
    const helpMessage = `
❓ *Available Commands*

/start - Start the bot and register
/tiers - View available pricing tiers
/buy - Purchase RPC access
/status - Check payment status
/balance - View your RPS allocation
/keys - Manage your API keys
/createkey - Create a new API key
/revokekey - Revoke an API key
/usage - View usage statistics
/help - Show this help message

*How to use:*
1. Use /tiers to view available plans
2. Use /buy to purchase access
3. Send USDC with the provided memo
4. Use /createkey to get your API key
5. Use the API key in X-API-Key header

Need help? Contact support: @your_support
    `.trim();

    await ctx.reply(helpMessage, { parse_mode: 'Markdown' });
  }

  async sendNotification(telegramId: string, message: string): Promise<void> {
    try {
      await this.bot.telegram.sendMessage(telegramId, message, {
        parse_mode: 'Markdown',
      });
      this.logger.debug('Notification sent', { telegramId });
    } catch (error) {
      this.logger.error('NotificationError', `Failed to send notification to ${telegramId}`, {}, error as Error);
    }
  }

  private getTierEmoji(tier: string): string {
    const emojis: Record<string, string> = {
      Starter: '🚀',
      Developer: '💻',
      Professional: '⚡',
      Enterprise: '💎',
      BASIC: '🚀',
      STANDARD: '💻',
      PREMIUM: '⚡',
      ENTERPRISE: '💎',
    };
    return emojis[tier] || '📦';
  }

  private getStatusEmoji(status: string): string {
    const emojis: Record<string, string> = {
      PENDING: '⏳',
      PARTIAL: '⚠️',
      COMPLETED: '✅',
      EXPIRED: '❌',
    };
    return emojis[status] || '❓';
  }
}
