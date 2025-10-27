import { Injectable, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { AppLogger } from '~/common/services/app-logger.service';
import { AnalyticsService } from './analytics.service';
import { DiscordAnalyticsService } from './discord-analytics.service';
import { WebSocketService } from './websocket.service';

@Injectable()
export class AnalyticsSchedulerService implements OnModuleInit {
  private readonly logger: AppLogger;
  private lastPriceAlert: number = 0;
  private readonly PRICE_ALERT_THRESHOLD = 0.1;

  constructor(
    private readonly analyticsService: AnalyticsService,
    @Inject(forwardRef(() => DiscordAnalyticsService))
    private readonly discordAnalyticsService: DiscordAnalyticsService,
    @Inject(forwardRef(() => WebSocketService))
    private readonly webSocketService: WebSocketService,
    logger: AppLogger,
  ) {
    this.logger = logger.forClass('AnalyticsSchedulerService');
  }

  onModuleInit(): void {
    this.logger.log('Analytics Scheduler service initialized');
  }

  /**
   * Monitor price changes and send alerts
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async monitorPriceChanges(): Promise<void> {
    try {
      const currentAnalytics = await this.analyticsService.getSystemAnalytics();
      const currentPrice = currentAnalytics.priceTrend.currentPrice;
      const currentUtilization = currentAnalytics.priceTrend.utilization;

      if (this.lastPriceAlert > 0) {
        const priceChange = Math.abs(currentPrice - this.lastPriceAlert) / this.lastPriceAlert;

        if (priceChange >= this.PRICE_ALERT_THRESHOLD) {
          const alertType = currentPrice > this.lastPriceAlert ? 'spike' : 'drop';

          await this.discordAnalyticsService.sendPriceAlert(
            alertType,
            currentPrice,
            this.lastPriceAlert,
            currentUtilization,
          );

          this.webSocketService.sendPriceAlert({
            type: `price_${alertType}`,
            message: `Price ${alertType} detected: ${(priceChange * 100).toFixed(2)}% change`,
            data: {
              currentPrice,
              previousPrice: this.lastPriceAlert,
              changePercentage: priceChange * 100,
              utilization: currentUtilization,
            },
          });

          this.logger.log('Price alert sent', {
            alertType,
            priceChange: priceChange * 100,
            currentPrice,
            previousPrice: this.lastPriceAlert,
          });
        }
      }

      this.lastPriceAlert = currentPrice;

      if (currentUtilization >= 80) {
        await this.discordAnalyticsService.sendPriceAlert(
          'high_utilization',
          currentPrice,
          this.lastPriceAlert,
          currentUtilization,
        );

        this.webSocketService.sendPriceAlert({
          type: 'high_utilization',
          message: `High utilization detected: ${currentUtilization.toFixed(1)}%`,
          data: {
            utilization: currentUtilization,
            currentPrice,
            threshold: 80,
          },
        });

        this.logger.warn('High utilization alert sent', { utilization: currentUtilization });
      }
    } catch (error) {
      this.logger.error(
        'Failed to monitor price changes',
        'AnalyticsSchedulerService',
        {},
        error as Error,
      );
    }
  }

  /**
   * Send system health check every 15 minutes
   */
  @Cron('*/15 * * * *')
  async sendSystemHealthCheck(): Promise<void> {
    try {
      const analytics = await this.analyticsService.getSystemAnalytics();

      const healthStatus = {
        utilization: analytics.nodeUsage.utilizationPercentage,
        activeUsers: analytics.nodeUsage.activeUsers,
        totalRequests: analytics.nodeUsage.totalRequests,
        revenue: analytics.revenue.daily,
        price: analytics.priceTrend.currentPrice,
      };

      this.webSocketService.sendUsageUpdate({
        userId: 'system',
        endpoint: 'health_check',
        requestCount: 1,
        timestamp: new Date(),
      });

      this.logger.debug('System health check completed', healthStatus);
    } catch (error) {
      this.logger.error(
        'Failed to send system health check',
        'AnalyticsSchedulerService',
        {},
        error as Error,
      );
    }
  }

  /**
   * Generate weekly analytics report
   */
  @Cron('0 9 * * 1')
  async sendWeeklyReport(): Promise<void> {
    try {
      const analytics = await this.analyticsService.getSystemAnalytics();
      const historicalData = await this.analyticsService.getHistoricalData(168);

      await this.discordAnalyticsService.sendCustomReport(
        '📊 Weekly Analytics Report',
        'Comprehensive weekly performance summary',
        {
          summary: {
            totalRequests: historicalData.nodeUsage.reduce(
              (sum: number, d: { totalRequests: number }) => sum + d.totalRequests,
              0,
            ),
            averageUtilization:
              historicalData.nodeUsage.reduce(
                (sum: number, d: { utilizationPercentage: number }) =>
                  sum + d.utilizationPercentage,
                0,
              ) / historicalData.nodeUsage.length,
            peakUtilization: Math.max(
              ...historicalData.nodeUsage.map(
                (d: { utilizationPercentage: number }) => d.utilizationPercentage,
              ),
            ),
            revenue: analytics.revenue.weekly,
            newUsers: analytics.userStats.newUsersToday * 7,
          },
          trends: {
            priceChange:
              historicalData.priceTrend.length > 1
                ? (((historicalData.priceTrend[historicalData.priceTrend.length - 1]
                    ?.currentPrice || 0) -
                    (historicalData.priceTrend[0]?.currentPrice || 0)) /
                    (historicalData.priceTrend[0]?.currentPrice || 1)) *
                  100
                : 0,
            utilizationTrend:
              historicalData.nodeUsage.length > 1
                ? (historicalData.nodeUsage[historicalData.nodeUsage.length - 1]
                    ?.utilizationPercentage || 0) -
                  (historicalData.nodeUsage[0]?.utilizationPercentage || 0)
                : 0,
          },
        },
      );

      this.logger.log('Weekly analytics report sent');
    } catch (error) {
      this.logger.error(
        'Failed to send weekly report',
        'AnalyticsSchedulerService',
        {},
        error as Error,
      );
    }
  }

  /**
   * Send monthly revenue milestone alerts
   */
  @Cron('0 0 1 * *')
  async sendMonthlyMilestone(): Promise<void> {
    try {
      const analytics = await this.analyticsService.getSystemAnalytics();

      if (analytics.revenue.monthly > 0) {
        await this.discordAnalyticsService.sendCustomReport(
          '🎉 Monthly Revenue Milestone',
          `Monthly revenue reached ${analytics.revenue.monthly.toFixed(4)} SOL`,
          {
            revenue: {
              monthly: analytics.revenue.monthly,
              daily: analytics.revenue.daily,
              weekly: analytics.revenue.weekly,
            },
            metrics: {
              activeUsers: analytics.userStats.totalActiveUsers,
              utilization: analytics.nodeUsage.utilizationPercentage,
              totalRequests: analytics.nodeUsage.totalRequests,
            },
          },
        );

        this.logger.log('Monthly revenue milestone sent', {
          monthlyRevenue: analytics.revenue.monthly,
        });
      }
    } catch (error) {
      this.logger.error(
        'Failed to send monthly milestone',
        'AnalyticsSchedulerService',
        {},
        error as Error,
      );
    }
  }
}
