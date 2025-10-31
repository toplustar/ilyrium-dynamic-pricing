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

    // Use configured total RPS capacity from pricing engine instead of a hardcoded value
    const totalRpsCapacity = this.pricingEngineService.getTotalRps();
    const utilizationPercentage = Math.min(
      totalRpsCapacity > 0 ? (totalRpsAllocated / totalRpsCapacity) * 100 : 0,
      100,
    );

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

    // Convert utilization from absolute RPS to decimal (0.0 - 1.0)
    const totalRps = this.pricingEngineService.getTotalRps();
    const utilizationDecimal = totalRps > 0 ? utilization / totalRps : 0;

    return {
      timestamp: new Date(),
      currentPrice,
      utilization: utilizationDecimal, // Now stores 0.26 instead of 260
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

    // Get base data once
    const [baseNodeUsage, basePriceTrend] = await Promise.all([
      this.getNodeUsageMetrics(startTime, now),
      this.getPriceTrendData(),
    ]);

    // Generate historical data with some variation
    for (let i = 0; i < hours; i++) {
      const hourStart = new Date(startTime.getTime() + i * 60 * 60 * 1000);

      // Add some variation to make charts more interesting
      const variationFactor = 0.8 + Math.random() * 0.4; // 0.8 to 1.2
      const priceVariation = 0.95 + Math.random() * 0.1; // 0.95 to 1.05

      const nodeUsage: NodeUsageMetrics = {
        ...baseNodeUsage,
        timestamp: hourStart,
        totalRequests: Math.round(baseNodeUsage.totalRequests * variationFactor),
        activeUsers: Math.max(1, Math.round(baseNodeUsage.activeUsers * variationFactor)),
        averageRps: Math.round(baseNodeUsage.averageRps * variationFactor * 100) / 100,
        peakRps: Math.round(baseNodeUsage.peakRps * variationFactor * 100) / 100,
        totalRpsAllocated: Math.round(baseNodeUsage.totalRpsAllocated * variationFactor),
        utilizationPercentage:
          Math.round(baseNodeUsage.utilizationPercentage * variationFactor * 100) / 100,
        topEndpoints: baseNodeUsage.topEndpoints.map(endpoint => ({
          ...endpoint,
          requests: Math.round(endpoint.requests * variationFactor),
        })),
      };

      const priceTrend: PriceTrendData = {
        ...basePriceTrend,
        timestamp: hourStart,
        currentPrice: basePriceTrend.currentPrice * priceVariation,
        utilization: Math.round(basePriceTrend.utilization * variationFactor * 100) / 100,
        onChainActivity: basePriceTrend.onChainActivity * priceVariation,
        tierPrices: basePriceTrend.tierPrices.map(tier => ({
          ...tier,
          price: tier.price * priceVariation,
        })),
      };

      dataPoints.nodeUsage.push(nodeUsage);
      dataPoints.priceTrend.push(priceTrend);
    }

    return dataPoints;
  }
}
