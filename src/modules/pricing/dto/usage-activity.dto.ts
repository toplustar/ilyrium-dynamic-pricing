import { ApiProperty } from '@nestjs/swagger';

export class UsageActivityDto {
  @ApiProperty({ example: '2025-10-10T19:00:00.000Z' })
  timestamp: Date;

  @ApiProperty({ example: 150 })
  requestCount: number;

  @ApiProperty({ example: '/api/getPrices', nullable: true })
  endpoint: string | null;
}
