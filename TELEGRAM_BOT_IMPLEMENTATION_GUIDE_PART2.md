# Telegram Bot Implementation Guide - Part 2: Services Implementation

This is Part 2 of the implementation guide, covering the core service layer for Solana payment integration.

## Table of Contents

- [Part 1: Database Schema & Entities](./TELEGRAM_BOT_IMPLEMENTATION_GUIDE.md) ✅
- **Part 2: Services Implementation** (This Document)
  - Solana Service
  - Payment Service
  - Transaction Monitor Service
- Part 3: Telegram Bot Handlers (Coming Next)
- Part 4: API Key System
- Part 5: Testing & Deployment

---

## 1. Solana Service Implementation

Create the service to interact with Solana blockchain for transaction verification.

### File: `src/modules/payment/services/solana.service.ts`

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Connection, PublicKey, ParsedTransactionWithMeta, ConfirmedSignatureInfo } from '@solana/web3.js';
import { AppLogger } from '~/common/services/app-logger.service';

export interface SolanaTransaction {
  signature: string;
  amount: number;
  memo: string;
  timestamp: Date;
  confirmations: number;
  fromAddress: string;
}

@Injectable()
export class SolanaService {
  private readonly connection: Connection;
  private readonly paymentWallet: PublicKey;
  private readonly usdcMint: PublicKey;
  private readonly requiredConfirmations: number;
  private readonly logger: AppLogger;

  constructor(
    private readonly configService: ConfigService,
    logger: AppLogger,
  ) {
    this.logger = logger.forClass('SolanaService');

    const rpcUrl = this.configService.get<string>('solana.rpcUrl');
    const walletAddress = this.configService.get<string>('solana.paymentWallet');
    const usdcMintAddress = this.configService.get<string>('solana.usdcMint');
    this.requiredConfirmations = this.configService.get<number>('solana.confirmationCount', 32);

    if (!rpcUrl || !walletAddress || !usdcMintAddress) {
      throw new Error('Solana configuration is incomplete');
    }

    this.connection = new Connection(rpcUrl, 'confirmed');
    this.paymentWallet = new PublicKey(walletAddress);
    this.usdcMint = new PublicKey(usdcMintAddress);

    this.logger.log('Solana service initialized', {
      rpcUrl,
      wallet: walletAddress,
      confirmations: this.requiredConfirmations,
    });
  }

  /**
   * Query recent transactions to the payment wallet with a specific memo
   * @param memo The payment memo to search for
   * @param limit Maximum number of transactions to check
   * @returns Array of matching transactions
   */
  async queryTransactionsByMemo(memo: string, limit = 100): Promise<SolanaTransaction[]> {
    try {
      this.logger.debug(`Querying transactions for memo: ${memo}`);

      // Get recent transaction signatures
      const signatures = await this.connection.getSignaturesForAddress(this.paymentWallet, { limit });

      const transactions: SolanaTransaction[] = [];

      for (const signatureInfo of signatures) {
        try {
          const transaction = await this.parseTransaction(signatureInfo, memo);
          if (transaction) {
            transactions.push(transaction);
          }
        } catch (error) {
          this.logger.warn(`Failed to parse transaction ${signatureInfo.signature}`, {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      this.logger.debug(`Found ${transactions.length} transactions for memo: ${memo}`);
      return transactions;
    } catch (error) {
      this.logger.error('SolanaQueryError', `Failed to query transactions for memo: ${memo}`, {}, error as Error);
      throw error;
    }
  }

  /**
   * Parse a single transaction and check if it matches the memo
   */
  private async parseTransaction(
    signatureInfo: ConfirmedSignatureInfo,
    targetMemo: string,
  ): Promise<SolanaTransaction | null> {
    const transaction = await this.connection.getParsedTransaction(signatureInfo.signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!transaction || !transaction.meta) {
      return null;
    }

    // Extract memo from transaction
    const memo = this.extractMemo(transaction);
    if (memo !== targetMemo) {
      return null;
    }

    // Extract USDC transfer amount
    const amount = this.extractUsdcAmount(transaction);
    if (amount === 0) {
      return null;
    }

    // Get sender address
    const fromAddress = this.extractSenderAddress(transaction);
    if (!fromAddress) {
      return null;
    }

    // Get confirmation count
    const slot = await this.connection.getSlot();
    const confirmations = transaction.slot ? slot - transaction.slot : 0;

    return {
      signature: signatureInfo.signature,
      amount,
      memo,
      timestamp: new Date((signatureInfo.blockTime || 0) * 1000),
      confirmations,
      fromAddress,
    };
  }

  /**
   * Extract memo from transaction instructions
   */
  private extractMemo(transaction: ParsedTransactionWithMeta): string | null {
    const instructions = transaction.transaction.message.instructions;

    for (const instruction of instructions) {
      if ('program' in instruction && instruction.program === 'spl-memo') {
        if ('parsed' in instruction) {
          return instruction.parsed as string;
        }
      }
    }

    return null;
  }

  /**
   * Extract USDC transfer amount from transaction
   */
  private extractUsdcAmount(transaction: ParsedTransactionWithMeta): number {
    const instructions = transaction.transaction.message.instructions;

    for (const instruction of instructions) {
      if ('parsed' in instruction && instruction.parsed && typeof instruction.parsed === 'object') {
        const parsed = instruction.parsed as any;

        // Check if this is a token transfer
        if (parsed.type === 'transferChecked' || parsed.type === 'transfer') {
          const info = parsed.info;

          // Verify it's a USDC transfer to our wallet
          if (info.mint === this.usdcMint.toBase58() && info.destination === this.paymentWallet.toBase58()) {
            // USDC has 6 decimals
            const amount = info.tokenAmount?.uiAmount || info.amount / 1_000_000;
            return amount;
          }
        }
      }
    }

    return 0;
  }

  /**
   * Extract sender address from transaction
   */
  private extractSenderAddress(transaction: ParsedTransactionWithMeta): string | null {
    const accountKeys = transaction.transaction.message.accountKeys;
    if (accountKeys.length > 0) {
      return accountKeys[0].pubkey.toBase58();
    }
    return null;
  }

  /**
   * Verify a specific transaction signature
   */
  async verifyTransaction(signature: string): Promise<SolanaTransaction | null> {
    try {
      this.logger.debug(`Verifying transaction: ${signature}`);

      const signatureInfo: ConfirmedSignatureInfo = {
        signature,
        slot: 0,
        err: null,
        memo: null,
        blockTime: null,
      };

      const transaction = await this.parseTransaction(signatureInfo, '');

      if (transaction && transaction.confirmations >= this.requiredConfirmations) {
        this.logger.log('Transaction verified', { signature, confirmations: transaction.confirmations });
        return transaction;
      }

      return null;
    } catch (error) {
      this.logger.error('TransactionVerificationError', `Failed to verify transaction: ${signature}`, {}, error as Error);
      return null;
    }
  }

  /**
   * Get current slot height (for calculating confirmations)
   */
  async getCurrentSlot(): Promise<number> {
    return await this.connection.getSlot();
  }

  /**
   * Check if connection is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      const version = await this.connection.getVersion();
      this.logger.debug('Solana connection healthy', { version });
      return true;
    } catch (error) {
      this.logger.error('SolanaHealthCheckError', 'Failed to connect to Solana', {}, error as Error);
      return false;
    }
  }
}
```

---

## 2. Payment Service Implementation

Create the service to manage payment attempts and track payment completion.

### File: `src/modules/payment/services/payment.service.ts`

```typescript
import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { nanoid } from 'nanoid';

import { AppLogger } from '~/common/services/app-logger.service';
import { PaymentAttempt, PaymentStatus } from '../entities/payment-attempt.entity';
import { PaymentTransaction } from '../entities/payment-transaction.entity';
import { Purchase } from '~/modules/pricing/entities/purchase.entity';
import { TierType } from '~/modules/pricing/entities/tier.enum';
import { PricingEngineService } from '~/modules/pricing/services/pricing-engine.service';

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

  /**
   * Create a new payment attempt with unique memo
   */
  async createPaymentAttempt(dto: CreatePaymentAttemptDto): Promise<PaymentAttemptResponse> {
    this.logger.log('Creating payment attempt', { userId: dto.userId, tier: dto.tier });

    // Get tier information
    const tiers = this.pricingEngineService.getTiers();
    const tierInfo = tiers.find(t => t.name === dto.tier);

    if (!tierInfo) {
      throw new HttpException('Invalid tier', HttpStatus.BAD_REQUEST);
    }

    // Calculate price
    const usedRps = await this.pricingEngineService.getCurrentUtilization();
    const basePrice = this.pricingEngineService.calculateDynamicPrice({
      usedRps,
      totalRps: this.pricingEngineService.getTotalRps(),
      priceMin: this.pricingEngineService.getPriceMin(),
      priceMax: this.pricingEngineService.getPriceMax(),
    });

    const totalPrice = Number((basePrice * tierInfo.rps * dto.duration).toFixed(6));

    // Check capacity
    if (usedRps + tierInfo.rps > this.pricingEngineService.getTotalRps()) {
      throw new HttpException('Insufficient capacity available', HttpStatus.CONFLICT);
    }

    // Generate unique memo
    const memo = await this.generateUniqueMemo();

    // Calculate expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.memoExpiryDays);

    // Create payment attempt
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
   * Generate a unique 10-character alphanumeric memo
   */
  private async generateUniqueMemo(): Promise<string> {
    const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      const memo = nanoid(10).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 10);

      // Pad with random chars if needed
      const paddedMemo = memo.padEnd(10, alphabet[Math.floor(Math.random() * alphabet.length)]);

      // Check if memo already exists
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

    // Check if transaction already recorded
    const existingTransaction = await this.paymentTransactionRepository.findOne({
      where: { signature },
    });

    if (existingTransaction) {
      this.logger.debug('Transaction already recorded', { signature });
      return;
    }

    // Create transaction record
    const transaction = this.paymentTransactionRepository.create({
      paymentAttemptId,
      signature,
      amount,
      fromAddress,
      confirmations,
      verifiedAt: new Date(),
    });

    await this.paymentTransactionRepository.save(transaction);

    // Update payment attempt
    paymentAttempt.amountPaid = Number((paymentAttempt.amountPaid + amount).toFixed(6));

    // Check if payment is complete
    if (paymentAttempt.amountPaid >= paymentAttempt.amountExpected) {
      paymentAttempt.status = PaymentStatus.COMPLETED;
      await this.completePurchase(paymentAttempt);
    } else if (paymentAttempt.amountPaid > 0) {
      paymentAttempt.status = PaymentStatus.PARTIAL;
    }

    await this.paymentAttemptRepository.save(paymentAttempt);

    this.logger.log('Transaction recorded', {
      paymentAttemptId,
      amountPaid: paymentAttempt.amountPaid,
      amountExpected: paymentAttempt.amountExpected,
      status: paymentAttempt.status,
    });
  }

  /**
   * Complete the purchase after payment is verified
   */
  private async completePurchase(paymentAttempt: PaymentAttempt): Promise<void> {
    this.logger.log('Completing purchase', { paymentAttemptId: paymentAttempt.id });

    // Get tier info
    const tiers = this.pricingEngineService.getTiers();
    const tierInfo = tiers.find(t => t.name === paymentAttempt.tier);

    if (!tierInfo) {
      throw new HttpException('Invalid tier', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    // Create purchase record
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + paymentAttempt.duration);

    const purchase = this.purchaseRepository.create({
      userId: paymentAttempt.userId,
      paymentAttemptId: paymentAttempt.id,
      tier: paymentAttempt.tier,
      rpsAllocated: tierInfo.rps,
      price: paymentAttempt.amountPaid,
      duration: paymentAttempt.duration,
      expiresAt,
      isActive: true,
    });

    await this.purchaseRepository.save(purchase);

    // Update utilization
    await this.pricingEngineService.updateUtilization(tierInfo.rps);

    this.logger.log('Purchase completed', {
      purchaseId: purchase.id,
      userId: paymentAttempt.userId,
      tier: paymentAttempt.tier,
      rps: tierInfo.rps,
      expiresAt,
    });
  }

  /**
   * Get payment attempt by memo
   */
  async getPaymentAttemptByMemo(memo: string): Promise<PaymentAttempt | null> {
    return await this.paymentAttemptRepository.findOne({
      where: { memo, status: PaymentStatus.PENDING },
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
      where: [
        { status: PaymentStatus.PENDING },
        { status: PaymentStatus.PARTIAL },
      ],
    });
  }

  /**
   * Mark expired payment attempts as expired
   */
  async markExpiredPaymentAttempts(): Promise<number> {
    const result = await this.paymentAttemptRepository.update(
      {
        expiresAt: LessThan(new Date()),
        status: PaymentStatus.PENDING,
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
}
```

---

## 3. Transaction Monitor Service

Create the background service that polls Solana for new transactions.

### File: `src/modules/payment/services/transaction-monitor.service.ts`

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';

import { AppLogger } from '~/common/services/app-logger.service';
import { SolanaService } from './solana.service';
import { PaymentService } from './payment.service';
import { PaymentStatus } from '../entities/payment-attempt.entity';

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
   * Main monitoring job - runs every 10 seconds
   */
  @Cron(CronExpression.EVERY_10_SECONDS)
  async monitorTransactions(): Promise<void> {
    // Prevent concurrent execution
    if (this.isMonitoring) {
      this.logger.debug('Monitor already running, skipping this cycle');
      return;
    }

    this.isMonitoring = true;

    try {
      await this.checkPendingPayments();
    } catch (error) {
      this.logger.error(
        'MonitorError',
        'Failed to monitor transactions',
        {},
        error as Error,
      );
    } finally {
      this.isMonitoring = false;
    }
  }

  /**
   * Check all pending payment attempts for new transactions
   */
  private async checkPendingPayments(): Promise<void> {
    // Get all pending payment attempts
    const pendingPayments = await this.paymentService.getPendingPaymentAttempts();

    if (pendingPayments.length === 0) {
      this.logger.debug('No pending payments to monitor');
      return;
    }

    this.logger.debug(`Checking ${pendingPayments.length} pending payments`);

    // Check each payment attempt
    for (const payment of pendingPayments) {
      try {
        await this.checkPaymentAttempt(payment.id, payment.memo);
      } catch (error) {
        this.logger.error(
          'PaymentCheckError',
          `Failed to check payment ${payment.id}`,
          { memo: payment.memo },
          error as Error,
        );
      }
    }

    // Mark expired payment attempts
    await this.paymentService.markExpiredPaymentAttempts();
  }

  /**
   * Check a specific payment attempt for transactions
   */
  private async checkPaymentAttempt(paymentAttemptId: string, memo: string): Promise<void> {
    this.logger.debug(`Checking payment attempt ${paymentAttemptId} with memo ${memo}`);

    // Query Solana for transactions with this memo
    const transactions = await this.solanaService.queryTransactionsByMemo(memo);

    if (transactions.length === 0) {
      this.logger.debug(`No transactions found for memo ${memo}`);
      return;
    }

    this.logger.log(`Found ${transactions.length} transactions for memo ${memo}`);

    // Process each transaction
    for (const transaction of transactions) {
      try {
        // Record the transaction
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
        // Continue processing other transactions even if one fails
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
   * Manual trigger for monitoring (useful for testing)
   */
  async triggerManualCheck(): Promise<void> {
    this.logger.log('Manual transaction check triggered');
    await this.monitorTransactions();
  }

  /**
   * Health check for the monitor service
   */
  async healthCheck(): Promise<{ isRunning: boolean; lastCheck: Date }> {
    return {
      isRunning: !this.isMonitoring,
      lastCheck: new Date(),
    };
  }
}
```

---

## 4. Payment Module Setup

Create the module that brings everything together.

### File: `src/modules/payment/payment.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { AppLogger } from '~/common/services/app-logger.service';
import { PaymentAttempt } from './entities/payment-attempt.entity';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { Purchase } from '../pricing/entities/purchase.entity';

import { SolanaService } from './services/solana.service';
import { PaymentService } from './services/payment.service';
import { TransactionMonitorService } from './services/transaction-monitor.service';

import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentAttempt, PaymentTransaction, Purchase]),
    ConfigModule,
    ScheduleModule.forRoot(),
    PricingModule, // Import PricingModule to access PricingEngineService
  ],
  providers: [
    {
      provide: AppLogger,
      useFactory: (): AppLogger => new AppLogger('PaymentModule'),
    },
    SolanaService,
    PaymentService,
    TransactionMonitorService,
  ],
  exports: [SolanaService, PaymentService, TransactionMonitorService],
})
export class PaymentModule {}
```

---

## 5. Update App Module

Add the PaymentModule to the main application module.

### File: `src/app.module.ts`

Add to imports array:

```typescript
import { PaymentModule } from './modules/payment/payment.module';

@Module({
  imports: [
    // ... existing imports
    PaymentModule,
  ],
  // ... rest of module
})
export class AppModule {}
```

---

## 6. Testing the Services

Create a simple test script to verify Solana connection and payment flow.

### File: `src/modules/payment/payment.test.ts` (Optional)

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SolanaService } from './services/solana.service';
import { AppLogger } from '~/common/services/app-logger.service';
import solanaConfig from '~/config/solana.config';

describe('SolanaService', () => {
  let service: SolanaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [solanaConfig],
        }),
      ],
      providers: [
        SolanaService,
        {
          provide: AppLogger,
          useFactory: (): AppLogger => new AppLogger('TestModule'),
        },
      ],
    }).compile();

    service = module.get<SolanaService>(SolanaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should connect to Solana', async () => {
    const isHealthy = await service.healthCheck();
    expect(isHealthy).toBe(true);
  });

  it('should query transactions by memo', async () => {
    const transactions = await service.queryTransactionsByMemo('TEST123456', 10);
    expect(Array.isArray(transactions)).toBe(true);
  });
});
```

---

## 7. Manual Testing Steps

### Step 1: Start the Application

```bash
npm run start:dev
```

### Step 2: Check Logs

You should see:

```
[PaymentModule.SolanaService] Solana service initialized
[PaymentModule.TransactionMonitorService] Transaction monitor initialized
```

### Step 3: Test Solana Connection

Create a test endpoint (optional):

```typescript
// In app.controller.ts
@Get('test/solana')
async testSolana(): Promise<any> {
  const solanaService = this.moduleRef.get(SolanaService);
  const isHealthy = await solanaService.healthCheck();
  return { healthy: isHealthy };
}
```

### Step 4: Monitor Background Jobs

Check logs every 10 seconds:

```
[PaymentModule.TransactionMonitorService] Checking 0 pending payments
```

### Step 5: Create Test Payment Attempt

Use curl or Postman (we'll create the endpoint in Part 3):

```bash
curl -X POST http://localhost:3000/payment/create \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-id",
    "tier": "BASIC",
    "duration": 30
  }'
```

Expected response:

```json
{
  "id": "uuid-here",
  "memo": "A1B2C3D4E5",
  "amountExpected": 50.000000,
  "amountPaid": 0,
  "walletAddress": "your-wallet-address",
  "expiresAt": "2025-10-18T...",
  "status": "PENDING"
}
```

---

## 8. Key Configuration Checklist

Before running, ensure these environment variables are set:

```env
# Solana Configuration
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
SOLANA_PAYMENT_WALLET=YourWalletAddressHere
SOLANA_USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
SOLANA_CONFIRMATION_COUNT=32

# Payment Configuration
PAYMENT_POLL_INTERVAL=10000
PAYMENT_MEMO_EXPIRY_DAYS=7
```

---

## 9. Common Issues and Troubleshooting

### Issue 1: Solana Connection Failed

**Symptom**: `Failed to connect to Solana` error

**Solutions**:
- Check if SOLANA_RPC_URL is valid
- Try using a different RPC endpoint (e.g., QuickNode, Alchemy)
- Verify network connectivity

### Issue 2: No Transactions Found

**Symptom**: Monitor runs but no transactions are detected

**Solutions**:
- Verify SOLANA_PAYMENT_WALLET is correct
- Check if the wallet has any recent transactions
- Test with a known transaction signature using `verifyTransaction()`

### Issue 3: Transaction Monitor Not Running

**Symptom**: No log messages from TransactionMonitorService

**Solutions**:
- Ensure ScheduleModule is imported in PaymentModule
- Check application logs for cron job errors
- Verify @nestjs/schedule is installed

### Issue 4: Duplicate Transaction Records

**Symptom**: Same transaction recorded multiple times

**Solutions**:
- Check for unique constraint on signature column in payment_transactions table
- Verify existingTransaction check in recordTransaction() method

---

## 10. Performance Considerations

### Optimization Tips:

1. **Batch Transaction Queries**
   - Process multiple payment attempts in parallel
   - Use Promise.all() for concurrent queries

2. **Cache Recent Transactions**
   - Store recently processed signatures in Redis
   - Skip already-processed transactions

3. **Adjust Poll Interval**
   - Increase interval during low activity periods
   - Use exponential backoff if no pending payments

4. **RPC Rate Limiting**
   - Monitor Solana RPC rate limits
   - Consider premium RPC providers for production

---

## Next Steps

Continue to Part 3: **Telegram Bot Handlers Implementation**

This will cover:
- Telegram bot setup with Telegraf
- Interactive keyboard builders
- Command handlers (/start, /tiers, /buy, /status, /keys, etc.)
- User notification system
- Integration with Payment Service

---

## Quick Reference

### Service Dependencies

```
TransactionMonitorService
├── SolanaService (query blockchain)
└── PaymentService (record payments)
    ├── PricingEngineService (calculate prices)
    └── Repositories (PaymentAttempt, PaymentTransaction, Purchase)
```

### Key Methods

```typescript
// Create payment
const payment = await paymentService.createPaymentAttempt({
  userId: 'user-id',
  tier: TierType.BASIC,
  duration: 30,
});

// Query transactions
const transactions = await solanaService.queryTransactionsByMemo('ABC1234567');

// Record transaction
await paymentService.recordTransaction(
  paymentAttemptId,
  signature,
  amount,
  fromAddress,
  confirmations,
);

// Trigger manual check
await transactionMonitorService.triggerManualCheck();
```

---

**Status**: Part 2 Complete ✅

**Next**: [Part 3: Telegram Bot Handlers](./TELEGRAM_BOT_IMPLEMENTATION_GUIDE_PART3.md)
