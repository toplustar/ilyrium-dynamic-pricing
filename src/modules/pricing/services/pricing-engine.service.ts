import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, Not, IsNull } from 'typeorm';
import { Connection, PublicKey } from '@solana/web3.js';

import { AppCacheService } from '~/common/services/app-cache.service';
import { TierConfigInterface } from '~/config/tier.config';
import { PricingConfigInterface } from '~/config/pricing.config';
import { SOLANA_CONFIG } from '~/config/constants';

import { Purchase } from '../entities/purchase.entity';

export interface PricingParams {
  usedRps: number;
  totalRps: number;
  priceMin: number;
  priceMax: number;
  onChainActivity?: number;
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
  private readonly k: number;
  private readonly alpha: number;
  private readonly phi: number;
  private readonly solanaConnection: Connection;

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
    this.k = pricingConfig.k;
    this.alpha = pricingConfig.alpha;
    this.phi = pricingConfig.phi;

    const rpcUrl = SOLANA_CONFIG.ACTIVITY_RPC_URL;
    this.solanaConnection = new Connection(rpcUrl, 'confirmed');
  }

  /**
   * Sigmoid function for smooth price transitions
   */
  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
  }

  /**
   * Calculates dynamic price using sigmoid-based formula
   * Formula: P = Pmin + (Pmax - Pmin) × σ(k[αU + φS])
   */
  calculateDynamicPrice(params: PricingParams): number {
    const { usedRps, totalRps, priceMin, priceMax, onChainActivity = 0.5 } = params;

    if (totalRps <= 0) {
      throw new Error('Total RPS must be greater than 0');
    }

    const utilization = Math.min(usedRps / totalRps, 1.0);

    const sigmoidInput = this.k * (this.alpha * utilization + this.phi * onChainActivity);

    const sigmoidValue = this.sigmoid(sigmoidInput);

    const price = priceMin + (priceMax - priceMin) * sigmoidValue;

    return Number(price.toFixed(6));
  }

  /**
   * Gets on-chain activity level using Solana blockchain data
   */
  async getOnChainActivity(): Promise<number> {
    try {
      const cachedActivity = await this.cacheService.get<string>('solana:onchain_activity');
      if (cachedActivity) {
        return parseFloat(cachedActivity);
      }

      const metrics = await Promise.allSettled([
        this.getTransactionActivity(),
        this.getBlockProductionActivity(),
        this.getNetworkCongestion(),
      ]);

      const transactionActivity = metrics[0].status === 'fulfilled' ? metrics[0].value : 0.5;
      const blockActivity = metrics[1].status === 'fulfilled' ? metrics[1].value : 0.5;
      const congestionActivity = metrics[2].status === 'fulfilled' ? metrics[2].value : 0.5;

      const overallActivity =
        transactionActivity * 0.5 + blockActivity * 0.3 + congestionActivity * 0.2;

      const normalizedActivity = Math.max(0, Math.min(1, overallActivity));

      await this.cacheService.set('solana:onchain_activity', normalizedActivity.toString(), 30000);

      return normalizedActivity;
    } catch (error) {
      console.warn('Failed to get Solana on-chain activity, using default value:', error);
      return 0.5;
    }
  }

  private async getTransactionActivity(): Promise<number> {
    try {
      const recentSignatures = await this.solanaConnection.getSignaturesForAddress(
        new PublicKey('11111111111111111111111111111111'),
        { limit: 100 },
      );

      const now = Date.now();
      const recentTransactions = recentSignatures.filter(
        sig => sig.blockTime && now - sig.blockTime * 1000 < 60000,
      );

      const tps = recentTransactions.length / 60;

      return Math.min(tps / 1000, 1);
    } catch (error) {
      console.warn('Failed to get transaction activity:', error);
      return 0.5;
    }
  }

  private async getBlockProductionActivity(): Promise<number> {
    try {
      const slot = await this.solanaConnection.getSlot();
      const blockTime = await this.solanaConnection.getBlockTime(slot);

      if (!blockTime) return 0.5;

      const timeSinceLastBlock = Date.now() - blockTime * 1000;
      const targetBlockTime = 400;
      const activity = Math.max(0, 1 - timeSinceLastBlock / targetBlockTime);

      return Math.min(activity, 1);
    } catch (error) {
      console.warn('Failed to get block production activity:', error);
      return 0.5;
    }
  }

  private async getNetworkCongestion(): Promise<number> {
    try {
      const performanceSamples = await this.solanaConnection.getRecentPerformanceSamples(5);

      if (performanceSamples.length === 0) return 0.5;

      const avgTransactions =
        performanceSamples.reduce((sum, sample) => sum + (sample.numTransactions || 0), 0) /
        performanceSamples.length;

      const avgSlotTime =
        performanceSamples.reduce((sum, sample) => sum + (sample.samplePeriodSecs || 0), 0) /
        performanceSamples.length;

      const transactionActivity = Math.min(avgTransactions / 1000, 1);
      const congestionFactor = Math.min(avgSlotTime / 0.5, 1);

      return (transactionActivity + (1 - congestionFactor)) / 2;
    } catch (error) {
      console.warn('Failed to get network congestion:', error);
      return 0.5;
    }
  }

  async getCurrentUtilization(): Promise<number> {
    const activePurchases = await this.purchaseRepository.find({
      where: {
        isActive: true,
        expiresAt: MoreThanOrEqual(new Date()),
        paymentAttemptId: Not(IsNull()),
      },
      select: ['rpsAllocated'],
    });

    const usedRps = activePurchases.reduce((sum, p) => sum + p.rpsAllocated, 0);

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
   * Gets pricing for all tiers based on current demand using sigmoid formula
   */
  async getAllTierPrices(): Promise<TierInfo[]> {
    const usedRps = await this.getCurrentUtilization();
    const onChainActivity = await this.getOnChainActivity();

    const basePrice = this.calculateDynamicPrice({
      usedRps,
      totalRps: this.totalRps,
      priceMin: this.priceMin,
      priceMax: this.priceMax,
      onChainActivity,
    });

    const tiers = this.getTiers();

    return tiers.map(tier => ({
      ...tier,
      price: Number((basePrice * tier.rps * 30).toFixed(4)),
    }));
  }

  async updateUtilization(deltaRps: number): Promise<void> {
    const currentUsed = await this.getCurrentUtilization();
    const newUsed = Math.max(0, currentUsed + deltaRps);

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
