import { Injectable, OnModuleInit } from '@nestjs/common';
// import { Cron, CronExpression } from '@nestjs/schedule'; // Temporarily disabled

import { AppLogger } from '~/common/services/app-logger.service';

import { PaymentService } from './payment.service';

/**
 * Service for auto-sweeping completed payments to main wallet
 * Runs every hour to collect funds from temporary payment addresses
 */
@Injectable()
export class PaymentSweepService implements OnModuleInit {
  private readonly logger: AppLogger;
  private readonly isSweeping = false;

  constructor(
    // @ts-ignore - Temporarily disabled for testing
    private readonly paymentService: PaymentService,
    logger: AppLogger,
  ) {
    this.logger = logger.forClass('PaymentSweepService');
    // Silence unused variable warning for testing
    void this.paymentService;
  }

  onModuleInit(): void {
    this.logger.log('🛑 Payment sweep service initialized - SWEEPING DISABLED FOR TESTING');
  }

  /**
   * Auto-sweep completed payments every hour
   * TEMPORARILY DISABLED FOR TESTING
   */
  // @Cron(CronExpression.EVERY_HOUR)
  autoSweepPayments(): void {
    this.logger.log('🛑 Auto-sweep is DISABLED for testing purposes');
    return;

    // Commented out for testing
    // if (this.isSweeping) {
    //   this.logger.debug('Sweep already in progress, skipping');
    //   return;
    // }

    // this.isSweeping = true;

    // try {
    //   await this.paymentService.sweepCompletedPayments();
    // } catch (error) {
    //   this.logger.error('AutoSweepError', 'Failed to auto-sweep payments', {}, error as Error);
    // } finally {
    //   this.isSweeping = false;
    // }
  }

  /**
   * Manual trigger for sweeping (for admin use)
   */
  triggerManualSweep(): void {
    this.logger.log('Manual sweep triggered');
    this.autoSweepPayments();
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
