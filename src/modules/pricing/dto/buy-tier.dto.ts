import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, Min, Max, MinLength, MaxLength, IsEnum } from 'class-validator';

export enum TierEnum {
  Starter = 'Starter',
  Developer = 'Developer',
  Professional = 'Professional',
  Enterprise = 'Enterprise',
}

export class BuyTierDto {
  @ApiProperty({ example: 'DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFgXz' })
  @IsString()
  @MinLength(43)
  @MaxLength(44)
  walletAddress: string;

  @ApiProperty({ enum: TierEnum, example: 'Starter' })
  @IsEnum(TierEnum)
  @IsString()
  tier: TierEnum;

  @ApiProperty({ example: 30, default: 30, minimum: 1, maximum: 365 })
  @IsInt()
  @Min(1)
  @Max(365)
  duration: number = 30;
}
