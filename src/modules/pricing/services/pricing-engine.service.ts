import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';

import { AppCacheService } from '~/common/services/app-cache.service';

import { Purchase } from '../entities/purchase.entity';
import { SystemMetrics } from '../entities/system-metrics.entity';

export interface PricingParams {
  usedRps: number;
  totalRps: number;
  priceMin: number;
  priceMax: number;
}

export interface TierInfo {
  name: string;
  rps: number;
  price?: number;
  description: string;
}

@Injectable()
export class PricingEngineService {
  private readonly priceMin: number;
  private readonly priceMax: number;
  private readonly totalRps: number;

  constructor(
    @InjectRepository(Purchase)
    private readonly purchaseRepository: Repository<Purchase>,
    @InjectRepository(SystemMetrics)
    private readonly systemMetricsRepository: Repository<SystemMetrics>,
    private readonly cacheService: AppCacheService,
    private readonly configService: ConfigService,
  ) {
    this.priceMin = this.configService.get<number>('app.priceMin', 0.001);
    this.priceMax = this.configService.get<number>('app.priceMax', 0.01);
    this.totalRps = this.configService.get<number>('app.totalRps', 10000);
  }

  /**
   * Calculates dynamic price based on demand
   * Formula: P(U) = Pmin + (Pmax - Pmin) * U
   * where U = used_rps / total_rps
   */
  calculateDynamicPrice(params: PricingParams): number {
    const { usedRps, totalRps, priceMin, priceMax } = params;

    if (totalRps <= 0) {
      throw new Error('Total RPS must be greater than 0');
    }

    const utilization = Math.min(usedRps / totalRps, 1.0);
    const price = priceMin + (priceMax - priceMin) * utilization;

    return Number(price.toFixed(6));
  }

  async getCurrentUtilization(): Promise<number> {
    const cached = await this.cacheService.get<string>('system:used_rps');

    if (cached) {
      return parseInt(cached, 10);
    }

    const activePurchases = await this.purchaseRepository.find({
      where: {
        isActive: true,
        expiresAt: MoreThanOrEqual(new Date()),
      },
      select: ['rpsAllocated'],
    });

    const usedRps = activePurchases.reduce((sum, p) => sum + p.rpsAllocated, 0);

    await this.cacheService.set('system:used_rps', usedRps.toString(), 60);

    return usedRps;
  }

  getTiers(): Omit<TierInfo, 'price'>[] {
    return [
      {
        name: 'Starter',
        rps: 10,
        description: 'Perfect for testing and small applications',
      },
      {
        name: 'Developer',
        rps: 50,
        description: 'Ideal for development and prototyping',
      },
      {
        name: 'Professional',
        rps: 200,
        description: 'For production applications',
      },
      {
        name: 'Enterprise',
        rps: 1000,
        description: 'High-performance for large-scale operations',
      },
      {
        name: 'Basic',
        rps: 10,
        description: 'Perfect for testing and small applications',
      },
      {
        name: 'Ultra',
        rps: 50,
        description: 'For production applications',
      },
      {
        name: 'Elite',
        rps: 200,
        description: 'High-performance for large-scale operations',
      },
    ];
  }

  /**
   * Gets pricing for all tiers based on current demand
   */
  async getAllTierPrices(): Promise<TierInfo[]> {
    const usedRps = await this.getCurrentUtilization();
    const basePrice = this.calculateDynamicPrice({
      usedRps,
      totalRps: this.totalRps,
      priceMin: this.priceMin,
      priceMax: this.priceMax,
    });

    const tiers = this.getTiers();

    return tiers.map(tier => ({
      ...tier,
      price: Number((basePrice * tier.rps * 30).toFixed(4)), // 30 days pricing
    }));
  }

  async updateUtilization(deltaRps: number): Promise<void> {
    const currentUsed = await this.getCurrentUtilization();
    const newUsed = Math.max(0, currentUsed + deltaRps);

    await this.cacheService.set('system:used_rps', newUsed.toString(), 60);

    await this.systemMetricsRepository.save({
      totalRps: this.totalRps,
      usedRps: newUsed,
      utilization: newUsed / this.totalRps,
    });
  }

  getTotalRps(): number {
    return this.totalRps;
  }

  getPriceMin(): number {
    return this.priceMin;
  }

  getPriceMax(): number {
    return this.priceMax;
  }
}
