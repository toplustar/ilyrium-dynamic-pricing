import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Purchase } from '../entities/purchase.entity';
import { BuyTierDto } from '../dto/buy-tier.dto';

import { PricingEngineService } from './pricing-engine.service';

@Injectable()
export class PurchaseService {
  constructor(
    @InjectRepository(Purchase)
    private readonly purchaseRepository: Repository<Purchase>,
    private readonly pricingEngineService: PricingEngineService,
  ) {}

  async buyTier(buyTierDto: BuyTierDto): Promise<Purchase> {
    const tiers = this.pricingEngineService.getTiers();
    const tierInfo = tiers.find(t => t.name === String(buyTierDto.tier));

    if (!tierInfo) {
      throw new HttpException('Invalid tier', HttpStatus.BAD_REQUEST);
    }

    const usedRps = await this.pricingEngineService.getCurrentUtilization();
    const onChainActivity = await this.pricingEngineService.getOnChainActivity();

    const basePrice = this.pricingEngineService.calculateDynamicPrice({
      usedRps,
      totalRps: this.pricingEngineService.getTotalRps(),
      priceMin: this.pricingEngineService.getPriceMin(),
      priceMax: this.pricingEngineService.getPriceMax(),
      onChainActivity,
    });

    const totalPrice = Number((basePrice * tierInfo.rps * buyTierDto.duration).toFixed(4));

    if (usedRps + tierInfo.rps > this.pricingEngineService.getTotalRps()) {
      throw new HttpException('Insufficient capacity available', HttpStatus.CONFLICT);
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + buyTierDto.duration);

    const purchase = this.purchaseRepository.create({
      walletAddress: buyTierDto.walletAddress,
      tier: buyTierDto.tier,
      rpsAllocated: tierInfo.rps,
      price: totalPrice,
      duration: buyTierDto.duration,
      expiresAt,
    });

    const savedPurchase = await this.purchaseRepository.save(purchase);

    await this.pricingEngineService.updateUtilization(tierInfo.rps);

    return savedPurchase;
  }
}
