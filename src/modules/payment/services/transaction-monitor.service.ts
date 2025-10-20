import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

import { AppLogger } from '~/common/services/app-logger.service';
import { PaymentStatus } from '../entities/payment-attempt.entity';

import { SolanaService } from './solana.service';
import { PaymentService } from './payment.service';

@Injectable()
export class TransactionMonitorService implements OnModuleInit {
  private readonly logger: AppLogger;
  private readonly pollInterval: number;
  private isMonitoring = false;

  constructor(
    private readonly solanaService: SolanaService,
    private readonly paymentService: PaymentService,
    private readonly configService: ConfigService,
    logger: AppLogger,
  ) {
    this.logger = logger.forClass('TransactionMonitorService');
    // Faster monitoring: 5 seconds instead of 10 to beat external sweep
    this.pollInterval = this.configService.get<number>('payment.pollInterval', 5000);
  }

  onModuleInit(): void {
    this.logger.log('Transaction monitor initialized', { pollInterval: this.pollInterval });
  }

  /**
   * Main monitoring job - checks for payments every 10 seconds
   */
  @Cron('*/10 * * * * *')
  async monitorTransactions(): Promise<void> {
    if (this.isMonitoring) {
      this.logger.debug('Monitor already running, skipping this cycle');
      return;
    }

    this.isMonitoring = true;

    try {
      await this.checkPendingPayments();
    } catch (error) {
      this.logger.error('MonitorError', 'Failed to monitor transactions', {}, error as Error);
    } finally {
      this.isMonitoring = false;
    }
  }

  /**
   * Manual trigger for monitoring
   */
  async triggerManualCheck(): Promise<void> {
    this.logger.log('Manual transaction check triggered');
    await this.monitorTransactions();
  }

  /**
   * Health check for the monitor service
   */
  healthCheck(): { isRunning: boolean; lastCheck: Date } {
    return {
      isRunning: !this.isMonitoring,
      lastCheck: new Date(),
    };
  }

  /**
   * Check all pending payment attempts for new transactions
   */
  private async checkPendingPayments(): Promise<void> {
    const pendingPayments = await this.paymentService.getPendingPaymentAttempts();

    if (pendingPayments.length === 0) {
      this.logger.debug('No pending payments to monitor');
      return;
    }

    this.logger.debug(`Checking ${pendingPayments.length} pending payments`);

    for (const payment of pendingPayments) {
      try {
        if (payment.paymentAddress) {
          // New system: Check unique address
          await this.checkPaymentByAddress(
            payment.id,
            payment.paymentAddress,
            payment.amountExpected,
          );
        } else if (payment.memo) {
          // Old system: Check memo (backward compatibility)
          await this.checkPaymentAttempt(payment.id, payment.memo);
        }
      } catch (error) {
        this.logger.error(
          'PaymentCheckError',
          `Failed to check payment ${payment.id}`,
          { paymentAddress: payment.paymentAddress, memo: payment.memo },
          error as Error,
        );
      }
    }

    await this.paymentService.markExpiredPaymentAttempts();
  }

  /**
   * Check a specific payment by unique address
   */
  private async checkPaymentByAddress(
    paymentAttemptId: string,
    paymentAddress: string,
    expectedAmount: number,
  ): Promise<void> {
    this.logger.debug(`Checking payment address ${paymentAddress}`);

    // Query transactions to this specific address
    const transactions = await this.solanaService.queryTransactionsByAddress(
      paymentAddress,
      expectedAmount * 0.99, // Allow 1% tolerance
    );

    if (transactions.length === 0) {
      this.logger.debug(`No transactions found for address ${paymentAddress}`);
      return;
    }

    this.logger.log(`Found ${transactions.length} transactions for ${paymentAddress}`);

    let paymentCompleted = false;

    for (const transaction of transactions) {
      try {
        // Record transaction immediately to beat external sweep
        await this.paymentService.recordTransaction(
          paymentAttemptId,
          transaction.signature,
          transaction.amount,
          transaction.fromAddress,
          transaction.confirmations,
        );

        this.logger.log('Transaction processed', {
          paymentAttemptId,
          signature: transaction.signature,
          amount: transaction.amount,
        });

        // Check if this transaction completed the payment
        const payment = await this.paymentService.getPaymentAttemptById(paymentAttemptId);
        if (payment && payment.status === PaymentStatus.COMPLETED) {
          paymentCompleted = true;
          this.logger.log('🎉 Payment completed immediately!', {
            paymentId: paymentAttemptId,
            totalPaid: payment.amountPaid,
            expectedAmount: payment.amountExpected,
          });
          break; // No need to process more transactions
        }
      } catch (error) {
        this.logger.error(
          'TransactionProcessingError',
          `Failed to process transaction ${transaction.signature}`,
          { paymentAttemptId, paymentAddress },
          error as Error,
        );
      }
    }

    // If payment completed, trigger immediate sweep of funds to main wallet
    if (paymentCompleted) {
      try {
        await this.triggerImmediateSweep(paymentAddress, paymentAttemptId);
      } catch (error) {
        this.logger.error(
          'SweepError',
          `Failed to sweep completed payment`,
          { paymentAttemptId, paymentAddress },
          error as Error,
        );
      }
    }
  }

  /**
   * Check a specific payment attempt for transactions (memo-based, for backward compatibility)
   */
  private async checkPaymentAttempt(paymentAttemptId: string, memo: string): Promise<void> {
    this.logger.debug(`Checking payment attempt ${paymentAttemptId} with memo ${memo}`);

    const transactions = await this.solanaService.queryTransactionsByMemo(memo);

    if (transactions.length === 0) {
      this.logger.debug(`No transactions found for memo ${memo}`);
      return;
    }

    this.logger.log(`Found ${transactions.length} transactions for memo ${memo}`);

    for (const transaction of transactions) {
      try {
        await this.paymentService.recordTransaction(
          paymentAttemptId,
          transaction.signature,
          transaction.amount,
          transaction.fromAddress,
          transaction.confirmations,
        );

        this.logger.log('Transaction processed', {
          paymentAttemptId,
          signature: transaction.signature,
          amount: transaction.amount,
        });
      } catch (error) {
        this.logger.error(
          'TransactionProcessingError',
          `Failed to process transaction ${transaction.signature}`,
          { paymentAttemptId, memo },
          error as Error,
        );
      }
    }
  }

  /**
   * Immediately sweep completed payment to main wallet
   */
  private async triggerImmediateSweep(
    paymentAddress: string,
    paymentAttemptId: string,
  ): Promise<void> {
    this.logger.log('🚀 Triggering immediate sweep', {
      paymentAddress,
      paymentAttemptId,
    });

    try {
      // First, let's get the payment details
      const payment = await this.paymentService.getPaymentAttemptById(paymentAttemptId);
      if (!payment) {
        this.logger.warn('Payment not found for sweep', { paymentAttemptId });
        return;
      }

      // Mark payment as swept to avoid re-processing
      await this.paymentService.markPaymentSwept(paymentAttemptId);

      // TODO: Implement actual sweep transaction here
      // For now, we just log the intent - you can add actual Solana sweep logic later
      this.logger.log('✅ Payment marked as swept', {
        paymentAttemptId,
        paymentAddress,
        amountPaid: payment.amountPaid,
        tier: payment.tier,
      });
    } catch (error) {
      this.logger.error(
        'ImmediateSweepError',
        'Failed to execute immediate sweep',
        { paymentAddress, paymentAttemptId },
        error as Error,
      );
    }
  }
}
