import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { PurchaseService } from '../services/purchase.service';
import { BuyTierDto } from '../dto/buy-tier.dto';

@ApiTags('Purchase')
@Controller('purchase')
export class PurchaseController {
  constructor(private readonly purchaseService: PurchaseService) {}

  @Post()
  @ApiOperation({ summary: 'Purchase a tier subscription' })
  @ApiResponse({ status: 400, description: 'Invalid tier or request data' })
  @ApiResponse({ status: 409, description: 'Insufficient capacity available' })
  @ApiResponse({ status: 500, description: 'Failed to process purchase' })
  async buyTier(@Body() buyTierDto: BuyTierDto): Promise<any> {
    return await this.purchaseService.buyTier(buyTierDto);
  }
}
