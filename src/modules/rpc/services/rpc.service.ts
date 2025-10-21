import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosResponse } from 'axios';

import { AppLogger } from '~/common/services/app-logger.service';

@Injectable()
export class RpcService {
  private readonly logger: AppLogger;
  private readonly rpcEndpoint: string;
  private readonly apiKey: string;

  constructor(
    private readonly configService: ConfigService,
    logger: AppLogger,
  ) {
    this.logger = logger.forClass('RpcService');
    this.rpcEndpoint =
      this.configService.get<string>('rpc.endpoint') || 'https://api.mainnet-beta.solana.com';
    this.apiKey = this.configService.get<string>('rpc.apiKey') || '';

    this.logger.log('RPC service initialized', {
      endpoint: this.rpcEndpoint,
      hasApiKey: !!this.apiKey,
    });
  }

  /**
   * Forward RPC request to Solana Vibe Station
   */
  async forwardRpcRequest(
    method: string,
    params: any[] = [],
    requestId?: string | number,
  ): Promise<any> {
    const startTime = Date.now();

    try {
      this.logger.debug('Forwarding RPC request', {
        method,
        paramsCount: params.length,
        requestId,
      });

      const requestBody = {
        jsonrpc: '2.0',
        method,
        params,
        id: requestId || Date.now(),
      };

      const response: AxiosResponse = await axios.post(this.rpcEndpoint, requestBody, {
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey && { Authorization: this.apiKey }),
        },
        timeout: 30000, // 30 second timeout
      });

      const duration = Date.now() - startTime;

      this.logger.debug('RPC request completed', {
        method,
        duration: `${duration}ms`,
        status: response.status,
        requestId,
      });

      return response.data;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error(
        'RPC request failed',
        `Method: ${method}, Duration: ${duration}ms`,
        { method, params, requestId },
        error as Error,
      );

      // Return proper JSON-RPC error response
      return {
        jsonrpc: '2.0',
        error: {
          code: -32603, // Internal error
          message: 'RPC request failed',
          data: error.message,
        },
        id: requestId || Date.now(),
      };
    }
  }

  /**
   * Get RPC endpoint information
   */
  getEndpointInfo(): { endpoint: string; hasApiKey: boolean } {
    return {
      endpoint: this.rpcEndpoint,
      hasApiKey: !!this.apiKey,
    };
  }
}
