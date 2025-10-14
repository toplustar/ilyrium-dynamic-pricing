import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { AppLogger } from '~/common/services/app-logger.service';

import { PaymentService } from './payment.service';

/**
 * Service for auto-sweeping completed payments to main wallet
 * Runs every hour to collect funds from temporary payment addresses
 */
@Injectable()
export class PaymentSweepService implements OnModuleInit {
  private readonly logger: AppLogger;
  private isSweeping = false;

  constructor(
    private readonly paymentService: PaymentService,
    logger: AppLogger,
  ) {
    this.logger = logger.forClass('PaymentSweepService');
  }

  onModuleInit(): void {
    this.logger.log('Payment sweep service initialized - sweeping every hour');
  }

  /**
   * Auto-sweep completed payments every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async autoSweepPayments(): Promise<void> {
    if (this.isSweeping) {
      this.logger.debug('Sweep already in progress, skipping');
      return;
    }

    this.isSweeping = true;

    try {
      await this.paymentService.sweepCompletedPayments();
    } catch (error) {
      this.logger.error('AutoSweepError', 'Failed to auto-sweep payments', {}, error as Error);
    } finally {
      this.isSweeping = false;
    }
  }

  /**
   * Manual trigger for sweeping (for admin use)
   */
  async triggerManualSweep(): Promise<void> {
    this.logger.log('Manual sweep triggered');
    await this.autoSweepPayments();
  }

  /**
   * Health check
   */
  healthCheck(): { isRunning: boolean; lastCheck: Date } {
    return {
      isRunning: !this.isSweeping,
      lastCheck: new Date(),
    };
  }
}

