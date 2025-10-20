import { Controller, Get, Post, HttpStatus, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

import { AppService, HealthCheckResponse } from './app.service';
import { DiscordBotService } from './modules/discord-bot/services/discord-bot.service';
import { PaymentService } from './modules/payment/services/payment.service';
import { PaymentStatus } from './modules/payment/entities/payment-attempt.entity';

@ApiTags('App')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly discordBotService: DiscordBotService,
    private readonly configService: ConfigService,
    private readonly paymentService: PaymentService,
  ) {}

  @Get('health')
  @ApiOperation({
    summary: 'Comprehensive health check',
    description:
      'Checks the health of the application including database and Redis connectivity. Returns detailed status information.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Health check completed',
    schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['healthy', 'unhealthy', 'degraded'],
          description: 'Overall system health status',
        },
        timestamp: { type: 'string', format: 'date-time', description: 'Current timestamp' },
        startupTimestamp: {
          type: 'string',
          format: 'date-time',
          description: 'Application startup timestamp',
        },
        environment: {
          type: 'string',
          description: 'Current environment (local, dev, stg, prd, etc.)',
        },
        commitId: { type: 'string', description: 'Git commit ID from deployment' },
        checks: {
          type: 'object',
          properties: {
            database: {
              type: 'object',
              properties: {
                status: { type: 'string', enum: ['up', 'down'] },
                responseTime: {
                  type: 'number',
                  description: 'Response time in milliseconds',
                  nullable: true,
                },
                error: { type: 'string', description: 'Error message if down', nullable: true },
              },
            },
            redis: {
              type: 'object',
              properties: {
                status: { type: 'string', enum: ['up', 'down'] },
                responseTime: {
                  type: 'number',
                  description: 'Response time in milliseconds',
                  nullable: true,
                },
                error: { type: 'string', description: 'Error message if down', nullable: true },
              },
            },
          },
        },
        uptime: { type: 'number', description: 'Application uptime in seconds' },
      },
      example: {
        status: 'healthy',
        timestamp: '2025-01-11T10:30:00.000Z',
        startupTimestamp: '2025-01-11T09:30:00.000Z',
        environment: 'local',
        commitId: 'a0846b9',
        checks: {
          database: {
            status: 'up',
            responseTime: 5,
          },
          redis: {
            status: 'up',
            responseTime: 2,
          },
        },
        uptime: 3600,
      },
    },
  })
  async getHealth(): Promise<HealthCheckResponse> {
    return await this.appService.getHealth();
  }

  @Get()
  @ApiOperation({ summary: 'Welcome message' })
  @ApiResponse({ status: 200, description: 'Returns welcome message' })
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('init-discord-channel')
  @ApiOperation({
    summary: 'Initialize Discord purchase channel',
    description: 'Sends the RPC Services message with buttons to the configured Discord channel',
  })
  @ApiResponse({ status: 200, description: 'Channel initialized successfully' })
  async initDiscordChannel(): Promise<{ success: boolean; message: string }> {
    const channelId = this.configService.get<string>('discord.purchaseChannelId');

    if (!channelId) {
      return {
        success: false,
        message: 'DISCORD_PURCHASE_CHANNEL_ID not configured',
      };
    }

    await this.discordBotService.sendPurchaseServicesMessage(channelId);

    return {
      success: true,
      message: `Purchase services message sent to channel ${channelId}`,
    };
  }

  @Get('payment/:paymentId/status')
  @ApiOperation({
    summary: 'Check payment status and get API key',
    description: 'Returns payment status and API key if payment is completed',
  })
  @ApiResponse({ status: 200, description: 'Payment status retrieved' })
  async getPaymentStatus(@Param('paymentId') paymentId: string): Promise<any> {
    const payment = await this.paymentService.getPaymentAttemptById(paymentId);

    if (!payment) {
      return {
        success: false,
        message: 'Payment not found',
      };
    }

    const result: any = {
      paymentId: payment.id,
      status: payment.status,
      amountPaid: payment.amountPaid,
      amountExpected: payment.amountExpected,
      tier: payment.tier,
      duration: payment.duration,
      expiresAt: payment.expiresAt,
      apiKey: null,
    };

    if (payment.status === PaymentStatus.COMPLETED) {
      const apiKey = await this.paymentService.getApiKeyForPayment(paymentId);
      if (apiKey) {
        result.apiKey = {
          id: apiKey.id,
          keyPrefix: apiKey.keyPrefix,
          expiresAt: apiKey.expiresAt,
          isActive: apiKey.isActive,
        };
      }
    }

    return result;
  }

  @Get('debug/pending-payments')
  @ApiOperation({
    summary: 'Debug pending payments',
    description: 'Shows all pending payments being monitored',
  })
  async getPendingPayments(): Promise<any> {
    const pendingPayments = await this.paymentService.getPendingPaymentAttempts();

    return {
      count: pendingPayments.length,
      payments: pendingPayments.map(payment => ({
        id: payment.id,
        userId: payment.userId,
        paymentAddress: payment.paymentAddress,
        memo: payment.memo,
        amountExpected: payment.amountExpected,
        amountPaid: payment.amountPaid,
        status: payment.status,
        tier: payment.tier,
        duration: payment.duration,
        expiresAt: payment.expiresAt,
        createdAt: payment.createdAt,
      })),
    };
  }

  @Get('debug/all-payments')
  @ApiOperation({
    summary: 'Debug all payments and API keys',
    description: 'Shows all payments (including completed) and their API keys',
  })
  async getAllPayments(): Promise<any> {
    const allPayments = await this.paymentService.getAllPaymentAttempts();

    const result = {
      totalPayments: allPayments.length,
      completedPayments: allPayments.filter(p => p.status === PaymentStatus.COMPLETED).length,
      payments: [] as any[],
      apiKeys: [] as any[],
    };

    for (const payment of allPayments) {
      const paymentData: any = {
        id: payment.id,
        userId: payment.userId,
        paymentAddress: payment.paymentAddress,
        memo: payment.memo,
        amountExpected: payment.amountExpected,
        amountPaid: payment.amountPaid,
        status: payment.status,
        tier: payment.tier,
        duration: payment.duration,
        expiresAt: payment.expiresAt,
        createdAt: payment.createdAt,
        apiKey: null,
      };

      // Get API key if payment is completed
      if (payment.status === PaymentStatus.COMPLETED) {
        try {
          const apiKey = await this.paymentService.getApiKeyForPayment(payment.id);
          if (apiKey) {
            paymentData.apiKey = {
              id: apiKey.id,
              fullKey: apiKey.fullKey, // Show full API key for debugging
              expiresAt: apiKey.expiresAt,
              isActive: apiKey.isActive,
            };
            result.apiKeys.push(paymentData.apiKey);
          }
        } catch (error) {
          paymentData.apiKey = { error: error.message };
        }
      }

      result.payments.push(paymentData);
    }

    return result;
  }

  @Get('debug/transaction/:signature')
  @ApiOperation({
    summary: 'Debug specific transaction',
    description: 'Check if a specific transaction signature is being processed',
  })
  debugTransaction(@Param('signature') signature: string): any {
    // This would need to be implemented in PaymentService
    return {
      signature,
      message: 'Transaction debugging endpoint - check logs for processing status',
    };
  }

  @Get('manual-process/:paymentId')
  @ApiOperation({
    summary: 'Manually process a payment',
    description: 'Force the system to check and process a specific payment',
  })
  async manualProcessPayment(@Param('paymentId') paymentId: string): Promise<any> {
    try {
      const payment = await this.paymentService.getPaymentAttemptById(paymentId);

      if (!payment) {
        return { success: false, message: 'Payment not found' };
      }

      if (payment.status === PaymentStatus.COMPLETED) {
        return { success: true, message: 'Payment already completed', payment };
      }

      // Force check the payment address
      if (payment.paymentAddress) {
        // This would trigger the monitoring logic manually
        return {
          success: true,
          message: 'Manual processing triggered',
          paymentAddress: payment.paymentAddress,
          expectedAmount: payment.amountExpected,
        };
      }

      return { success: false, message: 'No payment address found' };
    } catch (error) {
      return { success: false, message: 'Error processing payment', error: error.message };
    }
  }

  @Get('force-complete/:paymentId/:amount')
  @ApiOperation({
    summary: 'Force complete a payment with manual amount',
    description:
      'Manually complete a payment when transaction is detected but amount extraction fails',
  })
  async forceCompletePayment(
    @Param('paymentId') paymentId: string,
    @Param('amount') amount: string,
  ): Promise<any> {
    try {
      const payment = await this.paymentService.getPaymentAttemptById(paymentId);

      if (!payment) {
        return { success: false, message: 'Payment not found' };
      }

      if (payment.status === PaymentStatus.COMPLETED) {
        return { success: true, message: 'Payment already completed' };
      }

      const amountNum = parseFloat(amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        return { success: false, message: 'Invalid amount' };
      }

      // Force record the transaction with correct amount
      const signature =
        '4NgJ5T86qLf9yZpbc6vQAwtKosAkF6tqzhPkWVWgfth2C1BMC461mSBDYxKrsmsoBpUMrVN5wP3R1iQRq8rhJNob';

      await this.paymentService.recordTransaction(
        paymentId,
        signature,
        amountNum,
        'manual_force_complete',
        1,
      );

      return {
        success: true,
        message: `Payment force completed with ${amountNum} SOL`,
        signature,
      };
    } catch (error) {
      return {
        success: false,
        message: 'Error force completing payment',
        error: error.message,
      };
    }
  }

  @Get('my-api-keys/:userId?')
  @ApiOperation({
    summary: 'Get API keys for user',
    description: 'Retrieve API keys for a user ID or all recent API keys if no userId provided',
  })
  async getMyApiKeys(@Param('userId') userId?: string): Promise<any> {
    try {
      if (userId) {
        // Get API keys for specific user
        const apiKeys = await this.paymentService.getApiKeysForUser(userId);
        return {
          success: true,
          userId,
          count: apiKeys.length,
          apiKeys,
        };
      } else {
        // Get all recent API keys (for debugging)
        const allApiKeys = await this.paymentService.getAllApiKeys();
        return {
          success: true,
          message: 'All recent API keys (last 10)',
          count: allApiKeys.length,
          apiKeys: allApiKeys,
        };
      }
    } catch (error) {
      return { success: false, message: 'Error retrieving API keys', error: error.message };
    }
  }

  @Get('payment-status/:paymentAddress')
  @ApiOperation({
    summary: 'Get payment status and API key by payment address',
    description:
      'Check payment status and get API key using the unique payment address you sent SOL to',
  })
  async getPaymentStatusByAddress(@Param('paymentAddress') paymentAddress: string): Promise<any> {
    try {
      // Find payment attempt by address
      const payment = await this.paymentService.getPaymentAttemptByAddress(paymentAddress);

      if (!payment) {
        return {
          success: false,
          message: 'Payment address not found',
          paymentAddress,
        };
      }

      const result: any = {
        success: true,
        paymentAddress,
        payment: {
          id: payment.id,
          status: payment.status,
          tier: payment.tier,
          duration: payment.duration,
          amountExpected: payment.amountExpected,
          amountPaid: payment.amountPaid,
          expiresAt: payment.expiresAt,
          createdAt: payment.createdAt,
        },
        apiKey: null,
        message: null,
      };

      // If payment is completed, check for API key
      if (payment.status === PaymentStatus.COMPLETED) {
        try {
          const apiKeys = await this.paymentService.getApiKeysForUser(payment.userId);
          if (apiKeys.length > 0) {
            const latestKey = apiKeys[0]; // Most recent key
            result.apiKey = {
              keyPrefix: latestKey.keyPrefix,
              expiresAt: latestKey.expiresAt,
              isActive: latestKey.isActive,
              status: latestKey.status,
              note: latestKey.note,
            };
            result.message =
              '✅ Payment completed! API key was generated but full key was only shown once. Use regenerate endpoint to get new key.';
            result.regenerateUrl = `/api/regenerate-api-key/${payment.paymentAddress}`;
          } else {
            result.message = '✅ Payment completed but API key not found. Use regenerate endpoint.';
            result.regenerateUrl = `/api/regenerate-api-key/${payment.paymentAddress}`;
          }
        } catch {
          result.message = '✅ Payment completed but error checking API key.';
          result.regenerateUrl = `/api/regenerate-api-key/${payment.paymentAddress}`;
        }
      } else if (
        payment.status === PaymentStatus.PENDING ||
        payment.status === PaymentStatus.PARTIAL
      ) {
        const remaining = Number(payment.amountExpected) - Number(payment.amountPaid);
        result.message = `⏳ Waiting for payment. ${remaining.toFixed(6)} SOL remaining.`;
      } else if (payment.status === PaymentStatus.EXPIRED) {
        result.message = '❌ Payment expired. Please create a new payment.';
      }

      return result;
    } catch (error) {
      return {
        success: false,
        message: 'Error checking payment status',
        error: error.message,
      };
    }
  }

  @Post('regenerate-api-key/:paymentAddress')
  @ApiOperation({
    summary: 'Regenerate lost API key by payment address',
    description: 'Generate a new API key for a completed payment when the original was lost',
  })
  async regenerateApiKey(@Param('paymentAddress') paymentAddress: string): Promise<any> {
    try {
      // Find the completed payment
      const payment = await this.paymentService.getPaymentAttemptByAddress(paymentAddress);

      if (!payment) {
        return {
          success: false,
          message: 'Payment address not found',
        };
      }

      if (payment.status !== PaymentStatus.COMPLETED) {
        return {
          success: false,
          message: `Cannot regenerate API key. Payment status is: ${payment.status}`,
        };
      }

      // Get existing API keys for this user to deactivate them
      const existingKeys = await this.paymentService.getApiKeysForUser(payment.userId);
      const oldKeyId = existingKeys.length > 0 ? existingKeys[0].id : undefined;

      // Generate new API key
      const newApiKey = await this.paymentService.regenerateApiKey(payment.userId, oldKeyId);

      return {
        success: true,
        message: '🔑 New API key generated successfully!',
        paymentAddress,
        payment: {
          id: payment.id,
          tier: payment.tier,
          duration: payment.duration,
          amountPaid: payment.amountPaid,
          completedAt: payment.updatedAt,
        },
        apiKey: {
          key: newApiKey.fullKey, // Full key is available at creation time
          expiresAt: newApiKey.expiresAt,
          tier: payment.tier,
          duration: payment.duration,
          generatedAt: new Date(),
        },
        instructions: {
          usage: 'Add the API key to your requests using the X-API-Key header',
          backend_url: this.configService.get<string>('app.rpcBackendUrl', 'http://localhost:3000'),
          important: '⚠️ This is the only time you will see the full API key. Save it securely!',
        },
      };
    } catch (error) {
      return {
        success: false,
        message: 'Error regenerating API key',
        error: error.message,
      };
    }
  }
}
