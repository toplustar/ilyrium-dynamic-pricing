import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

import { AppService, HealthCheckResponse } from './app.service';
import { DiscordBotService } from './modules/discord-bot/services/discord-bot.service';

@ApiTags('App')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly discordBotService: DiscordBotService,
    private readonly configService: ConfigService,
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
}
