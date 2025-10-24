import { registerAs } from '@nestjs/config';
import { PRICING_CONFIG } from './constants';

export interface PricingConfigInterface {
  priceMin: number;
  priceMax: number;
  totalRps: number;
  cacheTtl: number;
  k: number;
  alpha: number;
  phi: number;
}

export const PricingConfig = registerAs('pricing', () => ({
  priceMin: PRICING_CONFIG.PRICE_MIN,
  priceMax: PRICING_CONFIG.PRICE_MAX,
  totalRps: PRICING_CONFIG.TOTAL_RPS,
  cacheTtl: PRICING_CONFIG.CACHE_TTL,
  k: PRICING_CONFIG.K,
  alpha: PRICING_CONFIG.ALPHA,
  phi: PRICING_CONFIG.PHI,
}));
