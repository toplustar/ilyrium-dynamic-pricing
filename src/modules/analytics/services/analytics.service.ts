import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan, Between } from 'typeorm';

import { AppLogger } from '~/common/services/app-logger.service';
import { Purchase } from '~/modules/pricing/entities/purchase.entity';
import { PricingEngineService } from '~/modules/pricing/services/pricing-engine.service';

export interface NodeUsageMetrics {
  timestamp: Date;
  totalRequests: number;
  activeUsers: number;
  averageRps: number;
  peakRps: number;
  totalRpsAllocated: number;
  utilizationPercentage: number;
  topEndpoints: Array<{ endpoint: string; requests: number }>;
}

export interface PriceTrendData {
  timestamp: Date;
  currentPrice: number;
  utilization: number;
  onChainActivity: number;
  tierPrices: Array<{ tier: string; price: number }>;
}

export interface SystemAnalytics {
  nodeUsage: NodeUsageMetrics;
  priceTrend: PriceTrendData;
  revenue: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  userStats: {
    totalActiveUsers: number;
    newUsersToday: number;
    averageSessionDuration: number;
  };
}

@Injectable()
export class AnalyticsService implements OnModuleInit {
  private readonly logger: AppLogger;

  constructor(
    @InjectRepository(Purchase)
    private readonly purchaseRepository: Repository<Purchase>,
    private readonly pricingEngineService: PricingEngineService,
    logger: AppLogger,
  ) {
    this.logger = logger.forClass('AnalyticsService');
  }

  onModuleInit(): void {
    this.logger.log('Analytics service initialized');
  }

  /**
   * Get comprehensive system analytics
   */
  async getSystemAnalytics(): Promise<SystemAnalytics> {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const nodeUsage = await this.getNodeUsageMetrics(oneHourAgo, now);
    const priceTrend = await this.getPriceTrendData();
    const revenue = await this.getRevenueMetrics();
    const userStats = await this.getUserStats();

    return {
      nodeUsage,
      priceTrend,
      revenue,
      userStats,
    };
  }

  /**
   * Get node usage metrics based on purchase data
   */
  async getNodeUsageMetrics(_startTime: Date, endTime: Date): Promise<NodeUsageMetrics> {
    const activePurchases = await this.purchaseRepository.find({
      where: {
        isActive: true,
        expiresAt: MoreThan(new Date()),
      },
    });

    const totalRpsAllocated = activePurchases.reduce((sum, p) => sum + p.rpsAllocated, 0);
    const uniqueUsers = new Set(activePurchases.map(p => p.userId)).size;

    const totalRequests = totalRpsAllocated;
    const averageRps = totalRpsAllocated;
    const peakRps = totalRpsAllocated;

    const utilizationPercentage = Math.min((totalRpsAllocated / 1000) * 100, 100);

    const tierStats = new Map<string, number>();
    activePurchases.forEach(p => {
      tierStats.set(p.tier, (tierStats.get(p.tier) || 0) + p.rpsAllocated);
    });

    const topEndpoints = Array.from(tierStats.entries())
      .map(([tier, rpsAllocated]) => ({ endpoint: `${tier} Tier`, requests: rpsAllocated }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 5);

    return {
      timestamp: endTime,
      totalRequests,
      activeUsers: uniqueUsers,
      averageRps: Math.round(averageRps * 100) / 100,
      peakRps: Math.round(peakRps * 100) / 100,
      totalRpsAllocated,
      utilizationPercentage: Math.round(utilizationPercentage * 100) / 100,
      topEndpoints,
    };
  }

  /**
   * Get price trend data
   */
  async getPriceTrendData(): Promise<PriceTrendData> {
    const utilization = await this.pricingEngineService.getCurrentUtilization();
    const onChainActivity = await this.pricingEngineService.getOnChainActivity();
    const tierPrices = await this.pricingEngineService.getAllTierPrices();

    const currentPrice = this.pricingEngineService.calculateDynamicPrice({
      usedRps: utilization,
      totalRps: this.pricingEngineService.getTotalRps(),
      priceMin: this.pricingEngineService.getPriceMin(),
      priceMax: this.pricingEngineService.getPriceMax(),
      onChainActivity,
    });

    return {
      timestamp: new Date(),
      currentPrice,
      utilization,
      onChainActivity,
      tierPrices: tierPrices.map(tier => ({
        tier: tier.name,
        price: tier.price || 0,
      })),
    };
  }

  /**
   * Get revenue metrics
   */
  async getRevenueMetrics(): Promise<{ daily: number; weekly: number; monthly: number }> {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [dailyPurchases, weeklyPurchases, monthlyPurchases] = await Promise.all([
      this.purchaseRepository.find({
        where: {
          createdAt: Between(oneDayAgo, now),
          isActive: true,
        },
        select: ['price'],
      }),
      this.purchaseRepository.find({
        where: {
          createdAt: Between(oneWeekAgo, now),
          isActive: true,
        },
        select: ['price'],
      }),
      this.purchaseRepository.find({
        where: {
          createdAt: Between(oneMonthAgo, now),
          isActive: true,
        },
        select: ['price'],
      }),
    ]);

    return {
      daily: dailyPurchases.reduce((sum, p) => sum + (p.price || 0), 0),
      weekly: weeklyPurchases.reduce((sum, p) => sum + (p.price || 0), 0),
      monthly: monthlyPurchases.reduce((sum, p) => sum + (p.price || 0), 0),
    };
  }

  /**
   * Get user statistics
   */
  async getUserStats(): Promise<{
    totalActiveUsers: number;
    newUsersToday: number;
    averageSessionDuration: number;
  }> {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [activeUsers, newUsers] = await Promise.all([
      this.purchaseRepository.count({
        where: {
          isActive: true,
          expiresAt: MoreThan(now),
        },
      }),
      this.purchaseRepository.count({
        where: {
          createdAt: Between(oneDayAgo, now),
        },
      }),
    ]);

    const averageSessionDuration = 30;

    return {
      totalActiveUsers: activeUsers,
      newUsersToday: newUsers,
      averageSessionDuration,
    };
  }

  /**
   * Get historical analytics data for charts
   */
  async getHistoricalData(hours: number = 24): Promise<{
    nodeUsage: NodeUsageMetrics[];
    priceTrend: PriceTrendData[];
  }> {
    const now = new Date();
    const startTime = new Date(now.getTime() - hours * 60 * 60 * 1000);

    const dataPoints: { nodeUsage: NodeUsageMetrics[]; priceTrend: PriceTrendData[] } = {
      nodeUsage: [],
      priceTrend: [],
    };

    for (let i = 0; i < hours; i++) {
      const hourStart = new Date(startTime.getTime() + i * 60 * 60 * 1000);
      const hourEnd = new Date(hourStart.getTime() + 60 * 60 * 1000);

      const [nodeUsage, priceTrend] = await Promise.all([
        this.getNodeUsageMetrics(hourStart, hourEnd),
        this.getPriceTrendData(),
      ]);

      dataPoints.nodeUsage.push(nodeUsage);
      dataPoints.priceTrend.push(priceTrend);
    }

    return dataPoints;
  }
}
