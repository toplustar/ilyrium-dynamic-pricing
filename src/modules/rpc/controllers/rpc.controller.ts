import {
  Controller,
  Post,
  Body,
  Headers,
  Req,
  Res,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Repository, MoreThan, MoreThanOrEqual } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';

import { AppLogger } from '~/common/services/app-logger.service';
import { TierBasedRateLimitGuard } from '~/common/guards/tier-based-rate-limit.guard';
import { UsageMetrics } from '~/modules/pricing/entities/usage-metrics.entity';
import { Purchase } from '~/modules/pricing/entities/purchase.entity';

import { RpcService } from '../services/rpc.service';

interface RpcRequest {
  jsonrpc: string;
  method: string;
  params?: any[];
  id?: string | number;
}

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    apiKeyId: string;
  };
}

@ApiTags('RPC')
@Controller('rpc')
export class RpcController {
  constructor(
    private readonly rpcService: RpcService,
    @InjectRepository(UsageMetrics)
    private readonly usageMetricsRepository: Repository<UsageMetrics>,
    @InjectRepository(Purchase)
    private readonly purchaseRepository: Repository<Purchase>,
    private readonly logger: AppLogger,
  ) {
    this.logger = logger.forClass('RpcController');
  }

  @Post()
  @UseGuards(TierBasedRateLimitGuard)
  @ApiOperation({
    summary: 'Solana RPC Proxy',
    description:
      'Forward Solana RPC requests to Solana Vibe Station with API key authentication and rate limiting',
  })
  @ApiHeader({
    name: 'X-API-Key',
    description: 'API key for authentication',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'RPC response from Solana Vibe Station',
    schema: {
      type: 'object',
      properties: {
        jsonrpc: { type: 'string', example: '2.0' },
        result: { type: 'any' },
        id: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or missing API key',
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded',
  })
  async handleRpcRequest(
    @Body() body: RpcRequest,
    @Headers('x-api-key') _apiKey: string,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    try {
      if (!body.jsonrpc || body.jsonrpc !== '2.0') {
        throw new HttpException('Invalid JSON-RPC format', HttpStatus.BAD_REQUEST);
      }

      if (!body.method) {
        throw new HttpException('Method is required', HttpStatus.BAD_REQUEST);
      }

      if (!req.user) {
        throw new HttpException('Authentication required', HttpStatus.UNAUTHORIZED);
      }

      this.logger.log('Processing RPC request', {
        method: body.method,
        userId: req.user.userId,
        apiKeyId: req.user.apiKeyId,
        requestId: body.id,
      });

      const response = await this.rpcService.forwardRpcRequest(
        body.method,
        body.params || [],
        body.id,
      );

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('X-RPC-Provider', 'Solana Vibe Station');
      res.setHeader('X-User-ID', req.user.userId);

      res.status(200).json(response);

      // Track usage metrics
      await this.trackUsage(req.user.userId, req.user.apiKeyId, body.method);
    } catch (error) {
      this.logger.error(
        'RPC request failed',
        `Method: ${body.method}`,
        {
          method: body.method,
          userId: req.user?.userId,
          error: error.message,
        },
        error as Error,
      );

      const errorResponse = {
        jsonrpc: '2.0',
        error: {
          code: error.status || -32603,
          message: error.message || 'Internal server error',
        },
        id: body.id || Date.now(),
      };

      res.status(error.status || 500).json(errorResponse);
    }
  }

  @Post('health')
  @ApiOperation({
    summary: 'RPC Health Check',
    description: 'Check if the RPC service is healthy and accessible',
  })
  @ApiResponse({
    status: 200,
    description: 'RPC service is healthy',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'healthy' },
        endpoint: { type: 'string' },
        timestamp: { type: 'string' },
      },
    },
  })
  healthCheck(@Res() res: Response): void {
    try {
      const endpointInfo = this.rpcService.getEndpointInfo();

      const healthResponse = {
        status: 'healthy',
        endpoint: endpointInfo.endpoint,
        hasApiKey: endpointInfo.hasApiKey,
        timestamp: new Date().toISOString(),
      };

      res.status(200).json(healthResponse);
    } catch (error) {
      this.logger.error('Health check failed', 'RPC health check', {}, error as Error);

      res.status(500).json({
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Track usage metrics for analytics
   */
  private async trackUsage(userId: string, apiKeyId: string, method: string): Promise<void> {
    try {
      // Get the user's wallet address from their active purchase
      const activePurchase = await this.purchaseRepository.findOne({
        where: {
          userId,
          isActive: true,
          expiresAt: MoreThan(new Date()),
        },
        order: { createdAt: 'DESC' },
      });

      if (!activePurchase) {
        this.logger.warn('No active purchase found for user', { userId });
        return;
      }

      // Check if there's already a usage metric record for today
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const existingMetric = await this.usageMetricsRepository.findOne({
        where: {
          walletAddress: activePurchase.walletAddress,
          endpoint: method,
          createdAt: MoreThanOrEqual(today),
        },
      });

      if (existingMetric) {
        // Update existing record
        existingMetric.requestCount += 1;
        await this.usageMetricsRepository.save(existingMetric);
      } else {
        // Create new record
        const usageMetric = this.usageMetricsRepository.create({
          apiKeyId,
          walletAddress: activePurchase.walletAddress,
          requestCount: 1,
          endpoint: method,
        });
        await this.usageMetricsRepository.save(usageMetric);
      }

      this.logger.debug('Usage tracked', {
        userId,
        walletAddress: activePurchase.walletAddress,
        method,
        apiKeyId,
      });
    } catch (error) {
      this.logger.error(
        'Failed to track usage',
        'RpcController',
        { userId, method },
        error as Error,
      );
    }
  }
}
