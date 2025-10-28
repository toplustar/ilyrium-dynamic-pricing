import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Client,
  ActionRowBuilder,
  ButtonBuilder,
  Interaction,
  TextChannel,
  Message,
  GatewayIntentBits,
  ButtonStyle,
  EmbedBuilder,
} from 'discord.js';
import { AppLogger } from '~/common/services/app-logger.service';
import { PurchaseService } from './purchase.service';
import { DiscordNotificationService } from './discord-notification.service';
import { DiscordAnalyticsService } from '~/modules/analytics/services/discord-analytics.service';

@Injectable()
export class DiscordBotService implements OnModuleInit {
  private client: Client;
  private readonly logger: AppLogger;

  constructor(
    private readonly configService: ConfigService,
    private readonly purchaseService: PurchaseService,
    private readonly discordNotificationService: DiscordNotificationService,
    private readonly discordAnalyticsService: DiscordAnalyticsService,
    logger: AppLogger,
  ) {
    this.logger = logger.forClass('DiscordBotService');
  }

  async onModuleInit(): Promise<void> {
    const botToken = this.configService.get<string>('discord.botToken');

    if (!botToken) {
      this.logger.warn('DISCORD_BOT_TOKEN not configured - bot will not start');
      return;
    }

    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    this.setupEventHandlers();
    await this.client.login(botToken);
    this.logger.log('Discord bot started successfully');
  }

  async sendPurchaseServicesMessage(channelId: string): Promise<void> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel?.isTextBased()) {
        this.logger.error('ChannelError', 'Channel not found or not text-based', { channelId });
        return;
      }

      const purchaseRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('rpc_services')
          .setLabel('RPC Services')
          .setStyle(ButtonStyle.Success)
          .setEmoji('🔗'),
      );

      await (channel as TextChannel).send({
        content: '**Click the button to purchase service**',
        components: [purchaseRow] as any,
      });

      const subscriptionsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('view_subscriptions')
          .setLabel('View My Active Subscriptions')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('📋'),
      );

      await (channel as TextChannel).send({
        content: '**Click the button to view your current service subscription**',
        components: [subscriptionsRow] as any,
      });

      this.logger.log('Purchase services messages sent', { channelId });
    } catch (err) {
      this.logger.error(
        'SendMessageError',
        'Failed to send purchase messages',
        { channelId },
        err as Error,
      );
    }
  }

  private setupEventHandlers(): void {
    this.client.on('ready', (): void => {
      this.logger.log(`Discord bot logged in as ${this.client.user?.tag}`);
    });

    this.client.on('messageCreate', (message: Message): void => {
      void this.handleMessage(message).catch(err =>
        this.logger.error('MessageError', 'Failed to handle message', {}, err as Error),
      );
    });

    this.client.on('interactionCreate', (interaction: Interaction): void => {
      void (async (): Promise<void> => {
        try {
          if (interaction.isButton()) {
            await this.handleButtonInteraction(interaction);
          }
        } catch (err) {
          this.logger.error('InteractionError', 'Failed to handle interaction', {}, err as Error);
          if (interaction.isRepliable()) {
            await interaction
              .reply({
                content: 'Sorry, something went wrong. Please try again later.',
                ephemeral: true,
              })
              .catch(() => {});
          }
        }
      })();
    });
  }

  private async handleMessage(message: Message): Promise<void> {
    if (message.author.bot) return;

    const content = message.content.trim().toLowerCase();
    const isAdmin = message.member?.permissions.has('Administrator') || false;

    if (isAdmin && ['!purchase', '!setup', '!buy'].includes(content)) {
      await this.sendPurchaseServicesMessage(message.channelId);
      await message.delete().catch(() => {});
      return;
    }

    // Handle analytics setup command
    if (isAdmin && content === '!setup-analytics') {
      await this.setupAnalyticsChannel(message);
      await message.delete().catch(() => {});
      return;
    }

    // Handle analytics commands (only in analytics channel)
    if (isAdmin && ['!analytics', '!stats', '!dashboard'].includes(content)) {
      const analyticsChannelId = this.configService.get<string>('discord.analyticsChannelId');
      if (analyticsChannelId && message.channelId !== analyticsChannelId) {
        await message.reply(
          '❌ Analytics commands can only be used in the dedicated analytics channel.',
        );
        return;
      }
      await this.handleAnalyticsCommand(message);
      await message.delete().catch(() => {});
      return;
    }

    if (!isAdmin && message.channel.isTextBased()) {
      const channel = message.channel as TextChannel;
      const name = channel.name?.toLowerCase() || '';
      const isPurchaseChannel =
        name.includes('purchase') || name.includes('buy') || name.includes('service');

      if (isPurchaseChannel) {
        await message.delete().catch(() => {});
        const msg = await channel
          .send({
            content: `<@${message.author.id}> Please use the buttons to interact with the purchase system.`,
          })
          .catch(() => undefined);

        if (msg) {
          setTimeout(() => {
            void msg.delete().catch(() => {});
          }, 3000);
        }
      }
    }
  }

  private async handleButtonInteraction(interaction: any): Promise<void> {
    const { customId } = interaction;

    if (interaction.user) {
      const user = await this.purchaseService['discordUserService'].getUserByDiscordId(
        interaction.user.id,
      );
      if (user) {
        this.discordNotificationService.storeUserInteraction(
          user.id,
          interaction.user.id,
          interaction,
        );
      }
    }

    if (customId === 'rpc_services') {
      await this.purchaseService.showTierSelection(interaction);
    } else if (customId === 'view_subscriptions') {
      await this.purchaseService.showActiveSubscriptions(interaction);
    } else if (customId.startsWith('tier:')) {
      await this.purchaseService.showDurationSelection(interaction);
    } else if (customId.startsWith('duration:')) {
      await this.purchaseService.createPayment(interaction);
    } else if (customId.startsWith('check_payment:')) {
      await this.purchaseService.checkPaymentStatus(interaction);
    } else if (customId === 'back_to_tiers') {
      await this.purchaseService.showTierSelection(interaction);
    } else if (customId.startsWith('regenerate_key:')) {
      await this.purchaseService.handleKeyRegeneration(interaction);
    } else if (customId.startsWith('confirm_regenerate:')) {
      await this.purchaseService.confirmKeyRegeneration(interaction);
    } else if (customId === 'cancel_regenerate') {
      await interaction.reply({
        content: '❌ Key regeneration cancelled.',
        ephemeral: true,
      });
    } else if (customId === 'analytics_refresh') {
      await this.handleAnalyticsRefresh(interaction);
    } else if (customId === 'analytics_historical') {
      await this.handleAnalyticsHistorical(interaction);
    } else if (customId === 'analytics_alerts') {
      await this.handleAnalyticsAlerts(interaction);
    } else if (customId === 'analytics_export') {
      await this.handleAnalyticsExport(interaction);
    }
  }

  /**
   * Get Discord client for external services
   */
  getClient(): Client | null {
    return this.client;
  }

  /**
   * Send message to purchase services channel
   */
  async sendToChannel(
    messageOptions: { content?: string; embeds?: any[] },
    targetUserId?: string,
  ): Promise<void> {
    try {
      if (!this.client) {
        this.logger.error('DiscordClientError', 'Discord client not initialized');
        return;
      }

      const channels = this.client.channels.cache.filter(channel => {
        if (!channel.isTextBased()) return false;
        const name = (channel as any).name?.toLowerCase() || '';
        return name.includes('purchase') || name.includes('buy') || name.includes('service');
      });

      const targetChannel = channels.first();
      if (targetChannel?.isTextBased()) {
        if (targetUserId) {
          const content = messageOptions.content || '';
          messageOptions.content = `<@${targetUserId}> ${content}`.trim();
        }

        await (targetChannel as any).send(messageOptions);
        this.logger.log('Message sent to purchase channel', {
          channelId: targetChannel.id,
          channelName: (targetChannel as any).name,
          targetUserId,
        });
      } else {
        this.logger.error(
          'ChannelNotFoundError',
          'No purchase channel found - create a channel with "purchase", "buy", or "service" in the name',
        );
      }
    } catch (error) {
      this.logger.error(
        'ChannelMessageError',
        'Failed to send message to purchase channel',
        { targetUserId },
        error as Error,
      );
    }
  }

  /**
   * Send direct message to a Discord user (kept for backward compatibility)
   */
  async sendDirectMessage(
    discordId: string,
    messageOptions: { content?: string; embeds?: any[] },
  ): Promise<void> {
    try {
      if (!this.client) {
        this.logger.error('DiscordClientError', 'Discord client not initialized');
        return;
      }

      const user = await this.client.users.fetch(discordId);
      if (user) {
        await user.send(messageOptions);
        this.logger.log('Direct message sent', { discordId, userId: user.username });
      } else {
        this.logger.warn('Discord user not found', { discordId });
      }
    } catch (error) {
      this.logger.error(
        'DirectMessageError',
        'Failed to send direct message',
        { discordId },
        error as Error,
      );
    }
  }

  /**
   * Setup analytics channel
   */
  private async setupAnalyticsChannel(message: Message): Promise<void> {
    try {
      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('📊 Analytics Channel Setup')
        .setDescription('This channel has been configured as the dedicated analytics channel.')
        .addFields(
          { name: '✅ Status', value: 'Analytics channel configured', inline: true },
          { name: '📈 Features', value: 'Live reports, alerts, and monitoring', inline: true },
          { name: '🔧 Commands', value: '`!analytics`, `!stats`, `!dashboard`', inline: true },
        )
        .setFooter({ text: 'Set DISCORD_ANALYTICS_CHANNEL_ID in your environment variables' })
        .setTimestamp();

      await message.channel.send({
        content: '📊 **Analytics Channel Configured!**',
        embeds: [embed],
      } as any);

      this.logger.log('Analytics channel setup completed', { channelId: message.channelId });
    } catch (error) {
      this.logger.error(
        'Failed to setup analytics channel',
        'DiscordBotService',
        { channelId: message.channelId },
        error as Error,
      );

      await message.channel.send({
        content: '❌ Failed to setup analytics channel. Please try again later.',
      });
    }
  }

  /**
   * Handle analytics command
   */
  private async handleAnalyticsCommand(message: Message): Promise<void> {
    try {
      await this.discordAnalyticsService.sendAnalyticsWithCharts();

      this.logger.log('Analytics charts sent', { channelId: message.channelId });
    } catch (error) {
      this.logger.error(
        'Failed to send analytics charts',
        'DiscordBotService',
        { channelId: message.channelId },
        error as Error,
      );

      await message.channel.send({
        content: '❌ Failed to load analytics charts. Please try again later.',
      });
    }
  }

  /**
   * Handle analytics refresh button
   */
  private async handleAnalyticsRefresh(interaction: any): Promise<void> {
    try {
      await interaction.deferUpdate();

      await this.discordAnalyticsService.sendAnalyticsWithCharts();

      await interaction.editReply({
        content: '📊 **Analytics Charts Refreshed** - New charts sent to channel',
      });

      this.logger.log('Analytics charts refreshed', { userId: interaction.user.id });
    } catch (error) {
      this.logger.error(
        'Failed to refresh analytics charts',
        'DiscordBotService',
        { userId: interaction.user.id },
        error as Error,
      );

      await interaction.editReply({
        content: '❌ Failed to refresh analytics charts.',
      });
    }
  }

  /**
   * Handle analytics historical button
   */
  private async handleAnalyticsHistorical(interaction: any): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const historicalData =
        await this.discordAnalyticsService['analyticsService'].getHistoricalData(24);

      const embed = new EmbedBuilder()
        .setColor(0x0099ff)
        .setTitle('📈 Historical Analytics (24h)')
        .setDescription('Historical data for the last 24 hours')
        .addFields(
          {
            name: '📊 Usage Trends',
            value: [
              `**Data Points:** ${historicalData.nodeUsage.length}`,
              `**Avg Requests/Hour:** ${Math.round(historicalData.nodeUsage.reduce((sum, d) => sum + d.totalRequests, 0) / historicalData.nodeUsage.length)}`,
              `**Peak Utilization:** ${Math.max(...historicalData.nodeUsage.map(d => d.utilizationPercentage)).toFixed(1)}%`,
            ].join('\n'),
            inline: true,
          },
          {
            name: '💰 Price Trends',
            value: [
              `**Data Points:** ${historicalData.priceTrend.length}`,
              `**Price Range:** ${Math.min(...historicalData.priceTrend.map(d => d.currentPrice)).toFixed(6)} - ${Math.max(...historicalData.priceTrend.map(d => d.currentPrice)).toFixed(6)} SOL`,
              `**Avg Activity:** ${((historicalData.priceTrend.reduce((sum, d) => sum + d.onChainActivity, 0) / historicalData.priceTrend.length) * 100).toFixed(1)}%`,
            ].join('\n'),
            inline: true,
          },
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      this.logger.error(
        'Failed to get historical analytics',
        'DiscordBotService',
        { userId: interaction.user.id },
        error as Error,
      );

      await interaction.editReply({
        content: '❌ Failed to load historical data.',
      });
    }
  }

  /**
   * Handle analytics alerts button
   */
  private async handleAnalyticsAlerts(interaction: any): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const embed = new EmbedBuilder()
        .setColor(0xffaa00)
        .setTitle('🚨 Analytics Alerts')
        .setDescription('Configure and view system alerts')
        .addFields(
          {
            name: '📊 Current Alerts',
            value: [
              '• High utilization monitoring',
              '• Price spike detection',
              '• System performance alerts',
              '• Revenue milestone tracking',
            ].join('\n'),
            inline: true,
          },
          {
            name: '⚙️ Alert Settings',
            value: [
              '• Utilization threshold: 80%',
              '• Price change threshold: 10%',
              '• Alert frequency: Real-time',
              '• Notification channels: Discord',
            ].join('\n'),
            inline: true,
          },
        )
        .setFooter({ text: 'Alert configuration coming soon!' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      this.logger.error(
        'Failed to get analytics alerts',
        'DiscordBotService',
        { userId: interaction.user.id },
        error as Error,
      );

      await interaction.editReply({
        content: '❌ Failed to load alerts information.',
      });
    }
  }

  /**
   * Handle analytics export button
   */
  private async handleAnalyticsExport(interaction: any): Promise<void> {
    try {
      await interaction.deferReply({ ephemeral: true });

      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('📤 Analytics Export')
        .setDescription('Export analytics data in various formats')
        .addFields(
          {
            name: '📊 Available Formats',
            value: [
              '• **JSON**: Complete data structure',
              '• **CSV**: Spreadsheet compatible',
              '• **PDF**: Formatted reports (coming soon)',
            ].join('\n'),
            inline: true,
          },
          {
            name: '⏰ Time Ranges',
            value: ['• Last 24 hours', '• Last 7 days', '• Last 30 days', '• Custom range'].join(
              '\n',
            ),
            inline: true,
          },
        )
        .addFields({
          name: '🔗 Export Options',
          value:
            'Use the web dashboard at `/analytics/export/json` or `/analytics/export/csv` for direct downloads.',
          inline: false,
        })
        .setFooter({ text: 'Web export available at /analytics/export' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      this.logger.error(
        'Failed to get analytics export info',
        'DiscordBotService',
        { userId: interaction.user.id },
        error as Error,
      );

      await interaction.editReply({
        content: '❌ Failed to load export information.',
      });
    }
  }
}
