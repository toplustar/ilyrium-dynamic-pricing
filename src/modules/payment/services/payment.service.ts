import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';

import { AppLogger } from '~/common/services/app-logger.service';
import { CryptoUtil } from '~/common/utils/crypto.util';
import { PricingEngineService } from '~/modules/pricing/services/pricing-engine.service';
import { Purchase } from '~/modules/pricing/entities/purchase.entity';
import { TierType } from '~/modules/pricing/entities/tier.enum';
import { ApiKeyService } from '~/modules/api-key/services/api-key.service';
import { HistoricalDataLogger } from '~/modules/analytics/services/historical-data-logger.service';

import { PaymentTransaction } from '../entities/payment-transaction.entity';
import { PaymentAttempt, PaymentStatus } from '../entities/payment-attempt.entity';
import { SolanaService } from './solana.service';

export interface CreatePaymentAttemptDto {
  userId: string;
  tier: TierType;
  duration: number;
}

export interface PaymentAttemptResponse {
  id: string;
  memo: string;
  amountExpected: number;
  amountPaid: number;
  walletAddress: string;
  expiresAt: Date;
  status: PaymentStatus;
}

@Injectable()
export class PaymentService {
  private readonly logger: AppLogger;
  private readonly paymentExpiryMinutes: number;
  private readonly sweepingPayments = new Set<string>();
  private notificationService?: {
    notifyPaymentReceived: (userId: string, amount: number, remaining: number) => Promise<void>;
    notifyPurchaseComplete: (
      userId: string,
      tier: string,
      rps: number,
      expiresAt: Date,
    ) => Promise<void>;
    notifyApiKeyGenerated: (
      userId: string,
      paymentAddress: string,
      apiKey: string,
      details: {
        tier: string;
        duration: number;
        expiresAt: Date;
        amountPaid: number;
        backendUrl: string;
      },
    ) => Promise<void>;
  };

  constructor(
    @InjectRepository(PaymentAttempt)
    private readonly paymentAttemptRepository: Repository<PaymentAttempt>,
    @InjectRepository(PaymentTransaction)
    private readonly paymentTransactionRepository: Repository<PaymentTransaction>,
    @InjectRepository(Purchase)
    private readonly purchaseRepository: Repository<Purchase>,
    private readonly configService: ConfigService,
    private readonly pricingEngineService: PricingEngineService,
    private readonly solanaService: SolanaService,
    private readonly apiKeyService: ApiKeyService,
    private readonly historicalDataLogger: HistoricalDataLogger,
    logger: AppLogger,
  ) {
    this.logger = logger.forClass('PaymentService');
    this.paymentExpiryMinutes = this.configService.get<number>('payment.expiryMinutes', 60);
    void this.sweepSinglePayment;
  }

  setNotificationService(service: {
    notifyPaymentReceived: (userId: string, amount: number, remaining: number) => Promise<void>;
    notifyPurchaseComplete: (
      userId: string,
      tier: string,
      rps: number,
      expiresAt: Date,
    ) => Promise<void>;
    notifyApiKeyGenerated: (
      userId: string,
      paymentAddress: string,
      apiKey: string,
      details: {
        tier: string;
        duration: number;
        expiresAt: Date;
        amountPaid: number;
        backendUrl: string;
      },
    ) => Promise<void>;
  }): void {
    this.notificationService = service;
  }

  /**
   * Create a new payment attempt with unique address
   */
  async createPaymentAttempt(dto: CreatePaymentAttemptDto): Promise<PaymentAttemptResponse> {
    this.logger.log('Creating payment attempt', { userId: dto.userId, tier: dto.tier });

    const tiers = this.pricingEngineService.getTiers();
    const tierInfo = tiers.find(t => t.name === String(dto.tier));

    if (!tierInfo) {
      throw new HttpException('Invalid tier', HttpStatus.BAD_REQUEST);
    }

    const usedRps = await this.pricingEngineService.getCurrentUtilization();
    const onChainActivity = await this.pricingEngineService.getOnChainActivity();

    const basePrice = this.pricingEngineService.calculateDynamicPrice({
      usedRps,
      totalRps: this.pricingEngineService.getTotalRps(),
      priceMin: this.pricingEngineService.getPriceMin(),
      priceMax: this.pricingEngineService.getPriceMax(),
      onChainActivity,
    });

    const totalPrice = Number((basePrice * tierInfo.rps * dto.duration).toFixed(6));

    if (usedRps + tierInfo.rps > this.pricingEngineService.getTotalRps()) {
      throw new HttpException('Insufficient capacity available', HttpStatus.CONFLICT);
    }

    const { publicKey, privateKey } = this.solanaService.generatePaymentAddress();

    const encryptedPrivateKey = CryptoUtil.encryptPrivateKey(privateKey);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.paymentExpiryMinutes);

    const paymentAttempt = this.paymentAttemptRepository.create({
      userId: dto.userId,
      paymentAddress: publicKey,
      paymentPrivateKey: encryptedPrivateKey,
      tier: dto.tier,
      duration: dto.duration,
      amountExpected: totalPrice,
      amountPaid: 0,
      status: PaymentStatus.PENDING,
      expiresAt,
    });

    const saved = await this.paymentAttemptRepository.save(paymentAttempt);

    this.logger.log('Payment attempt created with unique address', {
      id: saved.id,
      paymentAddress: publicKey,
      amountExpected: totalPrice,
      expiresAt,
    });

    return {
      id: saved.id,
      memo: '',
      amountExpected: saved.amountExpected,
      amountPaid: saved.amountPaid,
      walletAddress: publicKey,
      expiresAt: saved.expiresAt,
      status: saved.status,
    };
  }

  /**
   * Record a payment transaction
   */
  async recordTransaction(
    paymentAttemptId: string,
    signature: string,
    amount: number,
    fromAddress: string,
    confirmations: number,
  ): Promise<void> {
    this.logger.log('Recording transaction', { paymentAttemptId, signature, amount });

    const paymentAttempt = await this.paymentAttemptRepository.findOne({
      where: { id: paymentAttemptId },
    });

    if (!paymentAttempt) {
      throw new HttpException('Payment attempt not found', HttpStatus.NOT_FOUND);
    }

    const existingTransaction = await this.paymentTransactionRepository.findOne({
      where: { signature },
    });

    if (existingTransaction) {
      this.logger.debug('Transaction already recorded', { signature });
      return;
    }

    const transaction = this.paymentTransactionRepository.create({
      paymentAttemptId,
      signature,
      amount,
      fromAddress,
      confirmations,
      verifiedAt: new Date(),
    });

    await this.paymentTransactionRepository.save(transaction);

    paymentAttempt.amountPaid = Number((Number(paymentAttempt.amountPaid) + amount).toFixed(6));

    if (paymentAttempt.amountPaid >= Number(paymentAttempt.amountExpected)) {
      paymentAttempt.status = PaymentStatus.COMPLETED;
      await this.completePurchase(paymentAttempt);
    } else if (paymentAttempt.amountPaid > 0) {
      paymentAttempt.status = PaymentStatus.PARTIAL;
    }

    await this.paymentAttemptRepository.save(paymentAttempt);

    if (this.notificationService) {
      const remainingAmount = Number(paymentAttempt.amountExpected) - paymentAttempt.amountPaid;
      await this.notificationService.notifyPaymentReceived(
        paymentAttempt.userId,
        amount,
        remainingAmount,
      );
    }

    this.logger.log('Transaction recorded', {
      paymentAttemptId,
      amountPaid: paymentAttempt.amountPaid,
      amountExpected: paymentAttempt.amountExpected,
      status: paymentAttempt.status,
    });
  }

  /**
   * Get payment attempt by memo
   */
  async getPaymentAttemptByMemo(memo: string): Promise<PaymentAttempt | null> {
    return await this.paymentAttemptRepository.findOne({
      where: { memo, status: In([PaymentStatus.PENDING, PaymentStatus.PARTIAL]) },
    });
  }

  /**
   * Get payment attempt by ID
   */
  async getPaymentAttemptById(id: string): Promise<PaymentAttempt | null> {
    return await this.paymentAttemptRepository.findOne({
      where: { id },
      relations: ['transactions'],
    });
  }

  async getPaymentAttemptByAddress(paymentAddress: string): Promise<PaymentAttempt | null> {
    return await this.paymentAttemptRepository.findOne({
      where: { paymentAddress },
      relations: ['transactions'],
    });
  }

  /**
   * Get all pending payment attempts
   */
  async getPendingPaymentAttempts(): Promise<PaymentAttempt[]> {
    return await this.paymentAttemptRepository.find({
      where: [
        { status: PaymentStatus.PENDING, expiresAt: MoreThan(new Date()) },
        { status: PaymentStatus.PARTIAL, expiresAt: MoreThan(new Date()) },
      ],
    });
  }

  /**
   * Get all payment attempts for debugging
   */
  async getAllPaymentAttempts(): Promise<PaymentAttempt[]> {
    return await this.paymentAttemptRepository.find({
      order: { createdAt: 'DESC' },
      take: 20,
    });
  }

  /**
   * Get API keys for a specific user
   */
  async getApiKeysForUser(userId: string): Promise<any[]> {
    return await this.apiKeyService.getApiKeysForUser(userId);
  }

  /**
   * Get all API keys (for debugging)
   */
  async getAllApiKeys(): Promise<any[]> {
    return await this.apiKeyService.getAllApiKeys();
  }

  /**
   * Get API key for a completed payment
   */
  async getApiKeyForPayment(paymentAttemptId: string): Promise<any> {
    const payment = await this.paymentAttemptRepository.findOne({
      where: { id: paymentAttemptId },
    });

    if (!payment || payment.status !== PaymentStatus.COMPLETED) {
      return null;
    }

    const apiKeys = await this.apiKeyService.getApiKeysForUser(payment.userId);

    return apiKeys.length > 0 ? apiKeys[0] : null;
  }

  /**
   * Regenerate API key for a user (when original was lost)
   */
  async regenerateApiKey(userId: string, oldKeyId?: string): Promise<any> {
    return await this.apiKeyService.regenerateApiKey(userId, oldKeyId);
  }

  /**
   * Mark expired payment attempts as expired
   */
  async markExpiredPaymentAttempts(): Promise<number> {
    const result = await this.paymentAttemptRepository.update(
      {
        expiresAt: LessThan(new Date()),
        status: In([PaymentStatus.PENDING, PaymentStatus.PARTIAL]),
      },
      {
        status: PaymentStatus.EXPIRED,
      },
    );

    if (result.affected && result.affected > 0) {
      this.logger.log(`Marked ${result.affected} payment attempts as expired`);
    }

    return result.affected || 0;
  }

  /**
   * Get payment status for user
   */
  async getUserPaymentStatus(userId: string): Promise<PaymentAttempt[]> {
    return await this.paymentAttemptRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 10,
    });
  }

  /**
   * Complete the purchase after payment is verified
   */
  private async completePurchase(paymentAttempt: PaymentAttempt): Promise<void> {
    this.logger.log('Completing purchase', { paymentAttemptId: paymentAttempt.id });

    const tiers = this.pricingEngineService.getTiers();
    const tierInfo = tiers.find(t => t.name === paymentAttempt.tier);

    if (!tierInfo) {
      throw new HttpException('Invalid tier', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + paymentAttempt.duration);

    const purchase = this.purchaseRepository.create({
      userId: paymentAttempt.userId,
      paymentAttemptId: paymentAttempt.id,
      walletAddress: paymentAttempt.paymentAddress || 'discord-user',
      tier: paymentAttempt.tier,
      rpsAllocated: tierInfo.rps,
      price: paymentAttempt.amountPaid,
      duration: paymentAttempt.duration,
      expiresAt,
      isActive: true,
    });

    await this.purchaseRepository.save(purchase);

    // Log purchase event to historical data
    await this.logPurchaseEvent(purchase, paymentAttempt, tierInfo.rps);

    let generatedApiKey: any = null;
    try {
      generatedApiKey = await this.apiKeyService.createApiKey(
        paymentAttempt.userId,
        `${paymentAttempt.tier}-access`,
        expiresAt,
        { tier: paymentAttempt.tier, duration: paymentAttempt.duration },
      );

      this.logger.log('API key generated automatically', {
        keyId: generatedApiKey.id,
        userId: paymentAttempt.userId,
        tier: paymentAttempt.tier,
        expiresAt: generatedApiKey.expiresAt,
      });
    } catch (error) {
      this.logger.error(
        'Failed to generate API key',
        `Payment attempt ${paymentAttempt.id}`,
        { userId: paymentAttempt.userId },
        error as Error,
      );
    }

    await this.pricingEngineService.updateUtilization(tierInfo.rps);

    if (this.notificationService && generatedApiKey) {
      await this.notificationService.notifyApiKeyGenerated(
        paymentAttempt.userId,
        paymentAttempt.paymentAddress || 'unknown',
        generatedApiKey.fullKey,
        {
          tier: paymentAttempt.tier,
          duration: paymentAttempt.duration,
          expiresAt: generatedApiKey.expiresAt,
          amountPaid: paymentAttempt.amountPaid,
          backendUrl:
            this.configService.get<string>('urls.rpcBackendUrl') || 'http://localhost:3000/api/rpc',
        },
      );

      await this.notificationService.notifyPurchaseComplete(
        paymentAttempt.userId,
        paymentAttempt.tier,
        tierInfo.rps,
        expiresAt,
      );

      this.logger.log('🎉 API key sent automatically to user!', {
        userId: paymentAttempt.userId,
        paymentAddress: paymentAttempt.paymentAddress,
        tier: paymentAttempt.tier,
      });
    }

    this.logger.log('Purchase completed', {
      purchaseId: purchase.id,
      userId: paymentAttempt.userId,
      tier: paymentAttempt.tier,
      rps: tierInfo.rps,
      expiresAt,
    });

    await this.sweepSinglePayment(paymentAttempt);
  }

  /**
   * Sweep a single payment immediately after completion
   */
  async sweepCompletedPayments(): Promise<void> {
    this.logger.log('Starting auto-sweep of completed payments');

    const mainWallet = this.configService.get<string>('solana.paymentWallet');
    if (!mainWallet) {
      this.logger.error('SweepError', 'Main wallet not configured', {});
      return;
    }

    const completedPayments = await this.paymentAttemptRepository.find({
      where: {
        status: PaymentStatus.COMPLETED,
      },
      take: 50,
    });

    const paymentsToSweep = completedPayments.filter(
      (p: PaymentAttempt) => p.paymentPrivateKey && p.paymentAddress,
    );

    if (paymentsToSweep.length === 0) {
      this.logger.debug('No payments to sweep');
      return;
    }

    this.logger.log(`Found ${paymentsToSweep.length} payments to sweep`);

    let successCount = 0;
    let failCount = 0;

    for (const payment of paymentsToSweep) {
      if (this.sweepingPayments.has(payment.id)) {
        this.logger.debug('Payment already being swept, skipping', {
          paymentId: payment.id,
        });
        continue;
      }

      try {
        const { paymentPrivateKey } = payment;
        if (!paymentPrivateKey) {
          continue;
        }
        const privateKey = CryptoUtil.decryptPrivateKey(paymentPrivateKey);
        const signature = await this.solanaService.sweepFunds(privateKey, mainWallet);

        if (signature) {
          payment.paymentPrivateKey = undefined;
          await this.paymentAttemptRepository.save(payment);

          successCount++;
          this.logger.log('Swept payment', {
            paymentId: payment.id,
            from: payment.paymentAddress,
            to: mainWallet,
            signature,
          });
        } else {
          failCount++;
          this.logger.warn('Failed to sweep payment (insufficient balance or error)', {
            paymentId: payment.id,
            address: payment.paymentAddress,
          });
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        failCount++;
        this.logger.error(
          'SweepError',
          'Failed to sweep payment',
          { paymentId: payment.id },
          error as Error,
        );
      }
    }

    this.logger.log('Auto-sweep completed', {
      total: paymentsToSweep.length,
      success: successCount,
      failed: failCount,
    });
  }

  async sweepSinglePayment(payment: PaymentAttempt): Promise<void> {
    if (this.sweepingPayments.has(payment.id)) {
      this.logger.debug('Payment already being swept, skipping', {
        paymentId: payment.id,
      });
      return;
    }

    if (!payment.paymentPrivateKey || !payment.paymentAddress) {
      this.logger.debug('Payment has no private key, skipping immediate sweep', {
        paymentId: payment.id,
      });
      return;
    }

    this.sweepingPayments.add(payment.id);

    const mainWallet = this.configService.get<string>('solana.paymentWallet');
    if (!mainWallet) {
      this.logger.error('SweepError', 'Main wallet not configured', {});
      return;
    }

    try {
      this.logger.log('Starting immediate sweep', {
        paymentId: payment.id,
        from: payment.paymentAddress,
        to: mainWallet,
      });

      const { paymentPrivateKey } = payment;
      if (!paymentPrivateKey) {
        return;
      }
      const privateKey = CryptoUtil.decryptPrivateKey(paymentPrivateKey);

      const signature = await this.solanaService.sweepFunds(privateKey, mainWallet);

      if (signature) {
        payment.paymentPrivateKey = undefined;
        await this.paymentAttemptRepository.save(payment);

        this.logger.log('Immediate sweep successful', {
          paymentId: payment.id,
          from: payment.paymentAddress,
          to: mainWallet,
          signature,
        });
      } else {
        this.logger.warn('Immediate sweep failed (insufficient balance or error)', {
          paymentId: payment.id,
          address: payment.paymentAddress,
        });
      }
    } catch (error) {
      this.logger.error(
        'ImmediateSweepError',
        'Failed to immediately sweep payment',
        { paymentId: payment.id },
        error as Error,
      );
    } finally {
      this.sweepingPayments.delete(payment.id);
    }
  }

  /**
   * Mark a payment as swept to avoid re-processing
   */
  async markPaymentSwept(paymentAttemptId: string): Promise<void> {
    this.logger.log('Marking payment as swept', { paymentAttemptId });

    const paymentAttempt = await this.paymentAttemptRepository.findOne({
      where: { id: paymentAttemptId },
    });

    if (!paymentAttempt) {
      throw new HttpException('Payment attempt not found', HttpStatus.NOT_FOUND);
    }

    paymentAttempt.updatedAt = new Date();
    await this.paymentAttemptRepository.save(paymentAttempt);

    this.logger.log('Payment marked as swept', {
      paymentAttemptId,
      status: paymentAttempt.status,
      amountPaid: paymentAttempt.amountPaid,
    });
  }

  /**
   * Log purchase event to historical data
   */
  private async logPurchaseEvent(
    purchase: Purchase,
    paymentAttempt: PaymentAttempt,
    rpsAllocated: number,
  ): Promise<void> {
    try {
      await this.historicalDataLogger.logPurchase({
        tier: paymentAttempt.tier,
        rpsAllocated,
        price: paymentAttempt.amountPaid,
        duration: paymentAttempt.duration,
        walletAddress: paymentAttempt.paymentAddress || 'discord-user',
      });

      this.logger.log('Purchase event logged to historical data', {
        purchaseId: purchase.id,
        tier: paymentAttempt.tier,
        rpsAllocated,
        price: paymentAttempt.amountPaid,
      });
    } catch (error) {
      this.logger.error(
        'Failed to log purchase event',
        'PaymentService',
        { purchaseId: purchase.id },
        error as Error,
      );
    }
  }
}
