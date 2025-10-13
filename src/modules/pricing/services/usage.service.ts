import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';

import { Purchase } from '../entities/purchase.entity';
import { UsageMetrics } from '../entities/usage-metrics.entity';
import { GetUsageResponseDto } from '../dto/get-usage.dto';

@Injectable()
export class UsageService {
  constructor(
    @InjectRepository(Purchase)
    private readonly purchaseRepository: Repository<Purchase>,
    @InjectRepository(UsageMetrics)
    private readonly usageMetricsRepository: Repository<UsageMetrics>,
  ) {}

  async getUsage(walletAddress: string): Promise<GetUsageResponseDto> {
    // Get active purchases
    const activePurchases = await this.purchaseRepository.find({
      where: {
        walletAddress: walletAddress,
        isActive: true,
        expiresAt: MoreThanOrEqual(new Date()),
      },
      order: {
        createdAt: 'DESC',
      },
    });

    // Get usage metrics for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const usageMetrics = await this.usageMetricsRepository.find({
      where: {
        walletAddress: walletAddress,
        createdAt: MoreThanOrEqual(thirtyDaysAgo),
      },
      order: {
        createdAt: 'DESC',
      },
    });

    const totalRequests = usageMetrics.reduce((sum, m) => sum + m.requestCount, 0);
    const totalRpsAllocated = activePurchases.reduce((sum, p) => sum + p.rpsAllocated, 0);

    return {
      walletAddress: walletAddress,
      allocation: {
        totalRps: totalRpsAllocated,
        activePurchases: activePurchases.length,
        purchases: activePurchases.map(p => ({
          id: p.id,
          tier: p.tier,
          rps: p.rpsAllocated,
          expiresAt: p.expiresAt,
        })),
      },
      usage: {
        totalRequests,
        last30Days: usageMetrics.length,
        recentActivity: usageMetrics.slice(0, 10).map(m => ({
          timestamp: m.createdAt,
          requestCount: m.requestCount,
          endpoint: m.endpoint,
        })),
      },
    };
  }

  async getActivePurchases(userId: string): Promise<Purchase[]> {
    return await this.purchaseRepository.find({
      where: {
        userId,
        isActive: true,
        expiresAt: MoreThanOrEqual(new Date()),
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async getUserUsage(
    _userId: string,
    days: number | null,
  ): Promise<{ totalRequests: number; cachedRequests: number }> {
    let dateFilter = {};

    if (days !== null) {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      dateFilter = { createdAt: MoreThanOrEqual(startDate) };
    }

    const walletAddresses = ['telegram-user'];

    const usageMetrics = await this.usageMetricsRepository.find({
      where: {
        walletAddress: walletAddresses[0],
        ...dateFilter,
      },
    });

    const totalRequests = usageMetrics.reduce((sum, m) => sum + m.requestCount, 0);

    return {
      totalRequests,
      cachedRequests: 0,
    };
  }
}
