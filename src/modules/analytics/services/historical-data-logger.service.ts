import { Injectable, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';

import { AppLogger } from '~/common/services/app-logger.service';
import { SystemEvent, SystemEventType } from '../entities/system-event.entity';
import { AnalyticsService } from './analytics.service';
import { DiscordAnalyticsService } from './discord-analytics.service';

export interface EventData {
  eventType: SystemEventType;
  description?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class HistoricalDataLogger implements OnModuleInit {
  private readonly logger: AppLogger;
  private lastRpsUtilization: number = 0;
  private lastChainActivity: number = 0;
  private lastPrice: number = 0;
  private readonly CHANGE_THRESHOLD = 0.05; // 5% change threshold
  private readonly PRICE_CHANGE_THRESHOLD = 0.01; // 1% price change threshold

  constructor(
    @InjectRepository(SystemEvent)
    private readonly systemEventRepository: Repository<SystemEvent>,
    private readonly analyticsService: AnalyticsService,
    @Inject(forwardRef(() => DiscordAnalyticsService))
    private readonly discordAnalyticsService: DiscordAnalyticsService,
    logger: AppLogger,
  ) {
    this.logger = logger.forClass('HistoricalDataLogger');
  }

  async onModuleInit(): Promise<void> {
    await this.initializeBaseline();
    this.logger.log('WebSocket-based HistoricalDataLogger initialized');
  }

  /**
   * Log data when WebSocket detects changes
   */
  async logWebSocketEvent(
    eventType: 'rps-change' | 'chain-activity-change' | 'price-change',
    changeData: Record<string, any>,
  ): Promise<void> {
    try {
      await this.logEvent({
        eventType: SystemEventType.WEBSOCKET_LOG,
        description: `WebSocket detected ${eventType}: ${changeData.description}`,
        metadata: {
          trigger: 'websocket',
          changeType: eventType,
          ...changeData,
        },
      });
    } catch (error) {
      this.logger.error(
        'Failed to log WebSocket event',
        'HistoricalDataLogger',
        { eventType },
        error as Error,
      );
    }
  }

  /**
   * Check for RPS utilization changes and log if significant
   */
  async checkRpsChange(): Promise<boolean> {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const nodeUsage = await this.analyticsService.getNodeUsageMetrics(oneHourAgo, now);
      const currentUtilization = nodeUsage.utilizationPercentage;

      const utilizationChange = Math.abs(currentUtilization - this.lastRpsUtilization);

      if (utilizationChange >= this.CHANGE_THRESHOLD) {
        await this.logEvent({
          eventType: SystemEventType.RPS_CHANGE,
          description: `RPS utilization changed from ${this.lastRpsUtilization.toFixed(2)}% to ${currentUtilization.toFixed(2)}%`,
          metadata: {
            oldUtilization: this.lastRpsUtilization,
            newUtilization: currentUtilization,
            changeAmount: utilizationChange,
            changePercentage: ((utilizationChange / this.lastRpsUtilization) * 100).toFixed(2),
          },
        });

        this.lastRpsUtilization = currentUtilization;
        return true; // Change detected
      }

      return false; // No significant change
    } catch (error) {
      this.logger.error('Failed to check RPS change', 'HistoricalDataLogger', {}, error as Error);
      return false;
    }
  }

  /**
   * Check for chain activity changes and log if significant
   */
  async checkChainActivityChange(): Promise<boolean> {
    try {
      const priceTrend = await this.analyticsService.getPriceTrendData();
      const currentChainActivity = priceTrend.onChainActivity;

      const activityChange = Math.abs(currentChainActivity - this.lastChainActivity);

      if (activityChange >= this.CHANGE_THRESHOLD) {
        await this.logEvent({
          eventType: SystemEventType.CHAIN_ACTIVITY_CHANGE,
          description: `Chain activity changed from ${this.lastChainActivity.toFixed(4)} to ${currentChainActivity.toFixed(4)}`,
          metadata: {
            oldActivity: this.lastChainActivity,
            newActivity: currentChainActivity,
            changeAmount: activityChange,
            changePercentage: ((activityChange / this.lastChainActivity) * 100).toFixed(2),
          },
        });

        this.lastChainActivity = currentChainActivity;
        return true; // Change detected
      }

      return false; // No significant change
    } catch (error) {
      this.logger.error(
        'Failed to check chain activity change',
        'HistoricalDataLogger',
        {},
        error as Error,
      );
      return false;
    }
  }

  /**
   * Check for price changes and log if significant
   */
  async checkPriceChange(): Promise<boolean> {
    try {
      const priceTrend = await this.analyticsService.getPriceTrendData();
      const currentPrice = priceTrend.currentPrice;

      const priceChange = Math.abs(currentPrice - this.lastPrice);
      const priceChangePercentage = (priceChange / this.lastPrice) * 100;

      if (priceChangePercentage >= this.PRICE_CHANGE_THRESHOLD) {
        await this.logEvent({
          eventType: SystemEventType.WEBSOCKET_LOG,
          description: `Price changed from ${this.lastPrice.toFixed(6)} SOL to ${currentPrice.toFixed(6)} SOL`,
          metadata: {
            oldPrice: this.lastPrice,
            newPrice: currentPrice,
            changeAmount: priceChange,
            changePercentage: priceChangePercentage.toFixed(2),
            trigger: 'price-change',
          },
        });

        this.lastPrice = currentPrice;
        return true; // Change detected
      }

      return false; // No significant change
    } catch (error) {
      this.logger.error('Failed to check price change', 'HistoricalDataLogger', {}, error as Error);
      return false;
    }
  }

  /**
   * Log a system event with current analytics data
   */
  async logEvent(eventData: EventData): Promise<void> {
    try {
      const now = new Date();

      // Get current analytics data
      const [priceData, usageData] = await Promise.all([
        this.getCurrentPriceData(),
        this.getCurrentUsageData(),
      ]);

      // Create system event record
      const systemEvent = this.systemEventRepository.create({
        eventType: eventData.eventType,
        description: eventData.description,
        metadata: eventData.metadata || {},
        priceData,
        usageData,
        timestamp: now,
      });

      await this.systemEventRepository.save(systemEvent);

      this.logger.log(`System event logged: ${eventData.eventType}`, {
        eventType: eventData.eventType,
        description: eventData.description,
        priceData: priceData.currentPrice,
        utilization: usageData.utilizationPercentage,
      });

      // Trigger live analytics update for price/usage related events
      this.triggerLiveAnalyticsUpdate(eventData.eventType);
    } catch (error) {
      this.logger.error(
        'Failed to log system event',
        'HistoricalDataLogger',
        { eventType: eventData.eventType },
        error as Error,
      );
    }
  }

  /**
   * Log purchase event
   */
  async logPurchase(purchaseData: {
    tier: string;
    rpsAllocated: number;
    price: number;
    duration: number;
    walletAddress: string;
  }): Promise<void> {
    await this.logEvent({
      eventType: SystemEventType.PURCHASE,
      description: `Purchase: ${purchaseData.tier} tier, ${purchaseData.rpsAllocated} RPS for ${purchaseData.duration} days`,
      metadata: {
        tier: purchaseData.tier,
        rpsAllocated: purchaseData.rpsAllocated,
        price: purchaseData.price,
        duration: purchaseData.duration,
        walletAddress: purchaseData.walletAddress,
      },
    });

    // Check for RPS changes after purchase
    await this.checkRpsChange();
  }

  /**
   * Log expiration event
   */
  async logExpiration(expirationData: {
    tier: string;
    rpsAllocated: number;
    walletAddress: string;
    expiredAt: Date;
  }): Promise<void> {
    await this.logEvent({
      eventType: SystemEventType.EXPIRATION,
      description: `Expiration: ${expirationData.tier} tier, ${expirationData.rpsAllocated} RPS expired`,
      metadata: {
        tier: expirationData.tier,
        rpsAllocated: expirationData.rpsAllocated,
        walletAddress: expirationData.walletAddress,
        expiredAt: expirationData.expiredAt,
      },
    });

    // Check for RPS changes after expiration
    await this.checkRpsChange();
  }

  /**
   * Log manual adjustment
   */
  async logManualAdjustment(adjustmentData: {
    type: string;
    oldValue: any;
    newValue: any;
    reason: string;
    adjustedBy: string;
  }): Promise<void> {
    await this.logEvent({
      eventType: SystemEventType.MANUAL_ADJUST,
      description: `Manual adjustment: ${adjustmentData.type} from ${adjustmentData.oldValue} to ${adjustmentData.newValue}`,
      metadata: {
        type: adjustmentData.type,
        oldValue: adjustmentData.oldValue,
        newValue: adjustmentData.newValue,
        reason: adjustmentData.reason,
        adjustedBy: adjustmentData.adjustedBy,
      },
    });
  }

  /**
   * Get historical data from events
   */
  async getHistoricalDataFromEvents(hours: number = 24): Promise<{
    nodeUsage: Array<{
      timestamp: Date;
      totalRequests: number;
      activeUsers: number;
      averageRps: number;
      peakRps: number;
      totalRpsAllocated: number;
      utilizationPercentage: number;
      topEndpoints: Array<{ endpoint: string; requests: number }>;
    }>;
    priceTrend: Array<{
      timestamp: Date;
      currentPrice: number;
      utilization: number;
      onChainActivity: number;
      tierPrices: Array<{ tier: string; price: number }>;
    }>;
  }> {
    const startTime = new Date();
    startTime.setHours(startTime.getHours() - hours);

    const events = await this.systemEventRepository.find({
      where: {
        timestamp: MoreThanOrEqual(startTime),
      },
      order: {
        timestamp: 'ASC',
      },
    });

    const nodeUsage = events
      .filter(event => event.usageData)
      .map(event => ({
        timestamp: event.timestamp,
        ...event.usageData,
      }));

    const priceTrend = events
      .filter(event => event.priceData)
      .map(event => ({
        timestamp: event.timestamp,
        ...event.priceData,
      }));

    return { nodeUsage, priceTrend };
  }

  /**
   * Trigger live analytics update for relevant events
   */
  private triggerLiveAnalyticsUpdate(eventType: SystemEventType): void {
    try {
      // Only update live analytics for events that affect price/demand
      const relevantEvents = [
        SystemEventType.RPS_CHANGE,
        SystemEventType.CHAIN_ACTIVITY_CHANGE,
        SystemEventType.PURCHASE,
        SystemEventType.EXPIRATION,
        SystemEventType.MANUAL_ADJUST,
      ];

      if (relevantEvents.includes(eventType)) {
        // Use setTimeout to avoid blocking the main event logging
        setTimeout(async () => {
          try {
            await this.discordAnalyticsService.updateLiveAnalytics();
            this.logger.debug('Live analytics updated due to system event', {
              eventType,
            });
          } catch (error) {
            this.logger.warn('Failed to update live analytics after system event', {
              eventType,
              error: (error as Error).message,
            });
          }
        }, 1000); // 1 second delay to ensure data is fully processed
      }
    } catch (error) {
      this.logger.warn('Error triggering live analytics update', {
        eventType,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Initialize baseline values
   */
  async initializeBaseline(): Promise<void> {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const [nodeUsage, priceTrend] = await Promise.all([
        this.analyticsService.getNodeUsageMetrics(oneHourAgo, now),
        this.analyticsService.getPriceTrendData(),
      ]);

      this.lastRpsUtilization = nodeUsage.utilizationPercentage;
      this.lastChainActivity = priceTrend.onChainActivity;
      this.lastPrice = priceTrend.currentPrice;

      this.logger.log('Baseline values initialized', {
        rpsUtilization: this.lastRpsUtilization,
        chainActivity: this.lastChainActivity,
        price: this.lastPrice,
      });
    } catch (error) {
      this.logger.error(
        'Failed to initialize baseline values',
        'HistoricalDataLogger',
        {},
        error as Error,
      );
    }
  }

  /**
   * Get current price data
   */
  private async getCurrentPriceData(): Promise<{
    currentPrice: number;
    utilization: number;
    onChainActivity: number;
    tierPrices: Array<{ tier: string; price: number }>;
  }> {
    const priceTrend = await this.analyticsService.getPriceTrendData();
    return {
      currentPrice: priceTrend.currentPrice,
      utilization: priceTrend.utilization,
      onChainActivity: priceTrend.onChainActivity,
      tierPrices: priceTrend.tierPrices,
    };
  }

  /**
   * Get current usage data
   */
  private async getCurrentUsageData(): Promise<{
    totalRequests: number;
    activeUsers: number;
    averageRps: number;
    peakRps: number;
    totalRpsAllocated: number;
    utilizationPercentage: number;
    topEndpoints: Array<{ endpoint: string; requests: number }>;
  }> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const nodeUsage = await this.analyticsService.getNodeUsageMetrics(oneHourAgo, now);
    return {
      totalRequests: nodeUsage.totalRequests,
      activeUsers: nodeUsage.activeUsers,
      averageRps: nodeUsage.averageRps,
      peakRps: nodeUsage.peakRps,
      totalRpsAllocated: nodeUsage.totalRpsAllocated,
      utilizationPercentage: nodeUsage.utilizationPercentage,
      topEndpoints: nodeUsage.topEndpoints,
    };
  }

  /**
   * Get recent events from the database
   */
  async getRecentEvents(limit: number = 10): Promise<SystemEvent[]> {
    return this.systemEventRepository.find({
      order: {
        timestamp: 'DESC',
      },
      take: limit,
    });
  }

  /**
   * Get historical events with optional filtering
   */
  async getHistoricalEvents(hours: number = 24, eventType?: string): Promise<SystemEvent[]> {
    const now = new Date();
    const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000);

    const whereCondition: any = {
      timestamp: MoreThanOrEqual(startTime),
    };

    if (eventType) {
      whereCondition.eventType = eventType;
    }

    return this.systemEventRepository.find({
      where: whereCondition,
      order: {
        timestamp: 'ASC',
      },
    });
  }
}
