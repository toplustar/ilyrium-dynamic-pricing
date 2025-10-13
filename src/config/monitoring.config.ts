import { registerAs } from '@nestjs/config';
import * as appInsights from 'applicationinsights';

import { AppLogger } from '~/common/services/app-logger.service';

export const MonitoringConfig = registerAs('monitoring', () => {
  const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  if (connectionString) {
    appInsights
      .setup(connectionString)
      .setAutoDependencyCorrelation(true)
      .setAutoCollectRequests(true)
      .setAutoCollectPerformance(true, true)
      .setAutoCollectExceptions(true)
      .setAutoCollectDependencies(true)
      .setAutoCollectConsole(true)
      .setUseDiskRetryCaching(true)
      .setSendLiveMetrics(false)
      .start();

    const logger = new AppLogger('MonitoringConfig');

    logger.log('Application Insights initialized with request telemetry enrichment');
  }

  return {
    connectionString,
    enabled: !!connectionString,
  };
});

export default MonitoringConfig;
