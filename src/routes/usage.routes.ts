import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDatabase } from '../services/database';

const router = Router();

const usageQuerySchema = z.object({
  walletAddress: z.string().min(32).max(44),
});

/**
 * GET /api/getUsage
 * Returns usage and allocation data for a wallet
 */
router.get('/getUsage', async (req: Request, res: Response) => {
  try {
    const validated = usageQuerySchema.parse(req.query);
    const db = getDatabase();

    // Get active purchases
    const activePurchases = await db.purchase.findMany({
      where: {
        walletAddress: validated.walletAddress,
        isActive: true,
        expiresAt: {
          gte: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Get usage metrics for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const usageMetrics = await db.usageMetrics.findMany({
      where: {
        walletAddress: validated.walletAddress,
        timestamp: {
          gte: thirtyDaysAgo,
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    const totalRequests = usageMetrics.reduce((sum, m) => sum + m.requestCount, 0);
    const totalRpsAllocated = activePurchases.reduce((sum, p) => sum + p.rpsAllocated, 0);

    res.json({
      success: true,
      data: {
        walletAddress: validated.walletAddress,
        allocation: {
          totalRps: totalRpsAllocated,
          activePurchases: activePurchases.length,
          purchases: activePurchases.map((p) => ({
            id: p.id,
            tier: p.tier,
            rps: p.rpsAllocated,
            expiresAt: p.expiresAt,
          })),
        },
        usage: {
          totalRequests,
          last30Days: usageMetrics.length,
          recentActivity: usageMetrics.slice(0, 10).map((m) => ({
            timestamp: m.timestamp,
            requestCount: m.requestCount,
            endpoint: m.endpoint,
          })),
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request parameters',
        details: error.errors,
      });
    }

    console.error('Error getting usage:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve usage data',
    });
  }
});

export default router;

