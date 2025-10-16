import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

import { AppLogger } from '~/common/services/app-logger.service';

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
    this.pollInterval = this.configService.get<number>('payment.pollInterval', 10000);
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
}
