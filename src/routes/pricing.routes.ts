import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getAllTierPrices } from '../services/pricingEngine';

const router = Router();

/**
 * GET /api/getPrices
 * Returns dynamic prices for all tiers based on current demand
 */
router.get('/getPrices', async (req: Request, res: Response) => {
  try {
    const prices = await getAllTierPrices();
    
    res.json({
      success: true,
      data: {
        tiers: prices,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error getting prices:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve pricing information',
    });
  }
});

export default router;

