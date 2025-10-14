import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
// @ts-ignore - TypeORM types
import { Repository, LessThan, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';

import { AppLogger } from '~/common/services/app-logger.service';
import { Purchase } from '~/modules/pricing/entities/purchase.entity';
import { TierType } from '~/modules/pricing/entities/tier.enum';
import { PricingEngineService } from '~/modules/pricing/services/pricing-engine.service';
import { CryptoUtil } from '~/common/utils/crypto.util';

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
  private notificationService?: {
    notifyPaymentReceived: (userId: string, amount: number, remaining: number) => Promise<void>;
    notifyPurchaseComplete: (
      userId: string,
      tier: string,
      rps: number,
      expiresAt: Date,
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
    logger: AppLogger,
  ) {
    this.logger = logger.forClass('PaymentService');
    // Payment link expires in 60 minutes (1 hour) by default
    this.paymentExpiryMinutes = this.configService.get<number>('payment.expiryMinutes', 60);
  }

  setNotificationService(service: {
    notifyPaymentReceived: (userId: string, amount: number, remaining: number) => Promise<void>;
    notifyPurchaseComplete: (
      userId: string,
      tier: string,
      rps: number,
      expiresAt: Date,
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
    const basePrice = this.pricingEngineService.calculateDynamicPrice({
      usedRps,
      totalRps: this.pricingEngineService.getTotalRps(),
      priceMin: this.pricingEngineService.getPriceMin(),
      priceMax: this.pricingEngineService.getPriceMax(),
    });

    const totalPrice = Number((basePrice * tierInfo.rps * dto.duration).toFixed(6));

    if (usedRps + tierInfo.rps > this.pricingEngineService.getTotalRps()) {
      throw new HttpException('Insufficient capacity available', HttpStatus.CONFLICT);
    }

    // Generate unique payment address
    const { publicKey, privateKey } = this.solanaService.generatePaymentAddress();

    // Encrypt the private key before storing
    const encryptedPrivateKey = CryptoUtil.encryptPrivateKey(privateKey);

    // Set payment expiration to 1 hour from now
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
      memo: '', // No memo needed
      amountExpected: saved.amountExpected,
      amountPaid: saved.amountPaid,
      walletAddress: publicKey, // Return unique address
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

    paymentAttempt.amountPaid = Number((paymentAttempt.amountPaid + amount).toFixed(6));

    if (paymentAttempt.amountPaid >= paymentAttempt.amountExpected) {
      paymentAttempt.status = PaymentStatus.COMPLETED;
      await this.completePurchase(paymentAttempt);
    } else if (paymentAttempt.amountPaid > 0) {
      paymentAttempt.status = PaymentStatus.PARTIAL;
    }

    await this.paymentAttemptRepository.save(paymentAttempt);

    if (this.notificationService) {
      const remainingAmount = paymentAttempt.amountExpected - paymentAttempt.amountPaid;
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

  /**
   * Get all pending payment attempts
   */
  async getPendingPaymentAttempts(): Promise<PaymentAttempt[]> {
    return await this.paymentAttemptRepository.find({
      where: [{ status: PaymentStatus.PENDING }, { status: PaymentStatus.PARTIAL }],
    });
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
      walletAddress: 'telegram-user',
      tier: paymentAttempt.tier,
      rpsAllocated: tierInfo.rps,
      price: paymentAttempt.amountPaid,
      duration: paymentAttempt.duration,
      expiresAt,
      isActive: true,
    });

    await this.purchaseRepository.save(purchase);

    await this.pricingEngineService.updateUtilization(tierInfo.rps);

    if (this.notificationService) {
      await this.notificationService.notifyPurchaseComplete(
        paymentAttempt.userId,
        paymentAttempt.tier,
        tierInfo.rps,
        expiresAt,
      );
    }

    this.logger.log('Purchase completed', {
      purchaseId: purchase.id,
      userId: paymentAttempt.userId,
      tier: paymentAttempt.tier,
      rps: tierInfo.rps,
      expiresAt,
    });

    // Immediately sweep funds to main wallet
    await this.sweepSinglePayment(paymentAttempt);
  }

  /**
   * Sweep a single payment immediately after completion
   */
  private async sweepSinglePayment(payment: PaymentAttempt): Promise<void> {
    // Check if payment has a private key (unique address system)
    if (!payment.paymentPrivateKey || !payment.paymentAddress) {
      this.logger.debug('Payment has no private key, skipping immediate sweep', {
        paymentId: payment.id,
      });
      return;
    }

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

      // Decrypt the private key
      const privateKey = CryptoUtil.decryptPrivateKey(payment.paymentPrivateKey);

      // Sweep funds to main wallet
      const signature = await this.solanaService.sweepFunds(privateKey, mainWallet);

      if (signature) {
        // Clear the private key after successful sweep (security)
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
      // Don't throw - let the hourly cron retry if this fails
    }
  }

  /**
   * Sweep completed payments to main wallet
   * Called by cron job (backup sweep for any missed payments)
   */
  async sweepCompletedPayments(): Promise<void> {
    this.logger.log('Starting auto-sweep of completed payments');

    const mainWallet = this.configService.get<string>('solana.paymentWallet');
    if (!mainWallet) {
      this.logger.error('SweepError', 'Main wallet not configured', {});
      return;
    }

    // Find completed payments with private keys (not yet swept)
    const completedPayments = await this.paymentAttemptRepository.find({
      where: {
        status: PaymentStatus.COMPLETED,
      },
      take: 50, // Process up to 50 at a time
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
      try {
        // Decrypt the private key
        const privateKey = CryptoUtil.decryptPrivateKey(payment.paymentPrivateKey!);

        // Sweep funds to main wallet
        const signature = await this.solanaService.sweepFunds(privateKey, mainWallet);

        if (signature) {
          // Clear the private key after successful sweep (security)
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

        // Small delay to avoid rate limiting
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
}
