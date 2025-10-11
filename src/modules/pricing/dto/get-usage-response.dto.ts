import { ApiProperty } from '@nestjs/swagger';

import { PurchaseInfoDto } from './purchase-info.dto';
import { UsageActivityDto } from './usage-activity.dto';

export class GetUsageResponseDto {
  @ApiProperty({
    type: 'object',
    properties: {
      walletAddress: { type: 'string', example: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFgXz' },
      allocation: {
        type: 'object',
        properties: {
          totalRps: { type: 'number', example: 10 },
          activePurchases: { type: 'number', example: 1 },
          purchases: { type: 'array', items: { $ref: '#/components/schemas/PurchaseInfoDto' } },
        },
      },
      usage: {
        type: 'object',
        properties: {
          totalRequests: { type: 'number', example: 1500 },
          last30Days: { type: 'number', example: 45 },
          recentActivity: {
            type: 'array',
            items: { $ref: '#/components/schemas/UsageActivityDto' },
          },
        },
      },
    },
  })
  walletAddress: string;
  allocation: {
    totalRps: number;
    activePurchases: number;
    purchases: PurchaseInfoDto[];
  };
  usage: {
    totalRequests: number;
    last30Days: number;
    recentActivity: UsageActivityDto[];
  };
}
