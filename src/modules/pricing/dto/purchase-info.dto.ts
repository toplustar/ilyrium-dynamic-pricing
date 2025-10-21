import { ApiProperty } from '@nestjs/swagger';

export class PurchaseInfoDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: 'Basic' })
  tier: string;

  @ApiProperty({ example: 10 })
  rps: number;

  @ApiProperty({ example: '2025-11-09T19:00:00.000Z' })
  expiresAt: Date;
}
