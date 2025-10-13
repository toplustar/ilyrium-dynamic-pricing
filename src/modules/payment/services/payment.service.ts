import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, In } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { nanoid } from 'nanoid';

import { AppLogger } from '~/common/services/app-logger.service';
import { Purchase } from '~/modules/pricing/entities/purchase.entity';
import { TierType } from '~/modules/pricing/entities/tier.enum';
import { PricingEngineService } from '~/modules/pricing/services/pricing-engine.service';

import { PaymentTransaction } from '../entities/payment-transaction.entity';
import { PaymentAttempt, PaymentStatus } from '../entities/payment-attempt.entity';

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
  private readonly memoExpiryDays: number;
  private readonly paymentWallet: string;
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
    logger: AppLogger,
  ) {
    this.logger = logger.forClass('PaymentService');
    this.memoExpiryDays = this.configService.get<number>('payment.memoExpiryDays', 7);
    this.paymentWallet = this.configService.get<string>('solana.paymentWallet', '');
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
   * Create a new payment attempt with unique memo
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

    const memo = await this.generateUniqueMemo();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.memoExpiryDays);

    const paymentAttempt = this.paymentAttemptRepository.create({
      userId: dto.userId,
      memo,
      tier: dto.tier,
      duration: dto.duration,
      amountExpected: totalPrice,
      amountPaid: 0,
      status: PaymentStatus.PENDING,
      expiresAt,
    });

    const saved = await this.paymentAttemptRepository.save(paymentAttempt);

    this.logger.log('Payment attempt created', {
      id: saved.id,
      memo,
      amountExpected: totalPrice,
      expiresAt,
    });

    return {
      id: saved.id,
      memo: saved.memo,
      amountExpected: saved.amountExpected,
      amountPaid: saved.amountPaid,
      walletAddress: this.paymentWallet,
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
   * Generate a unique 10-character alphanumeric memo
   */
  private async generateUniqueMemo(): Promise<string> {
    const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const memo = nanoid(10)
        .replace(/[^A-Za-z0-9]/g, '')
        .toUpperCase()
        .slice(0, 10);

      const paddedMemo = memo.padEnd(10, alphabet[Math.floor(Math.random() * alphabet.length)]);

      const existing = await this.paymentAttemptRepository.findOne({
        where: { memo: paddedMemo },
      });

      if (!existing) {
        return paddedMemo;
      }

      attempts++;
    }

    throw new HttpException('Failed to generate unique memo', HttpStatus.INTERNAL_SERVER_ERROR);
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
  }
}
