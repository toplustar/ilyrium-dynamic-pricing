import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDatabase } from '../services/database';
import { getTiers, calculateDynamicPrice, getCurrentUtilization, updateUtilization } from '../services/pricingEngine';
import { config } from '../config/config';

const router = Router();

const buyTierSchema = z.object({
  walletAddress: z.string().min(32).max(44),
  tier: z.enum(['Starter', 'Developer', 'Professional', 'Enterprise']),
  duration: z.number().int().min(1).max(365).optional().default(30),
});

/**
 * POST /api/buyTier
 * Simulates purchase and stores in database
 */
router.post('/buyTier', async (req: Request, res: Response) => {
  try {
    const validated = buyTierSchema.parse(req.body);
    
    // Find tier info
    const tiers = getTiers();
    const tierInfo = tiers.find((t) => t.name === validated.tier);
    
    if (!tierInfo) {
      return res.status(400).json({
        success: false,
        error: 'Invalid tier',
      });
    }

    // Calculate current price
    const usedRps = await getCurrentUtilization();
    const basePrice = calculateDynamicPrice({
      usedRps,
      totalRps: config.pricing.totalRps,
      priceMin: config.pricing.priceMin,
      priceMax: config.pricing.priceMax,
    });

    const totalPrice = Number((basePrice * tierInfo.rps * validated.duration).toFixed(4));

    // Check if capacity is available
    if (usedRps + tierInfo.rps > config.pricing.totalRps) {
      return res.status(409).json({
        success: false,
        error: 'Insufficient capacity available',
      });
    }

    // Create purchase record
    const db = getDatabase();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + validated.duration);

    const purchase = await db.purchase.create({
      data: {
        walletAddress: validated.walletAddress,
        tier: validated.tier,
        rpsAllocated: tierInfo.rps,
        price: totalPrice,
        duration: validated.duration,
        expiresAt,
      },
    });

    // Update utilization
    await updateUtilization(tierInfo.rps);

    res.status(201).json({
      success: true,
      data: {
        purchaseId: purchase.id,
        tier: purchase.tier,
        rpsAllocated: purchase.rpsAllocated,
        price: purchase.price,
        expiresAt: purchase.expiresAt,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: error.errors,
      });
    }
    
    console.error('Error processing purchase:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process purchase',
    });
  }
});

export default router;

