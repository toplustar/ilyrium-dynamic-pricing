import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { AppLogger } from '~/common/services/app-logger.service';

import { PricingEngineService, TierInfo } from '../services/pricing-engine.service';

@ApiTags('Pricing')
@Controller()
export class PricingController {
  constructor(
    private readonly pricingEngineService: PricingEngineService,
    private readonly logger: AppLogger,
  ) {}

  @Get('prices')
  @ApiOperation({ summary: 'Get dynamic prices for all tiers based on current demand' })
  @ApiResponse({ status: 500, description: 'Failed to retrieve pricing information' })
  async getPrices(): Promise<TierInfo[]> {
    this.logger.log('Fetching dynamic prices for all tiers');

    const prices = await this.pricingEngineService.getAllTierPrices();

    this.logger.log('Successfully retrieved pricing information', {
      tierCount: prices.length,
      utilization: prices[0] ? `${((prices[0] as any).utilization || 0) * 100}%` : 'N/A',
    });

    return prices;
  }
}
