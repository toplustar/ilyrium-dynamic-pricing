import { config } from '../config/config';
import { getDatabase } from './database';
import { getRedisClient } from './redis';

export interface PricingParams {
  usedRps: number;
  totalRps: number;
  priceMin: number;
  priceMax: number;
}

export interface TierInfo {
  name: string;
  rps: number;
  price: number;
  description: string;
}

/**
 * Calculates dynamic price based on demand
 * Formula: P(U) = Pmin + (Pmax - Pmin) * U
 * where U = used_rps / total_rps
 */
export const calculateDynamicPrice = (params: PricingParams): number => {
  const { usedRps, totalRps, priceMin, priceMax } = params;
  
  if (totalRps <= 0) {
    throw new Error('Total RPS must be greater than 0');
  }

  const utilization = Math.min(usedRps / totalRps, 1.0);
  const price = priceMin + (priceMax - priceMin) * utilization;
  
  return Number(price.toFixed(6));
};

/**
 * Gets current system utilization from cache or database
 */
export const getCurrentUtilization = async (): Promise<number> => {
  try {
    const redis = getRedisClient();
    const cached = await redis.get('system:used_rps');
    
    if (cached) {
      return parseInt(cached, 10);
    }

    // Fallback: calculate from active purchases
    const db = getDatabase();
    const activePurchases = await db.purchase.findMany({
      where: {
        isActive: true,
        expiresAt: {
          gte: new Date(),
        },
      },
      select: {
        rpsAllocated: true,
      },
    });

    const usedRps = activePurchases.reduce((sum, p) => sum + p.rpsAllocated, 0);
    
    // Cache for 1 minute
    await redis.setEx('system:used_rps', 60, usedRps.toString());
    
    return usedRps;
  } catch (error) {
    console.error('Error getting utilization:', error);
    return 0;
  }
};

/**
 * Defines available tiers
 */
export const getTiers = (): Omit<TierInfo, 'price'>[] => {
  return [
    {
      name: 'Starter',
      rps: 10,
      description: 'Perfect for testing and small applications',
    },
    {
      name: 'Developer',
      rps: 50,
      description: 'Ideal for development and prototyping',
    },
    {
      name: 'Professional',
      rps: 200,
      description: 'For production applications',
    },
    {
      name: 'Enterprise',
      rps: 1000,
      description: 'High-performance for large-scale operations',
    },
  ];
};

/**
 * Gets pricing for all tiers based on current demand
 */
export const getAllTierPrices = async (): Promise<TierInfo[]> => {
  const usedRps = await getCurrentUtilization();
  const basePrice = calculateDynamicPrice({
    usedRps,
    totalRps: config.pricing.totalRps,
    priceMin: config.pricing.priceMin,
    priceMax: config.pricing.priceMax,
  });

  const tiers = getTiers();
  
  return tiers.map((tier) => ({
    ...tier,
    price: Number((basePrice * tier.rps * 30).toFixed(4)), // 30 days pricing
  }));
};

/**
 * Updates system utilization in cache
 */
export const updateUtilization = async (deltaRps: number): Promise<void> => {
  try {
    const redis = getRedisClient();
    const currentUsed = await getCurrentUtilization();
    const newUsed = Math.max(0, currentUsed + deltaRps);
    
    await redis.setEx('system:used_rps', 60, newUsed.toString());
    
    // Store metrics in database
    const db = getDatabase();
    await db.systemMetrics.create({
      data: {
        totalRps: config.pricing.totalRps,
        usedRps: newUsed,
        utilization: newUsed / config.pricing.totalRps,
      },
    });
  } catch (error) {
    console.error('Error updating utilization:', error);
  }
};

