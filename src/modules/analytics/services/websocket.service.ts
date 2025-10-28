import { Injectable, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Cron, CronExpression } from '@nestjs/schedule';

import { AppLogger } from '~/common/services/app-logger.service';
import { AnalyticsService, SystemAnalytics } from './analytics.service';

export interface AnalyticsClient {
  socket: Socket;
  userId?: string;
  subscribedChannels: Set<string>;
}

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: '/analytics',
})
export class WebSocketService implements OnModuleInit, OnModuleDestroy {
  @WebSocketServer()
  server: Server;

  private readonly logger: AppLogger;
  private readonly clients: Map<string, AnalyticsClient> = new Map();

  constructor(
    @Inject(forwardRef(() => AnalyticsService))
    private readonly analyticsService: AnalyticsService,
    logger: AppLogger,
  ) {
    this.logger = logger.forClass('WebSocketService');
  }

  onModuleInit(): void {
    this.logger.log('WebSocket service initialized');
  }

  onModuleDestroy(): void {
    this.logger.log('WebSocket service destroyed');
  }

  /**
   * Handle client connections
   */
  handleConnection(client: Socket): void {
    const clientId = client.id;
    this.clients.set(clientId, {
      socket: client,
      subscribedChannels: new Set(),
    });

    this.logger.log('Client connected', { clientId });

    // Send initial data
    void this.sendAnalyticsToClient(clientId);
  }

  /**
   * Handle client disconnections
   */
  handleDisconnect(client: Socket): void {
    const clientId = client.id;
    this.clients.delete(clientId);
    this.logger.log('Client disconnected', { clientId });
  }

  /**
   * Subscribe to analytics channels
   */
  @SubscribeMessage('subscribe')
  handleSubscribe(@MessageBody() data: { channels: string[]; userId?: string }): void {
    const clientId = 'anonymous';
    const client = this.clients.get(clientId);
    if (!client) return;

    data.channels.forEach(channel => {
      client.subscribedChannels.add(channel);
    });

    if (data.userId) {
      client.userId = data.userId;
    }

    this.logger.log('Client subscribed to channels', {
      clientId: client.socket.id,
      channels: data.channels,
      userId: data.userId,
    });

    void this.sendAnalyticsToClient(client.socket.id);
  }

  /**
   * Unsubscribe from analytics channels
   */
  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(@MessageBody() data: { channels: string[] }): void {
    const clientId = 'anonymous';
    const client = this.clients.get(clientId);
    if (!client) return;

    data.channels.forEach(channel => {
      client.subscribedChannels.delete(channel);
    });

    this.logger.log('Client unsubscribed from channels', {
      clientId: client.socket.id,
      channels: data.channels,
    });
  }

  /**
   * Send analytics data to all connected clients every minute
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async broadcastAnalytics(): Promise<void> {
    try {
      const analytics = await this.analyticsService.getSystemAnalytics();

      this.clients.forEach(client => {
        void this.sendAnalyticsToClient(client.socket.id, analytics);
      });

      this.logger.debug('Analytics broadcasted to clients', {
        clientCount: this.clients.size,
        timestamp: analytics.nodeUsage.timestamp,
      });
    } catch (error) {
      this.logger.error('Failed to broadcast analytics', 'WebSocketService', {}, error as Error);
    }
  }

  /**
   * Send analytics data to a specific client
   */
  private async sendAnalyticsToClient(
    clientId: string,
    analytics?: SystemAnalytics,
  ): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      const data = analytics || (await this.analyticsService.getSystemAnalytics());

      const payload: any = {
        timestamp: data.nodeUsage.timestamp,
      };

      if (client.subscribedChannels.has('nodeUsage')) {
        payload.nodeUsage = data.nodeUsage;
      }

      if (client.subscribedChannels.has('priceTrend')) {
        payload.priceTrend = data.priceTrend;
      }

      if (client.subscribedChannels.has('revenue')) {
        payload.revenue = data.revenue;
      }

      if (client.subscribedChannels.has('userStats')) {
        payload.userStats = data.userStats;
      }

      client.socket.emit('analytics', payload);
    } catch (error) {
      this.logger.error(
        'Failed to send analytics to client',
        'WebSocketService',
        { clientId },
        error as Error,
      );
    }
  }

  /**
   * Send real-time usage update
   */
  sendUsageUpdate(update: {
    userId: string;
    endpoint: string;
    requestCount: number;
    timestamp: Date;
  }): void {
    const payload = {
      type: 'usageUpdate',
      data: update,
    };

    this.clients.forEach(client => {
      if (
        client.subscribedChannels.has('realtime') ||
        (client.userId && client.userId === update.userId)
      ) {
        client.socket.emit('realtimeUpdate', payload);
      }
    });

    this.logger.debug('Usage update sent', { update });
  }

  /**
   * Send price alert
   */
  sendPriceAlert(alert: {
    type: 'price_spike' | 'price_drop' | 'high_utilization';
    message: string;
    data: any;
  }): void {
    const payload = {
      type: 'priceAlert',
      data: alert,
      timestamp: new Date(),
    };

    this.clients.forEach(client => {
      if (client.subscribedChannels.has('alerts')) {
        client.socket.emit('alert', payload);
      }
    });

    this.logger.log('Price alert sent', { alert });
  }

  /**
   * Get connected clients count
   */
  getConnectedClientsCount(): number {
    return this.clients.size;
  }

  /**
   * Get clients by user ID
   */
  getClientsByUserId(userId: string): AnalyticsClient[] {
    return Array.from(this.clients.values()).filter(client => client.userId === userId);
  }
}
