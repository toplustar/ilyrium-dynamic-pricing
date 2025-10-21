import { registerAs } from '@nestjs/config';

export interface PricingConfigInterface {
  priceMin: number;
  priceMax: number;
  totalRps: number;
  cacheTtl: number;
}

export const PricingConfig = registerAs('pricing', () => ({
  priceMin: parseFloat(process.env.PRICE_MIN || '0.001'),
  priceMax: parseFloat(process.env.PRICE_MAX || '0.01'),
  totalRps: parseInt(process.env.TOTAL_RPS || '500', 10),
  cacheTtl: 60,
}));
