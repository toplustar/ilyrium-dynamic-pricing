# Telegram Bot Implementation Guide - Part 3: Telegram Bot Handlers

This is Part 3 of the implementation guide, covering the Telegram bot implementation with Telegraf.

## Table of Contents

- [Part 1: Database Schema & Entities](./TELEGRAM_BOT_IMPLEMENTATION_GUIDE.md) ✅
- [Part 2: Services Implementation](./TELEGRAM_BOT_IMPLEMENTATION_GUIDE_PART2.md) ✅
- **Part 3: Telegram Bot Handlers** (This Document)
  - Bot Setup
  - Command Handlers
  - Keyboard Builders
  - User Service
  - Notification Service
- Part 4: API Key System (Coming Next)
- Part 5: Testing & Deployment

---

## 1. Telegram User Service

Create a service to manage Telegram users in the database.

### File: `src/modules/telegram-bot/services/telegram-user.service.ts`

```typescript
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
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
      // Update user info if changed
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

    // Update last seen
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
```

---

## 2. Keyboard Builder Service

Create a service to build interactive Telegram keyboards.

### File: `src/modules/telegram-bot/services/keyboard-builder.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { Markup } from 'telegraf';

import { TierType } from '~/modules/pricing/entities/tier.enum';

@Injectable()
export class KeyboardBuilderService {
  /**
   * Build main menu keyboard
   */
  buildMainMenu(): any {
    return Markup.keyboard([
      ['📊 View Tiers', '💳 Buy Access'],
      ['🔑 My API Keys', '📈 Usage Stats'],
      ['💰 Balance', '❓ Help'],
    ])
      .resize()
      .oneTime(false);
  }

  /**
   * Build tier selection keyboard
   */
  buildTierSelection(): any {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('🥉 Basic', 'tier:BASIC'),
        Markup.button.callback('🥈 Standard', 'tier:STANDARD'),
      ],
      [
        Markup.button.callback('🥇 Premium', 'tier:PREMIUM'),
        Markup.button.callback('💎 Enterprise', 'tier:ENTERPRISE'),
      ],
      [Markup.button.callback('« Back', 'back:main')],
    ]);
  }

  /**
   * Build duration selection keyboard for a specific tier
   */
  buildDurationSelection(tier: TierType): any {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('7 Days', `duration:${tier}:7`),
        Markup.button.callback('15 Days', `duration:${tier}:15`),
      ],
      [
        Markup.button.callback('30 Days', `duration:${tier}:30`),
        Markup.button.callback('60 Days', `duration:${tier}:60`),
      ],
      [
        Markup.button.callback('90 Days', `duration:${tier}:90`),
        Markup.button.callback('180 Days', `duration:${tier}:180`),
      ],
      [Markup.button.callback('« Back to Tiers', 'back:tiers')],
    ]);
  }

  /**
   * Build payment confirmation keyboard
   */
  buildPaymentConfirmation(paymentAttemptId: string): any {
    return Markup.inlineKeyboard([
      [Markup.button.callback('✅ Check Payment Status', `check:${paymentAttemptId}`)],
      [Markup.button.callback('❌ Cancel', 'cancel:payment')],
    ]);
  }

  /**
   * Build API key actions keyboard
   */
  buildApiKeyActions(): any {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('➕ Create New Key', 'key:create'),
        Markup.button.callback('🗑️ Revoke Key', 'key:revoke'),
      ],
      [Markup.button.callback('« Back', 'back:main')],
    ]);
  }

  /**
   * Build key revocation selection keyboard
   */
  buildKeyRevocationList(keys: Array<{ id: string; name: string; prefix: string }>): any {
    const buttons = keys.map(key =>
      [Markup.button.callback(`🗑️ ${key.name || key.prefix}`, `revoke:${key.id}`)],
    );

    buttons.push([Markup.button.callback('« Cancel', 'back:keys')]);

    return Markup.inlineKeyboard(buttons);
  }

  /**
   * Build usage period selection keyboard
   */
  buildUsagePeriodSelection(): any {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('Today', 'usage:1'),
        Markup.button.callback('7 Days', 'usage:7'),
      ],
      [
        Markup.button.callback('30 Days', 'usage:30'),
        Markup.button.callback('All Time', 'usage:all'),
      ],
      [Markup.button.callback('« Back', 'back:main')],
    ]);
  }

  /**
   * Build simple back button
   */
  buildBackButton(action: string): any {
    return Markup.inlineKeyboard([
      [Markup.button.callback('« Back', action)],
    ]);
  }

  /**
   * Remove keyboard
   */
  removeKeyboard(): any {
    return Markup.removeKeyboard();
  }
}
```

---

## 3. Bot Command Handlers

Create the main bot service with all command handlers.

### File: `src/modules/telegram-bot/services/telegram-bot.service.ts`

```typescript
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
import { TierType } from '~/modules/pricing/entities/tier.enum';

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
      this.logger.error('BotConfigError', 'TELEGRAM_BOT_TOKEN not configured', {});
      return;
    }

    this.bot = new Telegraf(botToken);
    this.setupCommands();
    this.setupCallbackHandlers();
    this.setupMessageHandlers();

    this.bot.launch();
    this.logger.log('Telegram bot started successfully');

    // Enable graceful stop
    process.once('SIGINT', () => this.bot.stop('SIGINT'));
    process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
  }

  /**
   * Setup bot commands
   */
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

  /**
   * Setup callback query handlers (inline button clicks)
   */
  private setupCallbackHandlers(): void {
    // Tier selection
    this.bot.action(/^tier:(.+)$/, ctx => this.handleTierSelection(ctx));

    // Duration selection
    this.bot.action(/^duration:(.+):(\d+)$/, ctx => this.handleDurationSelection(ctx));

    // Payment status check
    this.bot.action(/^check:(.+)$/, ctx => this.handleCheckPayment(ctx));

    // Cancel payment
    this.bot.action('cancel:payment', ctx => this.handleCancelPayment(ctx));

    // API key actions
    this.bot.action('key:create', ctx => this.handleCreateKey(ctx));
    this.bot.action('key:revoke', ctx => this.handleRevokeKey(ctx));
    this.bot.action(/^revoke:(.+)$/, ctx => this.handleConfirmRevoke(ctx));

    // Usage period selection
    this.bot.action(/^usage:(.+)$/, ctx => this.handleUsagePeriod(ctx));

    // Back navigation
    this.bot.action('back:main', ctx => this.handleStart(ctx));
    this.bot.action('back:tiers', ctx => this.handleTiers(ctx));
    this.bot.action('back:keys', ctx => this.handleKeys(ctx));
  }

  /**
   * Setup text message handlers
   */
  private setupMessageHandlers(): void {
    this.bot.hears('📊 View Tiers', ctx => this.handleTiers(ctx));
    this.bot.hears('💳 Buy Access', ctx => this.handleBuy(ctx));
    this.bot.hears('🔑 My API Keys', ctx => this.handleKeys(ctx));
    this.bot.hears('📈 Usage Stats', ctx => this.handleUsage(ctx));
    this.bot.hears('💰 Balance', ctx => this.handleBalance(ctx));
    this.bot.hears('❓ Help', ctx => this.handleHelp(ctx));
  }

  /**
   * /start command - Register user and show welcome message
   */
  private async handleStart(ctx: any): Promise<void> {
    try {
      const telegramId = ctx.from.id.toString();
      const username = ctx.from.username;
      const firstName = ctx.from.first_name;
      const lastName = ctx.from.last_name;

      const user = await this.telegramUserService.findOrCreate(
        telegramId,
        username,
        firstName,
        lastName,
      );

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

  /**
   * /tiers command - Show available pricing tiers
   */
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

  /**
   * Handle tier selection (callback)
   */
  private async handleTierSelection(ctx: any): Promise<void> {
    try {
      const tier = ctx.match[1] as TierType;

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

  /**
   * Handle duration selection (callback)
   */
  private async handleDurationSelection(ctx: any): Promise<void> {
    try {
      const tier = ctx.match[1] as TierType;
      const duration = parseInt(ctx.match[2], 10);

      const telegramId = ctx.from.id.toString();
      const user = await this.telegramUserService.getUserByTelegramId(telegramId);

      if (!user) {
        await ctx.answerCbQuery('User not found. Please start the bot with /start');
        return;
      }

      // Create payment attempt
      const payment = await this.paymentService.createPaymentAttempt({
        userId: user.id,
        tier,
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

  /**
   * /buy command - Start purchase flow
   */
  private async handleBuy(ctx: any): Promise<void> {
    await this.handleTiers(ctx);
  }

  /**
   * /status command - Check payment status
   */
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

  /**
   * Handle check payment callback
   */
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

  /**
   * /balance command - Show user's RPS allocation
   */
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

      const totalRps = purchases.reduce((sum, p) => sum + p.rpsAllocated, 0);

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

  /**
   * /keys command - Show user's API keys
   */
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

  /**
   * /createkey command - Generate new API key
   */
  private async handleCreateKey(ctx: any): Promise<void> {
    try {
      const telegramId = ctx.from.id.toString();
      const user = await this.telegramUserService.getUserByTelegramId(telegramId);

      if (!user) {
        await ctx.reply('Please start the bot with /start first.');
        return;
      }

      // Check if user has active purchases
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

      // Delete message after 60 seconds
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

  /**
   * /revokekey command - Start key revocation flow
   */
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

  /**
   * Handle confirm revoke callback
   */
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

  /**
   * /usage command - Show usage statistics
   */
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

  /**
   * Handle usage period selection
   */
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

  /**
   * Handle cancel payment callback
   */
  private async handleCancelPayment(ctx: any): Promise<void> {
    await ctx.editMessageText('❌ Payment cancelled.', {
      ...this.keyboardBuilder.buildBackButton('back:main'),
    });
    await ctx.answerCbQuery('Payment cancelled');
  }

  /**
   * /help command - Show help message
   */
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

  /**
   * Send notification to a user
   */
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

  /**
   * Helper: Get tier emoji
   */
  private getTierEmoji(tier: string): string {
    const emojis: Record<string, string> = {
      BASIC: '🥉',
      STANDARD: '🥈',
      PREMIUM: '🥇',
      ENTERPRISE: '💎',
    };
    return emojis[tier] || '📦';
  }

  /**
   * Helper: Get status emoji
   */
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
```

---

## 4. Notification Service

Create a service to send notifications when payments are completed.

### File: `src/modules/telegram-bot/services/notification.service.ts`

```typescript
import { Injectable } from '@nestjs/common';

import { AppLogger } from '~/common/services/app-logger.service';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramUserService } from './telegram-user.service';

@Injectable()
export class NotificationService {
  private readonly logger: AppLogger;

  constructor(
    private readonly telegramBotService: TelegramBotService,
    private readonly telegramUserService: TelegramUserService,
    logger: AppLogger,
  ) {
    this.logger = logger.forClass('NotificationService');
  }

  /**
   * Notify user that payment was received
   */
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
      this.logger.error('PaymentNotificationError', 'Failed to send payment notification', { userId }, error as Error);
    }
  }

  /**
   * Notify user that purchase is complete
   */
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

Use /createkey to generate your API key.
      `.trim();

      await this.telegramBotService.sendNotification(user.telegramId, message);

      this.logger.log('Purchase notification sent', { userId, tier, rpsAllocated });
    } catch (error) {
      this.logger.error('PurchaseNotificationError', 'Failed to send purchase notification', { userId }, error as Error);
    }
  }

  /**
   * Notify user that API key is about to expire
   */
  async notifyKeyExpiring(
    userId: string,
    keyPrefix: string,
    daysRemaining: number,
  ): Promise<void> {
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
      this.logger.error('KeyExpiryNotificationError', 'Failed to send key expiry notification', { userId }, error as Error);
    }
  }

  /**
   * Notify user that purchase is about to expire
   */
  async notifyPurchaseExpiring(
    userId: string,
    tier: string,
    daysRemaining: number,
  ): Promise<void> {
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
      this.logger.error('PurchaseExpiryNotificationError', 'Failed to send purchase expiry notification', { userId }, error as Error);
    }
  }
}
```

---

## 5. Telegram Bot Module

Create the module that brings all bot services together.

### File: `src/modules/telegram-bot/telegram-bot.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

import { AppLogger } from '~/common/services/app-logger.service';
import { TelegramUser } from './entities/telegram-user.entity';

import { TelegramBotService } from './services/telegram-bot.service';
import { TelegramUserService } from './services/telegram-user.service';
import { KeyboardBuilderService } from './services/keyboard-builder.service';
import { NotificationService } from './services/notification.service';

import { PaymentModule } from '../payment/payment.module';
import { PricingModule } from '../pricing/pricing.module';
import { ApiKeyModule } from '../api-key/api-key.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TelegramUser]),
    ConfigModule,
    PaymentModule,
    PricingModule,
    ApiKeyModule,
  ],
  providers: [
    {
      provide: AppLogger,
      useFactory: (): AppLogger => new AppLogger('TelegramBotModule'),
    },
    TelegramUserService,
    KeyboardBuilderService,
    TelegramBotService,
    NotificationService,
  ],
  exports: [TelegramBotService, TelegramUserService, NotificationService],
})
export class TelegramBotModule {}
```

---

## 6. Update Payment Service to Send Notifications

Update the payment service to send notifications when payments are completed.

### File: `src/modules/payment/services/payment.service.ts`

Add to the imports:

```typescript
import { NotificationService } from '~/modules/telegram-bot/services/notification.service';
```

Add to constructor:

```typescript
constructor(
  // ... existing dependencies
  private readonly notificationService: NotificationService, // Add this
  logger: AppLogger,
) {
  // ... existing code
}
```

Update the `recordTransaction` method to send notifications:

```typescript
// After saving the payment attempt
await this.paymentAttemptRepository.save(paymentAttempt);

// Send notification about payment received
const remainingAmount = paymentAttempt.amountExpected - paymentAttempt.amountPaid;
await this.notificationService.notifyPaymentReceived(
  paymentAttempt.userId,
  amount,
  remainingAmount,
);

this.logger.log('Transaction recorded', { ... });
```

Update the `completePurchase` method to send notifications:

```typescript
await this.purchaseRepository.save(purchase);

// Update utilization
await this.pricingEngineService.updateUtilization(tierInfo.rps);

// Send notification about completed purchase
await this.notificationService.notifyPurchaseComplete(
  paymentAttempt.userId,
  paymentAttempt.tier,
  tierInfo.rps,
  expiresAt,
);

this.logger.log('Purchase completed', { ... });
```

---

## 7. Update App Module

Add TelegramBotModule to the main application module.

### File: `src/app.module.ts`

```typescript
import { TelegramBotModule } from './modules/telegram-bot/telegram-bot.module';

@Module({
  imports: [
    // ... existing imports
    TelegramBotModule,
  ],
  // ... rest of module
})
export class AppModule {}
```

---

## 8. Testing the Bot

### Step 1: Set Bot Token

Add to `.env`:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
```

### Step 2: Start the Application

```bash
npm run start:dev
```

### Step 3: Check Logs

You should see:

```
[TelegramBotModule.TelegramBotService] Telegram bot started successfully
```

### Step 4: Test Bot Commands

1. Open Telegram and search for your bot
2. Send `/start` - Should see welcome message with keyboard
3. Send `/tiers` - Should see available tiers with inline buttons
4. Click a tier → Select duration → See payment instructions
5. Send `/keys` - Should see "no API keys yet" message
6. Send `/help` - Should see all available commands

### Step 5: Test Payment Flow

1. Use `/buy` command
2. Select tier and duration
3. Note the memo and wallet address
4. Send test USDC transaction on Solana devnet (or mainnet)
5. Click "Check Payment Status" button
6. Wait for transaction monitor to detect payment (10 seconds)
7. Should receive notification when payment is detected

---

## 9. Troubleshooting

### Issue 1: Bot Not Starting

**Symptom**: No "Telegram bot started" message in logs

**Solutions**:
- Verify TELEGRAM_BOT_TOKEN is set correctly
- Check bot token with BotFather
- Ensure telegraf package is installed

### Issue 2: Commands Not Working

**Symptom**: Bot doesn't respond to commands

**Solutions**:
- Check if bot is running (look for logs)
- Verify command handlers are registered
- Try restarting the bot with `/start`

### Issue 3: Buttons Not Working

**Symptom**: Clicking inline buttons has no effect

**Solutions**:
- Check callback query handlers are registered
- Verify action patterns match button callbacks
- Look for errors in application logs

### Issue 4: Notifications Not Sent

**Symptom**: User doesn't receive payment/purchase notifications

**Solutions**:
- Verify NotificationService is injected in PaymentService
- Check if user exists in telegram_users table
- Look for "NotificationError" in logs
- Ensure bot has permission to send messages to user

---

## Next Steps

Continue to Part 4: **API Key System Implementation**

This will cover:
- API Key Service (generation, validation, revocation)
- API Key Middleware for RPC proxy
- Rate limiting based on user's total RPS
- Usage tracking per API key
- Integration with existing RPC proxy

---

**Status**: Part 3 Complete ✅

**Next**: [Part 4: API Key System](./TELEGRAM_BOT_IMPLEMENTATION_GUIDE_PART4.md)
