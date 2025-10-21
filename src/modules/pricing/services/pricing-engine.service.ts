import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, Not, IsNull } from 'typeorm';

import { AppCacheService } from '~/common/services/app-cache.service';
import { TierConfigInterface } from '~/config/tier.config';
import { PricingConfigInterface } from '~/config/pricing.config';

import { Purchase } from '../entities/purchase.entity';

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
  private readonly cacheTtl: number;

  constructor(
    @InjectRepository(Purchase)
    private readonly purchaseRepository: Repository<Purchase>,
    private readonly cacheService: AppCacheService,
    private readonly configService: ConfigService,
  ) {
    const pricingConfig = this.configService.get<PricingConfigInterface>('pricing');
    if (!pricingConfig) {
      throw new Error('Pricing configuration not found');
    }
    this.priceMin = pricingConfig.priceMin;
    this.priceMax = pricingConfig.priceMax;
    this.totalRps = pricingConfig.totalRps;
    this.cacheTtl = pricingConfig.cacheTtl;
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
    // Always get fresh data from database to ensure accuracy
    // Only count purchases that have been actually paid for (have payment_attempt_id)
    const activePurchases = await this.purchaseRepository.find({
      where: {
        isActive: true,
        expiresAt: MoreThanOrEqual(new Date()),
        paymentAttemptId: Not(IsNull()), // Only paid purchases
      },
      select: ['rpsAllocated'],
    });

    const usedRps = activePurchases.reduce((sum, p) => sum + p.rpsAllocated, 0);

    // Update cache with fresh data
    await this.cacheService.set('system:used_rps', usedRps.toString(), this.cacheTtl * 1000);

    return usedRps;
  }

  getTiers(): Omit<TierInfo, 'price'>[] {
    const tierConfig = this.configService.get('tiers') as { tiers: TierConfigInterface[] };
    return tierConfig.tiers.map(tier => ({
      name: tier.name,
      rps: tier.rps,
      description: tier.description,
    }));
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
    // Get fresh utilization from database
    const currentUsed = await this.getCurrentUtilization();
    const newUsed = Math.max(0, currentUsed + deltaRps);

    // Update cache with new value
    await this.cacheService.set('system:used_rps', newUsed.toString(), this.cacheTtl * 1000);
  }

  /**
   * Clear the utilization cache to force fresh calculation
   */
  async clearUtilizationCache(): Promise<void> {
    await this.cacheService.del('system:used_rps');
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
