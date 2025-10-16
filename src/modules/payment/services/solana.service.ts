import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Connection,
  PublicKey,
  ParsedTransactionWithMeta,
  ConfirmedSignatureInfo,
  Keypair,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';

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
  private readonly usdcMint: PublicKey | null;
  private readonly requiredConfirmations: number;
  private readonly logger: AppLogger;
  private readonly useNativeSOL: boolean;

  constructor(
    private readonly configService: ConfigService,
    logger: AppLogger,
  ) {
    this.logger = logger.forClass('SolanaService');

    const rpcUrl = this.configService.get<string>('solana.rpcUrl');
    const walletAddress = this.configService.get<string>('solana.paymentWallet');
    const usdcMintAddress = this.configService.get<string>('solana.usdcMint');
    this.requiredConfirmations = this.configService.get<number>('solana.confirmationCount', 1);
    this.useNativeSOL = this.configService.get<boolean>('solana.useNativeSOL', true);

    if (!rpcUrl || !walletAddress) {
      throw new Error('Solana configuration is incomplete');
    }

    this.connection = new Connection(rpcUrl, 'confirmed');
    this.paymentWallet = new PublicKey(walletAddress);
    this.usdcMint = usdcMintAddress ? new PublicKey(usdcMintAddress) : null;

    this.logger.log('Solana service initialized', {
      rpcUrl,
      wallet: walletAddress,
      useNativeSOL: this.useNativeSOL,
      confirmations: this.requiredConfirmations,
    });
  }

  /**
   * Query recent transactions to the payment wallet with a specific memo
   */
  async queryTransactionsByMemo(memo: string, limit = 10): Promise<SolanaTransaction[]> {
    try {
      this.logger.debug(`Querying transactions for memo: ${memo}`);

      const signatures = await this.connection.getSignaturesForAddress(this.paymentWallet, {
        limit,
      });

      const transactions: SolanaTransaction[] = [];

      for (const signatureInfo of signatures) {
        try {
          const transaction = await this.parseTransaction(signatureInfo, memo);
          if (transaction) {
            transactions.push(transaction);
          }

          // Add small delay to avoid rate limiting
          await this.sleep(100);
        } catch (error) {
          this.logger.warn(`Failed to parse transaction ${signatureInfo.signature}`, {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      this.logger.debug(`Found ${transactions.length} transactions for memo: ${memo}`);
      return transactions;
    } catch (error) {
      this.logger.error(
        'SolanaQueryError',
        `Failed to query transactions for memo: ${memo}`,
        {},
        error as Error,
      );
      throw error;
    }
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
        this.logger.log('Transaction verified', {
          signature,
          confirmations: transaction.confirmations,
        });
        return transaction;
      }

      return null;
    } catch (error) {
      this.logger.error(
        'TransactionVerificationError',
        `Failed to verify transaction: ${signature}`,
        {},
        error as Error,
      );
      return null;
    }
  }

  /**
   * Get current slot height
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
      this.logger.error(
        'SolanaHealthCheckError',
        'Failed to connect to Solana',
        {},
        error as Error,
      );
      return false;
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

    if (!transaction?.meta) {
      return null;
    }

    const memo = this.extractMemo(transaction);
    if (targetMemo && memo !== targetMemo) {
      return null;
    }

    const amount = this.useNativeSOL
      ? this.extractSOLAmount(transaction)
      : this.extractUsdcAmount(transaction);
    if (amount === 0) {
      return null;
    }

    const fromAddress = this.extractSenderAddress(transaction);
    if (!fromAddress) {
      return null;
    }

    const slot = await this.connection.getSlot();
    const confirmations = transaction.slot ? slot - transaction.slot : 0;

    return {
      signature: signatureInfo.signature,
      amount,
      memo: memo || '',
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
   * Extract native SOL transfer amount from transaction
   */
  private extractSOLAmount(transaction: ParsedTransactionWithMeta): number {
    const preBalances = transaction.meta?.preBalances || [];
    const postBalances = transaction.meta?.postBalances || [];
    const accountKeys = transaction.transaction.message.accountKeys;

    // Find the payment wallet index
    const walletIndex = accountKeys.findIndex(
      key => key.pubkey.toBase58() === this.paymentWallet.toBase58(),
    );

    if (
      walletIndex === -1 ||
      walletIndex >= preBalances.length ||
      walletIndex >= postBalances.length
    ) {
      return 0;
    }

    const preBalance = preBalances[walletIndex] || 0;
    const postBalance = postBalances[walletIndex] || 0;
    const difference = postBalance - preBalance;

    // Convert lamports to SOL
    return difference > 0 ? difference / 1_000_000_000 : 0;
  }

  /**
   * Extract USDC transfer amount from transaction
   */
  private extractUsdcAmount(transaction: ParsedTransactionWithMeta): number {
    const instructions = transaction.transaction.message.instructions;

    for (const instruction of instructions) {
      if ('parsed' in instruction && instruction.parsed && typeof instruction.parsed === 'object') {
        const parsed = instruction.parsed;

        if (parsed.type === 'transferChecked' || parsed.type === 'transfer') {
          const info = parsed.info;

          if (
            this.usdcMint &&
            info.mint === this.usdcMint.toBase58() &&
            info.destination === this.paymentWallet.toBase58()
          ) {
            const amount =
              (info.tokenAmount?.uiAmount as number | undefined) || info.amount / 1_000_000;
            return amount;
          }
        }
      }
    }

    return 0;
  }

  /**
   * Helper method to sleep for a given number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  }

  /**
   * Extract sender address from transaction
   */
  private extractSenderAddress(transaction: ParsedTransactionWithMeta): string | null {
    const accountKeys = transaction.transaction.message.accountKeys;
    if (accountKeys.length > 0 && accountKeys[0]) {
      return accountKeys[0].pubkey.toBase58();
    }
    return null;
  }

  /**
   * Generate a unique keypair for payment
   * Returns: { publicKey: string, privateKey: Uint8Array }
   */
  generatePaymentAddress(): { publicKey: string; privateKey: Uint8Array } {
    const keypair = Keypair.generate();

    this.logger.debug('Generated new payment address', {
      publicKey: keypair.publicKey.toBase58(),
    });

    return {
      publicKey: keypair.publicKey.toBase58(),
      privateKey: keypair.secretKey,
    };
  }

  /**
   * Query transactions for a specific address (not memo-based)
   */
  async queryTransactionsByAddress(
    address: string,
    minAmount: number,
  ): Promise<SolanaTransaction[]> {
    try {
      const publicKey = new PublicKey(address);

      // Get recent transactions to this address
      const signatures = await this.connection.getSignaturesForAddress(publicKey, { limit: 10 });

      const transactions: SolanaTransaction[] = [];

      for (const signatureInfo of signatures) {
        const transaction = await this.parseTransactionForAddress(
          signatureInfo,
          publicKey,
          minAmount,
        );

        if (transaction) {
          transactions.push(transaction);
        }
      }

      this.logger.debug('Queried transactions by address', {
        address,
        found: transactions.length,
      });

      return transactions;
    } catch (error) {
      this.logger.error('QueryError', 'Failed to query transactions', { address }, error as Error);
      return [];
    }
  }

  /**
   * Parse transaction to check if it meets minimum amount
   */
  private async parseTransactionForAddress(
    signatureInfo: ConfirmedSignatureInfo,
    targetAddress: PublicKey,
    minAmount: number,
  ): Promise<SolanaTransaction | null> {
    const transaction = await this.connection.getParsedTransaction(signatureInfo.signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!transaction?.meta) {
      return null;
    }

    // Extract amount received by target address
    const amount = this.useNativeSOL
      ? this.extractSOLAmountToAddress(transaction, targetAddress)
      : this.extractUsdcAmountToAddress(transaction, targetAddress);

    if (amount < minAmount) {
      return null;
    }

    const fromAddress = this.extractSenderAddress(transaction);
    if (!fromAddress) {
      return null;
    }

    const slot = await this.connection.getSlot();
    const confirmations = transaction.slot ? slot - transaction.slot : 0;

    return {
      signature: signatureInfo.signature,
      amount,
      memo: '', // No memo needed!
      timestamp: new Date((signatureInfo.blockTime || 0) * 1000),
      confirmations,
      fromAddress,
    };
  }

  /**
   * Extract SOL amount received by specific address
   */
  private extractSOLAmountToAddress(
    transaction: ParsedTransactionWithMeta,
    targetAddress: PublicKey,
  ): number {
    const targetAddressStr = targetAddress.toBase58();

    // Check post balances vs pre balances
    const accountKeys = transaction.transaction.message.accountKeys;
    const accountIndex = accountKeys.findIndex(key => key.pubkey.toBase58() === targetAddressStr);

    if (accountIndex === -1) {
      return 0;
    }

    const preBalance = transaction.meta?.preBalances[accountIndex] || 0;
    const postBalance = transaction.meta?.postBalances[accountIndex] || 0;
    const difference = postBalance - preBalance;

    return difference > 0 ? difference / 1e9 : 0; // Convert lamports to SOL
  }

  /**
   * Extract USDC amount received by specific address (placeholder)
   */
  private extractUsdcAmountToAddress(
    _transaction: ParsedTransactionWithMeta,
    _targetAddress: PublicKey,
  ): number {
    // For now, return 0 - implement USDC token parsing if needed
    return 0;
  }

  /**
   * Sweep funds from payment address to main wallet
   */
  async sweepFunds(privateKey: Uint8Array, toAddress: string): Promise<string | null> {
    try {
      const fromKeypair = Keypair.fromSecretKey(privateKey);
      const toPublicKey = new PublicKey(toAddress);

      // Get balance
      const balance = await this.connection.getBalance(fromKeypair.publicKey);

      // Calculate amount to send (leave some for fee)
      const fee = 5000; // 0.000005 SOL
      if (balance <= fee) {
        this.logger.debug('Insufficient balance to sweep', {
          address: fromKeypair.publicKey.toBase58(),
          balance: balance / 1e9,
        });
        return null; // Not enough to sweep
      }

      const amount = balance - fee;

      // Create and send transfer transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: fromKeypair.publicKey,
          toPubkey: toPublicKey,
          lamports: amount,
        }),
      );

      const signature = await this.connection.sendTransaction(transaction, [fromKeypair]);

      await this.connection.confirmTransaction(signature);

      this.logger.log('Funds swept', {
        from: fromKeypair.publicKey.toBase58(),
        to: toAddress,
        amount: amount / 1e9,
        signature,
      });

      return signature;
    } catch (error) {
      this.logger.error('SweepError', 'Failed to sweep funds', {}, error as Error);
      return null;
    }
  }
}
