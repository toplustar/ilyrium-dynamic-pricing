import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, Min, Max, MinLength, MaxLength } from 'class-validator';

const WALLET_ADDRESS_MIN_LENGTH = 32;
const WALLET_ADDRESS_MAX_LENGTH = 44;
const MAX_DURATION_DAYS = 365;
const DEFAULT_DURATION_DAYS = 30;

export class BuyTierDto {
  @ApiProperty({ example: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFgXz' })
  @IsString()
  @MinLength(WALLET_ADDRESS_MIN_LENGTH)
  @MaxLength(WALLET_ADDRESS_MAX_LENGTH)
  walletAddress: string;

  @ApiProperty({ example: 'Basic', description: 'Tier name (Basic, Ultra, Elite)' })
  @IsString()
  tier: string;

  @ApiProperty({ example: 30, default: 30, minimum: 1, maximum: 365 })
  @IsInt()
  @Min(1)
  @Max(MAX_DURATION_DAYS)
  duration: number = DEFAULT_DURATION_DAYS;
}
