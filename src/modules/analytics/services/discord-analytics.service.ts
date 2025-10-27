import { Injectable, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

import { AppLogger } from '~/common/services/app-logger.service';
import { DiscordBotService } from '~/modules/discord-bot/services/discord-bot.service';
import { AnalyticsService } from './analytics.service';

@Injectable()
export class DiscordAnalyticsService implements OnModuleInit {
  private readonly logger: AppLogger;

  constructor(
    private readonly analyticsService: AnalyticsService,
    @Inject(forwardRef(() => DiscordBotService))
    private readonly discordBotService: DiscordBotService,
    logger: AppLogger,
  ) {
    this.logger = logger.forClass('DiscordAnalyticsService');
  }

  onModuleInit(): void {
    this.logger.log('Discord Analytics service initialized');
  }

  /**
   * Send analytics to dedicated analytics channel
   */
  async sendToAnalyticsChannel(
    content: string,
    embeds?: EmbedBuilder[],
    components?: ActionRowBuilder<ButtonBuilder>[],
  ): Promise<void> {
    try {
      const analyticsChannelId = this.discordBotService['configService'].get<string>(
        'discord.analyticsChannelId',
      );

      if (!analyticsChannelId) {
        this.logger.warn(
          'DISCORD_ANALYTICS_CHANNEL_ID not configured - analytics will not be sent',
        );
        return;
      }

      const channel = await this.discordBotService.getClient()?.channels.fetch(analyticsChannelId);
      if (!channel?.isTextBased()) {
        this.logger.error(
          'Analytics channel not found or not text-based',
          'DiscordAnalyticsService',
          { analyticsChannelId },
        );
        return;
      }

      await (channel as any).send({
        content,
        embeds: embeds?.map(embed => embed.toJSON()) || [],
        components: components?.map(component => component.toJSON()) || [],
      });

      this.logger.log('Analytics sent to dedicated channel', { analyticsChannelId });
    } catch (error) {
      this.logger.error(
        'Failed to send analytics to dedicated channel',
        'DiscordAnalyticsService',
        {},
        error as Error,
      );
    }
  }

  /**
   * Send price alert when significant changes occur
   */
  async sendPriceAlert(
    alertType: 'spike' | 'drop' | 'high_utilization',
    currentPrice: number,
    previousPrice: number,
    utilization: number,
  ): Promise<void> {
    const embed = new EmbedBuilder()
      .setColor(this.getAlertColor(alertType))
      .setTitle(this.getAlertTitle(alertType))
      .setDescription(this.getAlertDescription(alertType, currentPrice, previousPrice, utilization))
      .addFields(
        { name: '💰 Current Price', value: `${currentPrice.toFixed(6)} SOL`, inline: true },
        { name: '📊 Utilization', value: `${utilization.toFixed(1)}%`, inline: true },
        {
          name: '📈 Price Change',
          value: `${(((currentPrice - previousPrice) / previousPrice) * 100).toFixed(2)}%`,
          inline: true,
        },
      )
      .setTimestamp();

    await this.sendToAnalyticsChannel('🚨 **Price Alert**', [embed]);

    this.logger.log('Price alert sent', { alertType, currentPrice, previousPrice, utilization });
  }

  /**
   * Create simple analytics dashboard focused on price and demand
   */
  async createAnalyticsDashboard(): Promise<{
    embeds: EmbedBuilder[];
    components: ActionRowBuilder<ButtonBuilder>[];
  }> {
    try {
      const analytics = await this.analyticsService.getSystemAnalytics();

      const usedNodePercentage = this.calculateUsedNodePercentage(analytics.nodeUsage);

      const color =
        usedNodePercentage > 80 ? 0xff0000 : usedNodePercentage > 50 ? 0xffaa00 : 0x00ff00;
      const statusEmoji = usedNodePercentage > 80 ? '🔥' : usedNodePercentage > 50 ? '⚡' : '📊';

      const embed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`${statusEmoji} Live Price & Demand Dashboard`)
        .setDescription(`**Real-time pricing and demand monitoring**`)
        .addFields(
          {
            name: '💰 Current Price',
            value: `**$${analytics.priceTrend.currentPrice.toFixed(4)}**`,
            inline: true,
          },
          {
            name: '📈 Used Node %',
            value: `**${this.getDemandBar(usedNodePercentage)}** ${usedNodePercentage.toFixed(1)}%`,
            inline: true,
          },
          {
            name: '👥 Active Users',
            value: `**${analytics.nodeUsage.activeUsers}** users`,
            inline: true,
          },
        )
        .setFooter({
          text: `🕐 Last updated • ${this.getTimeAgo()}`,
        })
        .setTimestamp();

      const refreshButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('analytics_refresh')
          .setLabel('🔄 Refresh Data')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('analytics_export')
          .setLabel('📊 Export CSV')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setLabel('🌐 Web Dashboard')
          .setStyle(ButtonStyle.Link)
          .setURL('http://localhost:3000/api/dashboard'),
      );

      return {
        embeds: [embed],
        components: [refreshButton],
      };
    } catch (error) {
      this.logger.error(
        'Failed to create analytics dashboard',
        'DiscordAnalyticsService',
        {},
        error as Error,
      );
      throw error;
    }
  }

  /**
   * Get alert color based on type
   */
  private getAlertColor(alertType: string): number {
    switch (alertType) {
      case 'spike':
        return 0xff0000;
      case 'drop':
        return 0x00ff00;
      case 'high_utilization':
        return 0xffaa00;
      default:
        return 0x0099ff;
    }
  }

  /**
   * Get alert title based on type
   */
  private getAlertTitle(alertType: string): string {
    switch (alertType) {
      case 'spike':
        return '📈 Price Spike Detected';
      case 'drop':
        return '📉 Price Drop Detected';
      case 'high_utilization':
        return '⚠️ High Utilization Alert';
      default:
        return '🚨 System Alert';
    }
  }

  /**
   * Get alert description based on type
   */
  private getAlertDescription(
    alertType: string,
    currentPrice: number,
    previousPrice: number,
    utilization: number,
  ): string {
    const priceChange = (((currentPrice - previousPrice) / previousPrice) * 100).toFixed(2);

    switch (alertType) {
      case 'spike':
        return `Price increased by ${priceChange}% due to high demand. Consider scaling resources.`;
      case 'drop':
        return `Price decreased by ${Math.abs(parseFloat(priceChange))}% due to lower demand.`;
      case 'high_utilization':
        return `System utilization is at ${utilization.toFixed(1)}%. Performance may be affected.`;
      default:
        return 'A system alert has been triggered. Please check the details below.';
    }
  }

  /**
   * Send custom analytics report
   */
  async sendCustomReport(
    title: string,
    description: string,
    data: Record<string, any>,
    targetUserId?: string,
  ): Promise<void> {
    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle(title)
      .setDescription(description)
      .addFields({ name: '📊 Data', value: JSON.stringify(data, null, 2), inline: false })
      .setTimestamp();

    await this.sendToAnalyticsChannel('', [embed]);

    this.logger.log('Custom analytics report sent', { title, targetUserId });
  }

  /**
   * Create demand visualization bar
   */
  private getDemandBar(demandPercentage: number): string {
    const filled = Math.round(demandPercentage / 10);
    const empty = 10 - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  /**
   * Calculate used node percentage based on RPS allocation vs capacity
   */
  private calculateUsedNodePercentage(nodeUsage: any): number {
    const maxRpsCapacity = 1000;
    return Math.min((nodeUsage.totalRpsAllocated / maxRpsCapacity) * 100, 100);
  }

  private getTimeAgo(): string {
    return 'Just now';
  }
}
