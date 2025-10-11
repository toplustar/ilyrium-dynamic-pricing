import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class GetUsageQueryDto {
  @ApiProperty({ example: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFgXz' })
  @IsString()
  @MinLength(32)
  @MaxLength(44)
  walletAddress: string;
}

// Re-export for convenience
export { PurchaseInfoDto } from './purchase-info.dto';
export { UsageActivityDto } from './usage-activity.dto';
export { GetUsageResponseDto } from './get-usage-response.dto';
