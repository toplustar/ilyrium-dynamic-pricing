import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';

import { AppLogger } from '~/common/services/app-logger.service';
import { Purchase } from '~/modules/pricing/entities/purchase.entity';
import { HistoricalDataLogger } from './historical-data-logger.service';

@Injectable()
export class PurchaseExpirationMonitorService implements OnModuleInit {
  private readonly logger: AppLogger;

  constructor(
    @InjectRepository(Purchase)
    private readonly purchaseRepository: Repository<Purchase>,
    private readonly historicalDataLogger: HistoricalDataLogger,
    logger: AppLogger,
  ) {
    this.logger = logger.forClass('PurchaseExpirationMonitorService');
  }

  onModuleInit(): void {
    this.logger.log('Purchase Expiration Monitor service initialized');
  }

  @Cron(CronExpression.EVERY_HOUR) // Check for expirations every hour
  async handleExpiredPurchases(): Promise<void> {
    this.logger.log('Checking for expired purchases...');

    const now = new Date();
    const expiredPurchases = await this.purchaseRepository.find({
      where: {
        expiresAt: LessThan(now),
        isActive: true,
      },
    });

    this.logger.log(`Found ${expiredPurchases.length} expired purchases`);

    for (const purchase of expiredPurchases) {
      try {
        // Log expiration event
        await this.historicalDataLogger.logExpiration({
          tier: purchase.tier,
          rpsAllocated: purchase.rpsAllocated,
          walletAddress: purchase.walletAddress,
          expiredAt: purchase.expiresAt,
        });

        // Mark purchase as inactive
        purchase.isActive = false;
        await this.purchaseRepository.save(purchase);

        this.logger.log(`Logged and deactivated expired purchase: ${purchase.id}`, {
          purchaseId: purchase.id,
          tier: purchase.tier,
          rpsAllocated: purchase.rpsAllocated,
          walletAddress: purchase.walletAddress,
          expiredAt: purchase.expiresAt,
        });
      } catch (error) {
        this.logger.error(
          'Failed to process expired purchase',
          'PurchaseExpirationMonitorService',
          { purchaseId: purchase.id },
          error as Error,
        );
      }
    }

    if (expiredPurchases.length > 0) {
      this.logger.log(`Successfully processed ${expiredPurchases.length} expired purchases`);
    }
  }
}
