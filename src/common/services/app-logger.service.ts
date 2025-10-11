import * as appInsights from 'applicationinsights';

import { ConsoleLogger } from './console-logger.service';

export class AppLogger {
  private readonly client: appInsights.TelemetryClient;
  private readonly defaultContext: string;
  private readonly consoleLogger: ConsoleLogger;
  private classContext?: string;

  constructor(context: string) {
    this.defaultContext = context;
    this.client = appInsights.defaultClient;
    this.consoleLogger = new ConsoleLogger();
  }

  /**
   * Creates a child logger with a specific class context
   * @param className The name of the class using this logger
   * @returns A new logger instance with the class context
   */
  forClass(className: string): AppLogger {
    const childLogger = new AppLogger(this.defaultContext);
    childLogger.classContext = className;
    return childLogger;
  }

  log(message: string, contextData?: Record<string, any>): void {
    if (typeof contextData === 'string') contextData = {};

    const fullContext = this.getFullContext();
    this.consoleLogger.log(message, fullContext);

    if (this.client) {
      this.client.trackTrace({
        message: `[${fullContext}] ${message}`,
        severity: appInsights.Contracts.SeverityLevel.Information,
        properties: { ...contextData },
      });
    }
  }

  error(
    errorName: string,
    errorMessage: string,
    contextData?: Record<string, any>,
    errorObject?: Error,
  ): void {
    const fullContext = this.getFullContext();
    const errorMsg = `${errorName}: ${errorMessage}`;

    this.consoleLogger.error(errorMsg, fullContext, errorObject?.stack);

    if (this.client) {
      this.client.trackException({
        exception: errorObject ?? new Error(errorMessage),
        severity: appInsights.Contracts.SeverityLevel.Error,
        properties: {
          errorName,
          errorMessage,
          ...(contextData ?? {}),
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  warn(message: string, properties?: Record<string, any>): void {
    const fullContext = this.getFullContext();
    this.consoleLogger.warn(message, fullContext);
    if (this.client) {
      this.client.trackTrace({
        message: `[${fullContext}] ${message}`,
        severity: appInsights.Contracts.SeverityLevel.Warning,
        properties: properties || {},
      });
    }
  }

  debug(message: string, properties?: Record<string, any>): void {
    const fullContext = this.getFullContext();
    this.consoleLogger.debug(message, fullContext);
    if (this.client) {
      this.client.trackTrace({
        message: `[${fullContext}] ${message}`,
        severity: appInsights.Contracts.SeverityLevel.Verbose,
        properties: properties || {},
      });
    }
  }

  trackEvent(
    name: string,
    properties?: Record<string, any>,
    measurements?: Record<string, number>,
  ): void {
    if (this.client) {
      this.client.trackEvent({
        name,
        properties: properties || {},
        measurements: measurements || {},
      });
    }
  }

  trackCustomMetric(name: string, value: number, properties?: Record<string, any>): void {
    if (this.client) {
      this.client.trackMetric({
        name,
        value,
        properties: properties || {},
      });
    }
  }

  /**
   * Gets the full context string (module + class if available)
   */
  private getFullContext(): string {
    return this.classContext ? `${this.defaultContext}.${this.classContext}` : this.defaultContext;
  }
}
