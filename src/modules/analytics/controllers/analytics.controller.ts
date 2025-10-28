import { Controller, Get, Query, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam } from '@nestjs/swagger';

import { AppLogger } from '~/common/services/app-logger.service';
import { AnalyticsService } from '../services/analytics.service';
import { DiscordAnalyticsService } from '../services/discord-analytics.service';
import { HistoricalDataLogger } from '../services/historical-data-logger.service';

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
    private readonly discordAnalyticsService: DiscordAnalyticsService,
    private readonly historicalDataLogger: HistoricalDataLogger,
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

  @Get('send-charts')
  @ApiOperation({
    summary: 'Send analytics charts to Discord',
    description: 'Manually trigger sending analytics charts to Discord channel',
  })
  async sendChartsToDiscord(): Promise<{ message: string; success: boolean }> {
    try {
      await this.discordAnalyticsService.sendAnalyticsWithCharts();

      this.logger.log('Charts sent to Discord successfully');

      return {
        message: 'Charts sent to Discord successfully',
        success: true,
      };
    } catch (error) {
      this.logger.error(
        'Failed to send charts to Discord',
        'AnalyticsController',
        {},
        error as Error,
      );
      throw error;
    }
  }

  @Get('price-demand-chart')
  @ApiOperation({
    summary: 'Generate price and demand history chart',
    description: 'Generate a visual chart showing price and demand trends from system_events table',
  })
  @ApiQuery({
    name: 'hours',
    description: 'Number of hours to show (default: 24)',
    required: false,
    type: Number,
  })
  @ApiQuery({
    name: 'width',
    description: 'Chart width in pixels (default: 800)',
    required: false,
    type: Number,
  })
  @ApiQuery({
    name: 'height',
    description: 'Chart height in pixels (default: 400)',
    required: false,
    type: Number,
  })
  async generatePriceDemandChart(
    @Query('hours') hours: number = 24,
    @Query('width') width: number = 800,
    @Query('height') height: number = 400,
  ): Promise<any> {
    try {
      const events = await this.historicalDataLogger.getHistoricalEvents(hours);
      const priceEvents = events.filter((event: any) => event.priceData);

      if (priceEvents.length === 0) {
        return this.generateEmptyChartResponse(width, height);
      }

      const sampledEvents = this.sampleEvents(priceEvents);
      const chartData = this.extractChartData(sampledEvents);
      const chartConfig = this.buildChartConfig(chartData, hours);
      const chartUrl = await this.generateShortChartUrl(chartConfig, width, height);

      this.logger.log('Price and demand chart generated', {
        hours,
        dataPoints: priceEvents.length,
        urlLength: chartUrl.length,
      });

      return this.buildChartResponse(chartUrl, priceEvents.length, hours, chartData);
    } catch (error) {
      this.logger.error(
        'Failed to generate price and demand chart',
        'AnalyticsController',
        { hours },
        error as Error,
      );
      throw error;
    }
  }

  /**
   * Sample events to limit data points
   */
  private sampleEvents(events: any[]): any[] {
    const maxDataPoints = 20;
    const step = Math.ceil(events.length / maxDataPoints);
    return events.filter((_, index) => index % step === 0);
  }

  /**
   * Extract chart data from sampled events
   */
  private extractChartData(sampledEvents: any[]): {
    labels: string[];
    prices: number[];
    utilization: number[];
    onChainActivity: number[];
  } {
    const labels = sampledEvents.map((event: any) => {
      const date = new Date(event.timestamp);
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    });

    const prices = sampledEvents.map((event: any) => event.priceData.currentPrice * 1000);
    const utilization = sampledEvents.map((event: any) => event.priceData.utilization * 100);
    const onChainActivity = sampledEvents.map(
      (event: any) => event.priceData.onChainActivity * 100,
    );

    return { labels, prices, utilization, onChainActivity };
  }

  /**
   * Build chart configuration
   */
  private buildChartConfig(
    chartData: {
      labels: string[];
      prices: number[];
      utilization: number[];
      onChainActivity: number[];
    },
    hours: number,
  ): any {
    return {
      type: 'line',
      data: {
        labels: chartData.labels,
        datasets: [
          {
            label: 'Price (×10⁻³ SOL)',
            data: chartData.prices,
            borderColor: 'rgb(255, 159, 64)',
            backgroundColor: 'rgba(255, 159, 64, 0.1)',
            borderWidth: 3,
            tension: 0.4,
            fill: true,
            yAxisID: 'y',
          },
          {
            label: 'Demand (Utilization %)',
            data: chartData.utilization,
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            fill: false,
            yAxisID: 'y1',
          },
          {
            label: 'On-Chain Activity %',
            data: chartData.onChainActivity,
            borderColor: 'rgb(153, 102, 255)',
            backgroundColor: 'rgba(153, 102, 255, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            fill: false,
            yAxisID: 'y1',
          },
        ],
      },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          title: { display: true, text: `Price & Demand (${hours}h)` },
          legend: { display: true, position: 'top' },
        },
        scales: {
          x: { display: true, title: { display: true, text: 'Time' } },
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: { display: true, text: 'Price (×10⁻³ SOL)' },
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: { display: true, text: '%' },
            grid: { drawOnChartArea: false },
          },
        },
      },
    };
  }

  /**
   * Build chart response with statistics and explanation
   */
  private buildChartResponse(
    chartUrl: string,
    dataPoints: number,
    hours: number,
    chartData: { prices: number[]; utilization: number[] },
  ): any {
    const { prices, utilization } = chartData;
    return {
      chartUrl,
      imageUrl: chartUrl,
      dataPoints,
      timeRange: `${hours} hours`,
      explanation: {
        title: 'Understanding Your Dynamic Pricing Chart',
        description: 'This chart shows how price changes based on demand over time',
        lines: {
          orangeLine: {
            name: 'Price (×10⁻³ SOL)',
            meaning:
              'Price per RPS multiplied by 1000 for better visibility. Divide by 1000 to get actual SOL price',
            leftAxis: true,
            note: 'Example: Chart shows 5.862 → Actual price is 0.005862 SOL',
          },
          cyanLine: {
            name: 'Demand/Utilization',
            meaning: 'How much of the system capacity is being used (%)',
            rightAxis: true,
          },
          purpleLine: {
            name: 'On-Chain Activity',
            meaning: 'Solana blockchain activity level (%)',
            rightAxis: true,
          },
        },
        howItWorks: [
          '📈 When demand (cyan) goes UP → Price (orange) increases',
          '📉 When demand (cyan) goes DOWN → Price (orange) decreases',
          '⛓️ On-chain activity (purple) affects the baseline price',
          '⚡ Real-time adjustments based on actual usage',
        ],
      },
      statistics: {
        currentPrice: ((prices[prices.length - 1] || 0) / 1000).toFixed(6),
        averagePrice: (
          prices.reduce((a: number, b: number) => a + b, 0) /
          prices.length /
          1000
        ).toFixed(6),
        minPrice: (Math.min(...prices) / 1000).toFixed(6),
        maxPrice: (Math.max(...prices) / 1000).toFixed(6),
        currentPriceScaled: (prices[prices.length - 1] || 0).toFixed(3),
        averagePriceScaled: (
          prices.reduce((a: number, b: number) => a + b, 0) / prices.length
        ).toFixed(3),
        currentDemand: (utilization[utilization.length - 1] || 0).toFixed(1),
        averageDemand: (
          utilization.reduce((a: number, b: number) => a + b, 0) / utilization.length
        ).toFixed(1),
        note: 'Scaled prices are multiplied by 1000 for chart visibility',
      },
      message: 'Chart generated successfully - Copy the chartUrl to share!',
    };
  }

  /**
   * Generate empty chart response
   */
  private generateEmptyChartResponse(width: number, height: number): any {
    return {
      chartUrl: this.generateEmptyPriceDemandChart(width, height),
      message: 'No historical data available',
      dataPoints: 0,
    };
  }

  /**
   * Generate short URL for chart using QuickChart.io's short URL service
   */
  private async generateShortChartUrl(
    chartConfig: any,
    width: number,
    height: number,
  ): Promise<string> {
    try {
      const minimalConfig = {
        type: chartConfig.type,
        data: {
          labels: chartConfig.data.labels,
          datasets: chartConfig.data.datasets.map((ds: any) => ({
            label: ds.label,
            data: ds.data,
            borderColor: ds.borderColor,
            borderWidth: 2,
            fill: false,
          })),
        },
        options: {
          plugins: { legend: { display: true } },
          scales: {
            y: { display: true },
            y1: { display: true, position: 'right' },
          },
        },
      };

      const response = await fetch('https://quickchart.io/chart/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chart: minimalConfig,
          width,
          height,
          format: 'png',
        }),
      });

      if (response.ok) {
        const data: { url?: string } = await response.json();
        if (data.url) {
          this.logger.log('Short URL generated successfully', {
            shortUrlLength: data.url.length,
          });
          return data.url;
        }
      }

      this.logger.warn('Short URL service failed, using minimal URL');
      const encodedConfig = encodeURIComponent(JSON.stringify(minimalConfig));
      const regularUrl = `https://quickchart.io/chart?w=${width}&h=${height}&c=${encodedConfig}`;

      this.logger.log('Generated regular URL', { urlLength: regularUrl.length });
      return regularUrl;
    } catch (error) {
      this.logger.error('Failed to generate short URL', 'AnalyticsController', {}, error as Error);
      const ultraMinimal = {
        type: 'line',
        data: {
          labels: chartConfig.data.labels,
          datasets: [
            { label: 'Price', data: chartConfig.data.datasets[0].data, borderColor: 'orange' },
          ],
        },
      };
      const encodedConfig = encodeURIComponent(JSON.stringify(ultraMinimal));
      return `https://quickchart.io/chart?w=${width}&h=${height}&c=${encodedConfig}`;
    }
  }

  /**
   * Generate empty chart when no data available
   */
  private generateEmptyPriceDemandChart(width: number, height: number): string {
    const chartConfig = {
      type: 'line',
      data: {
        labels: ['No Data'],
        datasets: [
          {
            label: 'No Historical Data Available',
            data: [0],
            borderColor: 'rgb(201, 203, 207)',
            backgroundColor: 'rgba(201, 203, 207, 0.1)',
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'No Historical Data Available',
            font: { size: 16 },
          },
        },
      },
    };

    const encodedConfig = encodeURIComponent(JSON.stringify(chartConfig));
    return `https://quickchart.io/chart?width=${width}&height=${height}&c=${encodedConfig}`;
  }

  @Get('charts')
  @ApiOperation({
    summary: 'Generate analytics charts',
    description: 'Generate visual charts for analytics data using QuickChart.io',
  })
  @ApiQuery({
    name: 'hours',
    description: 'Number of hours to include in charts (default: 24)',
    required: false,
    type: Number,
  })
  async generateCharts(@Query('hours') hours: number = 24): Promise<any> {
    try {
      const analytics = await this.analyticsService.getSystemAnalytics();
      const historicalData = await this.analyticsService.getHistoricalData(hours);

      // Generate chart URLs using QuickChart.io
      const chartUrls = {
        priceTrend: this.generatePriceChartUrl(historicalData.priceTrend),
        usageTrend: this.generateUsageChartUrl(historicalData.nodeUsage),
        revenue: this.generateRevenueChartUrl(analytics.revenue),
      };

      this.logger.log('Charts generated', { hours });

      return {
        charts: chartUrls,
        metadata: {
          hours,
          generatedAt: new Date(),
          dataPoints: historicalData.nodeUsage.length,
        },
      };
    } catch (error) {
      this.logger.error(
        'Failed to generate charts',
        'AnalyticsController',
        { hours },
        error as Error,
      );
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

  /**
   * Generate QuickChart.io URL for price trend chart
   */
  private generatePriceChartUrl(
    priceData: Array<{
      timestamp: Date;
      currentPrice: number;
      utilization: number;
      onChainActivity: number;
      tierPrices: Array<{ tier: string; price: number }>;
    }>,
  ): string {
    const labels = priceData.map((_, index) => {
      const date = new Date();
      date.setHours(date.getHours() - (priceData.length - index - 1));
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    });

    const chartConfig = {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Price (SOL)',
            data: priceData.map(d => d.currentPrice),
            borderColor: '#ed8936',
            backgroundColor: 'rgba(237, 137, 54, 0.1)',
            tension: 0.4,
          },
          {
            label: 'Utilization %',
            data: priceData.map(d => d.utilization),
            borderColor: '#48bb78',
            backgroundColor: 'rgba(72, 187, 120, 0.1)',
            tension: 0.4,
            yAxisID: 'y1',
          },
        ],
      },
      options: {
        responsive: true,
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: 'Price (SOL)',
            },
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'Utilization %',
            },
            grid: {
              drawOnChartArea: false,
            },
          },
        },
      },
    };

    const encodedConfig = encodeURIComponent(JSON.stringify(chartConfig));
    return `https://quickchart.io/chart?c=${encodedConfig}`;
  }

  /**
   * Generate QuickChart.io URL for usage trend chart
   */
  private generateUsageChartUrl(
    usageData: Array<{
      timestamp: Date;
      totalRequests: number;
      activeUsers: number;
      averageRps: number;
      peakRps: number;
      totalRpsAllocated: number;
      utilizationPercentage: number;
      topEndpoints: Array<{ endpoint: string; requests: number }>;
    }>,
  ): string {
    const labels = usageData.map((_, index) => {
      const date = new Date();
      date.setHours(date.getHours() - (usageData.length - index - 1));
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    });

    const chartConfig = {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Total Requests',
            data: usageData.map(d => d.totalRequests),
            borderColor: '#4299e1',
            backgroundColor: 'rgba(66, 153, 225, 0.1)',
            tension: 0.4,
          },
          {
            label: 'Active Users',
            data: usageData.map(d => d.activeUsers),
            borderColor: '#9f7aea',
            backgroundColor: 'rgba(159, 122, 234, 0.1)',
            tension: 0.4,
            yAxisID: 'y1',
          },
        ],
      },
      options: {
        responsive: true,
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: 'Requests',
            },
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            title: {
              display: true,
              text: 'Users',
            },
            grid: {
              drawOnChartArea: false,
            },
          },
        },
      },
    };

    const encodedConfig = encodeURIComponent(JSON.stringify(chartConfig));
    return `https://quickchart.io/chart?c=${encodedConfig}`;
  }

  /**
   * Generate QuickChart.io URL for revenue chart
   */
  private generateRevenueChartUrl(revenueData: {
    daily: number;
    weekly: number;
    monthly: number;
  }): string {
    const chartConfig = {
      type: 'bar',
      data: {
        labels: ['Daily', 'Weekly', 'Monthly'],
        datasets: [
          {
            label: 'Revenue (SOL)',
            data: [revenueData.daily, revenueData.weekly, revenueData.monthly],
            backgroundColor: ['#38a169', '#ed8936', '#9f7aea'],
            borderColor: ['#2f855a', '#dd6b20', '#805ad5'],
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Revenue (SOL)',
            },
          },
        },
      },
    };

    const encodedConfig = encodeURIComponent(JSON.stringify(chartConfig));
    return `https://quickchart.io/chart?c=${encodedConfig}`;
  }
}
