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
   * Generate chart image using QuickChart.io
   */
  generateChartImage(
    chartType: 'line' | 'bar' | 'doughnut',
    data: Record<string, any>,
    options: Record<string, any> = {},
  ): string {
    const chartConfig = {
      type: chartType,
      data,
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom',
          },
        },
        ...options,
      },
    };

    const encodedConfig = encodeURIComponent(JSON.stringify(chartConfig));
    return `https://quickchart.io/chart?c=${encodedConfig}`;
  }

  /**
   * Create price trend chart for Discord
   */
  createPriceTrendChart(
    historicalData: Array<{
      timestamp: Date;
      currentPrice: number;
      utilization: number;
      onChainActivity: number;
      tierPrices: Array<{ tier: string; price: number }>;
    }>,
  ): string {
    const labels = historicalData.map((_, index) => {
      const date = new Date();
      date.setHours(date.getHours() - (historicalData.length - index - 1));
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    });

    const chartData = {
      labels,
      datasets: [
        {
          label: 'Price (SOL)',
          data: historicalData.map(d => d.currentPrice),
          borderColor: '#ed8936',
          backgroundColor: 'rgba(237, 137, 54, 0.1)',
          tension: 0.4,
        },
        {
          label: 'Utilization %',
          data: historicalData.map(d => d.utilization),
          borderColor: '#48bb78',
          backgroundColor: 'rgba(72, 187, 120, 0.1)',
          tension: 0.4,
          yAxisID: 'y1',
        },
      ],
    };

    const options = {
      scales: {
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: 'Price (SOL)',
          },
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: {
            display: true,
            text: 'Utilization %',
          },
          grid: {
            drawOnChartArea: false,
          },
        },
      },
    };

    return this.generateChartImage('line', chartData, options);
  }

  /**
   * Create usage trend chart for Discord
   */
  createUsageTrendChart(
    historicalData: Array<{
      timestamp: Date;
      totalRequests: number;
      activeUsers: number;
      averageRps: number;
      peakRps: number;
      totalRpsAllocated: number;
      utilizationPercentage: number;
      topEndpoints: Array<{ endpoint: string; requests: number }>;
    }>,
  ): string {
    const labels = historicalData.map((_, index) => {
      const date = new Date();
      date.setHours(date.getHours() - (historicalData.length - index - 1));
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    });

    const chartData = {
      labels,
      datasets: [
        {
          label: 'Total Requests',
          data: historicalData.map(d => d.totalRequests),
          borderColor: '#4299e1',
          backgroundColor: 'rgba(66, 153, 225, 0.1)',
          tension: 0.4,
        },
        {
          label: 'Active Users',
          data: historicalData.map(d => d.activeUsers),
          borderColor: '#9f7aea',
          backgroundColor: 'rgba(159, 122, 234, 0.1)',
          tension: 0.4,
          yAxisID: 'y1',
        },
      ],
    };

    const options = {
      scales: {
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: 'Requests',
          },
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: {
            display: true,
            text: 'Users',
          },
          grid: {
            drawOnChartArea: false,
          },
        },
      },
    };

    return this.generateChartImage('line', chartData, options);
  }

  /**
   * Create revenue chart for Discord
   */
  createRevenueChart(revenueData: { daily: number; weekly: number; monthly: number }): string {
    const chartData = {
      labels: ['Daily', 'Weekly', 'Monthly'],
      datasets: [
        {
          label: 'Revenue (SOL)',
          data: [revenueData.daily, revenueData.weekly, revenueData.monthly],
          backgroundColor: ['#38a169', '#ed8936', '#9f7aea'],
          borderColor: ['#2f855a', '#dd6b20', '#805ad5'],
          borderWidth: 2,
        },
      ],
    };

    const options = {
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Revenue (SOL)',
          },
        },
      },
    };

    return this.generateChartImage('bar', chartData, options);
  }

  /**
   * Create Price & Demand chart from system_events table
   */
  async createPriceDemandChartFromSystemEvents(hours: number = 24): Promise<string> {
    try {
      const response = await fetch(
        `http://localhost:3000/api/analytics/price-demand-chart?hours=${hours}&width=800&height=400`,
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch chart: ${response.statusText}`);
      }

      const data: { chartUrl: string } = await response.json();
      return data.chartUrl;
    } catch (error) {
      this.logger.error(
        'Failed to create price & demand chart',
        'DiscordAnalyticsService',
        { hours },
        error as Error,
      );
      return 'https://quickchart.io/chart?c=%7B%22type%22%3A%22line%22%2C%22data%22%3A%7B%22labels%22%3A%5B%22No%20Data%22%5D%2C%22datasets%22%3A%5B%7B%22label%22%3A%22No%20Data%22%2C%22data%22%3A%5B0%5D%7D%5D%7D%7D';
    }
  }

  /**
   * Send analytics with charts to Discord
   */
  async sendAnalyticsWithCharts(): Promise<void> {
    try {
      const analytics = await this.analyticsService.getSystemAnalytics();

      // Generate the new Price & Demand chart from system_events
      const priceDemandChartUrl = await this.createPriceDemandChartFromSystemEvents(24);

      // Create embed with the Price & Demand chart
      const embed = new EmbedBuilder()
        .setColor(0xff9f40)
        .setTitle('📊 Price & Demand History (24h)')
        .setDescription(
          '**How to read this chart:**\n' +
            '🟠 **Orange** = Price per RPS (×10⁻³ SOL for visibility)\n' +
            '🔵 **Cyan** = Demand/Utilization (%)\n' +
            '🟣 **Purple** = On-Chain Activity (%)\n\n' +
            '💡 When demand ↑ → Price ↑  |  When demand ↓ → Price ↓',
        )
        .addFields(
          {
            name: '💰 Current Price',
            value: `${analytics.priceTrend.currentPrice.toFixed(6)} SOL`,
            inline: true,
          },
          {
            name: '📈 Demand',
            value: `${analytics.priceTrend.utilization.toFixed(1)}%`,
            inline: true,
          },
          {
            name: '👥 Active Users',
            value: `${analytics.nodeUsage.activeUsers}`,
            inline: true,
          },
        )
        .setImage(priceDemandChartUrl)
        .setTimestamp();

      // Send main embed
      await this.sendToAnalyticsChannel('📊 **Price & Demand Analytics**', [embed]);

      this.logger.log('Price & Demand chart sent to Discord');
    } catch (error) {
      this.logger.error(
        'Failed to send analytics with charts',
        'DiscordAnalyticsService',
        {},
        error as Error,
      );
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
