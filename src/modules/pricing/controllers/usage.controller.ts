import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

import { UsageService } from '../services/usage.service';
import { GetUsageQueryDto, GetUsageResponseDto } from '../dto/get-usage.dto';

@ApiTags('Usage')
@Controller('usuage')
export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  @Get()
  @ApiOperation({ summary: 'Get usage and allocation data for a wallet' })
  @ApiResponse({
    status: 200,
    description: 'Usage data retrieved successfully',
    type: GetUsageResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  @ApiResponse({ status: 500, description: 'Failed to retrieve usage data' })
  async getUsage(@Query() query: GetUsageQueryDto): Promise<GetUsageResponseDto> {
    return await this.usageService.getUsage(query.walletAddress);
  }
}
