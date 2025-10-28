import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Connection } from '@solana/web3.js';
import { Buffer } from 'buffer';

// Dynamic import for WebSocket to handle module resolution issues
let WebSocket: any;

import { AppLogger } from '~/common/services/app-logger.service';
import { HistoricalDataLogger } from '~/modules/analytics/services/historical-data-logger.service';

export interface SolanaWebSocketEvent {
  type: 'accountChange' | 'programLog' | 'transaction' | 'slotUpdate';
  data: any;
  timestamp: Date;
}

export interface AccountChangeData {
  account: string;
  lamports: number;
  data: string;
  owner: string;
  executable: boolean;
  rentEpoch: number;
}

export interface ProgramLogData {
  programId: string;
  logs: string[];
  signature: string;
  err: any;
}

export interface TransactionData {
  signature: string;
  slot: number;
  err: any;
  meta: any;
}

@Injectable()
export class SolanaWebSocketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger: AppLogger;
  private ws: any = null;
  private readonly connection: Connection;
  private readonly wsUrl: string;
  private isConnected = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  // Monitoring subscriptions
  private readonly subscriptions = new Map<string, any>();

  constructor(
    private readonly configService: ConfigService,
    private readonly historicalDataLogger: HistoricalDataLogger,
    logger: AppLogger,
  ) {
    this.logger = logger.forClass('SolanaWebSocketService');

    // Get WebSocket URL from config
    this.wsUrl = this.configService.get<string>(
      'solana.wsUrl',
      'wss://api.mainnet-beta.solana.com',
    );

    // Create connection for fallback
    const rpcUrl = this.configService.get<string>(
      'solana.rpcUrl',
      'https://api.mainnet-beta.solana.com',
    );
    this.connection = new Connection(rpcUrl, 'confirmed');

    this.logger.log('Solana WebSocket service initialized', {
      wsUrl: this.wsUrl,
      rpcUrl,
    });
  }

  /**
   * Initialize WebSocket module dynamically
   */
  private async initializeWebSocket(): Promise<void> {
    try {
      const wsModule = await import('ws');
      WebSocket = wsModule.default || wsModule;
      this.logger.log('WebSocket module loaded successfully');
    } catch (error) {
      this.logger.error(
        'Failed to load WebSocket module',
        'SolanaWebSocketService',
        {},
        error as Error,
      );
      throw error;
    }
  }

  async onModuleInit(): Promise<void> {
    await this.initializeWebSocket();
    this.connect();
    this.setupMonitoring();
    this.logger.log('Solana WebSocket service started');
  }

  onModuleDestroy(): void {
    this.disconnect();
    this.logger.log('Solana WebSocket service destroyed');
  }

  /**
   * Connect to Solana WebSocket
   */
  private connect(): void {
    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on('open', () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.logger.log('Connected to Solana WebSocket');
      });

      this.ws.on('message', (data: any) => {
        this.handleMessage(data);
      });

      this.ws.on('close', (code: number, reason: string) => {
        this.isConnected = false;
        this.logger.warn('Solana WebSocket disconnected', { code, reason });
        this.scheduleReconnect();
      });

      this.ws.on('error', (error: Error) => {
        this.logger.error('Solana WebSocket error', 'SolanaWebSocketService', {}, error);
        this.scheduleReconnect();
      });
    } catch (error) {
      this.logger.error(
        'Failed to connect to Solana WebSocket',
        'SolanaWebSocketService',
        {},
        error as Error,
      );
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from WebSocket
   */
  private disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error('Max reconnection attempts reached', 'SolanaWebSocketService', {
        attempts: this.reconnectAttempts,
      });
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000); // exponential backoff, max 30s
    this.reconnectAttempts++;

    this.logger.log(`Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: any): void {
    try {
      const dataString =
        typeof data === 'string'
          ? data
          : Buffer.isBuffer(data)
            ? data.toString()
            : JSON.stringify(data);
      const message = JSON.parse(dataString);

      switch (message.method) {
        case 'accountNotification':
          void this.handleAccountChange(message.params);
          break;
        case 'logsNotification':
          void this.handleProgramLog(message.params);
          break;
        case 'signatureNotification':
          void this.handleTransactionUpdate(message.params);
          break;
        case 'slotNotification':
          void this.handleSlotUpdate(message.params);
          break;
        default:
          this.logger.debug('Unknown WebSocket message', { method: message.method });
      }
    } catch (error) {
      this.logger.error(
        'Failed to parse WebSocket message',
        'SolanaWebSocketService',
        {},
        error as Error,
      );
    }
  }

  /**
   * Handle account change notifications
   */
  private handleAccountChange(params: any): void {
    try {
      const accountData: AccountChangeData = {
        account: params.result.value.pubkey,
        lamports: params.result.value.account.lamports,
        data: params.result.value.account.data[0],
        owner: params.result.value.account.owner,
        executable: params.result.value.account.executable,
        rentEpoch: params.result.value.account.rentEpoch,
      };

      // Log significant account changes
      void this.historicalDataLogger.logWebSocketEvent('chain-activity-change', {
        description: `Account ${accountData.account} changed`,
        account: accountData.account,
        lamports: accountData.lamports,
        owner: accountData.owner,
        trigger: 'account-change',
      });

      this.logger.debug('Account change detected', { account: accountData.account });
    } catch (error) {
      this.logger.error(
        'Failed to handle account change',
        'SolanaWebSocketService',
        {},
        error as Error,
      );
    }
  }

  /**
   * Handle program log notifications
   */
  private handleProgramLog(params: any): void {
    try {
      const logData: ProgramLogData = {
        programId: params.result.value.programId,
        logs: params.result.value.logs,
        signature: params.result.value.signature,
        err: params.result.value.err,
      };

      // Log program activity
      void this.historicalDataLogger.logWebSocketEvent('chain-activity-change', {
        description: `Program ${logData.programId} activity`,
        programId: logData.programId,
        signature: logData.signature,
        logsCount: logData.logs.length,
        hasError: !!logData.err,
        trigger: 'program-log',
      });

      this.logger.debug('Program log detected', { programId: logData.programId });
    } catch (error) {
      this.logger.error(
        'Failed to handle program log',
        'SolanaWebSocketService',
        {},
        error as Error,
      );
    }
  }

  /**
   * Handle transaction notifications
   */
  private handleTransactionUpdate(params: any): void {
    try {
      const txData: TransactionData = {
        signature: params.result.value.signature,
        slot: params.result.value.slot,
        err: params.result.value.err,
        meta: params.result.value.meta,
      };

      // Log transaction activity
      void this.historicalDataLogger.logWebSocketEvent('chain-activity-change', {
        description: `Transaction ${txData.signature} processed`,
        signature: txData.signature,
        slot: txData.slot,
        success: !txData.err,
        trigger: 'transaction',
      });

      this.logger.debug('Transaction processed', { signature: txData.signature });
    } catch (error) {
      this.logger.error(
        'Failed to handle transaction update',
        'SolanaWebSocketService',
        {},
        error as Error,
      );
    }
  }

  /**
   * Handle slot updates
   */
  private handleSlotUpdate(params: any): void {
    try {
      const slotData = {
        slot: params.result.slot,
        timestamp: new Date(),
      };

      // Log slot updates periodically (every 100 slots to avoid spam)
      if (slotData.slot % 100 === 0) {
        void this.historicalDataLogger.logWebSocketEvent('chain-activity-change', {
          description: `Slot ${slotData.slot} processed`,
          slot: slotData.slot,
          trigger: 'slot-update',
        });
      }

      this.logger.debug('Slot update', { slot: slotData.slot });
    } catch (error) {
      this.logger.error(
        'Failed to handle slot update',
        'SolanaWebSocketService',
        {},
        error as Error,
      );
    }
  }

  /**
   * Setup monitoring subscriptions
   */
  private setupMonitoring(): void {
    if (!this.isConnected || !this.ws) {
      this.logger.warn('WebSocket not connected, skipping monitoring setup');
      return;
    }

    try {
      // Monitor system program for general activity
      const systemProgramId = '11111111111111111111111111111111';
      this.subscribeToProgramLogs(systemProgramId);

      // Monitor token program for token activity
      const tokenProgramId = 'TokenkegQfeZyiNwAJbNbGKPF7WuQMiKCBKb6BqKf';
      this.subscribeToProgramLogs(tokenProgramId);

      // Monitor slot updates
      this.subscribeToSlotUpdates();

      this.logger.log('Solana monitoring subscriptions established');
    } catch (error) {
      this.logger.error('Failed to setup monitoring', 'SolanaWebSocketService', {}, error as Error);
    }
  }

  /**
   * Subscribe to program logs
   */
  private subscribeToProgramLogs(programId: string): void {
    if (!this.ws || !this.isConnected) return;

    const subscription = {
      jsonrpc: '2.0',
      id: `program-${programId}`,
      method: 'logsSubscribe',
      params: [
        {
          programId,
        },
        {
          commitment: 'confirmed',
        },
      ],
    };

    this.ws.send(JSON.stringify(subscription));
    this.subscriptions.set(`program-${programId}`, subscription);

    this.logger.log(`Subscribed to program logs: ${programId}`);
  }

  /**
   * Subscribe to slot updates
   */
  private subscribeToSlotUpdates(): void {
    if (!this.ws || !this.isConnected) return;

    const subscription = {
      jsonrpc: '2.0',
      id: 'slot-updates',
      method: 'slotSubscribe',
      params: [],
    };

    this.ws.send(JSON.stringify(subscription));
    this.subscriptions.set('slot-updates', subscription);

    this.logger.log('Subscribed to slot updates');
  }

  /**
   * Subscribe to account changes
   */
  subscribeToAccount(accountPubkey: string): void {
    if (!this.ws || !this.isConnected) {
      this.logger.warn('WebSocket not connected, cannot subscribe to account');
      return;
    }

    try {
      const subscription = {
        jsonrpc: '2.0',
        id: `account-${accountPubkey}`,
        method: 'accountSubscribe',
        params: [
          accountPubkey,
          {
            encoding: 'base64',
            commitment: 'confirmed',
          },
        ],
      };

      this.ws.send(JSON.stringify(subscription));
      this.subscriptions.set(`account-${accountPubkey}`, subscription);

      this.logger.log(`Subscribed to account changes: ${accountPubkey}`);
    } catch (error) {
      this.logger.error(
        'Failed to subscribe to account',
        'SolanaWebSocketService',
        { accountPubkey },
        error as Error,
      );
    }
  }

  /**
   * Get current connection status
   */
  getConnectionStatus(): { connected: boolean; subscriptions: number; reconnectAttempts: number } {
    return {
      connected: this.isConnected,
      subscriptions: this.subscriptions.size,
      reconnectAttempts: this.reconnectAttempts,
    };
  }

  /**
   * Get real-time chain activity metrics
   */
  async getChainActivityMetrics(): Promise<{
    transactionsPerSecond: number;
    averageSlotTime: number;
    activeAccounts: number;
    networkCongestion: number;
  }> {
    try {
      // Get recent performance samples
      const samples = await this.connection.getRecentPerformanceSamples(5);

      const avgSlotTime =
        samples.reduce((sum, sample) => sum + sample.samplePeriodSecs, 0) / samples.length;
      const transactionsPerSecond =
        samples.reduce((sum, sample) => sum + sample.numTransactions, 0) /
        samples.reduce((sum, sample) => sum + sample.samplePeriodSecs, 0);

      // Get current epoch info
      const epochInfo = await this.connection.getEpochInfo();

      // Calculate network congestion (simplified)
      const networkCongestion = Math.min(transactionsPerSecond / 1000, 1); // Normalize to 0-1

      return {
        transactionsPerSecond: Math.round(transactionsPerSecond * 100) / 100,
        averageSlotTime: Math.round(avgSlotTime * 1000) / 1000,
        activeAccounts: epochInfo.absoluteSlot || 0,
        networkCongestion: Math.round(networkCongestion * 100) / 100,
      };
    } catch (error) {
      this.logger.error(
        'Failed to get chain activity metrics',
        'SolanaWebSocketService',
        {},
        error as Error,
      );
      return {
        transactionsPerSecond: 0,
        averageSlotTime: 0,
        activeAccounts: 0,
        networkCongestion: 0,
      };
    }
  }
}
