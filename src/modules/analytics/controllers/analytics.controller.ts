import { Controller, Get, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam } from '@nestjs/swagger';

import { AppLogger } from '~/common/services/app-logger.service';
import { AnalyticsService } from '../services/analytics.service';

export interface AnalyticsResponseDto {
  nodeUsage: {
    timestamp: Date;
    totalRequests: number;
    activeUsers: number;
    averageRps: number;
    peakRps: number;
    totalRpsAllocated: number;
    utilizationPercentage: number;
    topEndpoints: Array<{ endpoint: string; requests: number }>;
  };
  priceTrend: {
    timestamp: Date;
    currentPrice: number;
    utilization: number;
    onChainActivity: number;
    tierPrices: Array<{ tier: string; price: number }>;
  };
  revenue: {
    daily: number;
    weekly: number;
    monthly: number;
  };
  userStats: {
    totalActiveUsers: number;
    newUsersToday: number;
    averageSessionDuration: number;
  };
}

export interface HistoricalDataResponseDto {
  nodeUsage: Array<{
    timestamp: Date;
    totalRequests: number;
    activeUsers: number;
    averageRps: number;
    peakRps: number;
    utilizationPercentage: number;
  }>;
  priceTrend: Array<{
    timestamp: Date;
    currentPrice: number;
    utilization: number;
    onChainActivity: number;
  }>;
}

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly logger: AppLogger,
  ) {
    this.logger = logger.forClass('AnalyticsController');
  }

  @Get('current')
  @ApiOperation({
    summary: 'Get current system analytics',
    description:
      'Returns real-time analytics data including node usage, pricing, revenue, and user statistics',
  })
  @ApiResponse({
    status: 200,
    description: 'Current analytics data',
    schema: {
      type: 'object',
      properties: {
        nodeUsage: {
          type: 'object',
          properties: {
            timestamp: { type: 'string', format: 'date-time' },
            totalRequests: { type: 'number' },
            activeUsers: { type: 'number' },
            averageRps: { type: 'number' },
            peakRps: { type: 'number' },
            totalRpsAllocated: { type: 'number' },
            utilizationPercentage: { type: 'number' },
            topEndpoints: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  endpoint: { type: 'string' },
                  requests: { type: 'number' },
                },
              },
            },
          },
        },
        priceTrend: {
          type: 'object',
          properties: {
            timestamp: { type: 'string', format: 'date-time' },
            currentPrice: { type: 'number' },
            utilization: { type: 'number' },
            onChainActivity: { type: 'number' },
            tierPrices: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  tier: { type: 'string' },
                  price: { type: 'number' },
                },
              },
            },
          },
        },
        revenue: {
          type: 'object',
          properties: {
            daily: { type: 'number' },
            weekly: { type: 'number' },
            monthly: { type: 'number' },
          },
        },
        userStats: {
          type: 'object',
          properties: {
            totalActiveUsers: { type: 'number' },
            newUsersToday: { type: 'number' },
            averageSessionDuration: { type: 'number' },
          },
        },
      },
    },
  })
  async getCurrentAnalytics(): Promise<AnalyticsResponseDto> {
    try {
      const analytics = await this.analyticsService.getSystemAnalytics();

      this.logger.log('Current analytics requested');

      return analytics;
    } catch (error) {
      this.logger.error(
        'Failed to get current analytics',
        'AnalyticsController',
        {},
        error as Error,
      );
      throw error;
    }
  }

  @Get('historical')
  @ApiOperation({
    summary: 'Get historical analytics data',
    description: 'Returns historical analytics data for charting and trend analysis',
  })
  @ApiQuery({
    name: 'hours',
    description: 'Number of hours to retrieve data for (default: 24)',
    required: false,
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: 'Historical analytics data',
    schema: {
      type: 'object',
      properties: {
        nodeUsage: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              timestamp: { type: 'string', format: 'date-time' },
              totalRequests: { type: 'number' },
              activeUsers: { type: 'number' },
              averageRps: { type: 'number' },
              peakRps: { type: 'number' },
              utilizationPercentage: { type: 'number' },
            },
          },
        },
        priceTrend: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              timestamp: { type: 'string', format: 'date-time' },
              currentPrice: { type: 'number' },
              utilization: { type: 'number' },
              onChainActivity: { type: 'number' },
            },
          },
        },
      },
    },
  })
  async getHistoricalData(@Query('hours') hours: number = 24): Promise<HistoricalDataResponseDto> {
    try {
      const historicalData = await this.analyticsService.getHistoricalData(hours);

      this.logger.log('Historical analytics requested', { hours });

      return historicalData;
    } catch (error) {
      this.logger.error(
        'Failed to get historical analytics',
        'AnalyticsController',
        { hours },
        error as Error,
      );
      throw error;
    }
  }

  @Get('node-usage')
  @ApiOperation({
    summary: 'Get node usage metrics',
    description:
      'Returns detailed node usage metrics including RPS, utilization, and endpoint statistics',
  })
  @ApiQuery({
    name: 'startTime',
    description: 'Start time for the metrics (ISO string)',
    required: false,
    type: String,
  })
  @ApiQuery({
    name: 'endTime',
    description: 'End time for the metrics (ISO string)',
    required: false,
    type: String,
  })
  async getNodeUsage(
    @Query('startTime') startTime?: string,
    @Query('endTime') endTime?: string,
  ): Promise<any> {
    try {
      const end = endTime ? new Date(endTime) : new Date();
      const start = startTime ? new Date(startTime) : new Date(end.getTime() - 60 * 60 * 1000);

      const nodeUsage = await this.analyticsService.getNodeUsageMetrics(start, end);

      this.logger.log('Node usage metrics requested', { startTime, endTime });

      return nodeUsage;
    } catch (error) {
      this.logger.error(
        'Failed to get node usage metrics',
        'AnalyticsController',
        { startTime, endTime },
        error as Error,
      );
      throw error;
    }
  }

  @Get('price-trend')
  @ApiOperation({
    summary: 'Get price trend data',
    description: 'Returns current pricing information and trends',
  })
  async getPriceTrend(): Promise<any> {
    try {
      const priceTrend = await this.analyticsService.getPriceTrendData();

      this.logger.log('Price trend data requested');

      return priceTrend;
    } catch (error) {
      this.logger.error(
        'Failed to get price trend data',
        'AnalyticsController',
        {},
        error as Error,
      );
      throw error;
    }
  }

  @Get('revenue')
  @ApiOperation({
    summary: 'Get revenue metrics',
    description: 'Returns revenue statistics for daily, weekly, and monthly periods',
  })
  async getRevenueMetrics(): Promise<any> {
    try {
      const revenue = await this.analyticsService.getRevenueMetrics();

      this.logger.log('Revenue metrics requested');

      return revenue;
    } catch (error) {
      this.logger.error('Failed to get revenue metrics', 'AnalyticsController', {}, error as Error);
      throw error;
    }
  }

  @Get('user-stats')
  @ApiOperation({
    summary: 'Get user statistics',
    description: 'Returns user statistics including active users and new registrations',
  })
  async getUserStats(): Promise<any> {
    try {
      const userStats = await this.analyticsService.getUserStats();

      this.logger.log('User stats requested');

      return userStats;
    } catch (error) {
      this.logger.error('Failed to get user stats', 'AnalyticsController', {}, error as Error);
      throw error;
    }
  }

  @Get('dashboard')
  @ApiOperation({
    summary: 'Get analytics dashboard data',
    description: 'Returns comprehensive dashboard data for web interface',
  })
  async getDashboard(): Promise<any> {
    try {
      const analytics = await this.analyticsService.getSystemAnalytics();
      const historicalData = await this.analyticsService.getHistoricalData(24);

      const dashboard = {
        current: analytics,
        historical: historicalData,
        alerts: [],
        lastUpdated: new Date(),
      };

      this.logger.log('Dashboard data requested');

      return dashboard;
    } catch (error) {
      this.logger.error('Failed to get dashboard data', 'AnalyticsController', {}, error as Error);
      throw error;
    }
  }

  @Get('export/:format')
  @ApiOperation({
    summary: 'Export analytics data',
    description: 'Export analytics data in various formats (JSON, CSV)',
  })
  @ApiParam({
    name: 'format',
    description: 'Export format (json, csv)',
    enum: ['json', 'csv'],
  })
  @ApiQuery({
    name: 'hours',
    description: 'Number of hours to export (default: 24)',
    required: false,
    type: Number,
  })
  async exportData(
    @Param('format') format: 'json' | 'csv',
    @Query('hours') hours: number = 24,
  ): Promise<any> {
    try {
      const historicalData = await this.analyticsService.getHistoricalData(hours);

      if (format === 'csv') {
        // Convert to CSV format
        const csvData = this.convertToCSV(historicalData);
        return {
          data: csvData,
          contentType: 'text/csv',
          filename: `analytics-${new Date().toISOString().split('T')[0]}.csv`,
        };
      }

      // Return JSON format
      return {
        data: historicalData,
        contentType: 'application/json',
        filename: `analytics-${new Date().toISOString().split('T')[0]}.json`,
      };
    } catch (error) {
      this.logger.error(
        'Failed to export analytics data',
        'AnalyticsController',
        { format, hours },
        error as Error,
      );
      throw error;
    }
  }

  /**
   * Convert historical data to CSV format
   */
  private convertToCSV(data: HistoricalDataResponseDto): string {
    const headers = [
      'Timestamp',
      'Total Requests',
      'Active Users',
      'Average RPS',
      'Peak RPS',
      'Utilization %',
      'Current Price',
      'On-Chain Activity',
    ];

    const rows = data.nodeUsage.map((usage, index) => {
      const priceData = data.priceTrend[index] || data.priceTrend[data.priceTrend.length - 1];
      return [
        usage.timestamp.toISOString(),
        usage.totalRequests,
        usage.activeUsers,
        usage.averageRps,
        usage.peakRps,
        usage.utilizationPercentage,
        priceData?.currentPrice || 0,
        priceData?.onChainActivity || 0,
      ];
    });

    return [headers, ...rows].map(row => row.join(',')).join('\n');
  }
}
